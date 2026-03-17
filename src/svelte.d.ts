declare module "*.svelte" {
  import type { ComponentType, SvelteComponent } from "svelte";
  const component: ComponentType<SvelteComponent>;
  export default component;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare const __LOGICALLY_DEV__: boolean;
