<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let isOpen = false;
  export let modelType: "advanced" | "reasoning" = "advanced";

  const dispatch = createEventDispatcher<{ close: void }>();

  $: title =
    modelType === "advanced"
      ? "Unlock Advanced AI Models"
      : "Unlock Reasoning AI Models";

  $: upgradeUrl = "https://logically.app/pricing";

  $: features =
    modelType === "advanced"
      ? [
          {
            icon: "🚀",
            title: "GPT-5.1, Claude Sonnet 4.5, Gemini 2.5 Pro",
          },
          {
            icon: "📚",
            title: "Larger context windows for complex documents",
          },
          {
            icon: "🎯",
            title: "More accurate and nuanced responses",
          },
        ]
      : [
          {
            icon: "🧠",
            title: "GPT-5.2, Claude Opus 4.5, Gemini 3 Pro Preview",
          },
          {
            icon: "📊",
            title: "Complex multi-step reasoning",
          },
          {
            icon: "✨",
            title: "Comprehensive, detailed analysis",
          },
        ];

  function handleClose() {
    isOpen = false;
    dispatch("close");
  }

  function handleUpgrade() {
    window.open(upgradeUrl, "_blank");
    handleClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="ra-upgrade-backdrop" on:click={handleBackdropClick}>
    <div class="ra-upgrade-modal" role="dialog" aria-modal="true">
      <!-- Close button -->
      <button
        class="ra-upgrade-close"
        on:click={handleClose}
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
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- Header with icon and title -->
      <div class="ra-upgrade-header">
        <div class="ra-upgrade-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            ></path>
          </svg>
        </div>
        <h2 class="ra-upgrade-title">{title}</h2>
      </div>

      <!-- Features list -->
      <div class="ra-upgrade-features">
        {#each features as feature}
          <div class="ra-upgrade-feature">
            <span class="ra-upgrade-feature-icon">{feature.icon}</span>
            <span class="ra-upgrade-feature-text">{feature.title}</span>
          </div>
        {/each}
      </div>

      <!-- Action buttons -->
      <div class="ra-upgrade-actions">
        <button class="ra-upgrade-btn-primary" on:click={handleUpgrade}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
            ></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          Upgrade Now
        </button>
        <button class="ra-upgrade-btn-secondary" on:click={handleClose}>
          Maybe Later
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ra-upgrade-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .ra-upgrade-modal {
    display: block;
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 16px;
    padding: 24px;
    max-width: 360px;
    width: 100%;
    box-shadow:
      0 24px 48px rgba(0, 0, 0, 0.25),
      0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .ra-upgrade-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 6px;
    color: var(--text-muted);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .ra-upgrade-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .ra-upgrade-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .ra-upgrade-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }

  .ra-upgrade-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
    line-height: 1.3;
  }

  .ra-upgrade-features {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .ra-upgrade-feature {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--background-secondary);
    border-radius: 10px;
  }

  .ra-upgrade-feature-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .ra-upgrade-feature-text {
    font-size: 13px;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .ra-upgrade-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ra-upgrade-btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #1980e6 0%, #0066cc 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ra-upgrade-btn-primary:hover {
    background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(25, 128, 230, 0.35);
  }

  .ra-upgrade-btn-primary:active {
    transform: translateY(0);
  }

  .ra-upgrade-btn-secondary {
    padding: 10px 20px;
    background: transparent;
    color: var(--text-muted);
    border: none;
    border-radius: 10px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ra-upgrade-btn-secondary:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
