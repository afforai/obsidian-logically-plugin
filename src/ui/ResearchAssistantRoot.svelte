<script lang="ts">
	import { onMount } from "svelte";
	import { Notice, TFile, type App } from "obsidian";
	import type {
		LogicallyPlugin,
		ChatMessage,
		BaseModel,
		Privilege,
		SearchMode,
		SourceNode,
	} from "../types";
	import { AI_MODELS } from "../types";
	import ChatInput from "./ChatInput.svelte";
	import MessageList from "./MessageList.svelte";
	import LoginPrompt from "./LoginPrompt.svelte";
	import FilePicker from "./FilePicker.svelte";
	import UpgradeModal from "./UpgradeModal.svelte";
	import SettingsPanel from "./SettingsPanel.svelte";

	export let plugin: LogicallyPlugin;
	export let app: App;

	let messages: ChatMessage[] = plugin.settings.chatHistory ?? [];
	let isLoading = false;
	let currentResponse = "";
	let selectedModel: BaseModel = plugin.settings.selectedModel;
	let selectedMode: SearchMode = plugin.settings.searchMode ?? "files";
	let isAuthenticated = plugin.api.isAuthenticated();
	let contextFiles: string[] = plugin.settings.contextFiles ?? [];
	let filesExpanded = false;
	let isDraggingOver = false;
	let filePickerRef: FilePicker;
	let userPrivileges: Privilege[] = plugin.settings.userPrivileges ?? [];
	let userName: string = plugin.settings.userName ?? "";
	const maxFiles = 5;

	// Upgrade modal state
	let showUpgradeModal = false;
	let upgradeModalType: "advanced" | "reasoning" = "advanced";

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
			new Notice(
				`Failed to update AI model: ${update.error ?? "Unknown error"}`,
			);
		}
	}

	async function handleModeChange(mode: SearchMode) {
		selectedMode = mode;
		plugin.settings.searchMode = mode;
		await plugin.saveSettings();
	}

	async function handleFilesChange(files: string[]) {
		contextFiles = files;
		plugin.settings.contextFiles = files;
		await plugin.saveSettings();
	}

	function handleToggleFiles() {
		filesExpanded = !filesExpanded;
	}

	async function getContextFromFiles(): Promise<string> {
		if (contextFiles.length === 0) return "";

		const contents: string[] = [];
		for (const filePath of contextFiles) {
			try {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) continue;
				if (file.extension !== "md") continue;

				const content = await app.vault.cachedRead(file);
				contents.push(`## ${file.basename}\n\n${content}`);
			} catch (e) {
				console.warn(`[Logically] Could not read file: ${filePath}`, e);
			}
		}

		if (contents.length === 0) return "";
		return `\n\n---\n# Reference Files\n\n${contents.join("\n\n---\n\n")}`;
	}

	function getCustomInstructionContext(): string {
		const instruction = plugin.settings.customInstruction?.trim();
		if (!instruction) return "";
		return `\n\n---\n# Custom Instructions\n\n${instruction}`;
	}

	/**
	 * Convert context files to SourceNode entries for display in the sources table.
	 */
	function getContextFilesAsSources(): SourceNode[] {
		if (selectedMode !== "files" || contextFiles.length === 0) return [];

		return contextFiles.map((filePath) => ({
			fileid: filePath,
			filename:
				filePath.split("/").pop()?.replace(/\.md$/, "") || filePath,
			filetype: "reference",
		}));
	}

	/**
	 * Handle errors from the API, with special handling for quota errors.
	 */
	function handleApiError(
		error: string,
		assistantMessage: ChatMessage,
	): void {
		// Check for query quota error
		if (error.includes("query_quota") || error.includes(".query_quota")) {
			upsertMessage({
				...assistantMessage,
				content: `**You've reached your free query limit** 🚫\n\nYou've used all your free queries for this period. To continue using Logically's Research Assistant:\n\n- **Upgrade to a paid plan** for unlimited queries\n- Visit [logically.app/pricing](https://logically.app/pricing) to see available plans\n\nYour free quota will reset at the start of the next billing period.`,
			});
		} else {
			upsertMessage({
				...assistantMessage,
				content: `Error: ${error}`,
			});
		}
		isLoading = false;
		currentResponse = "";
	}

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

		const assistantMessage: ChatMessage = {
			id: generateId(),
			role: "assistant",
			content: "",
			timestamp: Date.now(),
			model: selectedModel,
			sources: [],
		};
		messages = [...messages, assistantMessage];

		try {
			// Only include file context when mode is "files"
			const fileContext =
				selectedMode === "files" ? await getContextFromFiles() : "";
			const customContext = getCustomInstructionContext();
			const combinedContext = customContext + fileContext;

			await plugin.api.streamMessage(
				text,
				selectedModel,
				historyBefore,
				(chunk: string) => {
					currentResponse += chunk;
					upsertMessage({
						...assistantMessage,
						content: currentResponse,
					});
				},
				() => {
					isLoading = false;
					currentResponse = "";
					// After completion, ensure reference files are in sources if no API sources
					const currentMsg = messages.find(
						(m) => m.id === assistantMessage.id,
					);
					if (
						currentMsg &&
						(!currentMsg.sources || currentMsg.sources.length === 0)
					) {
						const fileSources = getContextFilesAsSources();
						if (fileSources.length > 0) {
							upsertMessage({
								...assistantMessage,
								content: currentResponse,
								sources: fileSources,
							});
						}
					}
				},
				(error: string) => handleApiError(error, assistantMessage),
				combinedContext,
				selectedMode,
				(sources: SourceNode[]) => {
					// Merge API sources with context file sources
					const fileSources = getContextFilesAsSources();
					const allSources = [...sources, ...fileSources];
					upsertMessage({
						...assistantMessage,
						content: currentResponse,
						sources: allSources,
					});
				},
			);
		} catch (error) {
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
		plugin.saveSettings();
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

		while (userIndex >= 0 && messages[userIndex].role !== "user") {
			userIndex--;
		}

		if (userIndex < 0) {
			new Notice("No user message found to regenerate from");
			return;
		}

		const userMessage = messages[userIndex];
		const historyBefore = messages.slice(0, userIndex);

		messages = messages.slice(0, assistantIndex);

		isLoading = true;
		currentResponse = "";

		const assistantMessage: ChatMessage = {
			id: generateId(),
			role: "assistant",
			content: "",
			timestamp: Date.now(),
			model: selectedModel,
			sources: [],
		};
		messages = [...messages, assistantMessage];

		try {
			const fileContext =
				selectedMode === "files" ? await getContextFromFiles() : "";
			const customContext = getCustomInstructionContext();
			const combinedContext = customContext + fileContext;

			await plugin.api.streamMessage(
				userMessage.content,
				selectedModel,
				historyBefore,
				(chunk: string) => {
					currentResponse += chunk;
					upsertMessage({
						...assistantMessage,
						content: currentResponse,
					});
				},
				() => {
					isLoading = false;
					currentResponse = "";
					// After completion, ensure reference files are in sources if no API sources
					const currentMsg = messages.find(
						(m) => m.id === assistantMessage.id,
					);
					if (
						currentMsg &&
						(!currentMsg.sources || currentMsg.sources.length === 0)
					) {
						const fileSources = getContextFilesAsSources();
						if (fileSources.length > 0) {
							upsertMessage({
								...assistantMessage,
								content: currentResponse,
								sources: fileSources,
							});
						}
					}
				},
				(error: string) => handleApiError(error, assistantMessage),
				combinedContext,
				selectedMode,
				(sources: SourceNode[]) => {
					// Merge API sources with context file sources
					const fileSources = getContextFilesAsSources();
					const allSources = [...sources, ...fileSources];
					upsertMessage({
						...assistantMessage,
						content: currentResponse,
						sources: allSources,
					});
				},
			);
		} catch (error) {
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
						sourceLinks.push(`- [[${source.fileid}]]`);
					} else if (source.url || source.pdfUrl) {
						// External URL
						const url = source.pdfUrl || source.url;
						const title = source.filename || url;
						sourceLinks.push(`- [${title}](${url})`);
					} else {
						// Just filename
						sourceLinks.push(`- ${source.filename}`);
					}
				}

				if (sourceLinks.length > 0) {
					content +=
						"\n\n---\n\n**Sources:**\n" + sourceLinks.join("\n");
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

		// Generate footnote definitions for used citations
		if (usedCitations.size > 0 && sources && sources.length > 0) {
			const footnotes: string[] = [];
			const sortedIndices = Array.from(usedCitations).sort(
				(a, b) => a - b,
			);

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
		selectedModel = "openai_gpt_5_mini";
	}

	// Drag-and-drop handling (only active when mode is "files")
	function resolveFilePath(raw: string): string | null {
		if (!app) return null;
		let target = raw.trim();

		const wikiMatch = target.match(/\[\[([^\]|#]+)/);
		if (wikiMatch) target = wikiMatch[1];

		const mdMatch = target.match(/\[[^\]]*\]\(([^)#]+)/);
		if (mdMatch) target = mdMatch[1];

		if (target.startsWith("obsidian://")) {
			try {
				const url = new URL(target);
				const path =
					url.searchParams.get("file") ||
					url.searchParams.get("path");
				if (path) target = decodeURIComponent(path);
			} catch {
				/* ignore */
			}
		}

		if (target.startsWith("app://")) {
			try {
				const url = new URL(target);
				let path = decodeURIComponent(url.pathname);
				path = path.replace(/^\//, "");
				const parts = path.split("/");
				if (parts.length > 1) {
					target = parts.slice(1).join("/");
				}
			} catch {
				/* ignore */
			}
		}

		target = target.replace(/^\//, "");

		const directFile = app.vault.getAbstractFileByPath(target);
		if (directFile instanceof TFile && directFile.extension === "md") {
			return directFile.path;
		}

		if (!target.endsWith(".md")) {
			const withMd = app.vault.getAbstractFileByPath(target + ".md");
			if (withMd instanceof TFile) {
				return withMd.path;
			}
		}

		const resolved = app.metadataCache.getFirstLinkpathDest(target, "");
		if (resolved instanceof TFile && resolved.extension === "md") {
			return resolved.path;
		}

		return null;
	}

	function handleDragOver(e: DragEvent) {
		// Only allow drag when in files mode
		if (selectedMode !== "files") return;
		const dt = e.dataTransfer;
		if (!dt) return;
		e.preventDefault();
		dt.dropEffect = "link";
		isDraggingOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		const target = e.relatedTarget as Node | null;
		const container = e.currentTarget as HTMLElement;
		if (!target || !container.contains(target)) {
			isDraggingOver = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = false;

		// Only handle drop when in files mode
		if (selectedMode !== "files") return;

		const dt = e.dataTransfer;
		if (!dt) return;

		const payloads: string[] = [];
		const textPlain = dt.getData("text/plain");
		if (textPlain) payloads.push(textPlain);

		const textUri = dt.getData("text/uri-list");
		if (textUri) payloads.push(textUri);

		for (const type of dt.types) {
			const data = dt.getData(type);
			if (data && !payloads.includes(data)) {
				payloads.push(data);
			}
		}

		const allLines = payloads
			.join("\n")
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);

		const addedFiles: string[] = [];
		const alreadyAddedFiles: string[] = [];
		const unresolvedLines: string[] = [];
		const skippedDueToLimit: string[] = [];

		for (const line of allLines) {
			const resolved = resolveFilePath(line);
			if (!resolved) {
				unresolvedLines.push(line);
				continue;
			}

			if (
				contextFiles.includes(resolved) ||
				addedFiles.includes(resolved)
			) {
				alreadyAddedFiles.push(resolved);
				continue;
			}

			if (contextFiles.length + addedFiles.length >= maxFiles) {
				skippedDueToLimit.push(resolved);
				continue;
			}

			addedFiles.push(resolved);
		}

		if (addedFiles.length > 0) {
			contextFiles = [...contextFiles, ...addedFiles];
			plugin.settings.contextFiles = contextFiles;
			plugin.saveSettings();
			filesExpanded = true;
			new Notice(`Added ${addedFiles.length} file(s) as context`);
		}

		if (alreadyAddedFiles.length > 0) {
			const unique = Array.from(new Set(alreadyAddedFiles));
			const names = unique.map((p) => p.split("/").pop() ?? p);
			const maxShown = 4;
			const shown = names.slice(0, maxShown);
			const more = names.length - shown.length;
			new Notice(
				`${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""} ${
					names.length === 1 ? "was" : "were"
				} already added`,
			);
		}

		if (skippedDueToLimit.length > 0) {
			new Notice(`Reached the ${maxFiles} file limit`);
		}

		if (
			unresolvedLines.length > 0 &&
			addedFiles.length === 0 &&
			alreadyAddedFiles.length === 0
		) {
			new Notice("Could not resolve dropped file(s)");
		}
	}

	function handleLogin() {
		isAuthenticated = true;
		userPrivileges = plugin.settings.userPrivileges ?? [];
		userName = plugin.settings.userName ?? "";
		selectedModel = plugin.settings.selectedModel;
	}

	function handleShowUpgrade(type: "advanced" | "reasoning") {
		upgradeModalType = type;
		showUpgradeModal = true;
	}

	onMount(async () => {
		isAuthenticated = plugin.api.isAuthenticated();
		selectedModel = plugin.settings.selectedModel;
		selectedMode = plugin.settings.searchMode ?? "files";
		contextFiles = plugin.settings.contextFiles ?? [];
		messages = plugin.settings.chatHistory ?? [];
		userPrivileges = plugin.settings.userPrivileges ?? [];
		userName = plugin.settings.userName ?? "";

		// Fetch user name if authenticated but name not set
		if (isAuthenticated && !userName) {
			const userResult = await plugin.api.getCurrentUser();
			if (userResult.success && userResult.data) {
				const user = userResult.data;
				const nameParts = [user.first, user.last].filter(Boolean);
				userName = nameParts.join(" ") || plugin.settings.userEmail;
				plugin.settings.userName = userName;
				await plugin.saveSettings();
			}
		}
	});

	$: if (messages.length > 0 && !isLoading) {
		saveChatHistory();
	}

	$: selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);
</script>

<div
	class="logically-root"
	class:drag-active={isDraggingOver}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
	role="application"
	aria-label="Logically Research Assistant"
>
	{#if !isAuthenticated}
		<LoginPrompt {plugin} on:login={handleLogin} />
	{:else}
		<header class="ra-header">
			<div class="ra-title">
				<svg
					width="18"
					height="18"
					viewBox="0 0 25 26"
					fill="currentColor"
				>
					<circle cx="17.4406" cy="7.44062" r="3.44062" />
					<path
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M8.404 21.2031C6.86245 21.2031 6.09168 21.2031 5.50289 20.9031C4.98497 20.6392 4.5639 20.2181 4.3 19.7002C4 19.1114 4 18.3407 4 16.7991V8.12875C4 7.48947 4 7.16984 4.04236 6.90239C4.27554 5.43017 5.43017 4.27554 6.90239 4.04236C7.16984 4 7.48947 4 8.12875 4C8.76802 4 9.08765 4 9.3551 4.04236C10.8273 4.27554 11.982 5.43017 12.2151 6.90239C12.2575 7.16984 12.2575 7.48947 12.2575 8.12875V12.9455H17.073C17.7123 12.9455 18.0319 12.9455 18.2994 12.9879C19.7716 13.2211 20.9262 14.3757 21.1594 15.8479C21.2017 16.1154 21.2017 16.435 21.2017 17.0743C21.2017 17.7136 21.2017 18.0332 21.1594 18.3006C20.9262 19.7729 19.7716 20.9275 18.2994 21.1607C18.0319 21.203 17.7123 21.203 17.073 21.203H12.2575V21.2031H8.404ZM10.8807 12.9455H10.8799V19.8262H6.75195L6.75195 7.43993C6.75195 6.29981 7.6762 5.37556 8.81633 5.37556C9.95645 5.37556 10.8807 6.29981 10.8807 7.43994V12.9455ZM12.2575 19.8272H17.7589C18.899 19.8272 19.8233 18.903 19.8233 17.7628C19.8233 16.6227 18.899 15.6985 17.7589 15.6985H12.2575V19.8272Z"
					/>
				</svg>
				<span>Logically's Research Assistant</span>
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

		{#if filesExpanded && selectedMode === "files"}
			<FilePicker
				bind:this={filePickerRef}
				{app}
				selectedFiles={contextFiles}
				{maxFiles}
				on:change={(e) => handleFilesChange(e.detail)}
			/>
		{/if}

		{#if isDraggingOver && selectedMode === "files"}
			<div class="drop-overlay">
				<div class="drop-overlay-content">
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
						></path>
						<polyline points="14 2 14 8 20 8"></polyline>
						<line x1="12" y1="18" x2="12" y2="12"></line>
						<line x1="9" y1="15" x2="12" y2="12"></line>
						<line x1="15" y1="15" x2="12" y2="12"></line>
					</svg>
					<span>Drop files to add as context</span>
					<span class="drop-hint"
						>{contextFiles.length}/{maxFiles} files</span
					>
				</div>
			</div>
		{/if}

		<div class="ra-messages">
			<MessageList
				{messages}
				{isLoading}
				{currentResponse}
				{app}
				searchMode={selectedMode}
				{userName}
				on:insertToNote={(e) => handleInsertToNote(e.detail)}
				on:deleteFromIndex={(e) => handleDeleteFromIndex(e.detail)}
				on:regenerate={(e) => handleRegenerate(e.detail)}
			/>
		</div>

		<ChatInput
			on:send={(e) => handleSendMessage(e.detail)}
			on:modelChange={(e) => handleModelChange(e.detail)}
			on:modeChange={(e) => handleModeChange(e.detail)}
			on:showUpgrade={(e) => handleShowUpgrade(e.detail)}
			on:toggleFiles={handleToggleFiles}
			disabled={isLoading}
			{selectedModel}
			{selectedMode}
			{userPrivileges}
			{filesExpanded}
			fileCount={contextFiles.length}
		/>
	{/if}
</div>

<UpgradeModal
	bind:isOpen={showUpgradeModal}
	modelType={upgradeModalType}
	on:close={() => (showUpgradeModal = false)}
/>

<SettingsPanel
	{plugin}
	isOpen={showSettingsPanel}
	on:close={() => (showSettingsPanel = false)}
	on:logout={handleLogout}
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

	/* Drag-and-drop overlay */
	.logically-root.drag-active {
		position: relative;
	}

	.drop-overlay {
		position: absolute;
		inset: 0;
		background: rgba(25, 128, 230, 0.1);
		border: 2px dashed #1980e6;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		pointer-events: none;
	}

	.drop-overlay-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: #1980e6;
		font-weight: 500;
	}

	.drop-overlay-content svg {
		opacity: 0.8;
	}

	.drop-hint {
		font-size: 12px;
		opacity: 0.7;
	}
</style>
