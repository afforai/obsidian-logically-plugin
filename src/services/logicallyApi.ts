import { requestUrl } from "obsidian";
import type { RequestUrlParam } from "obsidian";
import * as https from "https";
import { URL } from "url";
import type {
  ApiResponse,
  BaseModel,
  ChatMessage,
  LogicallySettings,
  ModelEntity,
  PlanInfo,
  Privilege,
  Tool,
  UserInfo,
  SourceNode,
} from "../types";
import { AI_MODELS, DEFAULT_SETTINGS, ModelCategory } from "../types";
import { IS_DEV_BUILD } from "../utils/env";

// Module-level caching for models
let cachedModels: ModelEntity[] | null = null;
let fetchPromise: Promise<ModelEntity[]> | null = null;

/**
 * Citation frame payload forwarded intact from CITATION / CITATION:<tool> frames.
 * `sources` is the legacy flat array (consumed by SourcesTable); `tool` + `metadatas`
 * are the v2 per-tool payload consumed by the thinking-panel step builder (B14).
 */
export interface CitationPayload {
  tool: string;
  metadatas: Record<string, unknown>;
  sources: SourceNode[];
  /** Raw parsed payload forwarded to stage recorder for verbatim frontend buildSteps path. */
  rawPayload: Record<string, unknown>;
}

type StreamHandler = {
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onCitation?: (payload: CitationPayload) => void;
  /** RA v2: REASON frame payload forwarded intact (type may be "reason" or "tool_decision"). */
  onReason?: (payload: {
    type?: string;
    summary?: string;
    reason?: string;
    tool?: string;
    tool_decisions?: Record<string, { summary: string; reason: string }>;
  }) => void;
  /** RA v2: TOOL frame (start/end + name + status). */
  onTool?: (payload: {
    name: string;
    phase: "start" | "end";
    status?: "ok" | "failed" | "timeout";
    count?: number;
    summary?: string;
    reason?: string;
  }) => void;
  /** RA v2: STATUS token (e.g. ".searching_library", ".combined_quota_exceeded"). */
  onStatus?: (token: string) => void;
  /** B26: follow-up question suggestions (SUGGEST_QUESTIONS frame). */
  onSuggestQuestions?: (questions: string[]) => void;
  /** B27: fallback tool name when v1 bare CITATION payload lacks tool/source_type. */
  defaultTool?: string;
};

// B1: widened to accept colon-tagged keys (CITATION:search_library, TOOL_RESULT:search_web).
// Backreference \1 ensures opening/closing tags match exactly.
const STREAM_TOKEN_REGEX = /❬([A-Za-z_:]+)❭([\s\S]*?)❬\/\1❭/g;

const DEFAULT_SESSION_FIELDS = () => {
  const now = new Date();
  return {
    _id: "",
    sharing: false,
    name: "",
    system: "",
    files: [] as unknown[],
    tool: "doc_retrieval", // v1 legacy field; v2 ignores in favor of tools[]
    // B2: RA v2 opt-in flag — unconditional per upgrade spec.
    ra_v2_opt_in: true,
    // B3: opt into v2 wire protocol so backend emits ❬TOOL❭ / ❬TOOL_RESULT:*❭ frames.
    streamProtocolVersion: 2,
    parserReady: true,
    tools: [] as Tool[],
    google_auto: true,
    google_gl: "us",
    google_hl: "en",
    google_tbs: "any",
    google_tbs_min_enable: true,
    google_tbs_min: now,
    google_tbs_max_enable: true,
    google_tbs_max: now,
    google_include: [] as string[],
    google_exclude: [] as string[],
    semantic_scholar_auto: true,
    semantic_scholar_types: [] as string[],
    semantic_scholar_fields: [] as string[],
    semantic_scholar_tbs_min_enable: true,
    semantic_scholar_tbs_min: now,
    semantic_scholar_tbs_max_enable: true,
    semantic_scholar_tbs_max: now,
    semantic_scholar_open_access: false,
    created: now,
    accessed: now,
  };
};

