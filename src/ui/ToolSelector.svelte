<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { SearchMode } from "../types";

  export let selectedTools: SearchMode[] = ["files"];
  export let isAuthenticated = true;
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    change: SearchMode[];
    openConnectNotes: void;
    fileCount: void;
  }>();

  /** File count owned by Root (passed via prop). 0 = "All files" / no specific selection. */
  export let connectedFileCount = 0;
  // External-ref only: parent passes through for future analytics.
  export const totalFileCount = 0;

  let open = false;
  let triggerEl: HTMLButtonElement;
  let popoverEl: HTMLDivElement;

  $: hasFiles = selectedTools.includes("files");
  $: hasSemantic = selectedTools.includes("semantic");
  $: hasGoogle = selectedTools.includes("google");
  $: activeCount = selectedTools.length;
  $: agenticBadge =
    activeCount === 3
      ? {
          label: "Active",
          fg: "var(--ra-badge-active-fg)",
          bg: "var(--ra-badge-active-bg)",
        }
      : activeCount === 2
        ? {
            label: "Semi-active",
            fg: "var(--ra-badge-semi-fg)",
            bg: "var(--ra-badge-semi-bg)",
          }
        : {
            label: "Not active",
            fg: "var(--ra-badge-off-fg)",
            bg: "var(--ra-badge-off-bg)",
          };

  // Order for stacked trigger icons: files, semantic, google
  $: activeIcons = (
    [
      { mode: "files" as SearchMode, icon: "books" },
      { mode: "semantic" as SearchMode, icon: "graduation" },
      { mode: "google" as SearchMode, icon: "globe" },
    ] as const
  ).filter((t) => selectedTools.includes(t.mode));

  function emit(next: SearchMode[]) {
    selectedTools = next;
    dispatch("change", next);
  }

  function toggle(mode: SearchMode) {
    if (disabled) return;
    if (mode === "files" && !isAuthenticated) return; // B9
    emit(
      selectedTools.includes(mode)
        ? selectedTools.filter((m) => m !== mode)
        : [...selectedTools, mode],
    );
  }

  function activateAgentic() {
    if (disabled) return;
    const next: SearchMode[] = isAuthenticated
      ? ["files", "google", "semantic"]
      : ["google", "semantic"];
    emit(next);
  }

  function handleDocClick(e: MouseEvent) {
    if (!open) return;
    const t = e.target as HTMLElement;
    if (triggerEl?.contains(t) || popoverEl?.contains(t)) return;
    open = false;
  }

  onMount(() => document.addEventListener("click", handleDocClick, true));
  onDestroy(() => document.removeEventListener("click", handleDocClick, true));
</script>

