<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { BaseModel, ModelEntity, Privilege, SearchMode } from "../types";
  import {
    AI_MODELS,
    DEFAULT_SETTINGS,
    ModelCategory,
    PRIVILEGES,
  } from "../types";
  import ToolSelector from "./ToolSelector.svelte";

  export let disabled = false;
  export let selectedModel: BaseModel = "gemini_flash";
  export let selectedTools: SearchMode[] = ["files"];
  export let userPrivileges: Privilege[] = [];
  export let fileCount = 0;
  export let totalFileCount = 0;
  /** Available AI models - defaults to static list, can be overridden with API data */
  export let models: ModelEntity[] = AI_MODELS;
  export let isAuthenticated = true;

  const dispatch = createEventDispatcher<{
    send: string;
    modelChange: BaseModel;
    toolsChange: SearchMode[];
    showUpgrade: "advanced" | "reasoning";
    openConnectNotes: void;
    requestLogin: void;
  }>();

  let inputValue = "";
  let textareaEl: HTMLTextAreaElement;

  // Model selector state
  let modelDropdownOpen = false;
  let modelTriggerEl: HTMLButtonElement;
  let modelDropdownEl: HTMLDivElement;

  $: hasAdvancedAccess = userPrivileges.includes(PRIVILEGES.advanced_models);
  $: hasReasoningAccess = userPrivileges.includes(PRIVILEGES.reasoning_models);

  $: standardModels = models.filter(
    (m) => m.category === ModelCategory.standard,
  );
  $: advancedModels = models.filter(
    (m) => m.category === ModelCategory.advanced,
  );
  $: reasoningModels = models.filter(
    (m) => m.category === ModelCategory.reasoning,
  );
  $: selectedModelInfo = models.find((m) => m.id === selectedModel);

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
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 150) + "px";
    }
  }

  function handleSelectModel(model: BaseModel) {
    const modelInfo = models.find((m) => m.id === model);
    if (!modelInfo) return;

    // Visitors can only use the default model
    if (!isAuthenticated && model !== DEFAULT_SETTINGS.selectedModel) {
      dispatch("requestLogin");
      modelDropdownOpen = false;
      return;
    }

    if (modelInfo.category === ModelCategory.advanced && !hasAdvancedAccess) {
      dispatch("showUpgrade", "advanced");
      modelDropdownOpen = false;
      return;
    }

    if (modelInfo.category === ModelCategory.reasoning && !hasReasoningAccess) {
      dispatch("showUpgrade", "reasoning");
      modelDropdownOpen = false;
      return;
    }

    dispatch("modelChange", model);
    modelDropdownOpen = false;
  }

  function handleToolsChange(next: SearchMode[]) {
    dispatch("toolsChange", next);
  }

  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    if (modelDropdownOpen) {
      if (
        !modelTriggerEl?.contains(target) &&
        !modelDropdownEl?.contains(target)
      ) {
        modelDropdownOpen = false;
      }
    }
  }

  onMount(() => {
    document.addEventListener("click", handleDocumentClick, true);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleDocumentClick, true);
  });
</script>

