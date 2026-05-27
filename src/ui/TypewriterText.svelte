<script lang="ts">
  /**
   * Char-by-char text reveal (~5ms per char) when animate=true, instant otherwise.
   * Mirrors frontend LoadingIndicator/TypewriterText.
   */
  export let text: string;
  export let animate: boolean = false;

  let displayed: string = animate ? "" : text;
  let timer: ReturnType<typeof setInterval> | null = null;

  $: restart(text, animate);

  function restart(_t: string, _a: boolean) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!_a) {
      displayed = _t;
      return;
    }
    displayed = "";
    let i = 0;
    timer = setInterval(() => {
      i++;
      displayed = _t.slice(0, i);
      if (i >= _t.length && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 5);
  }

  import { onDestroy } from "svelte";
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<span>{displayed}</span>
