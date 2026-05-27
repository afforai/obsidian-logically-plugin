<script lang="ts">
  import { slide } from "svelte/transition";
  import type { ThinkingStep } from "../types";
  import StepRow from "./StepRow.svelte";

  export let steps: ThinkingStep[] = [];
  export let isOpen: boolean = true;
  export let animateReason: boolean = false;
  /** When true: reveal one step at a time, gated by prev.done (350ms tick). */
  export let staggered: boolean = false;

  let visibleCount: number = staggered
    ? Math.min(1, steps.length)
    : steps.length;

  $: tickStagger(steps, staggered, visibleCount);

  function tickStagger(_s: ThinkingStep[], _stag: boolean, _vc: number) {
    if (!_stag) {
      visibleCount = _s.length;
      return;
    }
    if (_vc >= _s.length) return;
    const current = _s[_vc - 1];
    if (current && !current.done) return;
    setTimeout(() => {
      if (visibleCount < steps.length) visibleCount = visibleCount + 1;
    }, 350);
  }

  $: visibleSteps = staggered ? steps.slice(0, visibleCount) : steps;
</script>

{#if isOpen && visibleSteps.length > 0}
  <div class="ra-step-list" transition:slide={{ duration: 200 }}>
    {#each visibleSteps as step, i (step.key)}
      <StepRow {step} isLast={i === visibleSteps.length - 1} {animateReason} />
    {/each}
  </div>
{/if}

<style>
  .ra-step-list {
    display: flex;
    flex-direction: column;
  }
</style>
