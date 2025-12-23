import { requestUrl } from 'obsidian';
import type { RequestUrlParam } from 'obsidian';
import * as https from 'https';
import { URL } from 'url';
import type {
	ApiResponse,
	BaseModel,
	ChatMessage,
	LogicallySettings,
	UserInfo,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { IS_DEV_BUILD } from '../utils/env';

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
		const baseUrl = IS_DEV_BUILD ? this.settings.apiUrl : DEFAULT_SETTINGS.apiUrl;
		const base = baseUrl.replace(/\/$/, '');
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
			const normalizedEmail = email.trim();
			const response = await requestUrl({
				url: this.getUrl('/signin'),
				method: 'POST',
				throw: false,
				contentType: 'application/json',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email: normalizedEmail, password }),
			});

			if (response.status >= 200 && response.status < 300) {
				const data = response.json;
				return {
					success: true,
					data: {
						token: data.token || data.accessToken,
						user: data.user || { id: '', email: normalizedEmail, privileges: [] },
					},
				};
			}

			const errorMessage = this.parseError(response.json, response.status);
			return { success: false, error: errorMessage };
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
			await this.streamCompletionViaNodeHttp(
				new URL(this.getUrl('/app/completion')),
				JSON.stringify(payload),
				{ onChunk, onComplete, onError },
			);
		} catch (error) {
			console.error('[Logically API] Stream failed:', error);
			onError(error instanceof Error ? error.message : 'Failed to get response');
		}
	}

	private async streamCompletionViaNodeHttp(
		url: URL,
		body: string,
		handlers: StreamHandler,
	): Promise<void> {
		return await new Promise((resolve) => {
			const headers = this.buildAuthHeaders({
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body).toString(),
			});

			const request = https.request(
				{
					protocol: url.protocol,
					hostname: url.hostname,
					port: url.port ? Number(url.port) : undefined,
					path: `${url.pathname}${url.search}`,
					method: 'POST',
					headers,
				},
				(response) => {
					const statusCode = response.statusCode ?? 0;
					if (statusCode < 200 || statusCode >= 300) {
						let errorBody = '';
						response.setEncoding('utf8');
						response.on('data', (chunk) => {
							errorBody += String(chunk);
						});
						response.on('end', () => {
							try {
								const parsed = errorBody ? JSON.parse(errorBody) : null;
								handlers.onError(this.parseError(parsed, statusCode));
							} catch (_e) {
								handlers.onError(this.parseError(errorBody || null, statusCode));
							}
							resolve();
						});
						return;
					}

					this.consumeNodeStream(response, handlers)
						.then(resolve)
						.catch((err) => {
							handlers.onError(err instanceof Error ? err.message : String(err));
							resolve();
						});
				},
			);

			request.on('error', (err) => {
				handlers.onError(err instanceof Error ? err.message : String(err));
				resolve();
			});

			request.write(body);
			request.end();
		});
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

	private async consumeNodeStream(
		body: NodeJS.ReadableStream,
		handlers: StreamHandler,
	): Promise<void> {
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
					// See consumeStream() for rationale: do not append parsed.completion.
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
				if (typeof chunk === 'string') {
					buffer += chunk;
				} else {
					buffer += decoder.decode(chunk as Uint8Array, { stream: true });
				}
				flushBuffer();
				if (completed) {
					body.removeListener('data', onData);
					body.removeListener('end', onEnd);
					body.removeListener('error', onError);
					resolve();
				}
			};

			const onEnd = () => {
				flushBuffer();
				if (!completed) handlers.onComplete();
				body.removeListener('data', onData);
				body.removeListener('end', onEnd);
				body.removeListener('error', onError);
				resolve();
			};

			const onError = (err: unknown) => {
				handlers.onError(err instanceof Error ? err.message : String(err));
				body.removeListener('data', onData);
				body.removeListener('end', onEnd);
				body.removeListener('error', onError);
				resolve();
			};

			body.on('data', onData);
			body.on('end', onEnd);
			body.on('error', onError);
		});
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

