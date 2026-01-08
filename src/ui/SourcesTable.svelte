<script lang="ts">
	import type { App } from "obsidian";
	import type { SourceNode } from "../types";

	export let sources: SourceNode[] = [];
	export let isExpanded = true;
	export let app: App | undefined = undefined;

	/**
	 * Group sources by their unique identifier (fileid or url or filename).
	 * This deduplicates sources that appear multiple times.
	 */
	function getUniqueSources(nodes: SourceNode[]): SourceNode[] {
		const seen = new Set<string>();
		const unique: SourceNode[] = [];
		for (const node of nodes) {
			const key = node.fileid || node.url || node.filename;
			if (!seen.has(key)) {
				seen.add(key);
				unique.push(node);
			}
		}
		return unique;
	}

	/**
	 * Determine the source type for display.
	 */
	function getSourceType(
		sources: SourceNode[],
	): "google" | "semantic_scholar" | "documents" | "reference" {
		const first = sources[0];
		if (!first) return "documents";
		if (first.filetype === "goog") return "google";
		if (first.filetype === "semantic_scholar") return "semantic_scholar";
		if (first.filetype === "reference") return "reference";
		return "documents";
	}

	/**
	 * Get appropriate label for source type.
	 */
	function getSourceLabel(
		type: "google" | "semantic_scholar" | "documents" | "reference",
	): string {
		switch (type) {
			case "google":
				return "Google Search Results";
			case "semantic_scholar":
				return "Semantic Scholar Results";
			case "reference":
				return "Reference Files";
			default:
				return "Document Sources";
		}
	}

	/**
	 * Get hostname from URL for display.
	 */
	function getHostname(url: string | undefined): string {
		if (!url) return "";
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	/** Validate URL has safe protocol (http/https only) */
	function isSafeUrl(url: string): boolean {
		return /^https?:\/\//i.test(url);
	}

	/**
	 * Open URL in external browser (only http/https URLs).
	 */
	function openUrl(url: string | undefined) {
		if (url && isSafeUrl(url)) {
			window.open(url, "_blank");
		}
	}

	/**
	 * Open a file in Obsidian by path.
	 */
	function openFile(filePath: string | undefined) {
		if (!filePath || !app) return;
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file) {
			app.workspace.openLinkText(filePath, "", false);
		}
	}

	$: uniqueSources = getUniqueSources(sources);
	$: sourceType = getSourceType(sources);
	$: sourceLabel = getSourceLabel(sourceType);
</script>

