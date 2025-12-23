<script lang="ts">
	import { createEventDispatcher, onMount } from "svelte";
	import type { App } from "obsidian";
	import { TFile } from "obsidian";

	export let app: App;
	export let selectedFiles: string[] = [];
	export let maxFiles = 5;

	const dispatch = createEventDispatcher<{ change: string[] }>();

	let isOpen = false;
	let searchQuery = "";
	let allFiles: TFile[] = [];
	let filteredFiles: TFile[] = [];
	let dropdownEl: HTMLDivElement;
	let debugInfo = "";

	function loadFiles() {
		debugInfo = "";

		// Check app exists
		if (!app) {
			debugInfo = "Error: app is undefined";
			console.error("[FilePicker] app is undefined");
			allFiles = [];
			filteredFiles = [];
			return;
		}

		// Check vault exists
		if (!app.vault) {
			debugInfo = "Error: app.vault is undefined";
			console.error("[FilePicker] app.vault is undefined");
			allFiles = [];
			filteredFiles = [];
			return;
		}

		try {
			// Try different methods to get files
			let files: TFile[] = [];

			// Method 1: getMarkdownFiles
			if (typeof app.vault.getMarkdownFiles === "function") {
				const mdFiles = app.vault.getMarkdownFiles();
				console.log(
					"[FilePicker] getMarkdownFiles() returned:",
					mdFiles?.length ?? 0,
				);
				if (mdFiles && mdFiles.length > 0) {
					files = mdFiles;
				}
			}

			// Method 2: Fallback to getFiles and filter
			if (
				files.length === 0 &&
				typeof app.vault.getFiles === "function"
			) {
				const allVaultFiles = app.vault.getFiles();
				console.log(
					"[FilePicker] getFiles() returned:",
					allVaultFiles?.length ?? 0,
				);
				if (allVaultFiles && allVaultFiles.length > 0) {
					files = allVaultFiles.filter((f) => f.extension === "md");
					console.log(
						"[FilePicker] Filtered to md files:",
						files.length,
					);
				}
			}

			// Method 3: Walk through vault.root if available
			if (files.length === 0 && app.vault.getRoot) {
				console.log("[FilePicker] Trying vault.getRoot()");
				const root = app.vault.getRoot();
				if (root && root.children) {
					const walk = (folder: any): TFile[] => {
						const result: TFile[] = [];
						for (const child of folder.children || []) {
							if (
								child instanceof TFile &&
								child.extension === "md"
							) {
								result.push(child);
							} else if (child.children) {
								result.push(...walk(child));
							}
						}
						return result;
					};
					files = walk(root);
					console.log(
						"[FilePicker] Walking vault root found:",
						files.length,
					);
				}
			}

			if (files.length === 0) {
				debugInfo = "No markdown files found";
				console.warn("[FilePicker] No files found by any method");
				allFiles = [];
				filteredFiles = [];
			} else {
				debugInfo = `Found ${files.length} files`;
				// Sort by mtime
				const sorted = [...files].sort((a, b) => {
					return (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0);
				});
				allFiles = sorted;
				// Immediately set filteredFiles
				filteredFiles = sorted.slice(0, 50);
				console.log(
					"[FilePicker] Set filteredFiles:",
					filteredFiles.length,
				);
			}

			console.log("[FilePicker] Total files loaded:", allFiles.length);
		} catch (err) {
			debugInfo = `Error: ${err}`;
			console.error("[FilePicker] Error loading files:", err);
			allFiles = [];
			filteredFiles = [];
		}
	}

	function filterFiles() {
		if (!searchQuery.trim()) {
			filteredFiles = allFiles.slice(0, 50);
		} else {
			const query = searchQuery.toLowerCase();
			filteredFiles = allFiles
				.filter(
					(f) =>
						f.path.toLowerCase().includes(query) ||
						f.basename.toLowerCase().includes(query),
				)
				.slice(0, 50);
		}
	}

	function toggleFile(filePath: string) {
		if (selectedFiles.includes(filePath)) {
			selectedFiles = selectedFiles.filter((f) => f !== filePath);
		} else if (selectedFiles.length < maxFiles) {
			selectedFiles = [...selectedFiles, filePath];
		}
		dispatch("change", selectedFiles);
	}

	function removeFile(filePath: string) {
		selectedFiles = selectedFiles.filter((f) => f !== filePath);
		dispatch("change", selectedFiles);
	}

	function handleDocumentClick(e: MouseEvent) {
		if (!isOpen) return;
		if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
			isOpen = false;
		}
	}

	function getFileName(path: string): string {
		const parts = path.split("/");
		return parts[parts.length - 1].replace(/\.md$/, "");
	}

	function getFolder(path: string): string {
		const parts = path.split("/");
		if (parts.length <= 1) return "";
		return parts.slice(0, -1).join("/");
	}

	export function addFilePath(filePath: string) {
		if (selectedFiles.includes(filePath)) return;
		if (selectedFiles.length >= maxFiles) return;
		selectedFiles = [...selectedFiles, filePath];
		dispatch("change", selectedFiles);
	}

	onMount(() => {
		console.log(
			"[FilePicker] onMount, app:",
			!!app,
			"vault:",
			!!app?.vault,
		);
		loadFiles();
		document.addEventListener("click", handleDocumentClick, true);
		return () => {
			document.removeEventListener("click", handleDocumentClick, true);
		};
	});

	$: if (searchQuery !== undefined) filterFiles();