<div class="ra-ts-wrapper">
  <button
    bind:this={triggerEl}
    type="button"
    class="ra-ts-trigger"
    class:open
    on:click|stopPropagation={() => (open = !open)}
    {disabled}
  >
    {#if activeIcons.length > 0}
      <span class="ra-ts-stack">
        {#each activeIcons as ent, i (ent.mode)}
          <span class="ra-ts-bubble" style="margin-left:{i > 0 ? '-6px' : '0'}">
            {#if ent.icon === "books"}
              <!-- books -->
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path
                  d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                />
              </svg>
            {:else if ent.icon === "graduation"}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            {:else}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path
                  d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                />
              </svg>
            {/if}
          </span>
        {/each}
      </span>
    {:else}
      <span class="ra-ts-placeholder">Select research mode</span>
    {/if}
    <svg
      class="ra-ts-end"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  </button>

  {#if open}
    <div bind:this={popoverEl} class="ra-ts-popover" role="dialog">
      <!-- Section A: Agentic AI -->
      <div class="ra-ts-section ra-ts-section-agentic">
        <div class="ra-ts-row-head">
          <div class="ra-ts-title-row">
            <svg
              class="ra-ts-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 2L4 8l8 6 8-6-8-6z" />
              <path d="M4 16l8 6 8-6" />
            </svg>
            <span class="ra-ts-label">Agentic AI</span>
          </div>
          <p class="ra-ts-desc">
            Logically will utilize all three sources to perform your research
            task.
          </p>
        </div>
        <div class="ra-ts-agentic-actions">
          <span
            class="ra-ts-badge"
            style="color:{agenticBadge.fg};background:{agenticBadge.bg}"
          >
            {agenticBadge.label}
          </span>
          <button
            type="button"
            class="ra-ts-btn-black"
            on:click={activateAgentic}
            disabled={activeCount === 3 || disabled}>Activate</button
          >
        </div>
      </div>

      <div class="ra-ts-divider"></div>

      <!-- Section B: Search library -->
      <div class="ra-ts-section ra-ts-section-row">
        <div class="ra-ts-row-body">
          <div class="ra-ts-title-row">
            <svg
              class="ra-ts-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path
                d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
              />
            </svg>
            <span class="ra-ts-label">Search library</span>
          </div>
          <p class="ra-ts-desc">
            Logically will use the files from your library to conduct research.
          </p>
          {#if hasFiles}
            <div class="ra-ts-subrow">
              <span class="ra-ts-muted">
                {#if connectedFileCount === 0}
                  No notes connected
                {:else}
                  {connectedFileCount} note{connectedFileCount !== 1 ? "s" : ""} connected
                {/if}
              </span>
              <button
                type="button"
                class="ra-ts-btn-white"
                on:click={() => dispatch("openConnectNotes")}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                  />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 12 15 15" />
                </svg>
                Connect notes
              </button>
            </div>
          {/if}
        </div>
        <label
          class="ra-ts-switch"
          class:disabled={!isAuthenticated || disabled}
          title={!isAuthenticated ? "Sign in to use library search" : ""}
        >
          <input
            type="checkbox"
            checked={hasFiles}
            disabled={!isAuthenticated || disabled}
            on:change={() => toggle("files")}
          />
          <span class="ra-ts-slider"></span>
        </label>
      </div>

      <!-- Section C: Academic -->
      <div class="ra-ts-section ra-ts-section-row">
        <div class="ra-ts-row-body">
          <div class="ra-ts-title-row">
            <svg
              class="ra-ts-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            <span class="ra-ts-label">Search academic databases</span>
          </div>
          <p class="ra-ts-desc">
            Logically will find relevant research papers to support your answer.
          </p>
        </div>
        <label class="ra-ts-switch" class:disabled>
          <input
            type="checkbox"
            checked={hasSemantic}
            {disabled}
            on:change={() => toggle("semantic")}
          />
          <span class="ra-ts-slider"></span>
        </label>
      </div>

      <!-- Section D: Web -->
      <div class="ra-ts-section ra-ts-section-row">
        <div class="ra-ts-row-body">
          <div class="ra-ts-title-row">
            <svg
              class="ra-ts-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              />
            </svg>
            <span class="ra-ts-label">Search web</span>
          </div>
          <p class="ra-ts-desc">
            Logically will search the latest sources on the internet.
          </p>
        </div>
        <label class="ra-ts-switch" class:disabled>
          <input
            type="checkbox"
            checked={hasGoogle}
            {disabled}
            on:change={() => toggle("google")}
          />
          <span class="ra-ts-slider"></span>
        </label>
      </div>
    </div>
  {/if}
</div>

<style>
  .ra-ts-wrapper {
    position: relative;
    display: inline-block;
  }

  .ra-ts-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: var(--ra-radius-md);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ra-grey-11);
    transition: background var(--ra-transition);
    box-shadow: none;
  }
  .ra-ts-trigger:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }
  .ra-ts-trigger.open {
    background: var(--background-modifier-hover);
  }
  .ra-ts-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ra-ts-stack {
    display: inline-flex;
    align-items: center;
  }
  .ra-ts-bubble {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--ra-icon-bubble-bg);
    color: var(--ra-icon-bubble-fg);
    border: 1px solid var(--background-modifier-border);
  }
  .ra-ts-trigger.open .ra-ts-bubble {
    border-color: var(--background-modifier-border);
  }
  .ra-ts-placeholder {
    font-weight: 500;
  }
  .ra-ts-end {
    color: var(--ra-grey-11);
  }

  .ra-ts-popover {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 6px;
    width: 340px;
    background: var(--background-primary);
    border-radius: var(--ra-radius-lg);
    box-shadow: var(--ra-shadow-pop);
    z-index: 1000;
    overflow: hidden;
  }

  .ra-ts-section-agentic {
    padding: 8px 8px 12px;
    background: var(--ra-grey-1);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ra-ts-row-head {
    padding: 0 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ra-ts-title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--ra-grey-11);
  }
  .ra-ts-icon {
    flex-shrink: 0;
    color: var(--ra-grey-11);
  }
  .ra-ts-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--ra-grey-11);
  }
  .ra-ts-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ra-grey-9);
  }
  .ra-ts-agentic-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ra-ts-badge {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 4px 8px;
    border-radius: var(--ra-radius-lg);
    font-size: 12px;
    font-weight: 500;
  }
  .ra-ts-btn-black {
    background: var(--text-normal);
    color: var(--background-primary);
    border: none;
    border-radius: var(--ra-radius-md);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  }
  .ra-ts-btn-black:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .ra-ts-btn-black:hover:not(:disabled) {
    filter: brightness(1.15);
  }

  .ra-ts-divider {
    height: 1px;
    background: var(--ra-hairline);
  }

  .ra-ts-section-row {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    margin: 4px 4px 0;
    padding: 8px;
  }
  .ra-ts-section-row:last-child {
    margin: 0 4px 4px;
  }
  .ra-ts-row-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .ra-ts-subrow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ra-ts-muted {
    font-size: 12px;
    color: var(--ra-muted-step);
  }
  .ra-ts-btn-white {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--background-primary);
    color: var(--ra-grey-11);
    border: 1px solid var(--ra-hairline);
    border-radius: var(--ra-radius-sm);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .ra-ts-btn-white:hover {
    background: var(--background-modifier-hover);
  }

  /* Switch */
  .ra-ts-switch {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .ra-ts-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .ra-ts-slider {
    position: absolute;
    inset: 0;
    background: var(--background-modifier-border);
    border-radius: 9px;
    transition: background var(--ra-transition);
    cursor: pointer;
  }
  .ra-ts-slider::before {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    left: 2px;
    top: 2px;
    background: #fff;
    border-radius: 50%;
    transition: transform var(--ra-transition);
  }
  .ra-ts-switch input:checked + .ra-ts-slider {
    background: var(--ra-brand-blue);
  }
  .ra-ts-switch input:checked + .ra-ts-slider::before {
    transform: translateX(14px);
  }
  .ra-ts-switch.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ra-ts-switch.disabled .ra-ts-slider {
    cursor: not-allowed;
  }
</style>
