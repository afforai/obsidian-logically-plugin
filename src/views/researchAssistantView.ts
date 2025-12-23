import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { LogicallyPlugin } from '../types';
import { VIEW_TYPE_RESEARCH_ASSISTANT } from '../types';
import ResearchAssistantRoot from '../ui/ResearchAssistantRoot.svelte';
import type { SvelteComponent } from 'svelte';

/**
 * Research Assistant view displayed in the right sidebar.
 */
export class ResearchAssistantView extends ItemView {
	plugin: LogicallyPlugin;
	private component: SvelteComponent | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LogicallyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_RESEARCH_ASSISTANT;
	}

	getDisplayText(): string {
		return 'Logically research assistant';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (container) {
			container.empty();
			container.addClass('logically-research-assistant-container');

			this.component = new ResearchAssistantRoot({
				target: container as HTMLElement,
				props: {
					plugin: this.plugin,
					app: this.app,
				},
			});
		}
	}

	async onClose(): Promise<void> {
		if (this.component) {
			this.component.$destroy();
			this.component = null;
		}
	}

	/**
	 * Refresh the view (e.g., after settings change).
	 */
	refresh(): void {
		if (this.component) {
			this.component.$destroy();
		}

		const container = this.containerEl.children[1];
		if (container) {
			container.empty();

			this.component = new ResearchAssistantRoot({
				target: container as HTMLElement,
				props: {
					plugin: this.plugin,
					app: this.app,
				},
			});
		}
	}
}
