<script lang="ts">
  /** "Thought for Ns" header with chevron toggle. */
  export let label: string;
  export let collapsed: boolean = true;
  export let onToggle: () => void = () => {};
</script>

<button type="button" class="ra-thought-header" on:click={onToggle}>
  <span class="ra-thought-label">{label}</span>
  <span class="ra-thought-chevron" class:open={!collapsed} aria-hidden="true">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
    >
  </span>
</button>

<style>
  .ra-thought-header {
    all: unset;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
    color: var(--ra-muted-step);
    font: inherit;
  }
  .ra-thought-label {
    color: var(--ra-muted-step);
    font-size: 13px;
  }
  .ra-thought-chevron {
    display: inline-flex;
    align-items: center;
    color: var(--ra-muted-step);
    transition: transform 0.2s;
  }
  .ra-thought-chevron.open {
    transform: rotate(90deg);
  }
</style>
