import { requestUrl } from 'obsidian';
import type { RequestUrlParam } from 'obsidian';
import type {
	ApiResponse,
	BaseModel,
	ChatMessage,
	LogicallySettings,
	UserInfo,
} from '../types';

type StreamHandler = {
	onChunk: (chunk: string) => void;
	onComplete: () => void;
	onError: (error: string) => void;
};

const STREAM_TOKEN_REGEX = /❬([A-Z_]+)❭([\s\S]*?)❬\/\1❭/g;

const DEFAULT_SESSION_FIELDS = () => {
	const now = new Date();
	return {
		_id: '',
		sharing: false,
		name: '',
		system: '',
		files: [] as unknown[],
		tool: 'doc_retrieval',
		google_auto: true,
		google_gl: 'us',
		google_hl: 'en',
		google_tbs: 'any',
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
	value.replace(/❪/g, '❬').replace(/❫/g, '❭');

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
		const base = this.settings.apiUrl.replace(/\/$/, '');
		return `${base}${endpoint}`;
	}

	private buildAuthHeaders(additional: Record<string, string> = {}): Record<string, string> {
		return this.settings.userToken
			? { 'x-access-token': this.settings.userToken, ...additional }
			: additional;
	}

	private parseError(json: any, status: number): string {
		if (!json) return `Request failed with status ${status}`;
		if (typeof json === 'string') return json;
		if (json.code) return json.code;
		if (json.message) return json.message;
		return `Request failed with status ${status}`;
	}

	/**
	 * Make an authenticated API request.
	 */
	private async request<T>(
		endpoint: string,
		options: Partial<RequestUrlParam> = {}
	): Promise<ApiResponse<T>> {
		if (!this.settings.userToken) {
			return { success: false, error: 'Not authenticated' };
		}

		try {
			const response = await requestUrl({
				url: this.getUrl(endpoint),
				method: options.method || 'GET',
				headers: {
					'Content-Type': 'application/json',
					...this.buildAuthHeaders(options.headers as Record<string, string> | undefined),
				},
				body: options.body,
			});

			if (response.status >= 200 && response.status < 300) {
				return { success: true, data: response.json };
			}

			const errorMessage = this.parseError(response.json, response.status);
			return { success: false, error: errorMessage };
		} catch (error) {
			console.error('[Logically API] Request failed:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred',
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
	async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: UserInfo }>> {
		try {
			const response = await requestUrl({
				url: this.getUrl('/signin'),
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password }),
			});

			if (response.status >= 200 && response.status < 300) {
				const data = response.json;
				return {
					success: true,
					data: {
						token: data.token || data.accessToken,
						user: data.user || { id: '', email, privileges: [] },
					},
				};
			}

			return {
				success: false,
				error: this.parseError(response.json, response.status),
			};
		} catch (error) {
			console.error('[Logically API] Login failed:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Login failed',
			};
		}
	}

	/**
	 * Verify the current token is valid.
	 */
	async verifyToken(): Promise<ApiResponse<UserInfo>> {
		return this.request<UserInfo>('/user');
	}

	/**
	 * Get current user information.
	 */
	async getCurrentUser(): Promise<ApiResponse<UserInfo>> {
		return this.request<UserInfo>('/user');
	}

	/**
	 * Send a chat message to the research assistant.
	 */
	private buildCompletionPayload(
		message: string,
		conversationHistory: ChatMessage[],
		contextNotes?: string,
	) {
		const base = DEFAULT_SESSION_FIELDS();
		const notes = (contextNotes ?? '').trim();
		if (notes) {
			base.system = `User notes (treat as reference context):\n${notes}`;
		}
		const history = [
			...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
			{ role: 'user' as const, content: message },
		];
		return {
			session: { ...base, history },
			externalData: { location: 'research_assistant' },
			heartbeat: 5000,
		};
	}

	/**
	 * Stream a chat response (using Server-Sent Events pattern via fetch).
	 * Note: Obsidian's requestUrl doesn't support streaming, so we use a simple POST.
	 */
	async streamMessage(
		message: string,
		_model: BaseModel,
		conversationHistory: ChatMessage[] = [],
		onChunk: (chunk: string) => void,
		onComplete: () => void,
		onError: (error: string) => void,
		contextNotes?: string,
	): Promise<void> {
		if (!this.settings.userToken) {
			onError('You are not logged in');
			return;
		}

		try {
			const payload = this.buildCompletionPayload(
				message,
				conversationHistory,
				contextNotes,
			);
			const response = await fetch(this.getUrl('/app/completion'), {
				method: 'POST',
				headers: this.buildAuthHeaders({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorBody = await safeJson(response);
				onError(this.parseError(errorBody, response.status));
				return;
			}

			if (!response.body) {
				onError('Empty response from server');
				return;
			}

			await this.consumeStream(response.body, { onChunk, onComplete, onError });
		} catch (error) {
			console.error('[Logically API] Stream failed:', error);
			onError(error instanceof Error ? error.message : 'Failed to get response');
		}
	}

	/**
	 * Get available libraries/documents for the user.
	 */
	async getLibraries(): Promise<ApiResponse<Array<{ id: string; name: string }>>> {
		return this.request('/app/libraries');
	}

	async updateBaseModel(model: BaseModel): Promise<ApiResponse<unknown>> {
		return this.request('/app/user_config', {
			method: 'PUT',
			body: JSON.stringify({ update: { base_model: model } }),
		});
	}

	private async consumeStream(
		body: ReadableStream<Uint8Array>,
		handlers: StreamHandler,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let completed = false;

		const handlePacket = (key: string, rawValue: string) => {
			const payload = unescapeStream(rawValue);
			switch (key) {
				case 'COMPLETION': {
					try {
						const parsed = JSON.parse(payload);
						if (parsed.chunk) handlers.onChunk(parsed.chunk);
						else handlers.onChunk(String(parsed));
					} catch (_e) {
						handlers.onChunk(payload);
					}
					break;
				}
				case 'CITATION': {
					// CITATION packet contains final completion + metadata for citations.
					// We do NOT append parsed.completion here because the text was already
					// streamed via COMPLETION chunks. Appending it would duplicate the response.
					// Future enhancement: could extract citation metadata if needed.
					break;
				}
				case 'ERROR': {
					try {
						const parsed = JSON.parse(payload);
						handlers.onError(parsed.code || parsed.message || 'Request failed');
					} catch (_e) {
						handlers.onError(payload || 'Request failed');
					}
					completed = true;
					break;
				}
				case 'DONE': {
					completed = true;
					handlers.onComplete();
					break;
				}
				default:
					break;
			}
		};

		const flushBuffer = () => {
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

		while (true) {
			const { value, done } = await reader.read();
			if (value) {
				buffer += decoder.decode(value, { stream: true });
				flushBuffer();
			}
			if (done || completed) break;
		}

		flushBuffer();
		if (!completed) {
			handlers.onComplete();
		}
	}

	/**
	 * Logout and clear the token.
	 */
	logout(): void {
		// Token clearing is handled by the settings
	}
}

async function safeJson(response: Response): Promise<any> {
	try {
		return await response.json();
	} catch (e) {
		console.error('Failed to parse JSON response', e);
		return null;
	}
}

