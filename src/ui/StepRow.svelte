<script lang="ts">
  import { slide } from "svelte/transition";
  import type { ThinkingStep } from "../types";
  import StepIcon from "./StepIcon.svelte";
  import TypewriterText from "./TypewriterText.svelte";
  import RefIcon from "./RefIcon.svelte";

  export let step: ThinkingStep;
  export let isLast: boolean = false;
  export let animateReason: boolean = false;

  let expanded: boolean = false;

  $: hasExpandable = !!step.reason;

  function toggle() {
    if (!hasExpandable) return;
    expanded = !expanded;
  }
</script>

<div class="ra-step-row">
  <div class="ra-step-left">
    <StepIcon {step} done={step.done} />
    {#if !isLast}
      <div class="ra-step-connector"></div>
    {/if}
  </div>

  <div class="ra-step-right" class:is-last={isLast}>
    <button
      type="button"
      class="ra-step-summary"
      class:clickable={hasExpandable}
      on:click={toggle}
      tabindex={hasExpandable ? 0 : -1}
    >
      <span class="ra-step-label">{step.label ?? ""}</span>
      {#if hasExpandable}
        <span class="ra-step-chevron" class:open={expanded} aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
          >
        </span>
      {/if}
    </button>

    {#if step.reason && expanded}
      <div class="ra-step-reason" transition:slide={{ duration: 200 }}>
        <div class="ra-step-reason-box">
          <TypewriterText text={step.reason} animate={animateReason} />
        </div>
      </div>
    {/if}

    {#if step.refs && step.refs.data.length > 0}
      <div class="ra-step-refs" transition:slide={{ duration: 200 }}>
        <div class="ra-step-refs-box">
          {#each step.refs.data as ref, idx (ref.url ?? ref.title + idx)}
            <a
              class="ra-step-ref-row"
              class:zebra-alt={idx % 2 === 1}
              href={ref.url ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <RefIcon icon={ref.icon ?? "file"} domain={ref.domain ?? ""} />
              <span class="ra-ref-title">{ref.title}</span>
              <span class="ra-ref-domain">{ref.domain ?? ""}</span>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ra-step-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
  }
  .ra-step-left {
    width: 16px;
    flex-shrink: 0;
    margin-right: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ra-step-connector {
    flex: 1;
    width: 1px;
    background: var(--ra-hairline);
  }
  .ra-step-right {
    flex: 1;
    padding-bottom: 12px;
    margin-top: -1.5px;
    min-width: 0;
  }
  .ra-step-right.is-last {
    padding-bottom: 0;
  }

  .ra-step-summary {
    all: unset;
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--ra-muted-step);
    user-select: none;
    cursor: default;
    font: inherit;
    line-height: 1.4;
  }
  .ra-step-summary.clickable {
    cursor: pointer;
  }
  .ra-step-label {
    color: var(--ra-muted-step);
  }
  .ra-step-chevron {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    transition: transform 0.2s;
    color: var(--ra-muted-step);
  }
  .ra-step-chevron.open {
    transform: rotate(90deg);
  }

  .ra-step-reason {
    margin-top: 8px;
    margin-bottom: 4px;
  }
  .ra-step-reason-box {
    padding: 8px 12px;
    border: 1px solid var(--ra-hairline);
    border-radius: var(--ra-radius-md);
    color: var(--ra-muted-step);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.5;
  }

  .ra-step-refs {
    margin-top: 8px;
    margin-bottom: 4px;
  }
  .ra-step-refs-box {
    border: 1px solid var(--ra-hairline);
    border-radius: var(--ra-radius-md);
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
  }
  .ra-step-ref-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 8px 12px;
    text-decoration: none;
    background: var(--background-primary);
  }
  .ra-step-ref-row.zebra-alt {
    background: var(--background-secondary);
  }
  .ra-step-ref-row:hover {
    background: var(--background-modifier-hover);
  }
  .ra-ref-title {
    font-weight: 600;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 3;
    min-width: 0;
    font-size: 13px;
  }
  .ra-ref-domain {
    color: var(--ra-muted-step);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: 12px;
  }
</style>
