<script lang="ts">
	import { createEventDispatcher, onMount, tick } from "svelte";
	import type { App } from "obsidian";
	import { TFile, TFolder } from "obsidian";

	export let app: App;
	export let selectedFiles: string[] = [];
	export let maxFiles = 5;

	const dispatch = createEventDispatcher<{ change: string[] }>();

	let isOpen = false;
	let searchQuery = "";
	let allFiles: TFile[] = [];
	let dropdownEl: HTMLDivElement;
	let debugInfo = "";
	let isLoading = false;

	interface FolderGroup {
		folder: string;
		files: TFile[];
	}

	// Use a reactive statement to compute filtered files
	$: computedFilteredFiles = computeFilteredFiles(allFiles, searchQuery);
	$: groupedFiles = groupFilesByFolder(computedFilteredFiles);

	function computeFilteredFiles(files: TFile[], query: string): TFile[] {
		if (!query.trim()) {
			return files.slice(0, 100);
		}
		const q = query.toLowerCase();
		return files
			.filter(
				(f) =>
					f.path.toLowerCase().includes(q) ||
					f.basename.toLowerCase().includes(q),
			)
			.slice(0, 100);
	}

	function groupFilesByFolder(files: TFile[]): FolderGroup[] {
		const folderMap = new Map<string, TFile[]>();

		for (const file of files) {
			const folder = getFolder(file.path) || "(root)";
			const existing = folderMap.get(folder) || [];
			existing.push(file);
			folderMap.set(folder, existing);
		}

		// Sort folders alphabetically, but put (root) first
		const entries = Array.from(folderMap.entries());
		entries.sort((a, b) => {
			if (a[0] === "(root)") return -1;
			if (b[0] === "(root)") return 1;
			return a[0].localeCompare(b[0]);
		});

		return entries.map(([folder, files]) => ({
			folder,
			files: files.sort((a, b) => a.basename.localeCompare(b.basename)),
		}));
	}

	async function loadFiles() {
		debugInfo = "";
		isLoading = true;

		if (!app) {
			debugInfo = "Error: app is undefined";
			console.error("[FilePicker] app is undefined");
			allFiles = [];
			isLoading = false;
			return;
		}

		if (!app.vault) {
			debugInfo = "Error: app.vault is undefined";
			console.error("[FilePicker] app.vault is undefined");
			allFiles = [];
			isLoading = false;
			return;
		}

		try {
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
					const walk = (folder: TFolder): TFile[] => {
						const result: TFile[] = [];
						for (const child of folder.children || []) {
							if (
								child instanceof TFile &&
								child.extension === "md"
							) {
								result.push(child);
							} else if (child instanceof TFolder) {
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
			} else {
				debugInfo = `Found ${files.length} files`;
				// Sort by mtime (most recent first)
				const sorted = [...files].sort((a, b) => {
					return (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0);
				});
				allFiles = sorted;
				console.log(
					"[FilePicker] Total files loaded:",
					allFiles.length,
				);
			}
		} catch (err) {
			debugInfo = `Error: ${err}`;
			console.error("[FilePicker] Error loading files:", err);
			allFiles = [];
		}

		isLoading = false;
		await tick();
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

	async function handleOpenDropdown() {
		isOpen = !isOpen;
		if (isOpen) {
			searchQuery = "";
			await loadFiles();
		}
	}

	onMount(() => {
		console.log(
			"[FilePicker] onMount, app:",
			!!app,
			"vault:",
			!!app?.vault,
		);
		document.addEventListener("click", handleDocumentClick, true);
		return () => {
			document.removeEventListener("click", handleDocumentClick, true);
		};
	});
</script>

<div
	class="ra-file-picker"
	bind:this={dropdownEl}
	role="region"
	aria-label="Reference files"
>
	<div class="ra-picker-header">
		<span class="ra-picker-label">Reference files</span>
		<span class="ra-picker-count">{selectedFiles.length}/{maxFiles}</span>
	</div>

	{#if selectedFiles.length > 0}
		<div class="ra-selected-files">
			{#each selectedFiles as filePath (filePath)}
				<div class="ra-selected-file">
					<svg
						class="ra-file-icon"
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
					<span class="ra-file-name" title={filePath}
						>{getFileName(filePath)}</span
					>
					<button
						type="button"
						class="ra-remove-btn"
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
		class="ra-add-btn"
		on:click={handleOpenDropdown}
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
		Add vault files (Drag and drop works too!)
	</button>

	{#if isOpen}
		<div class="ra-dropdown">
			<input
				type="text"
				class="ra-search-input"
				bind:value={searchQuery}
				placeholder="Search files..."
			/>
			<div class="ra-meta-row">
				{#if isLoading}
					Loading files...
				{:else}
					{debugInfo || `${allFiles.length} markdown files`}
				{/if}
			</div>
			<div class="ra-file-list">
				{#if isLoading}
					<div class="ra-no-files">Loading...</div>
				{:else if groupedFiles.length === 0}
					<div class="ra-no-files">
						{#if allFiles.length === 0}
							No markdown files found in this vault.
						{:else}
							No files match your search.
						{/if}
					</div>
				{:else}
					{#each groupedFiles as group (group.folder)}
						<div class="ra-folder-group">
							<div class="ra-folder-header">
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
									></path>
								</svg>
								<span>{group.folder}</span>
							</div>
							{#each group.files as file (file.path)}
								{@const isSelected = selectedFiles.includes(
									file.path,
								)}
								<button
									type="button"
									class="ra-file-item"
									class:selected={isSelected}
									class:disabled={!isSelected &&
										selectedFiles.length >= maxFiles}
									on:click={() => toggleFile(file.path)}
									disabled={!isSelected &&
										selectedFiles.length >= maxFiles}
								>
									<span class="ra-check"
										>{isSelected ? "✓" : ""}</span
									>
									<svg
										class="ra-file-item-icon"
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
										<polyline points="14 2 14 8 20 8"
										></polyline>
									</svg>
									<span class="ra-file-basename"
										>{file.basename}</span
									>
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<p class="ra-picker-hint">Selected files will be included as context.</p>
</div>

<style>
	.ra-file-picker {
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

	.ra-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.ra-picker-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-normal);
	}

	.ra-picker-count {
		font-size: 11px;
		color: var(--text-muted);
	}

	.ra-selected-files {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.ra-selected-file {
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

	.ra-file-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}

	.ra-file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ra-remove-btn {
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

	.ra-remove-btn:hover {
		opacity: 1;
	}

	.ra-add-btn {
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

	.ra-add-btn:hover:not(:disabled) {
		border-color: var(--interactive-accent);
		color: var(--interactive-accent);
	}

	.ra-add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ra-dropdown {
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

	.ra-meta-row {
		padding: 6px 10px;
		font-size: 11px;
		color: var(--text-muted);
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.ra-search-input {
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

	.ra-search-input::placeholder {
		color: var(--text-muted);
	}

	.ra-file-list {
		max-height: 280px;
		overflow-y: auto;
	}

	.ra-no-files {
		padding: 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 13px;
	}

	/* Folder grouping styles */
	.ra-folder-group {
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.ra-folder-group:last-child {
		border-bottom: none;
	}

	.ra-folder-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--background-secondary-alt);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.ra-folder-header svg {
		opacity: 0.7;
	}

	.ra-file-item {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px 6px 24px;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-normal);
	}

	.ra-file-item:hover:not(:disabled) {
		background: var(--background-modifier-hover);
	}

	.ra-file-item.selected {
		background: rgba(25, 128, 230, 0.1);
	}

	.ra-file-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ra-check {
		width: 14px;
		font-size: 11px;
		color: #1980e6;
		flex-shrink: 0;
	}

	.ra-file-item-icon {
		flex-shrink: 0;
		opacity: 0.5;
	}

	.ra-file-basename {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ra-picker-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0;
	}
</style>
