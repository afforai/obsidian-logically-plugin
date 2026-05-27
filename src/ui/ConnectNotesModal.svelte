<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { TFile, type App } from "obsidian";

  export let app: App;
  export let initialSelectedPaths: string[] = [];
  export let isOpen = false;
  export let isSyncing = false;

  const dispatch = createEventDispatcher<{
    submit: TFile[];
    close: void;
  }>();

  let search = "";
  let selected = new Set<string>(initialSelectedPaths);
  let allFiles: TFile[] = [];

  $: filtered = allFiles.filter((f) =>
    search.trim()
      ? f.path.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  $: selectedCount = selected.size;

  function refresh() {
    allFiles = app.vault
      .getMarkdownFiles()
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  function toggle(path: string) {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selected = next;
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const f of filtered) next.add(f.path);
    selected = next;
  }

  function clearAll() {
    selected = new Set();
  }

  function handleSubmit() {
    if (isSyncing) return;
    const chosen = allFiles.filter((f) => selected.has(f.path));
    dispatch("submit", chosen);
  }

  function handleClose() {
    if (isSyncing) return;
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") handleClose();
  }

  onMount(() => {
    refresh();
    document.addEventListener("keydown", handleKeydown);
  });
  onDestroy(() => document.removeEventListener("keydown", handleKeydown));

  $: if (isOpen) refresh();
</script>

{#if isOpen}
  <div
    class="ra-cn-overlay"
    on:click={handleClose}
    on:keydown={handleKeydown}
    role="presentation"
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="ra-cn-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Connect notes"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <header class="ra-cn-header">
        <div class="ra-cn-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Connect notes</span>
        </div>
        <button
          type="button"
          class="ra-cn-close"
          on:click={handleClose}
          disabled={isSyncing}
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <p class="ra-cn-desc">
        Select vault notes to sync into your Logically library. They will be
        indexed for retrieval-augmented search.
      </p>

      <div class="ra-cn-searchrow">
        <input
          type="text"
          class="ra-cn-search"
          placeholder="Search notes by path..."
          bind:value={search}
          disabled={isSyncing}
        />
        <button
          type="button"
          class="ra-cn-btn-ghost"
          on:click={selectAllVisible}
          disabled={isSyncing || filtered.length === 0}>Select shown</button
        >
        <button
          type="button"
          class="ra-cn-btn-ghost"
          on:click={clearAll}
          disabled={isSyncing || selectedCount === 0}>Clear</button
        >
      </div>

      <div class="ra-cn-list" role="listbox" aria-multiselectable="true">
        {#if filtered.length === 0}
          <div class="ra-cn-empty">No markdown notes match.</div>
        {:else}
          {#each filtered as file (file.path)}
            {@const checked = selected.has(file.path)}
            <label class="ra-cn-row" class:checked>
              <input
                type="checkbox"
                {checked}
                on:change={() => toggle(file.path)}
                disabled={isSyncing}
              />
              <span class="ra-cn-name">{file.basename}</span>
              <span class="ra-cn-path"
                >{file.parent?.path === "/"
                  ? ""
                  : (file.parent?.path ?? "")}</span
              >
            </label>
          {/each}
        {/if}
      </div>

      <footer class="ra-cn-footer">
        <span class="ra-cn-count">
          {selectedCount} note{selectedCount === 1 ? "" : "s"} selected
        </span>
        <div class="ra-cn-actions">
          <button
            type="button"
            class="ra-cn-btn-ghost"
            on:click={handleClose}
            disabled={isSyncing}>Cancel</button
          >
          <button
            type="button"
            class="ra-cn-btn-primary"
            on:click={handleSubmit}
            disabled={isSyncing || selectedCount === 0}
          >
            {isSyncing ? "Syncing..." : "Sync & connect"}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .ra-cn-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .ra-cn-modal {
    width: min(560px, 100%);
    max-height: 80vh;
    background: var(--background-primary);
    border: 1px solid var(--ra-hairline, var(--background-modifier-border));
    border-radius: var(--ra-radius-lg, 12px);
    box-shadow: var(--ra-shadow-pop, 0 12px 32px rgba(0, 0, 0, 0.3));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ra-cn-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid
      var(--ra-hairline, var(--background-modifier-border));
  }
  .ra-cn-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: var(--text-normal);
  }
  .ra-cn-title svg {
    color: var(--ra-brand-blue, var(--interactive-accent));
  }
  .ra-cn-close {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-muted);
    border-radius: 6px;
  }
  .ra-cn-close:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  .ra-cn-desc {
    margin: 12px 16px 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .ra-cn-searchrow {
    display: flex;
    gap: 6px;
    padding: 12px 16px;
  }
  .ra-cn-search {
    flex: 1;
    background: var(--background-secondary);
    border: 1px solid var(--ra-hairline, var(--background-modifier-border));
    border-radius: var(--ra-radius-md, 8px);
    padding: 6px 10px;
    font-size: 13px;
    color: var(--text-normal);
  }
  .ra-cn-search:focus {
    outline: none;
    border-color: var(--ra-brand-blue, var(--interactive-accent));
  }
  .ra-cn-list {
    flex: 1;
    min-height: 200px;
    overflow-y: auto;
    padding: 0 8px;
    border-top: 1px solid var(--ra-hairline, var(--background-modifier-border));
    border-bottom: 1px solid
      var(--ra-hairline, var(--background-modifier-border));
  }
  .ra-cn-empty {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }
  .ra-cn-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--ra-radius-sm, 6px);
    cursor: pointer;
    font-size: 13px;
    transition: background var(--ra-transition);
  }
  .ra-cn-row:hover {
    background: var(--background-modifier-hover);
  }
  .ra-cn-row.checked {
    background: var(--ra-brand-blue-bg);
  }
  .ra-cn-row input {
    margin: 0;
  }
  .ra-cn-name {
    color: var(--text-normal);
    font-weight: 500;
  }
  .ra-cn-path {
    color: var(--text-muted);
    font-size: 11px;
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
  }
  .ra-cn-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }
  .ra-cn-count {
    font-size: 12px;
    color: var(--text-muted);
  }
  .ra-cn-actions {
    display: flex;
    gap: 8px;
  }
  .ra-cn-btn-ghost {
    background: transparent;
    border: 1px solid var(--ra-hairline, var(--background-modifier-border));
    border-radius: var(--ra-radius-sm, 6px);
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-normal);
    cursor: pointer;
    font-family: inherit;
  }
  .ra-cn-btn-ghost:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }
  .ra-cn-btn-ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ra-cn-btn-primary {
    background: var(--ra-brand-blue, var(--interactive-accent));
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--ra-radius-md, 8px);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .ra-cn-btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .ra-cn-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
