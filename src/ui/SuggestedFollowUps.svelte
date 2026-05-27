<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let questions: string[] = [];
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{ select: string }>();

  function handleSelect(q: string) {
    if (disabled) return;
    dispatch("select", q);
  }
</script>

{#if questions.length > 0}
  <div class="ra-followups">
    <div class="ra-followups-header">Suggested follow up questions</div>
    <div class="ra-followups-list">
      {#each questions as q, i (i + q)}
        <button
          type="button"
          class="ra-followup-row"
          on:click={() => handleSelect(q)}
          {disabled}
        >
          <span class="ra-followup-icon" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <span class="ra-followup-text">{q}</span>
          <span class="ra-followup-chevron" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .ra-followups {
    margin-top: 12px;
    border: 1px solid var(--ra-hairline);
    border-radius: var(--ra-radius-md);
    overflow: hidden;
    background: var(--background-primary);
  }
  .ra-followups-header {
    padding: 10px 12px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    border-bottom: 1px solid var(--ra-hairline);
  }
  .ra-followups-list {
    display: flex;
    flex-direction: column;
  }
  .ra-followup-row {
    all: unset;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    cursor: pointer;
    border-top: 1px solid var(--ra-hairline);
    transition: background var(--ra-transition);
  }
  .ra-followup-row:first-child {
    border-top: none;
  }
  .ra-followup-row:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }
  .ra-followup-row:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ra-followup-icon {
    display: inline-flex;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .ra-followup-text {
    flex: 1;
    color: var(--text-normal);
    font-size: 14px;
    line-height: 1.4;
    min-width: 0;
    word-break: break-word;
  }
  .ra-followup-chevron {
    display: inline-flex;
    color: var(--text-muted);
    flex-shrink: 0;
  }
</style>
