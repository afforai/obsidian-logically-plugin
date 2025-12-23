import type { Plugin } from 'obsidian';
import type { LogicallyApi } from './services/logicallyApi';
import type { ResearchAssistantView } from './views/researchAssistantView';

export const VIEW_TYPE_RESEARCH_ASSISTANT = 'logically-research-assistant';

/** Model categories matching the frontend design */
export enum ModelCategory {
	standard = 'standard',
	advanced = 'advanced',
	reasoning = 'reasoning',
}

/** Base model identifiers - matches backend */
export type BaseModel =
	| 'gemini_flash'
	| 'gemini_pro'
	| 'openai_gpt_5_mini'
	| 'openai_gpt_51'
	| 'anthropic_claude_haiku'
	| 'anthropic_claude_sonnet'
	| 'gemini_reasoning'
	| 'openai_reasoning'
	| 'anthropic_claude_reasoning';

/** Model entity definition for UI display */
export interface ModelEntity {
	id: BaseModel;
	name: string;
	description: string;
	category: ModelCategory;
	tag?: string;
}

/** All available AI models grouped by category */
export const AI_MODELS: ModelEntity[] = [
	// Standard models
	{
		id: 'gemini_flash',
		name: 'Gemini Flash 2.5',
		description: 'Fast and efficient for basic research tasks',
		category: ModelCategory.standard,
		tag: 'Recommended',
	},
	{
		id: 'openai_gpt_5_mini',
		name: 'GPT-5 mini',
		description: 'Compact GPT model for quick responses',
		category: ModelCategory.standard,
	},
	{
		id: 'anthropic_claude_haiku',
		name: 'Claude Haiku 4.5',
		description: 'Fast Claude model for basic tasks',
		category: ModelCategory.standard,
	},
	// Advanced models
	{
		id: 'gemini_pro',
		name: 'Gemini Pro 2.5',
		description: 'Powerful model with large context window',
		category: ModelCategory.advanced,
		tag: 'Recommended',
	},
	{
		id: 'openai_gpt_51',
		name: 'GPT-5.1',
		description: 'Enterprise-level GPT with enhanced capabilities',
		category: ModelCategory.advanced,
	},
	{
		id: 'anthropic_claude_sonnet',
		name: 'Claude Sonnet 4.5',
		description: 'Balanced Claude model for complex tasks',
		category: ModelCategory.advanced,
	},
	// Reasoning models
	{
		id: 'gemini_reasoning',
		name: 'Gemini 3 Pro Preview',
		description: 'Optimized for complex reasoning tasks',
		category: ModelCategory.reasoning,
		tag: 'Recommended',
	},
	{
		id: 'openai_reasoning',
		name: 'GPT-5.2',
		description: 'Advanced reasoning with step-by-step analysis',
		category: ModelCategory.reasoning,
	},
	{
		id: 'anthropic_claude_reasoning',
		name: 'Claude Opus 4.5',
		description: 'Top-tier reasoning capabilities',
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
}

/** Default settings */
export const DEFAULT_SETTINGS: LogicallySettings = {
	userToken: '',
	apiUrl: 'https://api.logically.app',
	showRibbon: true,
	selectedModel: 'gemini_flash',
	contextNotes: '',
	contextFiles: [],
	chatHistory: [],
	userPrivileges: [],
	userEmail: '',
};

/** Chat message structure */
export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	model?: string;
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
	| 'advanced_models'
	| 'reasoning_models'
	| 'automatic_bibliography'
	| 'premium_doc_export'
	| 'download_with_annotations'
	| 'team'
	| 'bring_your_own_keys'
	| 'api_access'
	| 'admin'
	| 'ltd_organization';

export const PRIVILEGES: Readonly<Record<Privilege, Privilege>> = Object.freeze({
	advanced_models: 'advanced_models',
	reasoning_models: 'reasoning_models',
	automatic_bibliography: 'automatic_bibliography',
	premium_doc_export: 'premium_doc_export',
	download_with_annotations: 'download_with_annotations',
	team: 'team',
	bring_your_own_keys: 'bring_your_own_keys',
	api_access: 'api_access',
	admin: 'admin',
	ltd_organization: 'ltd_organization',
});

/** User information from API */
export interface UserInfo {
	id: string;
	email: string;
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