</script>

<div
	class="file-picker"
	bind:this={dropdownEl}
	role="region"
	aria-label="Reference files"
>
	<div class="picker-header">
		<span class="picker-label">Reference files</span>
		<span class="picker-count">{selectedFiles.length}/{maxFiles}</span>
	</div>

	{#if selectedFiles.length > 0}
		<div class="selected-files">
			{#each selectedFiles as filePath}
				<div class="selected-file">
					<svg
						class="file-icon"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
						></path>
						<polyline points="14 2 14 8 20 8"></polyline>
					</svg>
					<span class="file-name" title={filePath}
						>{getFileName(filePath)}</span
					>
					<button
						type="button"
						class="remove-btn"
						on:click={() => removeFile(filePath)}
						title="Remove"
					>
						<svg
							width="12"
							height="12"
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
			{/each}
		</div>
	{/if}

	<button
		type="button"
		class="add-btn"
		on:click={() => {
			isOpen = !isOpen;
			if (isOpen) {
				loadFiles();
				searchQuery = "";
			}
		}}
		disabled={selectedFiles.length >= maxFiles}
	>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
		Add vault files
	</button>

	{#if isOpen}
		<div class="dropdown">
			<input
				type="text"
				class="search-input"
				bind:value={searchQuery}
				placeholder="Search files..."
				on:input={filterFiles}
			/>
			<div class="meta-row">
				{debugInfo || `${allFiles.length} markdown files`}
			</div>
			<div class="file-list">
				{#if filteredFiles.length === 0}
					<div class="no-files">
						{#if allFiles.length === 0}
							No markdown files found in this vault.
						{:else}
							No files match your search.
						{/if}
					</div>
				{:else}
					{#each filteredFiles as file}
						{@const isSelected = selectedFiles.includes(file.path)}
						<button
							type="button"
							class="file-item"
							class:selected={isSelected}
							class:disabled={!isSelected &&
								selectedFiles.length >= maxFiles}
							on:click={() => toggleFile(file.path)}
							disabled={!isSelected &&
								selectedFiles.length >= maxFiles}
						>
							<span class="check">{isSelected ? "✓" : ""}</span>
							<div class="file-info">
								<span class="file-basename"
									>{file.basename}</span
								>
								{#if getFolder(file.path)}
									<span class="file-folder"
										>{getFolder(file.path)}</span
									>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<p class="picker-hint">Selected files will be included as context.</p>
</div>

<style>
	.file-picker {
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-shrink: 0;
		position: relative;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.picker-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-normal);
	}

	.picker-count {
		font-size: 11px;
		color: var(--text-muted);
	}

	.selected-files {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.selected-file {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		background: rgba(25, 128, 230, 0.15);
		color: #1980e6;
		border-radius: 4px;
		font-size: 12px;
		max-width: 180px;
	}

	.file-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		margin-left: 2px;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		opacity: 0.7;
	}

	.remove-btn:hover {
		opacity: 1;
	}

	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--background-primary);
		border: 1px dashed var(--background-modifier-border);
		border-radius: 6px;
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
	}

	.add-btn:hover:not(:disabled) {
		border-color: var(--interactive-accent);
		color: var(--interactive-accent);
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 4px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		overflow: hidden;
	}

	.meta-row {
		padding: 6px 10px;
		font-size: 11px;
		color: var(--text-muted);
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.search-input {
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-bottom: 1px solid var(--background-modifier-border);
		background: transparent;
		font-size: 13px;
		color: var(--text-normal);
		outline: none;
		box-sizing: border-box;
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.file-list {
		max-height: 200px;
		overflow-y: auto;
	}

	.no-files {
		padding: 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 13px;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-normal);
	}

	.file-item:hover:not(:disabled) {
		background: var(--background-modifier-hover);
	}

	.file-item.selected {
		background: rgba(25, 128, 230, 0.1);
	}

	.file-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.check {
		width: 16px;
		font-size: 12px;
		color: #1980e6;
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
	}

	.file-basename {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-folder {
		font-size: 11px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.picker-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0;
	}
</style>
