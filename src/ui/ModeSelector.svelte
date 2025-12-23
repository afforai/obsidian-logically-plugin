<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from "svelte";
	import type { SearchMode } from "../types";

	export let selectedMode: SearchMode = "files";
	export let disabled = false;

	const dispatch = createEventDispatcher<{ change: SearchMode }>();

	let isOpen = false;
	let triggerEl: HTMLButtonElement;
	let dropdownEl: HTMLDivElement;

	interface ModeOption {
		id: SearchMode;
		name: string;
		description: string;
		icon: string;
	}

	const modes: ModeOption[] = [
		{
			id: "files",
			name: "Document Retrieval",
			description: "Research using your vault files with citations",
			icon: "📄",
		},
		{
			id: "google",
			name: "Google Search",
			description: "Enrich research with web information",
			icon: "🔍",
		},
		{
			id: "semantic",
			name: "Semantic Scholar",
			description: "Search 200M+ peer-reviewed research papers",
			icon: "📚",
		},
	];

	$: selectedModeInfo = modes.find((m) => m.id === selectedMode) ?? modes[0];

	function handleSelect(mode: SearchMode) {
		dispatch("change", mode);
		isOpen = false;
	}

	function toggleDropdown(e: MouseEvent) {
		e.stopPropagation();
		if (disabled) return;
		isOpen = !isOpen;
	}

	function handleDocumentClick(e: MouseEvent) {
		if (!isOpen) return;
		const target = e.target as HTMLElement;
		if (triggerEl?.contains(target) || dropdownEl?.contains(target)) return;
		isOpen = false;
	}

	onMount(() => {
		document.addEventListener("click", handleDocumentClick, true);
	});

	onDestroy(() => {
		document.removeEventListener("click", handleDocumentClick, true);
	});
</script>

<div class="ra-mode-selector">
	<button
		bind:this={triggerEl}
		class="ra-mode-trigger"
		on:click={toggleDropdown}
		type="button"
		{disabled}
		title="Change search mode"
	>
		<span class="ra-mode-icon">{selectedModeInfo.icon}</span>
		<span class="ra-mode-name">{selectedModeInfo.name}</span>
		<svg
			class="ra-mode-chevron"
			class:open={isOpen}
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="6 9 12 15 18 9"></polyline>
		</svg>
	</button>

	{#if isOpen}
		<div bind:this={dropdownEl} class="ra-mode-dropdown">
			{#each modes as mode (mode.id)}
				<button
					class="ra-mode-item"
					class:selected={mode.id === selectedMode}
					on:click={() => handleSelect(mode.id)}
					type="button"
				>
					<span class="ra-mode-check">
						{#if mode.id === selectedMode}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<polyline points="20 6 9 17 4 12"></polyline>
							</svg>
						{/if}
					</span>
					<span class="ra-mode-item-icon">{mode.icon}</span>
					<div class="ra-mode-item-content">
						<span class="ra-mode-item-name">{mode.name}</span>
						<span class="ra-mode-item-desc">{mode.description}</span
						>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ra-mode-selector {
		position: relative;
	}

	.ra-mode-trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-normal);
		font-size: 13px;
		transition: all 0.15s ease;
	}

	.ra-mode-trigger:hover:not(:disabled) {
		background: var(--background-modifier-hover);
		border-color: var(--background-modifier-border-hover);
	}

	.ra-mode-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ra-mode-icon {
		font-size: 14px;
	}

	.ra-mode-name {
		font-weight: 500;
	}

	.ra-mode-chevron {
		color: var(--text-muted);
		transition: transform 0.15s ease;
		margin-left: 2px;
	}

	.ra-mode-chevron.open {
		transform: rotate(180deg);
	}

	.ra-mode-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: 4px;
		min-width: 280px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		padding: 4px;
		overflow: hidden;
	}

	.ra-mode-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		padding: 10px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		color: var(--text-normal);
		border-radius: 8px;
		transition: background 0.1s ease;
	}

	.ra-mode-item:hover {
		background: var(--background-modifier-hover);
	}

	.ra-mode-item.selected {
		background: rgba(25, 128, 230, 0.1);
	}

	.ra-mode-check {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: #1980e6;
		margin-top: 2px;
	}

	.ra-mode-item-icon {
		font-size: 16px;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.ra-mode-item-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.ra-mode-item-name {
		font-size: 13px;
		font-weight: 500;
	}

	.ra-mode-item-desc {
		font-size: 12px;
		color: var(--text-muted);
		line-height: 1.3;
	}
</style>