{#if uniqueSources.length > 0}
	<div class="ra-sources-container">
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<div
			class="ra-sources-header"
			on:click={() => (isExpanded = !isExpanded)}
		>
			<div class="ra-sources-title">
				{#if sourceType === "google"}
					<svg
						class="ra-sources-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="currentColor"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="currentColor"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="currentColor"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
				{:else if sourceType === "semantic_scholar"}
					<svg
						class="ra-sources-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
						/>
					</svg>
				{:else if sourceType === "reference"}
					<svg
						class="ra-sources-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
						/>
					</svg>
				{:else}
					<svg
						class="ra-sources-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
						/>
					</svg>
				{/if}
				<span>{sourceLabel}</span>
				<span class="ra-sources-count">({uniqueSources.length})</span>
			</div>
			<svg
				class="ra-sources-chevron"
				class:expanded={isExpanded}
				width="16"
				height="16"
				viewBox="0 0 24 24"
			>
				<path fill="currentColor" d="M7 10l5 5 5-5z" />
			</svg>
		</div>

		{#if isExpanded}
			<div class="ra-sources-table-wrapper">
				<table class="ra-sources-table">
					<thead>
						<tr>
							{#if sourceType === "google"}
								<th>Website</th>
								<th>Title</th>
							{:else if sourceType === "semantic_scholar"}
								<th>Source</th>
								<th>Title</th>
								<th>Citations</th>
							{:else if sourceType === "reference"}
								<th>File</th>
							{:else}
								<th>Document</th>
								<th>Pages</th>
							{/if}
							<th class="ra-sources-action-col">Link</th>
						</tr>
					</thead>
					<tbody>
						{#each uniqueSources as source, i}
							<tr>
								{#if sourceType === "google"}
									<td class="ra-sources-website">
										<img
											src="https://www.google.com/s2/favicons?domain={getHostname(
												source.url,
											)}&sz=16"
											alt=""
											width="16"
											height="16"
											class="ra-sources-favicon"
										/>{getHostname(source.url)}
									</td>
									<td class="ra-sources-title-cell">
										{source.filename}
									</td>
								{:else if sourceType === "semantic_scholar"}
									<td class="ra-sources-website">
										{#if source.pdfUrl}
											<img
												src="https://www.google.com/s2/favicons?domain={getHostname(
													source.pdfUrl,
												)}&sz=16"
												alt=""
												width="16"
												height="16"
												class="ra-sources-favicon"
											/>{getHostname(source.pdfUrl)}
										{:else}
											<svg
												class="ra-sources-favicon"
												width="16"
												height="16"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
												/>
											</svg>Semantic Scholar
										{/if}
									</td>
									<td class="ra-sources-title-cell">
										{source.filename}
									</td>
									<td class="ra-sources-stat">
										{source.citationCount ?? "-"}
									</td>
								{:else if sourceType === "reference"}
									<td
										class="ra-sources-title-cell ra-sources-file-cell"
									>
										<svg
											class="ra-sources-favicon"
											width="16"
											height="16"
											viewBox="0 0 24 24"
										>
											<path
												fill="currentColor"
												d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
											/>
										</svg>
										<!-- svelte-ignore a11y-click-events-have-key-events -->
										<!-- svelte-ignore a11y-no-static-element-interactions -->
										<span
											class="ra-sources-file-link"
											on:click={() =>
												openFile(source.fileid)}
											title="Open {source.fileid}"
											>{source.fileid ||
												source.filename}</span
										>
									</td>
								{:else}
									<td class="ra-sources-title-cell">
										{source.filename}
									</td>
									<td class="ra-sources-stat">
										{#if source.pages && source.pages.length > 0}
											{source.pages.join(", ")}
										{:else}
											-
										{/if}
									</td>
								{/if}
								<td class="ra-sources-action-col">
									{#if source.url || source.pdfUrl}
										<button
											type="button"
											class="ra-sources-link-btn"
											on:click={() =>
												openUrl(
													source.pdfUrl || source.url,
												)}
											title="Open in browser"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
												/>
											</svg>
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style>
	.ra-sources-container {
		margin-top: 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--background-primary);
	}

	.ra-sources-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		cursor: pointer;
		user-select: none;
		background: var(--background-secondary);
		transition: background 0.15s ease;
	}

	.ra-sources-header:hover {
		background: var(--background-modifier-hover);
	}

	.ra-sources-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.ra-sources-icon {
		flex-shrink: 0;
	}

	.ra-sources-count {
		opacity: 0.7;
	}

	.ra-sources-chevron {
		transition: transform 0.2s ease;
		color: var(--text-muted);
	}

	.ra-sources-chevron.expanded {
		transform: rotate(180deg);
	}

	.ra-sources-table-wrapper {
		overflow-x: auto;
		max-height: 200px;
		overflow-y: auto;
	}

	.ra-sources-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.ra-sources-table th,
	.ra-sources-table td {
		padding: 6px 10px;
		text-align: left;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.ra-sources-table th {
		background: var(--background-secondary);
		font-weight: 600;
		color: var(--text-muted);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.ra-sources-table tbody tr:hover {
		background: var(--background-modifier-hover);
	}

	.ra-sources-website {
		white-space: nowrap;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ra-sources-favicon {
		display: inline-block;
		vertical-align: middle;
		margin-right: 6px;
		border-radius: 2px;
	}

	.ra-sources-title-cell {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ra-sources-file-cell {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ra-sources-file-link {
		color: var(--interactive-accent);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}

	.ra-sources-file-link:hover {
		text-decoration-style: solid;
	}

	.ra-sources-stat {
		text-align: center;
		white-space: nowrap;
		color: var(--text-muted);
	}

	.ra-sources-action-col {
		width: 50px;
		text-align: center;
	}

	.ra-sources-link-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		color: var(--text-muted);
		transition: all 0.15s ease;
	}

	.ra-sources-link-btn:hover {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