const unescapeStream = (value: string) =>
  value.replace(/❪/g, "❬").replace(/❫/g, "❭");

/**
 * Logically API client for interacting with the Logically backend.
 */
export class LogicallyApi {
  private settings: LogicallySettings;

  constructor(settings: LogicallySettings) {
    this.settings = settings;
  }

  /**
   * Update the settings reference (call after settings change).
   */
  updateSettings(settings: LogicallySettings): void {
    this.settings = settings;
  }

  /**
   * Get the full API URL for an endpoint.
   */
  private getUrl(endpoint: string): string {
    const baseUrl = IS_DEV_BUILD
      ? this.settings.apiUrl
      : DEFAULT_SETTINGS.apiUrl;
    const base = baseUrl.replace(/\/$/, "");
    return `${base}${endpoint}`;
  }

  private buildAuthHeaders(
    additional?: Record<string, string>,
  ): Record<string, string> {
    return this.settings.userToken
      ? { "x-access-token": this.settings.userToken, ...additional }
      : { ...additional };
  }

  private parseError(json: unknown, status: number): string {
    if (!json) return `Request failed with status ${status}`;
    if (typeof json === "string") return json;
    if (typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if (typeof obj.code === "string") return obj.code;
      if (typeof obj.message === "string") return obj.message;
    }
    return `Request failed with status ${status}`;
  }

