<script lang="ts">
  import type { App } from "obsidian";
  import type { SourceNode, Tool } from "../types";

  export let sources: SourceNode[] = [];
  export let isExpanded = true;
  export let app: App | undefined = undefined;

  type TabKey = "all" | Tool;

  /** Per-tool grouping for the tabbed final-aggregate view (B36).
   *  Falls back to inferring from `filetype` for sources lacking `toolType`
   *  (legacy v1 frames / historical chat replay). */
  function classify(n: SourceNode): Tool {
    if (n.toolType) return n.toolType;
    if (n.filetype === "goog") return "search_web";
    if (n.filetype === "semantic_scholar") return "search_academic";
    return "search_library";
  }

  /** Deduplicate by stable identifier (fileid|url|filename). */
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

  function getHostname(url: string | undefined): string {
    if (!url) return "";
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function isSafeUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  function openUrl(url: string | undefined) {
    if (url && isSafeUrl(url)) {
      window.open(url, "_blank");
    }
  }

  function openFile(filePath: string | undefined) {
    if (!filePath || !app) return;
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file) {
      app.workspace.openLinkText(filePath, "", false);
    }
  }

  const TAB_LABEL: Record<Tool, string> = {
    search_library: "Library",
    search_academic: "Academic",
    search_web: "Web",
  };

  let activeTab: TabKey = "all";

  $: uniqueSources = getUniqueSources(sources);
  $: groups = (() => {
    const g: Record<Tool, SourceNode[]> = {
      search_library: [],
      search_academic: [],
      search_web: [],
    };
    for (const s of uniqueSources) g[classify(s)].push(s);
    return g;
  })();
  $: availableTools = (Object.keys(groups) as Tool[]).filter(
    (t) => groups[t].length > 0,
  );
  // If active tab becomes empty after data change, fall back to "all".
  $: if (activeTab !== "all" && !availableTools.includes(activeTab as Tool)) {
    activeTab = "all";
  }
  $: visibleSources =
    activeTab === "all" ? uniqueSources : groups[activeTab as Tool];
</script>

{#if uniqueSources.length > 0}
  <div class="ra-sources-container">
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="ra-sources-header" on:click={() => (isExpanded = !isExpanded)}>
      <div class="ra-sources-title">
        <svg class="ra-sources-icon" width="16" height="16" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"
          />
        </svg>
        <span>Sources</span>
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
      {#if availableTools.length > 1}
        <div class="ra-sources-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="ra-sources-tab"
            class:active={activeTab === "all"}
            on:click={() => (activeTab = "all")}
          >
            All
            <span class="ra-sources-tab-count">{uniqueSources.length}</span>
          </button>
          {#each availableTools as tool}
            <button
              type="button"
              role="tab"
              class="ra-sources-tab"
              class:active={activeTab === tool}
              on:click={() => (activeTab = tool)}
            >
              {TAB_LABEL[tool]}
              <span class="ra-sources-tab-count">{groups[tool].length}</span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="ra-sources-list">
        {#each visibleSources as source (source.fileid || source.url || source.filename)}
          {@const kind = classify(source)}
          <div class="ra-sources-row">
            <span class="ra-sources-row-icon" aria-hidden="true">
              {#if kind === "search_web"}
                {#if source.url}
                  <img
                    src="https://www.google.com/s2/favicons?domain={getHostname(
                      source.url,
                    )}&sz=32"
                    alt=""
                    width="16"
                    height="16"
                    class="ra-sources-favicon"
                  />
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.6a15.5 15.5 0 0 0-1.3-3.4A8 8 0 0 1 18.9 8zM12 4c.8 1 1.5 2.4 1.9 4h-3.8c.4-1.6 1.1-3 1.9-4zM4.3 14a7.9 7.9 0 0 1 0-4h3a17.6 17.6 0 0 0 0 4h-3zm.8 2h2.6c.3 1.2.7 2.3 1.3 3.4A8 8 0 0 1 5.1 16zM7.7 8H5.1a8 8 0 0 1 3.9-3.4A15.5 15.5 0 0 0 7.7 8zM12 20c-.8-1-1.5-2.4-1.9-4h3.8c-.4 1.6-1.1 3-1.9 4zm2.3-6H9.7a15.6 15.6 0 0 1 0-4h4.6a15.6 15.6 0 0 1 0 4zm.7 5.4c.5-1.1 1-2.2 1.3-3.4h2.6a8 8 0 0 1-3.9 3.4zm1.7-5.4a17.6 17.6 0 0 0 0-4h3a7.9 7.9 0 0 1 0 4h-3z"
                    />
                  </svg>
                {/if}
              {:else if kind === "search_academic"}
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 3 1 9l4 2.2v6L12 21l7-3.8v-6l2-1.1V17h2V9L12 3zm6.8 6L12 12.7 5.2 9 12 5.3 18.8 9zM17 16.2l-5 2.7-5-2.7v-3.5L12 15l5-2.3v3.5z"
                  />
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"
                  />
                </svg>
              {/if}
            </span>

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <span
              class="ra-sources-row-title"
              class:linkable={!!(source.url || source.pdfUrl || source.fileid)}
              title={source.filename}
              on:click={() => {
                if (source.url || source.pdfUrl) {
                  openUrl(source.pdfUrl || source.url);
                } else if (kind === "search_library") {
                  openFile(source.fileid);
                }
              }}
            >
              {source.filename}
            </span>

            <span class="ra-sources-row-meta">
              {#if kind === "search_web"}
                {getHostname(source.url)}
              {:else if kind === "search_academic"}
                {#if source.citationCount != null}
                  {source.citationCount} cites
                {:else}
                  Semantic Scholar
                {/if}
              {:else if source.pages && source.pages.length > 0}
                p. {source.pages.join(", ")}
              {/if}
            </span>
          </div>
        {/each}
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
    color: var(--text-muted);
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

  .ra-sources-tabs {
    display: flex;
    gap: 2px;
    padding: 6px 8px 0 8px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .ra-sources-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    border-bottom: 2px solid transparent;
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .ra-sources-tab:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .ra-sources-tab.active {
    color: var(--text-normal);
    border-bottom-color: var(--interactive-accent);
  }

  .ra-sources-tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
  }

  .ra-sources-tab.active .ra-sources-tab-count {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .ra-sources-list {
    max-height: 260px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .ra-sources-row {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background 0.12s ease;
  }

  .ra-sources-row:last-child {
    border-bottom: none;
  }

  .ra-sources-row:hover {
    background: var(--background-modifier-hover);
  }

  .ra-sources-row-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    width: 16px;
    height: 16px;
  }

  .ra-sources-favicon {
    border-radius: 3px;
  }

  .ra-sources-row-title {
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ra-sources-row-title.linkable {
    cursor: pointer;
  }

  .ra-sources-row-title.linkable:hover {
    color: var(--interactive-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .ra-sources-row-meta {
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }
</style>