<div class="ra-chat-input">
  <div class="ra-input-container">
    <textarea
      bind:this={textareaEl}
      bind:value={inputValue}
      on:keydown={handleKeydown}
      on:input={handleInput}
      placeholder="Ask me anything about your research..."
      rows="1"
      {disabled}
    ></textarea>
  </div>

  <div class="ra-input-footer">
    <div class="ra-input-controls">
      <ToolSelector
        {selectedTools}
        {isAuthenticated}
        {disabled}
        connectedFileCount={fileCount}
        {totalFileCount}
        on:change={(e) => handleToolsChange(e.detail)}
        on:openConnectNotes={() => dispatch("openConnectNotes")}
      />
    </div>

    <div class="ra-input-actions">
      <!-- Model Selector -->
      <div class="ra-selector-wrapper">
        <button
          bind:this={modelTriggerEl}
          class="ra-selector-btn"
          on:click|stopPropagation={() => {
            modelDropdownOpen = !modelDropdownOpen;
          }}
          type="button"
          {disabled}
        >
          <span class="ra-selector-text">
            {selectedModelInfo?.name ?? "Select model"}
          </span>
          {#if selectedModelInfo?.tag}
            <span class="ra-model-tag">{selectedModelInfo.tag}</span>
          {/if}
          <svg
            class="ra-selector-chevron"
            class:open={modelDropdownOpen}
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

        {#if modelDropdownOpen}
          <div
            bind:this={modelDropdownEl}
            class="ra-selector-dropdown ra-model-dropdown"
          >
            <!-- Standard Models -->
            <div class="ra-model-section">
              <div class="ra-section-header">Standard AI models</div>
              {#each standardModels as model (model.id)}
                <button
                  class="ra-dropdown-item"
                  class:selected={model.id === selectedModel}
                  on:click={() => handleSelectModel(model.id)}
                  type="button"
                >
                  <span class="ra-item-check">
                    {#if model.id === selectedModel}✓{/if}
                  </span>
                  <span class="ra-item-name">{model.name}</span>
                  {#if model.tag}
                    <span class="ra-model-tag">{model.tag}</span>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- Advanced Models -->
            <div class="ra-model-section">
              <div class="ra-section-header">
                <span class="ra-crown">👑</span> Advanced AI models
                {#if !hasAdvancedAccess}
                  <span class="ra-lock">🔒</span>
                {/if}
              </div>
              {#each advancedModels as model (model.id)}
                <button
                  class="ra-dropdown-item"
                  class:selected={model.id === selectedModel}
                  class:locked={!hasAdvancedAccess}
                  on:click={() => handleSelectModel(model.id)}
                  type="button"
                >
                  <span class="ra-item-check">
                    {#if model.id === selectedModel}✓{/if}
                  </span>
                  <span class="ra-item-name">{model.name}</span>
                  {#if model.tag}
                    <span class="ra-model-tag">{model.tag}</span>
                  {/if}
                  {#if !hasAdvancedAccess}
                    <span class="ra-item-lock">🔒</span>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- Reasoning Models -->
            <div class="ra-model-section">
              <div class="ra-section-header">
                <span class="ra-crown">👑</span> Reasoning AI models
                {#if !hasReasoningAccess}
                  <span class="ra-lock">🔒</span>
                {/if}
              </div>
              {#each reasoningModels as model (model.id)}
                <button
                  class="ra-dropdown-item"
                  class:selected={model.id === selectedModel}
                  class:locked={!hasReasoningAccess}
                  on:click={() => handleSelectModel(model.id)}
                  type="button"
                >
                  <span class="ra-item-check">
                    {#if model.id === selectedModel}✓{/if}
                  </span>
                  <span class="ra-item-name">{model.name}</span>
                  {#if model.tag}
                    <span class="ra-model-tag">{model.tag}</span>
                  {/if}
                  {#if !hasReasoningAccess}
                    <span class="ra-item-lock">🔒</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="ra-send-btn"
        on:click={handleSubmit}
        disabled={disabled || !inputValue.trim()}
        title="Send message"
      >
        {#if disabled}
          <svg
            class="ra-spinner"
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
  </div>

  <p class="ra-hint">
    Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
  </p>
</div>

<style>
  .ra-chat-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .ra-input-container {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--ra-radius-lg);
    padding: 10px 12px;
    transition: border-color var(--ra-transition);
  }

  .ra-input-container:focus-within {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent);
  }

  textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    box-shadow: none;
    resize: none;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-normal);
    min-height: 24px;
    max-height: 150px;
    font-family: inherit;
    padding: 0;
  }

  textarea:focus,
  textarea:focus-visible {
    outline: none;
    box-shadow: none;
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  textarea:disabled {
    opacity: 0.6;
  }

  .ra-input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ra-input-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  .ra-input-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .ra-selector-wrapper {
    position: relative;
  }

  .ra-selector-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--ra-radius-md);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--text-normal);
    transition:
      background var(--ra-transition),
      border-color var(--ra-transition);
  }

  .ra-selector-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .ra-selector-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ra-selector-text {
    font-weight: 500;
  }

  .ra-selector-chevron {
    color: var(--text-muted);
    transition: transform var(--ra-transition);
  }

  .ra-selector-chevron.open {
    transform: rotate(180deg);
  }

  .ra-selector-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--ra-radius-lg);
    box-shadow: var(--ra-shadow-pop);
    z-index: 1000;
    overflow: hidden;
  }

  .ra-model-dropdown {
    min-width: 260px;
    max-height: min(70vh, 400px);
    overflow-y: auto;
    right: 0;
    left: auto;
  }

  .ra-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    box-shadow: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: var(--text-normal);
    font-size: 13px;
    border-radius: var(--ra-radius-sm);
    transition: background var(--ra-transition);
  }

  .ra-dropdown-item:hover {
    background: var(--background-modifier-hover);
  }

  .ra-dropdown-item.selected {
    background: var(--ra-brand-blue-bg);
  }

  .ra-dropdown-item.locked {
    opacity: 0.7;
  }

  .ra-dropdown-item.locked:hover {
    background: rgba(245, 158, 11, 0.1);
  }

  .ra-item-check {
    width: 16px;
    font-size: 11px;
    color: var(--ra-brand-blue);
    flex-shrink: 0;
  }

  .ra-item-name {
    flex: 1;
  }

  .ra-item-lock {
    font-size: 11px;
    margin-left: auto;
  }

  .ra-model-section {
    padding: 4px 0;
  }

  .ra-model-section:not(:last-child) {
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .ra-section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .ra-crown {
    font-size: 11px;
  }

  .ra-lock {
    font-size: 10px;
    margin-left: auto;
  }

  .ra-model-tag {
    font-size: 10px;
    font-weight: 600;
    color: var(--ra-brand-blue);
    background: var(--ra-brand-blue-bg);
    padding: 2px 5px;
    border-radius: var(--ra-radius-sm);
  }

  .ra-send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: var(--interactive-accent);
    border: none;
    border-radius: var(--ra-radius-md);
    cursor: pointer;
    color: var(--text-on-accent);
    flex-shrink: 0;
    transition:
      filter var(--ra-transition),
      transform var(--ra-transition);
  }

  .ra-send-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .ra-send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ra-spinner {
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

  .ra-hint {
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
