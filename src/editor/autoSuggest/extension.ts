import { Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { LogicallyPlugin } from "../../types";
import { extractSuggestionContext, hashParagraph } from "./context";

interface SuggestionState {
  anchor: number;
  text: string;
}

interface SuggestInvocationSnapshot {
  requestId: number;
  filePath: string;
  cursorPos: number;
  paragraphFrom: number;
  paragraphTo: number;
  paragraphHash: string;
}

const setSuggestionEffect = StateEffect.define<SuggestionState>();
const clearSuggestionEffect = StateEffect.define<void>();

class SuggestionGhostWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: SuggestionGhostWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "ra-auto-suggest-ghost-inline";
    span.textContent = this.text;
    return span;
  }
}

const suggestionDecorations = (
  value: SuggestionState | null,
): DecorationSet => {
  if (!value || !value.text) {
    return Decoration.none;
  }

  const widget = Decoration.widget({
    widget: new SuggestionGhostWidget(value.text),
    side: 1,
  });

  return Decoration.set([widget.range(value.anchor)]);
};

const suggestionField = StateField.define<SuggestionState | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    let hasSetEffect = false;

    for (const effect of tr.effects) {
      if (effect.is(clearSuggestionEffect)) {
        next = null;
      }
      if (effect.is(setSuggestionEffect)) {
        hasSetEffect = true;
        next = effect.value;
      }
    }

    if (tr.docChanged && !hasSetEffect) {
      next = null;
    }

    if (next && tr.docChanged) {
      const mappedAnchor = tr.changes.mapPos(next.anchor, 1);
      next = { ...next, anchor: mappedAnchor };
    }

    return next;
  },
  provide: (field) => EditorView.decorations.from(field, suggestionDecorations),
});

class AutoSuggestViewController {
  private debounceTimer: number | null = null;
  private abortController: AbortController | null = null;
  private requestSeq = 0;
  private activeSnapshot: SuggestInvocationSnapshot | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly plugin: LogicallyPlugin,
  ) {}

  private isTypingChange(update: ViewUpdate): boolean {
    return update.transactions.some(
      (tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"),
    );
  }

  update(update: ViewUpdate): void {
    if (!this.plugin.settings.autoSuggestEnabled) {
      this.clearSuggestion();
      this.cancelPending();
      return;
    }

    if (update.focusChanged && !update.view.hasFocus) {
      this.clearSuggestion();
      this.cancelDebounce();
      return;
    }

    if (update.selectionSet || update.docChanged) {
      this.clearSuggestion();
    }

    if (!update.docChanged) {
      return;
    }

    // Accepting suggestion is a programmatic doc change; wait for real typing
    // before scheduling the next API request.
    if (!this.isTypingChange(update)) {
      return;
    }

    this.schedule();
  }

  destroy(): void {
    this.cancelDebounce();
    this.cancelPending();
    this.clearSuggestion();
  }

  private isSingleCursor(): boolean {
    const main = this.view.state.selection.main;
    return main.empty;
  }

  private schedule(): void {
    if (!this.isSingleCursor()) return;
    if (this.view.composing) return;

    this.cancelDebounce();

    const debounceSetting = Number(this.plugin.settings.autoSuggestDebounceMs);
    const debounceMs = Math.max(
      100,
      Number.isFinite(debounceSetting) ? debounceSetting : 500,
    );
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.requestSuggestion();
    }, debounceMs);
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private cancelPending(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private clearSuggestion(): void {
    if (this.view.state.field(suggestionField, false)) {
      this.view.dispatch({ effects: clearSuggestionEffect.of(undefined) });
    }
  }

  private getActiveFilePath(): string {
    return this.plugin.app.workspace.getActiveFile()?.path ?? "";
  }

  private isSnapshotStillValid(snapshot: SuggestInvocationSnapshot): boolean {
    const currentFilePath = this.getActiveFilePath();
    if (!currentFilePath || currentFilePath !== snapshot.filePath) {
      return false;
    }

    if (!this.isSingleCursor()) {
      return false;
    }

    const cursorPos = this.view.state.selection.main.head;
    if (cursorPos !== snapshot.cursorPos) {
      return false;
    }

    if (snapshot.paragraphTo > this.view.state.doc.length) {
      return false;
    }

    const currentParagraph = this.view.state.doc.sliceString(
      snapshot.paragraphFrom,
      snapshot.paragraphTo,
    );

    return hashParagraph(currentParagraph) === snapshot.paragraphHash;
  }

  private async requestSuggestion(): Promise<void> {
    if (!this.plugin.settings.autoSuggestEnabled) return;
    if (!this.isSingleCursor()) return;
    if (this.view.composing) return;

    const cursorPos = this.view.state.selection.main.head;
    const context = extractSuggestionContext(this.view.state.doc, cursorPos);
    if (!context || !context.text.trim()) return;

    const filePath = this.getActiveFilePath();
    if (!filePath) return;

    this.cancelPending();
    const abortController = new AbortController();
    this.abortController = abortController;

    const requestId = ++this.requestSeq;
    const snapshot: SuggestInvocationSnapshot = {
      requestId,
      filePath,
      cursorPos,
      paragraphFrom: context.from,
      paragraphTo: context.to,
      paragraphHash: context.hash,
    };
    this.activeSnapshot = snapshot;

    const result = await this.plugin.api.getAutoSuggestion(
      context.text,
      "visitor_draft",
      abortController.signal,
      {
        model: this.plugin.settings.selectedModel,
      },
    );

    if (abortController.signal.aborted) {
      return;
    }

    if (!result.success || !result.data) {
      return;
    }

    if (
      !this.activeSnapshot ||
      this.activeSnapshot.requestId !== requestId ||
      !this.isSnapshotStillValid(snapshot)
    ) {
      return;
    }

    const suggestion =
      (result.data.suggestion ?? "").replace(/\r\n?/g, "\n").split("\n")[0] ??
      "";
    const normalizedSuggestion = suggestion.trimStart();
    if (!normalizedSuggestion) {
      return;
    }

    this.view.dispatch({
      effects: setSuggestionEffect.of({
        anchor: cursorPos,
        text: normalizedSuggestion,
      }),
    });
  }
}

const acceptSuggestionKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      const suggestion = view.state.field(suggestionField, false);
      if (!suggestion || !suggestion.text) {
        return false;
      }

      view.dispatch({
        changes: {
          from: suggestion.anchor,
          to: suggestion.anchor,
          insert: suggestion.text,
        },
        selection: {
          anchor: suggestion.anchor + suggestion.text.length,
        },
        effects: clearSuggestionEffect.of(undefined),
      });

      return true;
    },
  },
]);

export const createAutoSuggestExtension = (
  plugin: LogicallyPlugin,
): Extension => {
  const autoSuggestPlugin = ViewPlugin.fromClass(
    class extends AutoSuggestViewController {
      constructor(view: EditorView) {
        super(view, plugin);
      }
    },
  );

  return [
    suggestionField,
    autoSuggestPlugin,
    Prec.highest(acceptSuggestionKeymap),
  ];
};
