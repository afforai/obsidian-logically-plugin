<script lang="ts">
  import { onMount } from "svelte";
  import { Notice, TFile, type App } from "obsidian";
  import type {
    LogicallyPlugin,
    ChatMessage,
    BaseModel,
    ModelEntity,
    Privilege,
    SearchMode,
    SourceNode,
    SyncedNote,
    Tool,
  } from "../types";
  import {
    AI_MODELS,
    DEFAULT_SETTINGS,
    PRIVILEGES,
    modesToTools,
  } from "../types";
  import ChatInput from "./ChatInput.svelte";
  import MessageList from "./MessageList.svelte";
  import LoginPrompt from "./LoginPrompt.svelte";
  import ConnectNotesModal from "./ConnectNotesModal.svelte";
  import UpgradeModal from "./UpgradeModal.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  // buildSteps is consumed inside ThinkingPanel; recorder here just writes raw events.

  export let plugin: LogicallyPlugin;
  export let app: App;

  let messages: ChatMessage[] = plugin.settings.chatHistory ?? [];
  let isLoading = false;
  let currentResponse = "";
  let selectedModel: BaseModel = plugin.settings.selectedModel;
  let selectedTools: SearchMode[] = plugin.settings.selectedTools ?? ["files"];
  let isAuthenticated = plugin.api.isAuthenticated();
  let connectedNotes: SyncedNote[] = plugin.settings.connectedNotes ?? [];
  let personalLibraryId: string | null = null;
  let connectModalOpen = false;
  let connectSyncing = false;
  let userPrivileges: Privilege[] = plugin.settings.userPrivileges ?? [];
  let userName: string = plugin.settings.userName ?? "";
  let loginPromptMode: "none" | "page" | "modal" = "none";
  let maxFiles = 5;
  let lastMaxFiles = maxFiles;
  /** Available AI models - fetched from API or fallback to static list */
  let availableModels: ModelEntity[] = AI_MODELS;

  const VISITOR_MAX_FILES = 3;
  const FREE_MAX_FILES = 5;
  const PAID_MAX_FILES = Infinity;

  function computeMaxFiles(privileges: Privilege[], isAuth: boolean): number {
    if (!isAuth) return VISITOR_MAX_FILES;
    const paidPrivileges: Privilege[] = [
      PRIVILEGES.advanced_models,
      PRIVILEGES.reasoning_models,
      PRIVILEGES.team,
      PRIVILEGES.ltd_organization,
      PRIVILEGES.admin,
    ];
    const isPaid = privileges.some((p) => paidPrivileges.includes(p));
    return isPaid ? PAID_MAX_FILES : FREE_MAX_FILES;
  }

  $: maxFiles = computeMaxFiles(userPrivileges, isAuthenticated);

  $: if (maxFiles !== lastMaxFiles) {
    if (connectedNotes.length > maxFiles) {
      connectedNotes = connectedNotes.slice(0, maxFiles);
      plugin.settings.connectedNotes = connectedNotes;
      void plugin.saveSettings();
    }
    lastMaxFiles = maxFiles;
  }

  // Upgrade modal state
  let showUpgradeModal = false;
  let upgradeModalType: "advanced" | "reasoning" | "quota" = "advanced";

  // Settings panel state
  let showSettingsPanel = false;

  // Debounced save for chat history
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  function saveChatHistory() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      plugin.settings.chatHistory = messages;
      await plugin.saveSettings();
    }, 500);
  }

  function generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function upsertMessage(next: ChatMessage) {
    const idx = messages.findIndex((m) => m.id === next.id);
    if (idx === -1) {
      messages = [...messages, next];
      return;
    }
    const updated = [...messages];
    updated[idx] = { ...updated[idx], ...next };
    messages = updated;
  }

  async function handleModelChange(model: BaseModel) {
    selectedModel = model;
    plugin.settings.selectedModel = model;
    await plugin.saveSettings();

    const update = await plugin.api.updateBaseModel(model);
    if (!update.success) {
      if (
        update.error === "[auth_expired]" ||
        update.error === "Not authenticated"
      ) {
        plugin.settings.userToken = "";
        plugin.settings.userEmail = "";
        plugin.settings.userPrivileges = [];
        plugin.settings.selectedModel = DEFAULT_SETTINGS.selectedModel;
        selectedModel = DEFAULT_SETTINGS.selectedModel;
        messages = [];
        plugin.settings.chatHistory = [];
        await plugin.saveSettings();
        isAuthenticated = false;
        new Notice("Your session has expired. Please sign in again.");
        return;
      }
      new Notice(
        `Failed to update AI model: ${update.error ?? "Unknown error"}`,
      );
    }
  }

  async function handleToolsChange(next: SearchMode[]) {
    selectedTools = next;
    plugin.settings.selectedTools = next;
    await plugin.saveSettings();
  }

  async function ensurePersonalLibraryId(): Promise<string | null> {
    if (personalLibraryId) return personalLibraryId;
    const res = await plugin.api.getCurrentUser();
    if (res.success && res.data?.personal_library) {
      personalLibraryId = res.data.personal_library;
      return personalLibraryId;
    }
    return null;
  }

  async function handleOpenConnectNotes() {
    if (!isAuthenticated) {
      loginPromptMode = "modal";
      return;
    }
    const lib = await ensurePersonalLibraryId();
    if (!lib) {
      new Notice("Could not determine your library. Try signing in again.");
      return;
    }
    connectModalOpen = true;
  }

  async function handleConnectSubmit(notes: TFile[]) {
    if (notes.length === 0) {
      connectedNotes = [];
      plugin.settings.connectedNotes = [];
      await plugin.saveSettings();
      connectModalOpen = false;
      return;
    }
    connectSyncing = true;
    try {
      // B19: persist vault path + display name only — content is read fresh per query.
      const next: SyncedNote[] = notes.map((f) => ({
        vaultPath: f.path,
        displayName: f.basename,
      }));
      connectedNotes = next;
      plugin.settings.connectedNotes = next;
      await plugin.saveSettings();
      new Notice(`Connected ${next.length} note(s) as inline context.`);
      connectModalOpen = false;
    } finally {
      connectSyncing = false;
    }
  }

  /**
   * B19: read each connected note from the vault and return its content for
   * inline injection into the completion's system prompt. Missing files are
   * skipped silently.
   */
  async function getContextFromFiles(): Promise<
    { path: string; content: string }[]
  > {
    if (!selectedTools.includes("files") || connectedNotes.length === 0) {
      return [];
    }
    const out: { path: string; content: string }[] = [];
    for (const note of connectedNotes) {
      const tfile = app.vault.getAbstractFileByPath(note.vaultPath);
      if (!(tfile instanceof TFile)) continue;
      try {
        const content = await app.vault.cachedRead(tfile);
        out.push({ path: note.vaultPath, content });
      } catch {
        /* skip unreadable */
      }
    }
    return out;
  }

  $: hasLibraryTool = selectedTools.includes("files");

  function getCustomInstructionContext(): string {
    const instruction = plugin.settings.customInstruction?.trim();
    if (!instruction) return "";
    return `\n\n---\n# Custom Instructions\n\n${instruction}`;
  }

  /**
   * Connected notes as SourceNode fallback (when backend citations empty).
   * Uses vaultPath as fileid so insertToNote can build [[wiki]] links.
   */
  function getConnectedNotesAsSources(): SourceNode[] {
    if (!selectedTools.includes("files") || connectedNotes.length === 0)
      return [];
    return connectedNotes.map((n) => ({
      fileid: n.vaultPath,
      filename:
        n.vaultPath.split("/").pop()?.replace(/\.md$/, "") || n.vaultPath,
      filetype: "reference",
    }));
  }

  /**
   * Handle errors from the API, with special handling for quota errors.
   */
  function handleApiError(error: string, assistantMessage: ChatMessage): void {
    // B5: RA v2 STATUS-routed quota & error tokens.
    if (
      error === ".combined_quota_exceeded" ||
      error === ".combined_quota_visitor_denied" ||
      error === ".combined_quota_visitor_blocked"
    ) {
      if (!isAuthenticated) loginPromptMode = "modal";
      upsertMessage({
        ...assistantMessage,
        content: `**Combined search quota reached**\n\nYou've used your combined library + web + academic quota for this period. [Upgrade your plan](https://logically.app/pricing) to continue.`,
      });
      isLoading = false;
      currentResponse = "";
      return;
    }
    if (error === ".error_v2") {
      upsertMessage({
        ...assistantMessage,
        content: `**Search pipeline error**\n\nThe research assistant encountered an internal error. Please try again.`,
      });
      isLoading = false;
      currentResponse = "";
      return;
    }
    // Credit quota (422 HTTP, LTD users)
    if (error.includes("credit_quota")) {
      upsertMessage({
        ...assistantMessage,
        content: `**You've used your credits**\n\nYou've reached your credit limit for this period. Upgrade your plan to continue.`,
      });
      handleShowUpgrade("quota");
      isLoading = false;
      currentResponse = "";
      return;
    }
    // Check for query quota error
    if (
      error.includes("query_quota") ||
      error.includes(".query_quota") ||
      error.includes("daily_quota_exceeded")
    ) {
      if (!isAuthenticated) {
        loginPromptMode = "modal";
      }
      upsertMessage({
        ...assistantMessage,
        content: `**You've reached your free query limit**\n\nYou've used all your free queries for this period. To continue using Logically's AI research assistant:\n\n- **Upgrade to a paid plan** for unlimited queries\n- Visit [logically.app/pricing](https://logically.app/pricing) to see available plans\n\nYour free quota will reset at the start of the next billing period.`,
      });
    } else {
      upsertMessage({
        ...assistantMessage,
        content: `Something went wrong. Please try again.`,
      });
    }
    isLoading = false;
    currentResponse = "";
  }

  // Live stage tracking per in-flight assistant turn — referenced by MessageList → ThinkingPanel
  // while streaming so buildSteps re-derives steps every render. Frozen onto message.reasoning
  // at onComplete.
  let liveStage: {
    data: Array<Record<string, unknown>>;
    status: string;
  } | null = null;
  let liveGeneratingStarted = false;
  let liveAssistantId: string | null = null;

  // Verbatim frontend stage recorder. Writes raw events into stage.data; buildSteps
  // re-derives the displayed steps every render (no plugin-side accumulator state).
  function makeStageRecorder(assistantMessage: ChatMessage) {
    const stage: { data: Array<Record<string, unknown>>; status: string } = {
      data: [],
      status: "",
    };
    liveStage = stage;
    liveAssistantId = assistantMessage.id;
    liveGeneratingStarted = false;
    const startTs = Date.now();
    let secondsAtFreeze = 0;

    // B1: dedup search_start across onStatus (.searching_*) + onTool (v2 TOOL frame).
    // Frontend update_chat.ts:188-194 emits search_start from STATUS-token translation;
    // we mirror that path here AND keep the TOOL-frame path for v2 backends.
    const seenStarts = new Set<string>();
    const SEARCH_TOOL_MAP: Record<string, Tool> = {
      ".searching_academic": "search_academic",
      ".searching_web": "search_web",
      ".searching_library": "search_library",
    };

    const onReason = (p: {
      type?: string;
      summary?: string;
      reason?: string;
      tool?: string;
      tool_decisions?: Record<string, { summary: string; reason: string }>;
    }) => {
      stage.status = "return_reason";
      stage.data = [
        ...stage.data,
        { type: "reason", summary: p.summary, reason: p.reason },
      ];
      if (p.tool_decisions) {
        for (const [tool, d] of Object.entries(p.tool_decisions)) {
          stage.data = [
            ...stage.data,
            {
              type: "tool_decision",
              tool,
              summary: d.summary,
              reason: d.reason,
            },
          ];
        }
      }
      // Force reactivity ping by reassigning liveStage reference.
      liveStage = stage;
      messages = messages;
    };

    const onTool = (p: { name: string; phase: "start" | "end" }) => {
      // B2: TOOL phase==="start" → frontend's `search_start` event. Dedup with onStatus.
      if (p.phase === "start" && p.name && !seenStarts.has(p.name)) {
        seenStarts.add(p.name);
        stage.data = [...stage.data, { type: "search_start", tool: p.name }];
        liveStage = stage;
        messages = messages;
      }
    };

    const onCitationTool = (
      tool: string,
      rawPayload: Record<string, unknown>,
    ) => {
      stage.data = [
        ...stage.data,
        { type: "citation", tool, payload: rawPayload },
      ];
      liveStage = stage;
      messages = messages;
    };

    const onStatus = (token: string) => {
      // B1: mirror frontend update_chat.ts:188-194 — STATUS .searching_* tokens
      // are the canonical search_start source for legacy-pipeline backends.
      const mapped = SEARCH_TOOL_MAP[token];
      if (mapped && !seenStarts.has(mapped)) {
        seenStarts.add(mapped);
        stage.data = [...stage.data, { type: "search_start", tool: mapped }];
        liveStage = stage;
        messages = messages;
      }
      stage.status = token;
      if (token === ".generating_response" && !liveGeneratingStarted) {
        liveGeneratingStarted = true;
        secondsAtFreeze = Math.floor((Date.now() - startTs) / 1000);
        messages = messages;
      }
    };

    const finalize = () => {
      if (!liveGeneratingStarted) {
        liveGeneratingStarted = true;
        secondsAtFreeze = Math.floor((Date.now() - startTs) / 1000);
      }
    };

    const snapshot = () => ({
      stage: { data: [...stage.data], status: stage.status },
      timeTaken: secondsAtFreeze || Math.floor((Date.now() - startTs) / 1000),
    });

    return { onReason, onTool, onCitationTool, onStatus, finalize, snapshot };
  }

  function clearLiveStage(assistantId: string) {
    if (liveAssistantId === assistantId) {
      liveStage = null;
      liveAssistantId = null;
      liveGeneratingStarted = false;
    }
  }

  /* removed legacy makeV2Callbacks body (replaced by makeStageRecorder):
    const acc = { steps: [], startTs: Date.now() } as any;
    let idx = 0;
    // B1-fix: dedupe gate — backend emits TOOL + STATUS legacy + STATUS tool_start
    // for the same tool. Skip subsequent pushes if an open step already exists.
    const hasOpenStepForTool = (tool: Tool) =>
      acc.steps.some((s) => s.type === tool && !s.done);
    const flush = () => {
      upsertMessage({
        ...assistantMessage,
        reasoning: { ...acc, steps: [...acc.steps] },
      });
    };
    const pushStep = (s: ThinkingStep) => {
      acc.steps.push(s);
      flush();
    };
    // B35: backend may conflate summary with full CoT prelude — clamp to single
    // line / 120 chars so multi-line reasoning never leaks into the step label.
    const truncateLabel = (s: string | undefined) =>
      (s ?? "").split("\n")[0].slice(0, 120);

    const onReason = (p: {
      type?: string;
      summary?: string;
      reason?: string;
      tool?: string;
    }) => {
      if (p.type === "tool_decision") {
        pushStep({
          key: `td-${p.tool ?? "x"}-${idx++}`,
          type: "tool_decision",
          label: truncateLabel(p.summary) || `Considered ${p.tool ?? "tool"}`,
          reason: p.reason,
          done: true,
        });
      } else {
        // Default: reason frame ({summary, reason}).
        pushStep({
          key: `r-${idx++}`,
          type: "reason",
          label: truncateLabel(p.summary) || "Analysed question",
          reason: p.reason,
          done: true,
        });
      }
    };

    const onTool = (p: {
      name: Tool | string;
      phase: "start" | "end";
      status?: "ok" | "failed" | "timeout";
      count?: number;
    }) => {
      if (p.phase !== "start") return;
      const tool = p.name as Tool;
      if (
        tool !== "search_library" &&
        tool !== "search_web" &&
        tool !== "search_academic"
      ) {
        return;
      }
      if (hasOpenStepForTool(tool)) return;
      pushStep({
        key: `s-${tool}-${idx++}`,
        type: tool,
        label: STARTING_TOOL_LABELS[tool],
        done: false,
      });
    };

    const onCitation = (p: {
      tool: string;
      metadatas: Record<string, unknown>;
      sources?: SourceNode[];
    }) => {
      const tool = p.tool as Tool;
      if (
        tool !== "search_library" &&
        tool !== "search_web" &&
        tool !== "search_academic"
      ) {
        return;
      }
      // B3-fix: prefer metadatas-built refs; fallback to payload.sources when
      // backend sends empty metadatas but populated nodes.
      let effectiveRefs = buildRefsFromMetadatas(p.metadatas, tool);
      if (
        (!effectiveRefs || effectiveRefs.data.length === 0) &&
        p.sources &&
        p.sources.length > 0
      ) {
        effectiveRefs = {
          type: tool,
          data: p.sources.map((n) => ({
            title: n.filename || n.url || "Untitled",
            url: n.url,
            domain: n.url
              ? extractDomain(n.url)
              : tool === "search_library"
                ? "Library"
                : tool === "search_academic"
                  ? "Academic"
                  : "",
            icon:
              tool === "search_library"
                ? "file"
                : tool === "search_academic"
                  ? "graduation"
                  : "globe",
          })),
        };
      }
      const count = effectiveRefs?.data.length ?? 0;
      const label =
        count > 0
          ? DONE_TOOL_LABELS[tool].replace("{{number-here}}", String(count))
          : NO_RESULTS_LABELS[tool];
      // Finalize matching open search step, else append a fresh done step.
      let matched = false;
      for (let i = acc.steps.length - 1; i >= 0; i--) {
        const s = acc.steps[i];
        if (s.type === tool && !s.done) {
          // B33: replace OBJECT IDENTITY so Svelte StepRow keyed by step.key
          // re-renders and the refs block actually paints.
          acc.steps[i] = {
            ...s,
            done: true,
            label,
            refs: effectiveRefs ?? s.refs,
          };
          matched = true;
          break;
        }
      }
      if (!matched) {
        // B5-fix: seenTools dropped — B1's hasOpenStepForTool prevents duplicate
        // spinners; each unmatched CITATION legitimately appends one done entry.
        acc.steps.push({
          key: `c-${tool}-${idx++}`,
          type: tool,
          label,
          refs: effectiveRefs ?? undefined,
          done: true,
        });
      }
      flush();
    };

    const onStatus = (token: string) => {
      // B34: legacy STATUS-only backends emit `.searching_<tool>` tokens; map
      // them onto the same fresh-step push as v2 tool_start so a live spinner
      // appears even on the pre-v2 status pipeline.
      const LEGACY_SEARCHING: Record<string, Tool> = {
        ".searching_library": "search_library",
        ".searching_web": "search_web",
        ".searching_academic": "search_academic",
      };
      const legacyTool = LEGACY_SEARCHING[token];
      if (legacyTool) {
        if (hasOpenStepForTool(legacyTool)) return;
        pushStep({
          key: `s-${legacyTool}-${idx++}`,
          type: legacyTool,
          label: STARTING_TOOL_LABELS[legacyTool],
          done: false,
        });
        return;
      }
      // B28: v2-pipeline-on / protocol-v2-off backends emit tool lifecycle as
      // ❬STATUS❭tool_start:<name>❬/STATUS❭ instead of ❬TOOL❭ frames.
      if (token.startsWith("tool_start:")) {
        const tool = token.slice("tool_start:".length) as Tool;
        if (
          tool === "search_library" ||
          tool === "search_web" ||
          tool === "search_academic"
        ) {
          if (hasOpenStepForTool(tool)) return;
          pushStep({
            key: `s-${tool}-${idx++}`,
            type: tool,
            label: STARTING_TOOL_LABELS[tool],
            done: false,
          });
        }
        return;
      }
      if (token.startsWith("tool_end:")) {
        const tool = token.slice("tool_end:".length);
        for (let i = acc.steps.length - 1; i >= 0; i--) {
          const s = acc.steps[i];
          if (s.type === tool && !s.done) {
            // B33: replace identity so StepRow re-renders into done state.
            acc.steps[i] = { ...s, done: true };
            flush();
            break;
          }
        }
        return;
      }
      if (token === ".generating_response" && !acc.endTs) {
        acc.endTs = Date.now();
        acc.timeTaken = acc.endTs - acc.startTs;
        // B33: object-replacement sweep — preserve key, force re-render.
        acc.steps = acc.steps.map((s) => (s.done ? s : { ...s, done: true }));
        // B24: only push "Verified sources" when at least one citation arrived.
        const hasAnyRefs = acc.steps.some(
          (s) => (s.refs?.data?.length ?? 0) > 0,
        );
        if (hasAnyRefs) {
          pushStep({
            key: `v-${idx++}`,
            type: "verified",
            label: "Verified sources",
            done: true,
          });
        }
        pushStep({
          key: `g-${idx++}`,
          type: "generating",
          label: "Generating answer...",
          done: false,
        });
      }
    };

    // B4-fix: when answer chunks start arriving, mark any open "generating"
    // step done so the spinner stops even if backend never sends DONE.
    const onAnswerChunk = () => {
      let mutated = false;
      acc.steps = acc.steps.map((s) => {
        if (s.type === "generating" && !s.done) {
          mutated = true;
          return { ...s, done: true, label: "Generated answer" };
        }
        return s;
      });
      if (mutated) flush();
    };

    const finalize = () => {
      // B25: drop the "Generating answer..." step entirely once generation ends.
      acc.steps = acc.steps.filter((s) => s.type !== "generating");
      if (!acc.endTs) {
        acc.endTs = Date.now();
        acc.timeTaken = acc.endTs - acc.startTs;
      }
      flush();
    };

    return { onReason, onTool, onStatus, onCitation, onAnswerChunk, finalize };
  }
  */

  async function handleSendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const historyBefore = messages;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    messages = [...messages, userMessage];

    isLoading = true;
    currentResponse = "";

    const effectiveModel: BaseModel = isAuthenticated
      ? selectedModel
      : DEFAULT_SETTINGS.selectedModel;

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      model: effectiveModel,
      sources: [],
    };
    messages = [...messages, assistantMessage];

    try {
      const effectiveTools: Tool[] = modesToTools(selectedTools);
      // B19: read connected notes inline from the vault each query.
      const attachments = await getContextFromFiles();
      const customContext = getCustomInstructionContext();
      const recorder = makeStageRecorder(assistantMessage);
      const baseOpts = !isAuthenticated
        ? { endpoint: "/public/visitor/completion", skipAuth: true }
        : {};
      const streamOptions = {
        ...baseOpts,
        onReason: recorder.onReason,
        onTool: recorder.onTool,
        onStatus: (token: string) => {
          recorder.onStatus(token);
        },
        onSuggestQuestions: (qs: string[]) => {
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            suggestQuestions: qs,
          });
        },
      };

      await plugin.api.streamMessage(
        text,
        effectiveModel,
        historyBefore,
        (chunk: string) => {
          currentResponse += chunk;
          const liveMsg = messages.find((m) => m.id === assistantMessage.id);
          upsertMessage({
            ...(liveMsg ?? assistantMessage),
            content: currentResponse,
          });
        },
        () => {
          // B22: snapshot streamed content BEFORE clearing currentResponse.
          const finalContent = currentResponse;
          isLoading = false;
          currentResponse = "";
          recorder.finalize();
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          const fileSources =
            !currentMsg?.sources || currentMsg.sources.length === 0
              ? getConnectedNotesAsSources()
              : [];
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            content: finalContent,
            sources:
              fileSources.length > 0
                ? fileSources
                : (currentMsg?.sources ?? []),
            reasoning: recorder.snapshot(),
            suggestQuestions: currentMsg?.suggestQuestions,
          });
          clearLiveStage(assistantMessage.id);
          if (saveTimeout) clearTimeout(saveTimeout);
          plugin.settings.chatHistory = messages;
          void plugin.saveSettings();
        },
        (error: string) => {
          clearLiveStage(assistantMessage.id);
          handleApiError(error, assistantMessage);
        },
        customContext,
        effectiveTools,
        (payload) => {
          // Tool-tagged citation (CITATION:<tool>) → stage event; bare CITATION → completion-only adoption (B3).
          if (payload.tool) {
            recorder.onCitationTool(payload.tool, payload.rawPayload);
          }
          // B1 fix: merge prior accumulated sources (from earlier CITATION frames) with
          // incoming + connected notes, dedup by url|fileid|filename. Reading from
          // messages[] avoids the outer-captured assistantMessage.sources=[] overwrite bug.
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          // Append incoming nodes without dedup — backend citation [N] is a 1-based
          // index into the flat concatenated nodes array across all frames in order.
          // Deduping changes indices and breaks the mapping.
          const prior = (currentMsg?.sources ?? []).filter(
            (s) => s.filetype !== "reference",
          );
          const incoming = payload.sources ?? [];
          const merged = [...prior, ...incoming];
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            content: currentResponse,
            sources: merged,
          });
        },
        attachments,
        streamOptions,
      );
    } catch (error) {
      clearLiveStage(assistantMessage.id);
      console.error("[Logically] Error sending message:", error);
      upsertMessage({
        ...assistantMessage,
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      isLoading = false;
    }
  }

  function handleClearChat() {
    messages = [];
    currentResponse = "";
    plugin.settings.chatHistory = [];
    void plugin.saveSettings();
  }

  function handleDeleteFromIndex(index: number) {
    if (isLoading) return;
    messages = messages.slice(0, index);
    saveChatHistory();
  }

  async function handleRegenerate(index: number) {
    if (isLoading) return;

    const assistantIndex = index;
    let userIndex = assistantIndex - 1;

    while (userIndex >= 0) {
      const msg = messages[userIndex];
      if (msg && msg.role === "user") break;
      userIndex--;
    }

    if (userIndex < 0) {
      new Notice("No user message found to regenerate from");
      return;
    }

    const userMessage = messages[userIndex];
    if (!userMessage || userMessage.role !== "user") {
      new Notice("No user message found to regenerate from");
      return;
    }
    const historyBefore = messages.slice(0, userIndex);

    messages = messages.slice(0, assistantIndex);

    isLoading = true;
    currentResponse = "";

    const effectiveModel: BaseModel = isAuthenticated
      ? selectedModel
      : DEFAULT_SETTINGS.selectedModel;

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      model: effectiveModel,
      sources: [],
    };
    messages = [...messages, assistantMessage];

    try {
      const effectiveTools: Tool[] = modesToTools(selectedTools);
      const attachments = await getContextFromFiles();
      const customContext = getCustomInstructionContext();
      const recorder = makeStageRecorder(assistantMessage);
      const baseOpts = !isAuthenticated
        ? { endpoint: "/public/visitor/completion", skipAuth: true }
        : {};
      const streamOptions = {
        ...baseOpts,
        onReason: recorder.onReason,
        onTool: recorder.onTool,
        onStatus: (token: string) => {
          recorder.onStatus(token);
        },
        onSuggestQuestions: (qs: string[]) => {
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            suggestQuestions: qs,
          });
        },
      };

      await plugin.api.streamMessage(
        userMessage.content,
        effectiveModel,
        historyBefore,
        (chunk: string) => {
          currentResponse += chunk;
          const liveMsg = messages.find((m) => m.id === assistantMessage.id);
          upsertMessage({
            ...(liveMsg ?? assistantMessage),
            content: currentResponse,
          });
        },
        () => {
          const finalContent = currentResponse;
          isLoading = false;
          currentResponse = "";
          recorder.finalize();
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          const fileSources =
            !currentMsg?.sources || currentMsg.sources.length === 0
              ? getConnectedNotesAsSources()
              : [];
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            content: finalContent,
            sources:
              fileSources.length > 0
                ? fileSources
                : (currentMsg?.sources ?? []),
            reasoning: recorder.snapshot(),
            suggestQuestions: currentMsg?.suggestQuestions,
          });
          clearLiveStage(assistantMessage.id);
          if (saveTimeout) clearTimeout(saveTimeout);
          plugin.settings.chatHistory = messages;
          void plugin.saveSettings();
        },
        (error: string) => {
          clearLiveStage(assistantMessage.id);
          handleApiError(error, assistantMessage);
        },
        customContext,
        effectiveTools,
        (payload) => {
          if (payload.tool) {
            recorder.onCitationTool(payload.tool, payload.rawPayload);
          }
          // B1 fix: same merge+dedup as handleSendMessage. See note above.
          const currentMsg = messages.find((m) => m.id === assistantMessage.id);
          // Append incoming nodes without dedup — backend citation [N] is a 1-based
          // index into the flat concatenated nodes array across all frames in order.
          // Deduping changes indices and breaks the mapping.
          const prior = (currentMsg?.sources ?? []).filter(
            (s) => s.filetype !== "reference",
          );
          const incoming = payload.sources ?? [];
          const merged = [...prior, ...incoming];
          upsertMessage({
            ...(currentMsg ?? assistantMessage),
            content: currentResponse,
            sources: merged,
          });
        },
        attachments,
        streamOptions,
      );
    } catch (error) {
      clearLiveStage(assistantMessage.id);
      console.error("[Logically] Error regenerating:", error);
      upsertMessage({
        ...assistantMessage,
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      isLoading = false;
    }
  }

  async function handleInsertToNote(message: ChatMessage) {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active note to insert into. Open a note first.");
      return;
    }

    try {
      let content = message.content;
      content = replaceCitationTokensForNote(content, message.sources);

      // Add sources as hyperlinks if available
      if (message.sources && message.sources.length > 0) {
        const sourceLinks: string[] = [];
        const seen = new Set<string>();

        for (const source of message.sources) {
          const key = source.fileid || source.url || source.filename;
          if (seen.has(key)) continue;
          seen.add(key);

          if (source.filetype === "reference" && source.fileid) {
            // Internal Obsidian file link
            sourceLinks.push(`${sourceLinks.length + 1}. [[${source.fileid}]]`);
          } else if (source.url || source.pdfUrl) {
            // External URL
            const url = source.pdfUrl || source.url;
            const title = source.filename || url;
            sourceLinks.push(`${sourceLinks.length + 1}. [${title}](${url})`);
          } else {
            // Just filename
            sourceLinks.push(`${sourceLinks.length + 1}. ${source.filename}`);
          }
        }

        if (sourceLinks.length > 0) {
          content += "\n\n---\n\n**Sources:**\n" + sourceLinks.join("\n");
        }
      }

      const editor = app.workspace.activeEditor?.editor;

      if (editor) {
        const cursor = editor.getCursor();
        editor.replaceRange(content + "\n\n", cursor);
        new Notice(`Inserted response into ${activeFile.basename}`);
      } else {
        await app.vault.append(activeFile, "\n\n" + content);
        new Notice(`Appended response to ${activeFile.basename}`);
      }
    } catch (e) {
      console.error("[Logically] Failed to insert to note:", e);
      new Notice("Failed to insert response into note");
    }
  }

  function replaceCitationTokensForNote(
    content: string,
    sources: SourceNode[] | undefined,
  ): string {
    if (!content) return content;

    // Track which citation numbers are used so we can generate footnote definitions
    const usedCitations = new Set<number>();

    const replacer = (match: string, num: string) => {
      const index = Number.parseInt(num, 10) - 1;
      usedCitations.add(index);
      // Use Obsidian footnote syntax: [^N]
      return `[^${num}]`;
    };

    // Handle both variants we see in responses: 【N†source】 and [N†source]
    const square = /\[(\d+)\s*†\s*source\s*\]/g;
    const curly = /【(\d+)\s*†\s*source\s*】/g;
    const curlyAny = /【(\d+)†[^】]*】/g;
    const squareAny = /\[(\d+)†[^\]]*\]/g;

    let result = content
      .replace(curly, replacer)
      .replace(square, replacer)
      .replace(curlyAny, replacer)
      .replace(squareAny, replacer);

    // B3: bare [N] markers (new backend format). Negative lookahead skips markdown links [label](url).
    // Gate on sources bounds so prose like [citation needed] isn't replaced.
    result = result.replace(/\[(\d+)\](?!\()/g, (m, num) => {
      const idx = Number.parseInt(num, 10) - 1;
      if (!sources || idx < 0 || idx >= sources.length) return m;
      usedCitations.add(idx);
      return `[^${num}]`;
    });

    // Generate footnote definitions for used citations
    if (usedCitations.size > 0 && sources && sources.length > 0) {
      const footnotes: string[] = [];
      const sortedIndices = Array.from(usedCitations).sort((a, b) => a - b);

      for (const index of sortedIndices) {
        const num = index + 1;
        const source = sources[index];
        if (!source) {
          footnotes.push(`[^${num}]: Source not available`);
          continue;
        }

        if (source.filetype === "reference" && source.fileid) {
          // Obsidian internal link
          footnotes.push(`[^${num}]: [[${source.fileid}]]`);
        } else if (source.pdfUrl || source.url) {
          const url = source.pdfUrl || source.url;
          const title = source.filename || "Source";
          footnotes.push(`[^${num}]: [${title}](${url})`);
        } else {
          footnotes.push(`[^${num}]: ${source.filename || "Source"}`);
        }
      }

      if (footnotes.length > 0) {
        result += "\n\n" + footnotes.join("\n");
      }
    }

    return result;
  }

  function handleLogout() {
    isAuthenticated = false;
    messages = [];
    selectedModel = DEFAULT_SETTINGS.selectedModel;
  }

  function handleLogin() {
    // Flush visitor messages to settings before login overwrites
    plugin.settings.chatHistory = messages;
    void plugin.saveSettings();

    isAuthenticated = true;
    loginPromptMode = "none";
    userPrivileges = plugin.settings.userPrivileges ?? [];
    userName = plugin.settings.userName ?? "";
    selectedModel = plugin.settings.selectedModel;
    // Preserve visitor conversation — only clear if account switch wiped history
    if (plugin.settings.chatHistory.length === 0) {
      messages = [];
    }
  }

  function handleShowUpgrade(type: "advanced" | "reasoning" | "quota") {
    upgradeModalType = type;
    showUpgradeModal = true;
  }

  onMount(async () => {
    isAuthenticated = plugin.api.isAuthenticated();
    selectedModel = plugin.settings.selectedModel;
    selectedTools = plugin.settings.selectedTools ?? ["files"];
    connectedNotes = plugin.settings.connectedNotes ?? [];
    messages = plugin.settings.chatHistory ?? [];
    userPrivileges = plugin.settings.userPrivileges ?? [];
    userName = plugin.settings.userName ?? "";

    // Fetch available models from API (with static fallback)
    availableModels = await plugin.api.getModels();

    // Fetch user name if authenticated but name not set
    if (isAuthenticated) {
      const userResult = await plugin.api.getCurrentUser();
      if (userResult.success && userResult.data) {
        const user = userResult.data;
        if (user.personal_library) personalLibraryId = user.personal_library;
        if (!userName) {
          const nameParts = [user.first, user.last].filter(Boolean);
          userName = nameParts.join(" ") || plugin.settings.userEmail;
          plugin.settings.userName = userName;
          await plugin.saveSettings();
        }
      }
    }
  });

  $: if (messages.length > 0 && !isLoading) {
    saveChatHistory();
  }

  $: selectedModelInfo = availableModels.find((m) => m.id === selectedModel);
