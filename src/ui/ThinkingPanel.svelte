<script lang="ts">
  /**
   * Verbatim frontend LoadingIndicator: re-derives steps via buildSteps(stage.data, generatingStarted)
   * every render. Live phase uses props-supplied stage; historical replay uses message.reasoning.stage.
   */
  import type { AccumulatedReasoning, StageData } from "../types";
  import ThoughtHeader from "./ThoughtHeader.svelte";
  import StepList from "./StepList.svelte";
  import StepRow from "./StepRow.svelte";
  import { buildSteps } from "../services/buildSteps";

  export let reasoning: AccumulatedReasoning | undefined = undefined;
  export let isLive: boolean = false;
  /** Live stage data while streaming (null when not live or no events yet). */
  export let liveStage: StageData | null = null;
  /** True once .generating_response fires during live stream. */
  export let liveGeneratingStarted: boolean = false;

  let collapsed: boolean = false;

  $: stageData = isLive
    ? (liveStage?.data ?? [])
    : (reasoning?.stage?.data ?? []);
  // Historical replay: behave as if generation always started (steps all done).
  $: generatingStarted = isLive ? liveGeneratingStarted : true;
  $: steps = buildSteps(stageData, generatingStarted);
  $: hasAny = steps.length > 0;
  $: showShimmer = isLive && !liveGeneratingStarted;
  $: showHeader = (isLive && liveGeneratingStarted) || (!isLive && hasAny);
  $: timeTaken = reasoning?.timeTaken ?? 0;
  // Trailing "Generating answer..." row — only while live + generating. Hide post-stream.
  $: trailingStep =
    isLive && liveGeneratingStarted
      ? {
          key: "generating_answer",
          label: "Generating answer...",
          refs: null,
          reason: null,
          summary: null,
          done: false,
        }
      : null;
</script>

{#if hasAny || showShimmer}
  <div class="ra-thinking-panel">
    {#if showShimmer}
      <div class="ra-thinking-shimmer-wrap">
        <span class="ra-thinking-text">Thinking...</span>
        <span class="ra-thinking-shimmer" aria-hidden="true"></span>
      </div>
    {/if}

    {#if showHeader}
      <ThoughtHeader
        label={`Thought for ${timeTaken}s`}
        {collapsed}
        onToggle={() => (collapsed = !collapsed)}
      />
    {/if}

    {#if hasAny}
      <StepList
        {steps}
        isOpen={isLive || !collapsed}
        animateReason={isLive}
        staggered={false}
      />
    {/if}

    {#if trailingStep}
      <StepRow step={trailingStep} isLast={true} animateReason={false} />
    {/if}
  </div>
{/if}

<style>
  .ra-thinking-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 4px 0 8px 0;
  }
  .ra-thinking-shimmer-wrap {
    position: relative;
    display: inline-block;
    overflow: hidden;
    margin-left: 4px;
    width: fit-content;
  }
  .ra-thinking-text {
    color: var(--ra-muted-step);
    font-size: 13px;
  }
  .ra-thinking-shimmer {
    position: absolute;
    top: 0;
    left: -10px;
    height: 100%;
    width: 8px;
    transform: rotate(5deg);
    background: white;
    filter: blur(3px);
    animation: ra-thinking-shimmer 2.4s linear infinite;
    pointer-events: none;
  }
</style>
