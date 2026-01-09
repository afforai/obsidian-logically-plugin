<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { BaseModel, Privilege } from "../types";
  import { AI_MODELS, ModelCategory, PRIVILEGES } from "../types";
  import UpgradeModal from "./UpgradeModal.svelte";

  export let selectedModel: BaseModel;
  export let userPrivileges: Privilege[] = [];

  const dispatch = createEventDispatcher<{ change: BaseModel }>();

  let isOpen = false;
  let triggerEl: HTMLButtonElement;
  let dropdownEl: HTMLDivElement;

  // Upgrade modal state
  let showUpgradeModal = false;
  let upgradeModalType: "advanced" | "reasoning" = "advanced";

  $: hasAdvancedAccess = userPrivileges.includes(PRIVILEGES.advanced_models);
  $: hasReasoningAccess = userPrivileges.includes(PRIVILEGES.reasoning_models);

  $: standardModels = AI_MODELS.filter(
    (m) => m.category === ModelCategory.standard,
  );
  $: advancedModels = AI_MODELS.filter(
    (m) => m.category === ModelCategory.advanced,
  );
  $: reasoningModels = AI_MODELS.filter(
    (m) => m.category === ModelCategory.reasoning,
  );
  $: selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);

  function handleSelect(model: BaseModel) {
    const modelInfo = AI_MODELS.find((m) => m.id === model);
    if (!modelInfo) return;

    // Check privileges for advanced models
    if (modelInfo.category === ModelCategory.advanced && !hasAdvancedAccess) {
      upgradeModalType = "advanced";
      showUpgradeModal = true;
      isOpen = false;
      return;
    }

    // Check privileges for reasoning models
    if (modelInfo.category === ModelCategory.reasoning && !hasReasoningAccess) {
      upgradeModalType = "reasoning";
      showUpgradeModal = true;
      isOpen = false;
      return;
    }

    dispatch("change", model);
    isOpen = false;
  }

  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
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

<div class="model-selector">
  <button
    bind:this={triggerEl}
    class="model-trigger"
    on:click={toggleDropdown}
    type="button"
  >
    <span class="model-trigger-content">
      {#if selectedModelInfo}
        <span class="model-name">{selectedModelInfo.name}</span>
        {#if selectedModelInfo.tag}
          <span class="model-tag">{selectedModelInfo.tag}</span>
        {/if}
      {:else}
        <span class="model-name">Select model</span>
      {/if}
    </span>
    <svg
      class="chevron"
      class:open={isOpen}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </button>

  {#if isOpen}
    <div bind:this={dropdownEl} class="model-dropdown">
      <!-- Standard Models -->
      <div class="model-section">
        <div class="section-header">
          Standard AI models
          <span class="section-hint">(For basic research)</span>
        </div>
        {#each standardModels as model}
          <button
            class="model-item"
            class:selected={model.id === selectedModel}
            on:click={() => handleSelect(model.id)}
            type="button"
          >
            <span class="check-area">
              {#if model.id === selectedModel}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {/if}
            </span>
            <span class="model-item-name">{model.name}</span>
            {#if model.tag}
              <span class="model-tag">{model.tag}</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Advanced Models -->
      <div class="model-section">
        <div class="section-header">
          <span class="crown">👑</span>
          Advanced AI models
          <span class="section-hint">(For deep research)</span>
          {#if !hasAdvancedAccess}
            <span class="locked-badge">🔒</span>
          {/if}
        </div>
        {#each advancedModels as model}
          <button
            class="model-item"
            class:selected={model.id === selectedModel}
            class:locked={!hasAdvancedAccess}
            on:click={() => handleSelect(model.id)}
            type="button"
          >
            <span class="check-area">
              {#if model.id === selectedModel}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {/if}
            </span>
            <span class="model-item-name">{model.name}</span>
            {#if model.tag}
              <span class="model-tag">{model.tag}</span>
            {/if}
            {#if !hasAdvancedAccess}
              <span class="lock-icon">🔒</span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Reasoning Models -->
      <div class="model-section">
        <div class="section-header">
          <span class="crown">👑</span>
          Reasoning AI models
          <span class="section-hint">(For detailed answers)</span>
          {#if !hasReasoningAccess}
            <span class="locked-badge">🔒</span>
          {/if}
        </div>
        {#each reasoningModels as model}
          <button
            class="model-item"
            class:selected={model.id === selectedModel}
            class:locked={!hasReasoningAccess}
            on:click={() => handleSelect(model.id)}
            type="button"
          >
            <span class="check-area">
              {#if model.id === selectedModel}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {/if}
            </span>
            <span class="model-item-name">{model.name}</span>
            {#if model.tag}
              <span class="model-tag">{model.tag}</span>
            {/if}
            {#if !hasReasoningAccess}
              <span class="lock-icon">🔒</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<UpgradeModal
  bind:isOpen={showUpgradeModal}
  modelType={upgradeModalType}
  on:close={() => (showUpgradeModal = false)}
/>

<style>
  .model-selector {
    position: relative;
    z-index: 10;
  }

  .model-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    color: var(--text-normal);
  }

  .model-trigger:hover {
    background: var(--background-modifier-hover);
  }

  .model-trigger-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-name {
    font-size: 14px;
    font-weight: 500;
  }

  .model-tag {
    font-size: 11px;
    font-weight: 600;
    color: #1980e6;
    background: rgba(25, 128, 230, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .chevron {
    color: var(--text-muted);
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .model-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: 1000;
    max-height: min(70vh, 640px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .model-section {
    padding: 4px 0;
  }

  .model-section:not(:last-child) {
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .section-hint {
    color: var(--text-muted);
    font-weight: 400;
  }

  .crown {
    font-size: 12px;
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: calc(100% - 8px);
    padding: 6px 8px;
    background: transparent;
    border: none;
    box-shadow: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: var(--text-normal);
    border-radius: 4px;
    margin: 0 4px;
  }

  .model-item:hover {
    background: var(--background-modifier-hover);
  }

  .model-item.selected {
    background: var(--background-modifier-hover);
  }

  .check-area {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--interactive-accent);
  }

  .model-item-name {
    font-size: 14px;
    flex: 1;
  }

  .model-item.locked {
    opacity: 0.7;
  }

  .model-item.locked:hover {
    background: rgba(245, 158, 11, 0.1);
  }

  .locked-badge {
    font-size: 11px;
    margin-left: auto;
  }

  .lock-icon {
    font-size: 12px;
    margin-left: auto;
  }
</style>