  /**
   * Make an authenticated API request.
   */
  private async request<T>(
    endpoint: string,
    options: Partial<RequestUrlParam> = {},
  ): Promise<ApiResponse<T>> {
    if (!this.settings.userToken) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      const response = await requestUrl({
        url: this.getUrl(endpoint),
        method: options.method ?? "GET",
        throw: false,
        headers: {
          "Content-Type": "application/json",
          ...this.buildAuthHeaders(options.headers),
        },
        body: options.body,
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true, data: response.json as unknown as T };
      }

      // Detect auth failure before parseError loses HTTP status
      if (response.status === 401) {
        return { success: false, error: "[auth_expired]" };
      }

      const errorMessage = this.parseError(
        response.json as unknown,
        response.status,
      );
      return { success: false, error: errorMessage };
    } catch (error) {
      console.error("[Logically API] Request failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Check if the user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!this.settings.userToken;
  }

  /**
   * Login with email and password.
   */
  async login(
    email: string,
    password: string,
  ): Promise<ApiResponse<{ token: string; user: UserInfo }>> {
    try {
      const normalizedEmail = email.trim();
      const response = await requestUrl({
        url: this.getUrl("/signin"),
        method: "POST",
        throw: false,
        contentType: "application/json",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as Record<string, unknown>;
        const token = (data.token ?? data.accessToken) as string | undefined;
        const rawUser = data.user as
          | {
              id?: string;
              email?: string;
              privileges?: Privilege[];
              personal_library?: string;
            }
          | undefined;
        const user: UserInfo = {
          id: rawUser?.id ?? "",
          email: rawUser?.email ?? normalizedEmail,
          privileges: rawUser?.privileges ?? [],
          personal_library: rawUser?.personal_library,
        };
        return {
          success: true,
          data: {
            token: token ?? "",
            user,
          },
        };
      }

      const errorMessage = this.parseError(
        response.json as unknown,
        response.status,
      );
      return { success: false, error: errorMessage };
    } catch (error) {
      console.error("[Logically API] Login failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed",
      };
    }
  }

  /**
   * Login with Google OAuth access token.
   * Backend verifies the token with Google and returns a JWT.
   */
  async loginWithGoogle(
    accessToken: string,
  ): Promise<ApiResponse<{ token: string; user: UserInfo; email: string }>> {
    try {
      const response = await requestUrl({
        url: this.getUrl("/google_oauth"),
        method: "POST",
        throw: false,
        contentType: "application/json",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as Record<string, unknown>;
        const token = (data.token ?? data.accessToken) as string | undefined;
        if (!token || token === "null") {
          return { success: false, error: "No token received from server" };
        }
        const rawUser = data.user as
          | {
              id?: string;
              email?: string;
              privileges?: Privilege[];
              personal_library?: string;
            }
          | undefined;
        const email = (data.email as string | undefined) ?? "";
        const user: UserInfo = {
          id: rawUser?.id ?? "",
          email: rawUser?.email ?? email,
          privileges: rawUser?.privileges ?? [],
          personal_library: rawUser?.personal_library,
        };
        return {
          success: true,
          data: {
            token,
            user,
            email,
          },
        };
      }

      const errorMessage = this.parseError(
        response.json as unknown,
        response.status,
      );
      return { success: false, error: errorMessage };
    } catch (error) {
      console.error("[Logically API] Google OAuth failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Google login failed",
      };
    }
  }

  /**
   * Verify the current token is valid.
   */
  async verifyToken(): Promise<ApiResponse<UserInfo>> {
    return this.request<UserInfo>("/user");
  }

  /**
   * Get current user information.
   */
  async getCurrentUser(): Promise<ApiResponse<UserInfo>> {
    return this.request<UserInfo>("/user");
  }

  /**
   * Get current user's plan information (includes privileges).
   */
  async getUserPlan(): Promise<ApiResponse<PlanInfo>> {
    return this.request<PlanInfo>("/plan");
  }

  /**
   * Send a chat message to the research assistant.
   */
  private buildCompletionPayload(
    message: string,
    conversationHistory: ChatMessage[],
    tools: Tool[],
    contextNotes?: string,
    /** Inline vault-note context: each note read fresh from disk and injected into system prompt. */
    attachments?: { path: string; content: string }[],
  ) {
    const base = DEFAULT_SESSION_FIELDS();
    // B8: tools[] is the source of truth; legacy `tool` derived from tools[0] for v1 backends.
    // search_library has no v1 equivalent — exclude from base.tools and leave base.tool empty.
    const effectiveTools = tools.length > 0 ? tools : ([] as Tool[]);
    const v1Tools = effectiveTools
      .filter((t) => t !== "search_library")
      .map((t) =>
        t === "search_web"
          ? "google"
          : t === "search_academic"
            ? "semantic_scholar"
            : t,
      );
    base.tools = v1Tools as unknown as Tool[];
    const primaryTool = effectiveTools[0];
    base.tool =
      primaryTool === "search_web"
        ? "google"
        : primaryTool === "search_academic"
          ? "semantic_scholar"
          : "";

    // Send custom instructions directly - backend prepends "Additional instruction:"
    const notes = (contextNotes ?? "").trim();
    if (notes) {
      base.system = notes;
    }
    // B19: inline attached vault notes into the system prompt as primary context.
    if (attachments && attachments.length > 0) {
      const ctx = attachments
        .map((a) => `## ${a.path}\n${a.content}`)
        .join("\n\n---\n\n");
      base.system = `${notes ? notes + "\n\n---\n\n" : ""}# Attached vault notes (use as primary context)\n\n${ctx}`;
    }
    const userMsg = {
      role: "user" as const,
      content: message,
    };
    const history = [
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      userMsg,
    ];
    return {
      session: { ...base, history },
      externalData: { location: "research_assistant" },
      heartbeat: 5000,
    };
  }

  /**
   * Stream a chat response.
   *
   * IMPORTANT: In Obsidian (Electron), browser `fetch` requests can be blocked by CORS.
   * We use Node's `https` to stream the response without CORS restrictions.
   */
  async streamMessage(
    message: string,
    _model: BaseModel,
    conversationHistory: ChatMessage[] = [],
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    contextNotes?: string,
    tools: Tool[] = ["search_library"],
    onCitation?: (payload: CitationPayload) => void,
    attachments?: { path: string; content: string }[],
    options?: {
      endpoint?: string;
      skipAuth?: boolean;
      onReason?: StreamHandler["onReason"];
      onTool?: StreamHandler["onTool"];
      onStatus?: StreamHandler["onStatus"];
      onSuggestQuestions?: StreamHandler["onSuggestQuestions"];
    },
  ): Promise<void> {
    if (!options?.skipAuth && !this.settings.userToken) {
      onError("You are not logged in");
      return;
    }

    try {
      const payload = this.buildCompletionPayload(
        message,
        conversationHistory,
        tools,
        contextNotes,
        attachments,
      );
      const effectiveTools =
        tools.length > 0 ? tools : (["search_library"] as Tool[]);
      await this.streamCompletionViaRequestUrl(
        this.getUrl(options?.endpoint ?? "/app/completion"),
        JSON.stringify(payload),
        {
          onChunk,
          onComplete,
          onError,
          onCitation,
          onReason: options?.onReason,
          onTool: options?.onTool,
          onStatus: options?.onStatus,
          onSuggestQuestions: options?.onSuggestQuestions,
          // B27: enables emitCitation to attribute v1 bare CITATION (no tool/source_type) to the active tool.
          defaultTool: effectiveTools[0] ?? "",
        },
      );
    } catch (error) {
      console.error("[Logically API] Stream failed:", error);
      onError(
        error instanceof Error ? error.message : "Failed to get response",
      );
    }
  }

  private async streamCompletionViaRequestUrl(
    url: string,
    body: string,
    handlers: StreamHandler,
  ): Promise<void> {
    const parsedUrl = new URL(url);
    const headers = this.buildAuthHeaders({
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    });

    return new Promise((resolve) => {
      const req = https.request(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || undefined,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers,
        },
        (res) => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            let errorBody = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              errorBody += String(chunk);
            });
            res.on("end", () => {
              try {
                const parsed: unknown = errorBody
                  ? JSON.parse(errorBody)
                  : null;
                handlers.onError(this.parseError(parsed, statusCode));
              } catch {
                handlers.onError(
                  this.parseError(errorBody || null, statusCode),
                );
              }
              resolve();
            });
            return;
          }

          this.consumeNodeStream(res, handlers)
            .then(resolve)
            .catch((err) => {
              handlers.onError(
                err instanceof Error ? err.message : String(err),
              );
              resolve();
            });
        },
      );

      req.on("error", (err) => {
        handlers.onError(err instanceof Error ? err.message : String(err));
        resolve();
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Get available libraries/documents for the user.
   */
  async getLibraries(): Promise<
    ApiResponse<Array<{ id: string; name: string }>>
  > {
    return this.request("/app/libraries");
  }

  async updateBaseModel(model: BaseModel): Promise<ApiResponse<unknown>> {
    return this.request("/app/user_config", {
      method: "PUT",
      body: JSON.stringify({ update: { base_model: model } }),
    });
  }

  /**
   * Fetch available AI models from backend API.
   * Returns cached models if available, otherwise fetches from API.
   * Falls back to static AI_MODELS list on error.
   */
  async getModels(): Promise<ModelEntity[]> {
    if (cachedModels) return cachedModels;
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
      try {
        const response = await requestUrl({
          url: this.getUrl("/app/models"),
          method: "GET",
        });
        if (response.status >= 200 && response.status < 300) {
          const data = response.json as {
            models: Array<{
              id: string;
              display_name: string;
              description: string;
              category: string;
              tag?: string;
            }>;
          };
          cachedModels = data.models
            .filter((m) => m.id !== "custom")
            .map((m) => ({
              id: m.id as BaseModel,
              name: m.display_name,
              description: m.description,
              category:
                ModelCategory[m.category as keyof typeof ModelCategory] ||
                ModelCategory.standard,
              tag: m.tag,
            }));
          return cachedModels;
        }
      } catch {
        // Fallback to static list on error
      }
      fetchPromise = null;
      return AI_MODELS;
    })();
    return fetchPromise;
  }

  /**
   * Parse a CITATION / CITATION:<tool> payload into {tool, metadatas, sources}
   * and forward intact (B14).
   *
   * Tool resolution chain (B27):
   *   1. `toolFromTag` — suffix from v2 ❬CITATION:<tool>❭ frame.
   *   2. `parsed.tool` — explicit field on v2 payload.
   *   3. `parsed.source_type` normalized — v1 bare ❬CITATION❭ frames (RA_V2_PIPELINE=false)
   *      emit {completion, metadatas, nodes, source_type:"web"|"academic"|"library"}.
   *   4. `defaultTool` — last-resort fallback from caller-supplied effectiveTools[0]
   *      (covers v1 payloads lacking source_type entirely).
   */
  private emitCitation(
    payload: string,
    onCitation: (p: CitationPayload) => void,
    toolFromTag: string,
    defaultTool: string = "",
  ): void {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const nodes = parsed.nodes;
      const legacySrc =
        typeof parsed.source_type === "string" ? parsed.source_type : "";
      const normalizedLegacy =
        legacySrc === "web"
          ? "search_web"
          : legacySrc === "academic"
            ? "search_academic"
            : legacySrc === "library"
              ? "search_library"
              : legacySrc;
      const tool =
        toolFromTag ||
        (typeof parsed.tool === "string" ? parsed.tool : "") ||
        normalizedLegacy ||
        defaultTool ||
        "";
      // B36: stamp canonical tool onto each SourceNode so the final aggregate
      // SourcesTable can group sources into per-tool tabs (All/Library/Academic/Web).
      const toolTyped =
        tool === "search_library" ||
        tool === "search_academic" ||
        tool === "search_web"
          ? (tool as Tool)
          : undefined;
      const sources: SourceNode[] =
        nodes && Array.isArray(nodes)
          ? (nodes as Record<string, unknown>[]).map((n) => ({
              fileid: n.fileid as string | undefined,
              filename: (n.filename as string) ?? "Unknown",
              filetype: (n.filetype as string) ?? "",
              url: n.url as string | undefined,
              pdfUrl: n.pdfUrl as string | undefined,
              pages: n.pages as number[] | undefined,
              content: n.content as string | undefined,
              citationCount: (n.others as Record<string, unknown> | undefined)
                ?.citation_count as number | undefined,
              referenceCount: (n.others as Record<string, unknown> | undefined)
                ?.reference_count as number | undefined,
              toolType: toolTyped,
            }))
          : [];
      const rawMetadatas =
        (parsed.metadatas as Record<string, unknown> | undefined) ?? {};
      // B2: mirror frontend update_chat.ts:88-98 — stamp canonical tool onto
      // each metadatas entry so SourcesTable per-tool filtering works for
      // refs built from metadatas (not just sources[]).
      const metadatas: Record<string, unknown> = Object.fromEntries(
        Object.entries(rawMetadatas).map(([k, v]) => [
          k,
          (Array.isArray(v) ? v : [v]).map((item) => ({
            ...(item as Record<string, unknown>),
            toolType: toolTyped,
          })),
        ]),
      );
      // Forward stamped metadatas through rawPayload too so downstream
      // buildRefsFromMetadatas sees the toolType stamp.
      const stampedPayload = { ...parsed, metadatas };
      onCitation({ tool, metadatas, sources, rawPayload: stampedPayload });
    } catch {
      /* ignore parse errors */
    }
  }

