<script lang="ts">
  /** Icon for a single ref row inside a step's refs panel. */
  export let icon: "file" | "globe" | "graduation" = "file";
  export let domain: string = "";

  // Web/academic rows show a favicon (https only via google s2). Library shows file glyph.
  $: faviconSrc = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`
    : "";
</script>

{#if icon === "file"}
  <svg
    class="ra-ref-icon"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    ><path
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
    /><polyline points="14 2 14 8 20 8" /></svg
  >
{:else if icon === "graduation"}
  <svg
    class="ra-ref-icon"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    ><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path
      d="M6 12v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-5"
    /></svg
  >
{:else if domain}
  <img
    class="ra-ref-favicon"
    src={faviconSrc}
    alt=""
    on:error={(e) => (e.currentTarget.style.display = "none")}
  />
{:else}
  <svg
    class="ra-ref-icon"
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
    /></svg
  >
{/if}

<style>
  .ra-ref-icon {
    flex-shrink: 0;
    color: var(--ra-muted-step);
  }
  .ra-ref-favicon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    border-radius: 2px;
  }
</style>
