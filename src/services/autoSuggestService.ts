import { Notice } from "obsidian";
import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { LogicallyApi } from "./logicallyApi";
import type { AutoSuggestQuota, LogicallySettings } from "../types";
import { AutoSuggestLimitModal } from "../ui/autoSuggestLimitModal";
import {
  setGhostText,
  setGhostRegenerating,
  hasGhostText,
  registerAcceptHandler,
  unregisterAcceptHandler,
  registerCursorMoveHandler,
  unregisterCursorMoveHandler,
  registerRegenerateHandler,
  unregisterRegenerateHandler,
} from "../extensions/ghostText";

/** Maximum characters to send as context to the backend. */
const MAX_CONTEXT_CHARS = 320;
/** Maximum number of cached suggestions per view. */
const MAX_CACHE_SIZE = 50;
/** Pricing page for upgrading when quota is reached. */
const PRICING_URL = "https://logically.app/pricing";

const TABLE_SEPARATOR_RE = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

type TableNormalization = {
  isTable: boolean;
  text: string;
};

function normalizeTableSuggestionText(text: string): TableNormalization {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let tableStart = -1;
  let inlineLeadingText = "";
  let headerOnlyLine = "";

  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i] ?? "";
    const nextLine = lines[i + 1] ?? "";
    if (!TABLE_SEPARATOR_RE.test(nextLine.trim())) {
      continue;
    }

    const firstPipe = currentLine.indexOf("|");
    if (firstPipe < 0) {
      continue;
    }

    const beforePipe = currentLine.slice(0, firstPipe).trimEnd();
    const fromPipe = currentLine.slice(firstPipe).trimStart();
    if (!fromPipe.startsWith("|")) {
      continue;
    }

    tableStart = i;
    inlineLeadingText = beforePipe;
    headerOnlyLine = fromPipe;
    break;
  }

  if (tableStart < 0) {
    return { isTable: false, text: normalized };
  }

  if (inlineLeadingText.length > 0) {
    lines.splice(tableStart, 1, inlineLeadingText, headerOnlyLine);
    tableStart += 1;
  } else {
    lines[tableStart] = headerOnlyLine;
  }

  const lineBeforeTable = tableStart > 0 ? (lines[tableStart - 1] ?? "") : "";
  if (tableStart > 0 && lineBeforeTable.trim().length > 0) {
    lines.splice(tableStart, 0, "");
  }

  return { isTable: true, text: lines.join("\n") };
}

function tablePrefixForPosition(view: EditorView, pos: number): string {
  const line = view.state.doc.lineAt(pos);
  const colOffset = pos - line.from;
  if (colOffset > 0) {
    return "\n\n";
  }

  if (line.number === 1) {
    return "";
  }

  const prevLine = view.state.doc.line(line.number - 1);
  return prevLine.text.trim().length > 0 ? "\n" : "";
}

function displaySuggestionAt(
  view: EditorView,
  pos: number,
  text: string,
): string {
  const table = normalizeTableSuggestionText(text);
  if (!table.isTable) {
    return text;
  }
  return tablePrefixForPosition(view, pos) + table.text;
}

/** A cached suggestion tied to a document position and its context. */
interface CachedSuggestion {
  text: string;
  contextHash: string;
}

/**
 * AutoSuggestService manages the debounce → API call → ghost-text lifecycle.
 *
 * It is instantiated once per plugin load and operates across all editor views.
 * Each view is registered/unregistered via {@link attachView}/{@link detachView}.
 */
export class AutoSuggestService {
  private app: App;
  private api: LogicallyApi;
  private settings: LogicallySettings;
  private isLimitModalOpen = false;
  private lastLimitAlertAt = 0;
  private lastErrorNoticeAt = 0;

  // Debounce / request state (single active request at a time)
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  // Snapshot of the context when the suggestion was requested
  private pendingSuggestion: {
    view: EditorView;
    pos: number;
    contextHash: string;
    text: string; // the ghost suggestion text
  } | null = null;

  // All views we have accept handlers registered on
  private registeredViews = new Set<EditorView>();

  // ── Suggestion cache ──
  // Key: document position (absolute offset).  Value: suggestion + context hash.
  // Invalidated entirely on any document change (positions shift).
  private suggestionCache = new Map<number, CachedSuggestion>();

