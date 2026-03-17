import { requestUrl } from "obsidian";
import type { RequestUrlParam } from "obsidian";
import type {
  ApiResponse,
  AutoSuggestQuota,
  AutoSuggestResponse,
  BaseModel,
  ChatMessage,
  LogicallySettings,
  ModelEntity,
  PlanInfo,
  Privilege,
  UserInfo,
  SearchMode,
  SourceNode,
} from "../types";
import {
  type AutoSuggestStreamHandler,
  streamAutoSuggestMarkdown,
  streamCompletionViaRequestUrl,
} from "./streamingClient";
import {
  AI_MODELS,
  DEFAULT_SETTINGS,
  ModelCategory,
  SEARCH_MODE_TO_TOOL,
} from "../types";
import { IS_DEV_BUILD } from "utils/env";

// Module-level caching for models
let cachedModels: ModelEntity[] | null = null;
let fetchPromise: Promise<ModelEntity[]> | null = null;

const DEFAULT_SESSION_FIELDS = () => {
  const now = new Date();
  return {
    _id: "",
    sharing: false,
    name: "",
    system: "",
    files: [] as unknown[],
    tool: "doc_retrieval",
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
          | { id?: string; email?: string; privileges?: Privilege[] }
          | undefined;
        const user: UserInfo = {
          id: rawUser?.id ?? "",
          email: rawUser?.email ?? normalizedEmail,
          privileges: rawUser?.privileges ?? [],
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
          | { id?: string; email?: string; privileges?: Privilege[] }
          | undefined;
        const email = (data.email as string | undefined) ?? "";
        const user: UserInfo = {
          id: rawUser?.id ?? "",
          email: rawUser?.email ?? email,
          privileges: rawUser?.privileges ?? [],
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
    searchMode: SearchMode = "files",
    contextNotes?: string,
    fileAttachments?: Array<{ type: "file"; data: string }>,
  ) {
    const base = DEFAULT_SESSION_FIELDS();
    // Set the tool based on search mode
    base.tool = SEARCH_MODE_TO_TOOL[searchMode] || "doc_retrieval";

    // Send custom instructions directly - backend prepends "Additional instruction:"
    const notes = (contextNotes ?? "").trim();
    if (notes) {
      base.system = notes;
    }
    // Build user message with optional file attachments
    const userMsg: {
      role: "user";
      content: string;
      attachments?: Array<{ type: "file"; data: string }>;
    } = {
      role: "user" as const,
      content: message,
    };
    if (fileAttachments && fileAttachments.length > 0) {
      userMsg.attachments = fileAttachments;
    }
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
    searchMode: SearchMode = "files",
    onCitation?: (sources: SourceNode[]) => void,
    fileAttachments?: Array<{ type: "file"; data: string }>,
    options?: { endpoint?: string; skipAuth?: boolean },
  ): Promise<void> {
    if (!options?.skipAuth && !this.settings.userToken) {
      onError("You are not logged in");
      return;
    }

    try {
      const payload = this.buildCompletionPayload(
        message,
        conversationHistory,
        searchMode,
        contextNotes,
        fileAttachments,
      );
      const headers = this.buildAuthHeaders({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify(payload)).toString(),
      });
      await streamCompletionViaRequestUrl(
        this.getUrl(options?.endpoint ?? "/app/completion"),
        JSON.stringify(payload),
        headers,
        (json, status) => this.parseError(json, status),
        { onChunk, onComplete, onError, onCitation },
      );
    } catch (error) {
      console.error("[Logically API] Stream failed:", error);
      onError(
        error instanceof Error ? error.message : "Failed to get response",
      );
    }
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
   * Request an auto-suggestion from the backend.
   */
  async getAutoSuggestion(params: {
    text: string;
    model?: string;
    options?: {
      regenerate?: boolean;
      temperature?: number;
      is_internal_source?: boolean;
      is_external_source?: boolean;
    };
  }): Promise<ApiResponse<AutoSuggestResponse>> {
    return this.request<AutoSuggestResponse>("/obsidian/autosuggest/suggest", {
      method: "POST",
      body: JSON.stringify({
        text: params.text,
        model: params.model,
        options: params.options,
      }),
    });
  }

  /**
   * Request an auto-suggestion as streaming markdown text.
   */
  async streamAutoSuggestion(
    params: {
      text: string;
      model?: string;
      options?: {
        regenerate?: boolean;
        temperature?: number;
        is_internal_source?: boolean;
        is_external_source?: boolean;
      };
    },
    handlers?: AutoSuggestStreamHandler,
  ): Promise<ApiResponse<{ suggestion: string }>> {
    if (!this.settings.userToken) {
      return { success: false, error: "Not authenticated" };
    }

    const url = this.getUrl("/obsidian/autosuggest/suggest/stream");
    const body = JSON.stringify({
      text: params.text,
      model: params.model,
      options: params.options,
    });
    const headers = this.buildAuthHeaders({
      "Content-Type": "application/json",
      Accept: "text/markdown",
      "Content-Length": Buffer.byteLength(body).toString(),
    });

    return streamAutoSuggestMarkdown(
      url,
      body,
      headers,
      (json, status) => this.parseError(json, status),
      handlers,
    );
  }

  /**
   * Record acceptance of an auto-suggestion (increments daily quota for free users).
   */
  async acceptAutoSuggestion(params?: {
    regenerate?: boolean;
  }): Promise<ApiResponse<AutoSuggestQuota>> {
    return this.request<AutoSuggestQuota>(
      "/obsidian/autosuggest/suggest/accept",
      {
        method: "POST",
        body: JSON.stringify({ regenerate: params?.regenerate ?? false }),
      },
    );
  }

  /**
   * Get current daily auto-suggest quota.
   */
  async getAutoSuggestQuota(): Promise<ApiResponse<AutoSuggestQuota>> {
    return this.request<AutoSuggestQuota>(
      "/obsidian/autosuggest/suggest/daily-quota",
    );
  }

  /**
   * Logout and clear the token.
   */
  logout(): void {
    // Token clearing is handled by the settings
  }
}
