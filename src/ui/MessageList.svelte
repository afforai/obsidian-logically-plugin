<script lang="ts">
	import { onMount, afterUpdate, onDestroy } from "svelte";
	import { MarkdownRenderer, Component, type App } from "obsidian";
	import type { ChatMessage } from "../types";
	import { AI_MODELS } from "../types";
	import { createEventDispatcher } from "svelte";
	import SourcesTable from "./SourcesTable.svelte";

	export let messages: ChatMessage[] = [];
	export let isLoading = false;
	export let currentResponse = "";
	export let app: App;

	/**
	 * Convert citation tokens like 【12†source】 to clickable superscript links.
	 * The number refers to the source index in the sources array.
	 */
	function processCitationTokens(
		content: string,
		sources: import("../types").SourceNode[] | undefined,
	): string {
		if (!content) return content;

		// Match citation tokens: 【N†source】 or 【N†...】
		return content.replace(/【(\d+)†[^】]*】/g, (match, num) => {
			const index = parseInt(num, 10) - 1; // Convert to 0-indexed
			const source = sources?.[index];

			if (source) {
				const url = source.pdfUrl || source.url;
				const title = source.filename || "Source";
				if (url) {
					return `<sup class="ra-citation-link"><a href="${url}" target="_blank" title="${title}">[${num}]</a></sup>`;
				}
				// No URL - just show the number with title tooltip
				return `<sup class="ra-citation-link" title="${title}">[${num}]</sup>`;
			}
			// Source not found, just show the number
			return `<sup class="ra-citation-link">[${num}]</sup>`;
		});
	}

	const dispatch = createEventDispatcher<{
		insertToNote: ChatMessage;
		deleteFromIndex: number;
		regenerate: number;
	}>();

	let listEl: HTMLElement;
	let renderedIds = new Set<string>();

	// Create a Component instance for MarkdownRenderer to avoid memory leaks
	let markdownComponent: Component;

	function getModelName(modelId: string | undefined): string {
		if (!modelId) return "AI";
		const model = AI_MODELS.find((m) => m.id === modelId);
		return model?.name || modelId;
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	async function renderMarkdown(
		el: HTMLElement,
		content: string,
		sources?: import("../types").SourceNode[],
	) {
		el.empty();
		try {
			// Process citation tokens before rendering
			const processedContent = processCitationTokens(content, sources);
			await MarkdownRenderer.render(
				app,
				processedContent,
				el,
				"",
				markdownComponent,
			);
		} catch (e) {
			console.warn("[MessageList] Markdown render error:", e);
			el.textContent = content;
		}
	}

	function handleInsertToNote(message: ChatMessage) {
		dispatch("insertToNote", message);
	}

	function handleDelete(index: number) {
		dispatch("deleteFromIndex", index);
	}

	function handleRegenerate(index: number) {
		dispatch("regenerate", index);
	}

	function scrollToBottom() {
		if (listEl) {
			listEl.scrollTop = listEl.scrollHeight;
		}
	}

	async function renderAssistantMessages() {
		if (!listEl) return;

		for (const msg of messages) {
			if (msg.role !== "assistant") continue;

			const contentEl = listEl.querySelector(
				`[data-msg-id="${msg.id}"] .message-content`,
			) as HTMLElement;
			if (!contentEl) continue;

			// Include sources in the content hash for re-render check
			const sourcesHash = msg.sources
				? JSON.stringify(msg.sources.length)
				: "0";
			const contentKey = `${msg.content}|${sourcesHash}`;
			const currentContent = contentEl.getAttribute("data-content");
			if (currentContent !== contentKey) {
				await renderMarkdown(
					contentEl,
					msg.content || "...",
					msg.sources,
				);
				contentEl.setAttribute("data-content", contentKey);
			}
		}
	}

	afterUpdate(() => {
		renderAssistantMessages();
		scrollToBottom();
	});

	onMount(() => {
		// Create component for markdown rendering
		markdownComponent = new Component();
		markdownComponent.load();

		renderAssistantMessages();
		scrollToBottom();
	});

	onDestroy(() => {
		// Clean up component
		if (markdownComponent) {
			markdownComponent.unload();
		}
	});
</script>

<div class="message-list" bind:this={listEl}>
	{#if messages.length === 0 && !isLoading}
		<div class="empty-state">
			<div class="empty-icon">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
					></path>
					<path d="M8 10h.01"></path>
					<path d="M12 10h.01"></path>
					<path d="M16 10h.01"></path>
				</svg>
			</div>
			<h3 class="empty-title">Start a conversation</h3>
			<p class="empty-desc">
				Ask me about your research, summarize papers, or explore topics.
			</p>
		</div>
	{:else}
		{#each messages as message, index (message.id)}
			<div
				class="message"
				class:user={message.role === "user"}
				class:assistant={message.role === "assistant"}
				data-msg-id={message.id}
			>
				<div class="message-header">
					{#if message.role === "user"}
						<span class="message-sender">You</span>
					{:else}
						<span class="message-sender"
							>{getModelName(message.model)}</span
						>
					{/if}
					<span class="message-time"
						>{formatTime(message.timestamp)}</span
					>
				</div>
				<div class="message-content">
					{#if message.role === "user"}
						{message.content || "..."}
					{:else}
						<!-- Rendered via MarkdownRenderer -->
					{/if}
				</div>
				<!-- Action buttons at bottom right -->
				<div class="message-actions">
					{#if message.role === "user"}
						<button
							type="button"
							class="action-btn action-btn-danger"
							on:click={() => handleDelete(index)}
							title="Delete this message and all below"
							disabled={isLoading}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 14 14"
								fill="none"
							>
								<path
									d="M12.25 3.0625H10.1739C9.64833 3.0625 9.62617 2.996 9.48209 2.56433L9.36425 2.21025C9.18516 1.67358 8.68525 1.3125 8.11942 1.3125H5.88058C5.31475 1.3125 4.81425 1.673 4.63575 2.21025L4.51792 2.56433C4.37383 2.99658 4.35167 3.0625 3.82608 3.0625H1.75C1.5085 3.0625 1.3125 3.2585 1.3125 3.5C1.3125 3.7415 1.5085 3.9375 1.75 3.9375H2.50716L2.95458 10.6452C3.04092 11.9432 3.83659 12.6875 5.13742 12.6875H8.86317C10.1634 12.6875 10.9591 11.9432 11.046 10.6452L11.4934 3.9375H12.25C12.4915 3.9375 12.6875 3.7415 12.6875 3.5C12.6875 3.2585 12.4915 3.0625 12.25 3.0625ZM5.46583 2.48675C5.52591 2.30767 5.69216 2.1875 5.88058 2.1875H8.11942C8.30784 2.1875 8.47467 2.30767 8.53417 2.48675L8.652 2.84083C8.67767 2.91725 8.70333 2.99133 8.73133 3.0625H5.2675C5.2955 2.99075 5.32175 2.91666 5.34742 2.84083L5.46583 2.48675ZM10.1722 10.5869C10.1168 11.4228 9.70025 11.8125 8.86258 11.8125H5.13683C4.29917 11.8125 3.88325 11.4234 3.82725 10.5869L3.38392 3.9375H3.8255C3.89842 3.9375 3.95908 3.92992 4.02442 3.92525C4.04425 3.92817 4.06233 3.9375 4.08275 3.9375H9.91608C9.93708 3.9375 9.95458 3.92817 9.97442 3.92525C10.0397 3.92992 10.1004 3.9375 10.1733 3.9375H10.6149L10.1722 10.5869ZM8.60417 6.41667V9.33333C8.60417 9.57483 8.40817 9.77083 8.16667 9.77083C7.92517 9.77083 7.72917 9.57483 7.72917 9.33333V6.41667C7.72917 6.17517 7.92517 5.97917 8.16667 5.97917C8.40817 5.97917 8.60417 6.17517 8.60417 6.41667ZM6.27083 6.41667V9.33333C6.27083 9.57483 6.07483 9.77083 5.83333 9.77083C5.59183 9.77083 5.39583 9.57483 5.39583 9.33333V6.41667C5.39583 6.17517 5.59183 5.97917 5.83333 5.97917C6.07483 5.97917 6.27083 6.17517 6.27083 6.41667Z"
									fill="currentColor"
								/>
							</svg>
						</button>
					{:else if message.content}
						<button
							type="button"
							class="action-btn"
							on:click={() => handleInsertToNote(message)}
							title="Insert into active note"
							disabled={isLoading}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
							>
								<path
									fill-rule="evenodd"
									clip-rule="evenodd"
									d="M1.78906 4.41451C1.78906 2.52873 3.31779 1 5.20358 1H10.9527C12.0523 1 12.9445 1.88831 12.9508 2.9865C13.9065 3.59171 14.541 4.65843 14.541 5.87336V8.99994H13.4588V5.87336C13.4588 4.58525 12.4146 3.54104 11.1265 3.54104H6.87336C5.58526 3.54104 4.54104 4.58525 4.54104 5.87336V12.1265C4.54104 13.4146 5.58526 14.4588 6.87336 14.4588H8.99994V15.541H6.87336C5.48984 15.541 4.29851 14.7182 3.76205 13.5352C2.66699 13.5033 1.78906 12.6056 1.78906 11.5028V4.41451ZM10.9527 2.0822C11.2799 2.0822 11.567 2.25376 11.729 2.51183C11.5334 2.47701 11.3321 2.45884 11.1265 2.45884H6.87336C4.98758 2.45884 3.45885 3.98757 3.45885 5.87336V12.1265C3.45885 12.2138 3.46212 12.3003 3.46855 12.3859C3.11848 12.2455 2.87126 11.903 2.87126 11.5028V4.41451C2.87126 3.12641 3.91547 2.0822 5.20358 2.0822H10.9527ZM6.39666 5.67008C6.09884 5.67008 5.85742 5.91151 5.85742 6.20932C5.85742 6.50714 6.09884 6.74857 6.39666 6.74857H11.6852C11.983 6.74857 12.2244 6.50714 12.2244 6.20932C12.2244 5.91151 11.983 5.67008 11.6852 5.67008H6.39666ZM5.85742 8.73114C5.85742 8.43333 6.09884 8.1919 6.39666 8.1919H10.7252V9.27039H6.39666C6.09884 9.27039 5.85742 9.02896 5.85742 8.73114ZM6.39666 10.7028C6.09884 10.7028 5.85742 10.9442 5.85742 11.242C5.85742 11.5398 6.09884 11.7813 6.39666 11.7813H8.99822V10.7028H6.39666Z"
									fill="currentColor"
								/>
								<path
									fill-rule="evenodd"
									clip-rule="evenodd"
									d="M13.1874 10.0156C13.1874 9.73948 12.9635 9.51562 12.6874 9.51562C12.4112 9.51562 12.1874 9.73948 12.1874 10.0156V12.0864H10.1133C9.83714 12.0864 9.61328 12.3103 9.61328 12.5864C9.61328 12.8626 9.83714 13.0864 10.1133 13.0864H12.1874V15.1581C12.1874 15.4342 12.4112 15.6581 12.6874 15.6581C12.9635 15.6581 13.1874 15.4342 13.1874 15.1581V13.0864H15.2557C15.5319 13.0864 15.7557 12.8626 15.7557 12.5864C15.7557 12.3103 15.5319 12.0864 15.2557 12.0864H13.1874V10.0156Z"
									fill="currentColor"
								/>
							</svg>
						</button>
						<button
							type="button"
							class="action-btn"
							on:click={() => handleRegenerate(index)}
							title="Regenerate response"
							disabled={isLoading}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
							>
								<path
									d="M2.5 8.33351C2.5 8.83618 2.6167 9.32077 2.84603 9.7741C2.97136 10.0208 2.87198 10.3215 2.62598 10.4461C2.55398 10.4828 2.47597 10.5002 2.40063 10.5002C2.21797 10.5002 2.04202 10.4003 1.95402 10.2263C1.65735 9.64025 1.5 8.98551 1.5 8.33351C1.5 5.88018 3.21333 4.16685 5.66667 4.16685H10.126L9.646 3.68686C9.45066 3.49153 9.45066 3.17484 9.646 2.97951C9.84133 2.78417 10.158 2.78417 10.3534 2.97951L11.6867 4.31284C11.7327 4.35884 11.7693 4.41411 11.7947 4.47544C11.8453 4.59744 11.8453 4.73544 11.7947 4.85744C11.7693 4.91877 11.7327 4.9742 11.6867 5.0202L10.3534 6.35353C10.256 6.45086 10.128 6.50018 10 6.50018C9.872 6.50018 9.74398 6.45153 9.64665 6.35353C9.45131 6.1582 9.45131 5.84151 9.64665 5.64617L10.1266 5.16619H5.66732C3.47932 5.16686 2.5 6.75751 2.5 8.33351ZM14.046 6.44077C13.9213 6.19477 13.6207 6.09488 13.374 6.22088C13.128 6.34555 13.0286 6.64625 13.154 6.89292C13.3833 7.34625 13.5 7.83085 13.5 8.33351C13.5 9.90951 12.5207 11.5002 10.3333 11.5002H5.87402L6.354 11.0202C6.54934 10.8249 6.54934 10.5082 6.354 10.3128C6.15867 10.1175 5.84198 10.1175 5.64665 10.3128L4.31331 11.6462C4.11798 11.8415 4.11798 12.1582 4.31331 12.3535L5.64665 13.6869C5.74398 13.7842 5.872 13.8335 6 13.8335C6.128 13.8335 6.25602 13.7849 6.35335 13.6869C6.54869 13.4915 6.54869 13.1748 6.35335 12.9795L5.87337 12.4995H10.3327C12.786 12.4995 14.4993 10.7862 14.4993 8.33286C14.5 7.68153 14.3433 7.02677 14.046 6.44077Z"
									fill="currentColor"
								/>
							</svg>
						</button>
					{/if}
				</div>
				<!-- Sources table for assistant messages with citations -->
				{#if message.role === "assistant" && message.sources && message.sources.length > 0}
					<SourcesTable sources={message.sources} {app} />
				{/if}
			</div>
		{/each}

		{#if isLoading && !messages.find((m) => m.content === currentResponse)}
			<div class="message assistant loading">
				<div class="message-header">
					<span class="message-sender">AI</span>
				</div>
				<div class="message-content">
					{#if currentResponse}
						{currentResponse}
					{:else}
						<div class="typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
		padding: 4px 0;
		min-height: 0;
		position: relative;
	}

	.empty-state {
		/* Override Obsidian's default .empty-state which has position:absolute */
		position: static !important;
		width: auto !important;
		height: auto !important;
		inset: auto !important;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 20px;
		color: var(--text-muted);
		pointer-events: none;
	}

	.empty-icon {
		margin-bottom: 16px;
		opacity: 0.5;
	}

	.empty-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-normal);
		margin: 0 0 8px 0;
	}

	.empty-desc {
		font-size: 13px;
		margin: 0;
		max-width: 280px;
		line-height: 1.5;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		border-radius: 12px;
		max-width: 95%;
	}

	.message.user {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		align-self: flex-end;
		border-bottom-right-radius: 4px;
	}

	.message.assistant {
		background: var(--background-secondary);
		align-self: flex-start;
		border-bottom-left-radius: 4px;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		opacity: 0.8;
	}

	.message-actions {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
		margin-top: 8px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.message:hover .message-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text-muted);
		transition: all 0.15s ease;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
		border-color: var(--text-muted);
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.action-btn-danger:hover:not(:disabled) {
		color: var(--text-error);
		border-color: var(--text-error);
	}

	.message.user .message-content {
		white-space: pre-wrap;
	}

	.message.user .message-header {
		justify-content: flex-end;
	}

	.message-sender {
		font-weight: 600;
	}

	.message-time {
		opacity: 0.7;
	}

	.message-content {
		font-size: 14px;
		line-height: 1.5;
		word-break: break-word;
	}

	/* Markdown content styling */
	.message.assistant .message-content :global(p) {
		margin: 0 0 8px 0;
	}

	.message.assistant .message-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.message.assistant .message-content :global(pre) {
		background: var(--background-primary);
		border-radius: 6px;
		padding: 10px;
		overflow-x: auto;
		margin: 8px 0;
		font-size: 13px;
	}

	.message.assistant .message-content :global(code) {
		background: var(--background-primary);
		padding: 2px 4px;
		border-radius: 3px;
		font-size: 13px;
	}

	.message.assistant .message-content :global(pre code) {
		background: none;
		padding: 0;
	}

	.message.assistant .message-content :global(ul),
	.message.assistant .message-content :global(ol) {
		margin: 8px 0;
		padding-left: 20px;
	}

	.message.assistant .message-content :global(li) {
		margin: 4px 0;
	}

	.message.assistant .message-content :global(h1),
	.message.assistant .message-content :global(h2),
	.message.assistant .message-content :global(h3),
	.message.assistant .message-content :global(h4) {
		margin: 12px 0 8px 0;
		font-weight: 600;
	}

	.message.assistant .message-content :global(h1) {
		font-size: 18px;
	}
	.message.assistant .message-content :global(h2) {
		font-size: 16px;
	}
	.message.assistant .message-content :global(h3) {
		font-size: 15px;
	}
	.message.assistant .message-content :global(h4) {
		font-size: 14px;
	}

	.message.assistant .message-content :global(blockquote) {
		border-left: 3px solid var(--text-muted);
		margin: 8px 0;
		padding-left: 12px;
		color: var(--text-muted);
	}

	.message.assistant .message-content :global(table) {
		border-collapse: collapse;
		margin: 8px 0;
		font-size: 13px;
	}

	.message.assistant .message-content :global(th),
	.message.assistant .message-content :global(td) {
		border: 1px solid var(--background-modifier-border);
		padding: 6px 10px;
	}

	.message.assistant .message-content :global(th) {
		background: var(--background-primary);
		font-weight: 600;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: 4px 0;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		background: var(--text-muted);
		border-radius: 50%;
		animation: typing 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: 0s;
	}
	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.4;
		}
		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}

	/* Citation link styling */
	.message.assistant .message-content :global(.ra-citation-link) {
		font-size: 10px;
		vertical-align: super;
		margin: 0 1px;
	}

	.message.assistant .message-content :global(.ra-citation-link a) {
		color: var(--interactive-accent);
		text-decoration: none;
		font-weight: 600;
		padding: 1px 3px;
		border-radius: 3px;
		background: var(--background-primary);
		transition: all 0.15s ease;
	}

	.message.assistant .message-content :global(.ra-citation-link a:hover) {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
