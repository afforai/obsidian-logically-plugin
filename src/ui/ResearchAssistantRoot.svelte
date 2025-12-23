<script lang="ts">
	import { onMount } from "svelte";
	import { Notice, TFile, type App } from "obsidian";
	import type { LogicallyPlugin, ChatMessage, BaseModel } from "../types";
	import { AI_MODELS } from "../types";
	import ModelSelector from "./ModelSelector.svelte";
	import ChatInput from "./ChatInput.svelte";
	import MessageList from "./MessageList.svelte";
	import LoginPrompt from "./LoginPrompt.svelte";
	import FilePicker from "./FilePicker.svelte";

	export let plugin: LogicallyPlugin;
	export let app: App;

	let messages: ChatMessage[] = plugin.settings.chatHistory ?? [];
	let isLoading = false;
	let currentResponse = "";
	let selectedModel: BaseModel = plugin.settings.selectedModel;
	let isAuthenticated = plugin.api.isAuthenticated();
	let contextFiles: string[] = plugin.settings.contextFiles ?? [];
	let filesExpanded = false;
	let isDraggingOver = false;
	let filePickerRef: FilePicker;
	const maxFiles = 5;

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

	async function handleFilesChange(files: string[]) {
		contextFiles = files;
		plugin.settings.contextFiles = files;
		await plugin.saveSettings();
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
		};
		messages = [...messages, assistantMessage];

		try {
			const fileContext = await getContextFromFiles();

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
				},
				(error: string) => {
					upsertMessage({
						...assistantMessage,
						content: `Error: ${error}`,
					});
					isLoading = false;
					currentResponse = "";
				},
				fileContext,
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
		// Delete message at index and everything after
		messages = messages.slice(0, index);
		saveChatHistory();
	}

	async function handleRegenerate(index: number) {
		if (isLoading) return;

		// Find the user message before this assistant message
		const assistantIndex = index;
		let userIndex = assistantIndex - 1;

		// Make sure we have a user message
		while (userIndex >= 0 && messages[userIndex].role !== "user") {
			userIndex--;
		}

		if (userIndex < 0) {
			new Notice("No user message found to regenerate from");
			return;
		}

		const userMessage = messages[userIndex];
		const historyBefore = messages.slice(0, userIndex);

		// Remove the old assistant response and everything after
		messages = messages.slice(0, assistantIndex);

		isLoading = true;
		currentResponse = "";

		const assistantMessage: ChatMessage = {
			id: generateId(),
			role: "assistant",
			content: "",
			timestamp: Date.now(),
			model: selectedModel,
		};
		messages = [...messages, assistantMessage];

		try {
			const fileContext = await getContextFromFiles();

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
				},
				(error: string) => {
					upsertMessage({
						...assistantMessage,
						content: `Error: ${error}`,
					});
					isLoading = false;
					currentResponse = "";
				},
				fileContext,
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
			const content = message.content;
			const editor = app.workspace.activeEditor?.editor;

			if (editor) {
				// Insert at cursor position
				const cursor = editor.getCursor();
				editor.replaceRange(content + "\n\n", cursor);
				new Notice(`Inserted response into ${activeFile.basename}`);
			} else {
				// Fallback: append to file
				await app.vault.append(activeFile, "\n\n" + content);
				new Notice(`Appended response to ${activeFile.basename}`);
			}
		} catch (e) {
			console.error("[Logically] Failed to insert to note:", e);
			new Notice("Failed to insert response into note");
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Drag-and-drop handling for the entire chat area
	// ─────────────────────────────────────────────────────────────

	function resolveFilePath(raw: string): string | null {
		if (!app) return null;
		let target = raw.trim();

		// Extract from wiki link [[file]]
		const wikiMatch = target.match(/\[\[([^\]|#]+)/);
		if (wikiMatch) target = wikiMatch[1];

		// Extract from md link [text](file)
		const mdMatch = target.match(/\[[^\]]*\]\(([^)#]+)/);
		if (mdMatch) target = mdMatch[1];

		// Handle obsidian:// URIs
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

		// Handle app:// URIs (internal Obsidian)
		if (target.startsWith("app://")) {
			try {
				const url = new URL(target);
				// Path is usually the pathname after the vault identifier
				let path = decodeURIComponent(url.pathname);
				// Remove leading slash
				path = path.replace(/^\//, "");
				// Skip vault identifier (first segment)
				const parts = path.split("/");
				if (parts.length > 1) {
					target = parts.slice(1).join("/");
				}
			} catch {
				/* ignore */
			}
		}

		// Strip leading slash
		target = target.replace(/^\//, "");

		// Try direct path lookup
		const directFile = app.vault.getAbstractFileByPath(target);
		if (directFile instanceof TFile && directFile.extension === "md") {
			return directFile.path;
		}

		// Try with .md extension
		if (!target.endsWith(".md")) {
			const withMd = app.vault.getAbstractFileByPath(target + ".md");
			if (withMd instanceof TFile) {
				return withMd.path;
			}
		}

		// Try resolving as link
		const resolved = app.metadataCache.getFirstLinkpathDest(target, "");
		if (resolved instanceof TFile && resolved.extension === "md") {
			return resolved.path;
		}

		return null;
	}

	function handleDragOver(e: DragEvent) {
		// Check if this looks like a file drag
		const dt = e.dataTransfer;
		if (!dt) return;

		// Accept the drag
		e.preventDefault();
		dt.dropEffect = "link";
		isDraggingOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// Only hide if leaving the container entirely
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

		const dt = e.dataTransfer;
		if (!dt) {
			console.log("[Logically] Drop: no dataTransfer");
			return;
		}

		// Log all available data types
		console.log("[Logically] Drop event, types:", [...dt.types]);
		for (const type of dt.types) {
			console.log(`[Logically] Data[${type}]:`, dt.getData(type));
		}

		// Collect all text payloads
		const payloads: string[] = [];

		// Try common types
		const textPlain = dt.getData("text/plain");
		if (textPlain) payloads.push(textPlain);

		const textUri = dt.getData("text/uri-list");
		if (textUri) payloads.push(textUri);

		// Try all types
		for (const type of dt.types) {
			const data = dt.getData(type);
			if (data && !payloads.includes(data)) {
				payloads.push(data);
			}
		}

		// Also check files property (for OS file drops)
		if (dt.files && dt.files.length > 0) {
			console.log("[Logically] Drop has files:", dt.files.length);
			// OS file drops won't work for vault files, but log for debug
		}

		// Parse and resolve paths
		const allLines = payloads
			.join("\n")
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		console.log("[Logically] Lines to resolve:", allLines);

		let addedCount = 0;
		for (const line of allLines) {
			if (contextFiles.length >= maxFiles) break;

			const resolved = resolveFilePath(line);
			console.log(`[Logically] Resolving "${line}" -> "${resolved}"`);

			if (resolved && !contextFiles.includes(resolved)) {
				contextFiles = [...contextFiles, resolved];
				addedCount++;
			}
		}

		if (addedCount > 0) {
			plugin.settings.contextFiles = contextFiles;
			plugin.saveSettings();
			filesExpanded = true; // Show the files panel
			new Notice(`Added ${addedCount} file(s) as context`);
		} else if (allLines.length > 0) {
			new Notice("Could not resolve dropped file(s)");
		}
	}

	function handleLogin() {
		isAuthenticated = true;
	}

	onMount(() => {
		isAuthenticated = plugin.api.isAuthenticated();
		selectedModel = plugin.settings.selectedModel;
		contextFiles = plugin.settings.contextFiles ?? [];
		messages = plugin.settings.chatHistory ?? [];
	});

	// Save chat history when messages change
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
	aria-label="Logically Research Assistant - drag files here to add context"
>
	{#if !isAuthenticated}
		<LoginPrompt {plugin} on:login={handleLogin} />
	{:else}
		<header class="ra-header">
			<div class="ra-title">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
					></path>
				</svg>
				<span>Logically's Research Assistant</span>
			</div>
			<div class="ra-actions">
				<button
					type="button"
					class="ra-btn"
					class:active={filesExpanded}
					on:click={() => (filesExpanded = !filesExpanded)}
				>
					Files {#if contextFiles.length > 0}<span class="ra-badge"
							>{contextFiles.length}</span
						>{/if}
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

		<ModelSelector
			{selectedModel}
			on:change={(e) => handleModelChange(e.detail)}
		/>

		{#if filesExpanded}
			<FilePicker
				bind:this={filePickerRef}
				{app}
				selectedFiles={contextFiles}
				{maxFiles}
				on:change={(e) => handleFilesChange(e.detail)}
			/>
		{/if}

		{#if isDraggingOver}
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
				on:insertToNote={(e) => handleInsertToNote(e.detail)}
				on:deleteFromIndex={(e) => handleDeleteFromIndex(e.detail)}
				on:regenerate={(e) => handleRegenerate(e.detail)}
			/>
		</div>

		<ChatInput
			on:send={(e) => handleSendMessage(e.detail)}
			disabled={isLoading}
		/>
	{/if}
</div>

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

	.ra-btn.active {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.ra-badge {
		background: rgba(25, 128, 230, 0.2);
		color: #1980e6;
		font-size: 11px;
		padding: 1px 5px;
		border-radius: 8px;
		font-weight: 600;
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