</script>

<div
  class="logically-root"
  role="application"
  aria-label="Logically AI research assistant"
>
  {#if loginPromptMode !== "none" && !isAuthenticated}
    <LoginPrompt
      {plugin}
      isModal={loginPromptMode === "modal"}
      on:login={handleLogin}
      on:dismiss={() => (loginPromptMode = "none")}
    />
  {:else}
    {#if !isAuthenticated}
      <div class="ra-visitor-banner">
        <span
          >You're in visitor mode (3 messages/day). Sign in for full access.</span
        >
        <div class="ra-visitor-actions">
          <button
            class="ra-btn ra-btn-primary"
            on:click={() => (loginPromptMode = "page")}>Sign in</button
          >
          <button
            class="ra-btn"
            on:click={() =>
              window.open("https://logically.app/signup", "_blank")}
            >Create account</button
          >
        </div>
      </div>
    {/if}
    <header class="ra-header">
      <div class="ra-title">
        <svg width="18" height="18" viewBox="0 0 25 26" fill="currentColor">
          <circle cx="17.4406" cy="7.44062" r="3.44062" />
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M8.404 21.2031C6.86245 21.2031 6.09168 21.2031 5.50289 20.9031C4.98497 20.6392 4.5639 20.2181 4.3 19.7002C4 19.1114 4 18.3407 4 16.7991V8.12875C4 7.48947 4 7.16984 4.04236 6.90239C4.27554 5.43017 5.43017 4.27554 6.90239 4.04236C7.16984 4 7.48947 4 8.12875 4C8.76802 4 9.08765 4 9.3551 4.04236C10.8273 4.27554 11.982 5.43017 12.2151 6.90239C12.2575 7.16984 12.2575 7.48947 12.2575 8.12875V12.9455H17.073C17.7123 12.9455 18.0319 12.9455 18.2994 12.9879C19.7716 13.2211 20.9262 14.3757 21.1594 15.8479C21.2017 16.1154 21.2017 16.435 21.2017 17.0743C21.2017 17.7136 21.2017 18.0332 21.1594 18.3006C20.9262 19.7729 19.7716 20.9275 18.2994 21.1607C18.0319 21.203 17.7123 21.203 17.073 21.203H12.2575V21.2031H8.404ZM10.8807 12.9455H10.8799V19.8262H6.75195L6.75195 7.43993C6.75195 6.29981 7.6762 5.37556 8.81633 5.37556C9.95645 5.37556 10.8807 6.29981 10.8807 7.43994V12.9455ZM12.2575 19.8272H17.7589C18.899 19.8272 19.8233 18.903 19.8233 17.7628C19.8233 16.6227 18.899 15.6985 17.7589 15.6985H12.2575V19.8272Z"
          />
        </svg>
        <span>Logically's AI Research Assistant</span>
      </div>
      <div class="ra-actions">
        <button
          type="button"
          class="ra-btn ra-btn-settings"
          on:click={() => (showSettingsPanel = true)}
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            ></path>
          </svg>
        </button>
        <button
          type="button"
          class="ra-btn ra-btn-icon"
          on:click={handleClearChat}
          disabled={messages.length === 0}
          title="Clear chat"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </header>

    <div class="ra-messages">
      <MessageList
        {messages}
        {isLoading}
        {currentResponse}
        {app}
        searchMode={selectedTools[0] ?? "files"}
        {userName}
        models={availableModels}
        {liveStage}
        {liveGeneratingStarted}
        {liveAssistantId}
        on:insertToNote={(e) => handleInsertToNote(e.detail)}
        on:deleteFromIndex={(e) => handleDeleteFromIndex(e.detail)}
        on:regenerate={(e) => handleRegenerate(e.detail)}
        on:openConnectNotes={handleOpenConnectNotes}
        on:selectFollowUp={(e) => handleSendMessage(e.detail)}
      />
    </div>

    <ChatInput
      on:send={(e) => handleSendMessage(e.detail)}
      on:modelChange={(e) => handleModelChange(e.detail)}
      on:toolsChange={(e) => handleToolsChange(e.detail)}
      on:showUpgrade={(e) => handleShowUpgrade(e.detail)}
      on:openConnectNotes={handleOpenConnectNotes}
      on:requestLogin={() => (loginPromptMode = "modal")}
      disabled={isLoading}
      selectedModel={isAuthenticated
        ? selectedModel
        : DEFAULT_SETTINGS.selectedModel}
      {selectedTools}
      userPrivileges={isAuthenticated ? userPrivileges : []}
      fileCount={connectedNotes.length}
      models={availableModels}
      {isAuthenticated}
    />
  {/if}
</div>

<UpgradeModal
  bind:isOpen={showUpgradeModal}
  modelType={upgradeModalType}
  on:close={() => (showUpgradeModal = false)}
/>

<ConnectNotesModal
  {app}
  isOpen={connectModalOpen}
  isSyncing={connectSyncing}
  initialSelectedPaths={connectedNotes.map((n) => n.vaultPath)}
  on:submit={(e) => handleConnectSubmit(e.detail)}
  on:close={() => (connectModalOpen = false)}
/>

<SettingsPanel
  {plugin}
  isOpen={showSettingsPanel}
  {isAuthenticated}
  on:close={() => (showSettingsPanel = false)}
  on:logout={handleLogout}
  on:login={() => {
    loginPromptMode = "modal";
  }}
/>

<style>
  .logically-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    gap: 12px;
    background: var(--background-primary);
    box-sizing: border-box;
  }

  .ra-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .ra-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: var(--text-normal);
  }

  .ra-title svg {
    color: var(--interactive-accent);
  }

  .ra-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .ra-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 13px;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ra-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .ra-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ra-btn-settings {
    padding: 6px;
  }

  .ra-btn-icon {
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ra-messages {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .ra-visitor-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--background-secondary);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .ra-visitor-actions {
    display: flex;
    gap: 8px;
  }

  .ra-btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .ra-btn-primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    color: var(--text-on-accent);
  }
</style>