  private async consumeNodeStream(
    body: NodeJS.ReadableStream,
    handlers: StreamHandler,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    const handlePacket = (key: string, rawValue: string) => {
      const payload = unescapeStream(rawValue);
      // B1+B3+B14: v2 colon-tagged citation frames forward {tool, metadatas, sources} intact.
      // TOOL_RESULT:* arrives before CITATION:* with empty metadatas; frontend update_chat.ts
      // ignores TOOL_RESULT entirely. Mirror that: skip so buildSteps sees only the populated
      // CITATION:* event (otherwise data.find picks the empty one → "No results found").
      if (key.startsWith("TOOL_RESULT:")) {
        return;
      }
      if (key.startsWith("CITATION:")) {
        if (handlers.onCitation) {
          const tool = key.split(":")[1] ?? "";
          this.emitCitation(
            payload,
            handlers.onCitation,
            tool,
            handlers.defaultTool ?? "",
          );
        }
        return;
      }
      switch (key) {
        case "COMPLETION": {
          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const chunk = parsed.chunk;
            if (typeof chunk === "string") handlers.onChunk(chunk);
            else handlers.onChunk(JSON.stringify(parsed));
          } catch {
            handlers.onChunk(payload);
          }
          break;
        }
        case "CITATION": {
          if (handlers.onCitation) {
            this.emitCitation(
              payload,
              handlers.onCitation,
              "",
              handlers.defaultTool ?? "",
            );
          }
          break;
        }
        case "ERROR": {
          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const code = parsed.code;
            const message = parsed.message;
            handlers.onError(
              (typeof code === "string" ? code : null) ??
                (typeof message === "string" ? message : null) ??
                "Request failed",
            );
          } catch {
            handlers.onError(payload || "Request failed");
          }
          completed = true;
          break;
        }
        case "DONE": {
          completed = true;
          handlers.onComplete();
          break;
        }
        case "REASON": {
          if (handlers.onReason) {
            try {
              const parsed = JSON.parse(payload) as {
                type?: string;
                summary?: string;
                reason?: string;
                tool?: string;
                tool_decisions?: Record<
                  string,
                  { summary: string; reason: string }
                >;
              };
              handlers.onReason(parsed);
            } catch {
              /* ignore */
            }
          }
          break;
        }
        case "TOOL": {
          if (handlers.onTool) {
            try {
              const parsed = JSON.parse(payload) as {
                name: string;
                phase: "start" | "end";
                status?: "ok" | "failed" | "timeout";
                count?: number;
                summary?: string;
                reason?: string;
              };
              handlers.onTool(parsed);
            } catch {
              /* ignore */
            }
          }
          break;
        }
        case "STATUS": {
          // B5: route STATUS tokens (e.g. ".combined_quota_exceeded", ".searching_library").
          // Quota/error tokens are converted to onError so UI shows them as failures;
          // lifecycle tokens flow to onStatus for the thinking panel.
          const token = payload.trim();
          if (
            token === ".combined_quota_exceeded" ||
            token === ".combined_quota_visitor_denied" ||
            token === ".combined_quota_visitor_blocked" ||
            token === ".error_v2"
          ) {
            handlers.onError(token);
            completed = true;
            break;
          }
          if (handlers.onStatus) handlers.onStatus(token);
          break;
        }
        case "SUGGEST_QUESTIONS": {
          if (handlers.onSuggestQuestions) {
            try {
              const arr = JSON.parse(payload) as unknown[];
              if (Array.isArray(arr)) {
                handlers.onSuggestQuestions(
                  arr.filter((q): q is string => typeof q === "string"),
                );
              }
            } catch {
              /* ignore */
            }
          }
          break;
        }
        default:
          break;
      }
    };

    const flushBuffer = () => {
      STREAM_TOKEN_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      while ((match = STREAM_TOKEN_REGEX.exec(buffer)) !== null) {
        lastIndex = STREAM_TOKEN_REGEX.lastIndex;
        const key = match[1];
        const value = match[2];
        if (key && value !== undefined) {
          handlePacket(key, value);
        }
      }
      buffer = buffer.slice(lastIndex);
    };

    return await new Promise((resolve) => {
      const onData = (chunk: unknown) => {
        if (completed) return;
        if (typeof chunk === "string") {
          buffer += chunk;
        } else {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        }
        flushBuffer();
        if (completed) {
          body.removeListener("data", onData);
          body.removeListener("end", onEnd);
          body.removeListener("error", onError);
          resolve();
        }
      };

      const onEnd = () => {
        flushBuffer();
        if (!completed) handlers.onComplete();
        body.removeListener("data", onData);
        body.removeListener("end", onEnd);
        body.removeListener("error", onError);
        resolve();
      };

      const onError = (err: unknown) => {
        handlers.onError(err instanceof Error ? err.message : String(err));
        body.removeListener("data", onData);
        body.removeListener("end", onEnd);
        body.removeListener("error", onError);
        resolve();
      };

      body.on("data", onData);
      body.on("end", onEnd);
      body.on("error", onError);
    });
  }

  /**
   * Logout and clear the token.
   */
  logout(): void {
    // Token clearing is handled by the settings
  }
}