  constructor(app: App, api: LogicallyApi, settings: LogicallySettings) {
    this.app = app;
    this.api = api;
    this.settings = settings;
  }

  /** Update settings reference (call after settings change). */
  updateSettings(settings: LogicallySettings): void {
    this.settings = settings;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Called on every document change.  Resets debounce and eventually
   * triggers a suggestion request.
   */
  onDocChange(view: EditorView): void {
    // Ensure accept handler is registered
    this.attachView(view);

    // Clear any existing ghost text immediately (user typed)
    if (hasGhostText(view)) {
      view.dispatch({ effects: setGhostText.of(null) });
    }
    this.pendingSuggestion = null;

    // Document changed → all cached positions are stale
    this.suggestionCache.clear();

    // Guard: feature disabled or not authenticated
    if (!this.settings.autoSuggestEnabled || !this.settings.userToken) {
      return;
    }

    // Cancel in-flight request
    this.abortController?.abort();
    this.abortController = null;

    // Reset debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    const delay = this.settings.autoSuggestDelay;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.requestSuggestion(view);
    }, delay);
  }

  /** Register the accept and cursor-move handlers on a view (idempotent). */
  attachView(view: EditorView): void {
    if (this.registeredViews.has(view)) return;
    this.registeredViews.add(view);
    registerAcceptHandler(view, (v) => this.handleAccept(v));
    registerCursorMoveHandler(view, (v, pos) => this.handleCursorMove(v, pos));
    registerRegenerateHandler(view, (v) => this.handleRegenerate(v));
  }

  /** Unregister handlers from a view. */
  detachView(view: EditorView): void {
    if (!this.registeredViews.has(view)) return;
    this.registeredViews.delete(view);
    unregisterAcceptHandler(view);
    unregisterCursorMoveHandler(view);
    unregisterRegenerateHandler(view);
  }

  /** Tear down everything. */
  destroy(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.abortController?.abort();
    for (const view of this.registeredViews) {
      unregisterAcceptHandler(view);
      unregisterCursorMoveHandler(view);
      unregisterRegenerateHandler(view);
    }
    this.registeredViews.clear();
    this.pendingSuggestion = null;
    this.suggestionCache.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async requestSuggestion(
    view: EditorView,
    regenerate = false,
  ): Promise<void> {
    const state = view.state;
    const cursor = state.selection.main.head;
    const context = this.extractContext(view, cursor);
    if (!context.trim()) return;

    const contextHash = simpleHash(context);

    // Cancel any prior in-flight request
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    try {
      const result = await this.api.streamAutoSuggestion(
        {
          text: context,
          options: {
            regenerate,
            is_internal_source: this.settings.autoSuggestInternalSource,
            is_external_source: this.settings.autoSuggestExternalSource,
          },
        },
        {
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!chunk) return;
            const currentCursor = view.state.selection.main.head;
            const currentContext = this.extractContext(view, currentCursor);
            if (
              currentCursor !== cursor ||
              simpleHash(currentContext) !== contextHash
            ) {
              controller.abort();
              return;
            }

            const current = this.pendingSuggestion?.text ?? "";
            const suggestion = current + chunk;
            this.pendingSuggestion = {
              view,
              pos: currentCursor,
              contextHash,
              text: suggestion,
            };
            // For table suggestions mid-line, prefix with \n in the preview
            // so the ghost text wraps correctly. pendingSuggestion.text stays
            // as the raw backend text; handleAccept adds the \n at insert time.
            const displayText = displaySuggestionAt(
              view,
              currentCursor,
              suggestion,
            );
            view.dispatch({
              effects: setGhostText.of({
                text: displayText,
                pos: currentCursor,
              }),
            });
          },
        },
      );

      if (!result.success) {
        if (/AbortError/i.test(result.error ?? "")) return;
        this.maybeShowLimitUpgradePrompt(undefined, result.error);
        this.maybeShowAutoSuggestError(result.error);
        return;
      }

      // Bail if aborted while waiting
      if (controller.signal.aborted) return;

      if (result.data?.suggestion && result.data.suggestion.trim()) {
        // Verify cursor hasn't moved and document context unchanged
        const currentCursor = view.state.selection.main.head;
        const currentContext = this.extractContext(view, currentCursor);
        if (
          currentCursor !== cursor ||
          simpleHash(currentContext) !== contextHash
        ) {
          return; // stale
        }

        const suggestion = result.data.suggestion.trimEnd();

        // Cache the suggestion at this position
        this.cacheSuggestion(currentCursor, suggestion, contextHash);

        this.pendingSuggestion = {
          view,
          pos: currentCursor,
          contextHash,
          text: suggestion,
        };

        const finalDisplay = displaySuggestionAt(
          view,
          currentCursor,
          suggestion,
        );
        view.dispatch({
          effects: setGhostText.of({ text: finalDisplay, pos: currentCursor }),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Auto-suggest failed";
      this.maybeShowAutoSuggestError(message);
    } finally {
      if (regenerate && hasGhostText(view)) {
        view.dispatch({ effects: setGhostRegenerating.of(false) });
      }
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }

  /**
   * Handle Tab press — insert the ghost text and notify the backend.
   * Returns true if the suggestion was accepted, false to pass Tab through.
   */
  private handleAccept(view: EditorView): boolean {
    const pending = this.pendingSuggestion;
    if (!pending || pending.view !== view) return false;

    const text = pending.text;
    const pos = pending.pos;

    // Verify cursor is still at the anchor
    if (view.state.selection.main.head !== pos) {
      view.dispatch({ effects: setGhostText.of(null) });
      this.pendingSuggestion = null;
      return true; // consume Tab to clear, but don't insert
    }

    // Insert the suggestion text at the cursor position.
    // If the suggestion is a markdown table (starts with |), it must begin
    // on its own line — prepend \n if the cursor is not already at column 0.
    let insertText = text;
    const normalizedTable = normalizeTableSuggestionText(text);
    if (normalizedTable.isTable) {
      insertText = tablePrefixForPosition(view, pos) + normalizedTable.text;
      if (!insertText.endsWith("\n")) {
        insertText += "\n";
      }
    }

    view.dispatch({
      changes: { from: pos, insert: insertText },
      selection: { anchor: pos + insertText.length },
      effects: setGhostText.of(null),
    });

    this.pendingSuggestion = null;
    // Accept → clear entire cache (document changed, positions shift)
    this.suggestionCache.clear();

    // Fire-and-forget: notify backend of acceptance and react to quota state
    void this.notifyAcceptance();

    return true;
  }

  /**
   * Handle Regenerate button click — clear current suggestion and request a new one.
   */
  private handleRegenerate(view: EditorView): void {
    const pending = this.pendingSuggestion;
    if (!pending || pending.view !== view) return;

    const pos = pending.pos;

    // Show loading state while requesting a new suggestion
    view.dispatch({ effects: setGhostRegenerating.of(true) });

    // Remove cached entry for this position
    this.suggestionCache.delete(pos);

    // Cancel any in-flight request
    this.abortController?.abort();
    this.abortController = null;

    // Request a new suggestion with regenerate flag
    void this.requestSuggestion(view, true);
  }

  private async notifyAcceptance(): Promise<void> {
    const result = await this.api.acceptAutoSuggestion();
    if (!result.success) {
      this.maybeShowLimitUpgradePrompt(undefined, result.error);
      this.maybeShowAutoSuggestError(result.error);
      return;
    }
    this.maybeShowLimitUpgradePrompt(result.data);
  }

  private maybeShowAutoSuggestError(error?: string): void {
    const msg = (error ?? "").trim();
    if (!msg || /AbortError/i.test(msg)) return;
    if (/daily suggestion acceptance limit reached/i.test(msg)) return;

    const now = Date.now();
    if (now - this.lastErrorNoticeAt < 10000) return;
    this.lastErrorNoticeAt = now;

    console.warn("[Logically autosuggest]", msg);
    new Notice(`Auto-suggest unavailable: ${msg}`, 5000);
  }

  private maybeShowLimitUpgradePrompt(
    quota?: AutoSuggestQuota,
    error?: string,
  ): void {
    const limitFromError = /daily suggestion acceptance limit reached/i.test(
      error ?? "",
    );
    const limitFromQuota =
      quota?.hit === true ||
      quota?.can_accept === false ||
      (typeof quota?.remaining === "number" &&
        typeof quota?.limit === "number" &&
        quota.limit !== Number.MAX_SAFE_INTEGER &&
        quota.remaining <= 0);

    if (!limitFromError && !limitFromQuota) return;
    if (this.isLimitModalOpen) return;

    const now = Date.now();
    if (now - this.lastLimitAlertAt < 10000) return;
    this.lastLimitAlertAt = now;
    this.isLimitModalOpen = true;

    const modal = new AutoSuggestLimitModal(
      this.app,
      () => window.open(PRICING_URL, "_blank"),
      () => {
        this.isLimitModalOpen = false;
      },
    );
    modal.open();
  }

  /**
   * Called when cursor moves (without doc change).
   * If cursor lands on a cached position with matching context → re-show ghost text.
   */
  private handleCursorMove(view: EditorView, pos: number): void {
    if (!this.settings.autoSuggestEnabled || !this.settings.userToken) return;

    const cached = this.suggestionCache.get(pos);
    if (!cached) return;

    // Verify that the surrounding text still matches
    const context = this.extractContext(view, pos);
    if (simpleHash(context) !== cached.contextHash) {
      // Context changed since caching → stale entry
      this.suggestionCache.delete(pos);
      return;
    }

    // Restore the ghost text
    this.pendingSuggestion = {
      view,
      pos,
      contextHash: cached.contextHash,
      text: cached.text,
    };
    const cachedDisplay = displaySuggestionAt(view, pos, cached.text);
    view.dispatch({
      effects: setGhostText.of({ text: cachedDisplay, pos }),
    });
  }

  /** Store a suggestion in the local cache, evicting oldest if full. */
  private cacheSuggestion(
    pos: number,
    text: string,
    contextHash: string,
  ): void {
    if (this.suggestionCache.size >= MAX_CACHE_SIZE) {
      // Evict the oldest entry (first inserted)
      const first = this.suggestionCache.keys().next().value as
        | number
        | undefined;
      if (first !== undefined) this.suggestionCache.delete(first);
    }
    this.suggestionCache.set(pos, { text, contextHash });
  }

  /**
   * Extract context text around the cursor to send to the backend.
   * - If cursor is mid-line, take up to MAX_CONTEXT_CHARS before cursor.
   * - If cursor is at start of empty line, take the previous paragraph.
   */
  private extractContext(view: EditorView, pos: number): string {
    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    const textBeforeCursorOnLine = doc.sliceString(line.from, pos);

    if (textBeforeCursorOnLine.trim().length > 0) {
      // User is typing on a line — grab recent text
      return this.getRecentText(doc, pos, MAX_CONTEXT_CHARS);
    }

    // Cursor at start of blank line → grab previous paragraph
    return this.getPreviousParagraph(doc, line.number);
  }

  private getRecentText(
    doc: {
      sliceString(from: number, to: number): string;
      readonly length: number;
    },
    pos: number,
    maxChars: number,
  ): string {
    const from = Math.max(0, pos - maxChars);
    return doc.sliceString(from, pos);
  }

  private getPreviousParagraph(
    doc: {
      line(n: number): {
        from: number;
        to: number;
        text: string;
        number: number;
      };
      readonly lines: number;
      sliceString(from: number, to: number): string;
    },
    currentLineNumber: number,
  ): string {
    // Walk backwards to find a non-empty line
    let endLine = currentLineNumber - 1;
    while (endLine >= 1 && doc.line(endLine).text.trim() === "") {
      endLine--;
    }
    if (endLine < 1) return "";

    // Walk further back to the start of this paragraph (contiguous non-empty lines)
    let startLine = endLine;
    while (startLine > 1 && doc.line(startLine - 1).text.trim() !== "") {
      startLine--;
    }

    const from = doc.line(startLine).from;
    const to = doc.line(endLine).to;
    const text = doc.sliceString(from, to);

    // Truncate to MAX_CONTEXT_CHARS from the end
    if (text.length > MAX_CONTEXT_CHARS) {
      return text.slice(text.length - MAX_CONTEXT_CHARS);
    }
    return text;
  }
}

/** Fast non-crypto hash for string comparison. */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}
