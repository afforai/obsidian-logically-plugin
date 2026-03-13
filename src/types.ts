import type { Plugin } from "obsidian";
import type { LogicallyApi } from "./services/logicallyApi";
import type { ResearchAssistantView } from "./views/researchAssistantView";

export const VIEW_TYPE_RESEARCH_ASSISTANT = "logically-research-assistant";

/** Search modes matching backend tools */
export type SearchMode = "files" | "google" | "semantic";

/** Search mode to backend tool mapping */
export const SEARCH_MODE_TO_TOOL: Record<SearchMode, string> = {
  files: "doc_retrieval",
  google: "google",
  semantic: "semantic_scholar",
};

/** Model categories matching the frontend design */
export enum ModelCategory {
  standard = "standard",
  advanced = "advanced",
  reasoning = "reasoning",
}

/** Base model identifiers - matches backend */
export type BaseModel =
  | "gemini_flash"
  | "gemini_pro"
  | "openai_gpt_5_mini"
  | "openai_gpt_51"
  | "anthropic_claude_haiku"
  | "anthropic_claude_sonnet"
  | "gemini_reasoning"
  | "openai_reasoning"
  | "anthropic_claude_reasoning";

/** Model entity definition for UI display */
export interface ModelEntity {
  id: BaseModel;
  name: string;
  description: string;
  category: ModelCategory;
  tag?: string;
}

/**
 * Static model list — used as fallback when API unavailable.
 * Prefer api.getModels() for fresh data.
 */
export const AI_MODELS: ModelEntity[] = [
  // Standard models
  {
    id: "gemini_flash",
    name: "Gemini Flash 2.5",
    description: "Fast and efficient for basic research tasks",
    category: ModelCategory.standard,
    tag: "Recommended",
  },
  {
    id: "openai_gpt_5_mini",
    name: "GPT-5 mini",
    description: "Compact GPT model for quick responses",
    category: ModelCategory.standard,
  },
  {
    id: "anthropic_claude_haiku",
    name: "Claude Haiku 4.5",
    description: "Fast Claude model for basic tasks",
    category: ModelCategory.standard,
  },
  // Advanced models
  {
    id: "gemini_pro",
    name: "Gemini Pro 2.5",
    description: "Powerful model with large context window",
    category: ModelCategory.advanced,
    tag: "Recommended",
  },
  {
    id: "openai_gpt_51",
    name: "GPT-5.1",
    description: "Enterprise-level GPT with enhanced capabilities",
    category: ModelCategory.advanced,
  },
  {
    id: "anthropic_claude_sonnet",
    name: "Claude Sonnet 4.6",
    description: "Balanced Claude model for complex tasks",
    category: ModelCategory.advanced,
  },
  // Reasoning models
  {
    id: "gemini_reasoning",
    name: "Gemini 3.1 Pro Preview",
    description: "Optimized for complex reasoning tasks",
    category: ModelCategory.reasoning,
    tag: "Recommended",
  },
  {
    id: "openai_reasoning",
    name: "GPT-5.4",
    description: "Advanced reasoning with step-by-step analysis",
    category: ModelCategory.reasoning,
  },
  {
    id: "anthropic_claude_reasoning",
    name: "Claude Opus 4.6",
    description: "Top-tier reasoning capabilities",
    category: ModelCategory.reasoning,
  },
];

/** Plugin settings stored in Obsidian */
export interface LogicallySettings {
  /** User's authentication token */
  userToken: string;
  /** API base URL */
  apiUrl: string;
  /** Whether to show the ribbon icon */
  showRibbon: boolean;
  /** Selected AI model */
  selectedModel: BaseModel;
  /** Selected search mode */
  searchMode: SearchMode;
  /** Free-form notes included as extra context for completions */
  contextNotes: string;
  /** Selected vault files to include as context */
  contextFiles: string[];
  /** Persisted chat history */
  chatHistory: ChatMessage[];
  /** User privileges (cached from last login/fetch) */
  userPrivileges: Privilege[];
  /** User email (cached) */
  userEmail: string;
  /** User display name (cached) */
  userName: string;
  /** Custom instruction prepended to all prompts */
  customInstruction: string;
  /** Last successfully logged in email - used to detect account switches and wipe history */
  lastLoggedInEmail: string;
}

/** Default settings */
export const DEFAULT_SETTINGS: LogicallySettings = {
  userToken: "",
  apiUrl: "https://api.logically.app",
  showRibbon: true,
  selectedModel: "gemini_flash",
  searchMode: "files",
  contextNotes: "",
  contextFiles: [],
  chatHistory: [],
  userPrivileges: [],
  userEmail: "",
  userName: "",
  customInstruction: "",
  lastLoggedInEmail: "",
};

/** Source node from AI response (citation data) */
export interface SourceNode {
  /** File ID for uploaded documents */
  fileid?: string;
  /** Display name */
  filename: string;
  /** Type: 'goog', 'semantic_scholar', or document type */
  filetype: string;
  /** URL for web sources */
  url?: string;
  /** PDF URL for semantic scholar */
  pdfUrl?: string;
  /** Page numbers referenced */
  pages?: number[];
  /** Content excerpt */
  content?: string;
  /** Citation count for semantic scholar */
  citationCount?: number;
  /** Reference count for semantic scholar */
  referenceCount?: number;
}

/** Chat message structure */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  model?: string;
  /** Source nodes from citations (for assistant messages) */
  sources?: SourceNode[];
}

/** Chat session structure */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** User privileges matching backend/frontend */
export type Privilege =
  | "advanced_models"
  | "reasoning_models"
  | "automatic_bibliography"
  | "premium_doc_export"
  | "download_with_annotations"
  | "team"
  | "bring_your_own_keys"
  | "api_access"
  | "admin"
  | "ltd_organization";

export const PRIVILEGES: Readonly<Record<Privilege, Privilege>> = Object.freeze(
  {
    advanced_models: "advanced_models",
    reasoning_models: "reasoning_models",
    automatic_bibliography: "automatic_bibliography",
    premium_doc_export: "premium_doc_export",
    download_with_annotations: "download_with_annotations",
    team: "team",
    bring_your_own_keys: "bring_your_own_keys",
    api_access: "api_access",
    admin: "admin",
    ltd_organization: "ltd_organization",
  },
);

/** User information from API */
export interface UserInfo {
  id: string;
  _id?: string;
  email: string;
  first?: string;
  last?: string;
  name?: string;
  privileges: Privilege[];
}

/** User plan information from /plan endpoint */
export interface PlanInfo {
  subscription_type: string;
  privileges: Privilege[];
  has_addon?: boolean;
  addon_privileges?: Privilege[];
}

/** API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Plugin interface for type safety */
export interface LogicallyPlugin extends Plugin {
  settings: LogicallySettings;
  api: LogicallyApi;
  researchAssistantView: ResearchAssistantView | null;
  ribbon: HTMLElement | null;

  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
  showRibbon(show: boolean): void;
}
