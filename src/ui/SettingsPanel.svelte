<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import { Notice } from "obsidian";
	import type { LogicallyPlugin } from "../types";

	export let plugin: LogicallyPlugin;
	export let isOpen = false;

	const dispatch = createEventDispatcher<{
		close: void;
		logout: void;
	}>();

	let customInstruction = plugin.settings.customInstruction ?? "";
	let isSaving = false;
	let textareaEl: HTMLTextAreaElement;

	async function handleSaveInstruction() {
		isSaving = true;
		plugin.settings.customInstruction = customInstruction;
		await plugin.saveSettings();
		isSaving = false;
		new Notice("Custom instruction saved");
	}

	async function handleLogout() {
		plugin.settings.userToken = "";
		plugin.settings.userEmail = "";
		plugin.settings.userPrivileges = [];
		plugin.settings.chatHistory = [];
		await plugin.saveSettings();
		dispatch("logout");
		dispatch("close");
		new Notice("Logged out successfully");
	}

	function handleClose() {
		dispatch("close");
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handlePanelKeydown(e: KeyboardEvent) {
		// Only close on Escape if not typing in textarea
		if (e.key === "Escape" && e.target !== textareaEl) {
			e.preventDefault();
			handleClose();
		}
	}

	// Handle textarea input manually to work around Obsidian event issues
	function handleTextareaInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		customInstruction = target.value;
	}

	$: if (isOpen) {
		customInstruction = plugin.settings.customInstruction ?? "";
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="ra-settings-backdrop"
		on:click={handleBackdropClick}
		on:keydown={handlePanelKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="settings-title"
	>
		<div class="ra-settings-panel">
			<div class="ra-settings-header">
				<h3 id="settings-title">Settings</h3>
				<button
					type="button"
					class="ra-settings-close"
					on:click={handleClose}
					title="Close"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="ra-settings-content">
				<!-- Account Section -->
				<div class="ra-settings-section">
					<div class="ra-section-title">Account</div>
					<div class="ra-account-info">
						<span class="ra-account-email"
							>{plugin.settings.userEmail || "Unknown"}</span
						>
						<button
							type="button"
							class="ra-logout-btn"
							on:click={handleLogout}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
								></path>
								<polyline points="16 17 21 12 16 7"></polyline>
								<line x1="21" y1="12" x2="9" y2="12"></line>
							</svg>
							Logout
						</button>
					</div>
				</div>

				<!-- Custom Instruction Section -->
				<div class="ra-settings-section">
					<div class="ra-section-title">Custom Instruction</div>
					<p class="ra-section-desc">
						Add custom instructions that will be included with every
						message you send. Use this to personalize the
						assistant's behavior or provide persistent context.
					</p>
					<textarea
						bind:this={textareaEl}
						class="ra-instruction-input"
						value={customInstruction}
						on:input={handleTextareaInput}
						placeholder="e.g., 'Always cite sources in APA format' or 'I'm researching quantum computing'"
						rows="4"
					></textarea>
					<button
						type="button"
						class="ra-save-btn"
						on:click={handleSaveInstruction}
						disabled={isSaving}
					>
						{isSaving ? "Saving..." : "Save Instruction"}
					</button>
				</div>

				<!-- Help Section -->
				<div class="ra-settings-section">
					<div class="ra-section-title">Help</div>
					<p class="ra-section-desc">
						For more settings including AI model selection and
						advanced configuration, visit the
						<button
							type="button"
							class="ra-link-btn"
							on:click={() => {
								const appAny = plugin.app;
								appAny.setting?.open?.();
								appAny.setting?.openTabById?.(
									plugin.manifest.id,
								);
								handleClose();
							}}>Plugin Settings</button
						>.
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.ra-settings-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.ra-settings-panel {
		background: var(--background-primary);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
		width: 90%;
		max-width: 400px;
		max-height: 80vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.ra-settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.ra-settings-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--text-normal);
	}

	.ra-settings-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
	}

	.ra-settings-close:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.ra-settings-content {
		padding: 16px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.ra-settings-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.ra-section-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-normal);
	}

	.ra-section-desc {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0;
		line-height: 1.5;
	}

	.ra-account-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		background: var(--background-secondary);
		border-radius: 8px;
	}

	.ra-account-email {
		font-size: 13px;
		color: var(--text-normal);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ra-logout-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: transparent;
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
		font-size: 12px;
		color: var(--text-muted);
		transition: all 0.15s ease;
	}

	.ra-logout-btn:hover {
		border-color: #ef4444;
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}

	.ra-instruction-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		font-family: inherit;
		font-size: 13px;
		color: var(--text-normal);
		resize: vertical;
		min-height: 80px;
		box-sizing: border-box;
	}

	.ra-instruction-input:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.ra-instruction-input::placeholder {
		color: var(--text-muted);
	}

	.ra-save-btn {
		align-self: flex-start;
		padding: 8px 14px;
		background: var(--interactive-accent);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-on-accent);
		transition: all 0.15s ease;
	}

	.ra-save-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.ra-save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.ra-link-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		color: var(--interactive-accent);
		text-decoration: underline;
	}

	.ra-link-btn:hover {
		text-decoration: none;
	}
</style>
