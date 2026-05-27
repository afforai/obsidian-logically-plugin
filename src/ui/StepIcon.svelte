<script lang="ts">
  import type { ThinkingStep } from "../types";
  export let step: ThinkingStep;
  export let done: boolean;

  /** Tool glyph derived from key prefix (search_<tool>) or refs.type. */
  $: keyTool = step.key.startsWith("search_")
    ? step.key.slice("search_".length)
    : "";
  $: doneToolType =
    keyTool === "search_library" ||
    keyTool === "search_web" ||
    keyTool === "search_academic"
      ? keyTool
      : step.refs?.type === "search_library" ||
          step.refs?.type === "search_web" ||
          step.refs?.type === "search_academic"
        ? step.refs.type
        : null;
</script>

<div class="ra-step-icon">
  {#if done}
    {#if !doneToolType}
      <div class="ra-step-check">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
        >
      </div>
    {:else if doneToolType === "search_library"}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path
          d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        /></svg
      >
    {:else if doneToolType === "search_academic"}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path
          d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
        /></svg
      >
    {:else if doneToolType === "search_web"}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><circle cx="12" cy="12" r="10" /><line
          x1="2"
          y1="12"
          x2="22"
          y2="12"
        /><path
          d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        /></svg
      >
    {/if}
  {:else}
    <div class="ra-spinner">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg
      >
    </div>
  {/if}
</div>

<style>
  .ra-step-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--ra-muted-step);
  }
  .ra-step-check {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--ra-hairline);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ra-spinner {
    display: flex;
    color: var(--ra-hairline);
    animation: ra-spin 2.5s linear infinite;
  }
  @keyframes ra-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
