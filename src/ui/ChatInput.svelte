<script lang="ts">
	import { createEventDispatcher } from "svelte";

	export let disabled = false;

	const dispatch = createEventDispatcher<{ send: string }>();

	let inputValue = "";
	let textareaEl: HTMLTextAreaElement;

	function handleSubmit() {
		if (!inputValue.trim() || disabled) return;
		dispatch("send", inputValue.trim());
		inputValue = "";
		if (textareaEl) textareaEl.style.height = "auto";
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}
	}

	function handleInput() {
		if (textareaEl) {
			textareaEl.style.height = "auto";
			textareaEl.style.height =
				Math.min(textareaEl.scrollHeight, 150) + "px";
		}
	}
</script>

<div class="chat-input">
	<div class="input-row">
		<textarea
			bind:this={textareaEl}
			bind:value={inputValue}
			on:keydown={handleKeydown}
			on:input={handleInput}
			placeholder="Ask me anything about your research..."
			rows="1"
			{disabled}
		></textarea>
		<button
			type="button"
			class="send-btn"
			on:click={handleSubmit}
			disabled={disabled || !inputValue.trim()}
			title="Send message"
		>
			{#if disabled}
				<svg
					class="spinner"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle
						cx="12"
						cy="12"
						r="10"
						stroke-dasharray="32"
						stroke-dashoffset="12"
					></circle>
				</svg>
			{:else}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<line x1="22" y1="2" x2="11" y2="13"></line>
					<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
				</svg>
			{/if}
		</button>
	</div>
	<p class="hint">
		Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
	</p>
</div>

<style>
	.chat-input {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
	}

	.input-row {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		padding: 8px 12px;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 10px;
	}

	.input-row:focus-within {
		border-color: var(--interactive-accent);
	}

	textarea {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-normal);
		min-height: 24px;
		max-height: 150px;
		font-family: inherit;
		padding: 0;
	}

	textarea::placeholder {
		color: var(--text-muted);
	}

	textarea:disabled {
		opacity: 0.6;
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: var(--interactive-accent);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		color: var(--text-on-accent);
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.hint {
		font-size: 11px;
		color: var(--text-muted);
		text-align: center;
		margin: 0;
	}

	kbd {
		font-size: 10px;
		font-family: var(--font-monospace);
		padding: 2px 4px;
		background: var(--background-modifier-border);
		border-radius: 3px;
	}
</style>
