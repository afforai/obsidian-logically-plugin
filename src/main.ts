import { addIcon, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import type { App, PluginManifest } from 'obsidian';
import type { LogicallyPlugin, LogicallySettings } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_RESEARCH_ASSISTANT } from './types';
import { LogicallyApi } from './services/logicallyApi';
import { LogicallySettingTab } from './settings';
import { ResearchAssistantView } from './views/researchAssistantView';

// Custom icon for Logically
const LOGICALLY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
	<circle cx="12" cy="10" r="1"/>
	<circle cx="8" cy="10" r="1"/>
	<circle cx="16" cy="10" r="1"/>
</svg>`;

/**
 * Logically Plugin - AI-powered research assistant for Obsidian
 */
export default class LogicallyPluginImpl extends Plugin implements LogicallyPlugin {
	settings: LogicallySettings;
	api: LogicallyApi;
	researchAssistantView: ResearchAssistantView | null = null;
	ribbon: HTMLElement | null = null;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.settings = DEFAULT_SETTINGS;
		this.api = new LogicallyApi(this.settings);
	}

	async onload(): Promise<void> {
		console.log('Loading Logically plugin...');

		await this.loadSettings();
		this.api.updateSettings(this.settings);

		// Register custom icon
		addIcon('logically-icon', LOGICALLY_ICON);

		// Register the research assistant view
		this.registerView(
			VIEW_TYPE_RESEARCH_ASSISTANT,
			(leaf: WorkspaceLeaf) => {
				this.researchAssistantView = new ResearchAssistantView(leaf, this);
				return this.researchAssistantView;
			}
		);

		// Add settings tab
		this.addSettingTab(new LogicallySettingTab(this.app, this));

		// Add ribbon icon if enabled
		this.showRibbon(this.settings.showRibbon);

		// Add command to open research assistant
		this.addCommand({
			id: 'open-research-assistant',
			name: 'Open Research Assistant',
			callback: () => this.activateView(),
		});

		// Add command to toggle research assistant
		this.addCommand({
			id: 'toggle-research-assistant',
			name: 'Toggle Research Assistant',
			callback: () => this.toggleView(),
		});

		console.log('Logically plugin loaded');
	}

	onunload(): void {
		// Detach all views of this type
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_RESEARCH_ASSISTANT);

		// Remove ribbon if it exists
		if (this.ribbon) {
			this.ribbon.remove();
			this.ribbon = null;
		}

		console.log('Logically plugin unloaded');
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.api.updateSettings(this.settings);
	}

	/**
	 * Show or hide the ribbon icon.
	 */
	showRibbon(show: boolean): void {
		if (show) {
			if (!this.ribbon) {
				this.ribbon = this.addRibbonIcon(
					'logically-icon',
					'Logically Research Assistant',
					() => this.toggleView()
				);
			}
		} else {
			if (this.ribbon) {
				this.ribbon.remove();
				this.ribbon = null;
			}
		}
	}

	/**
	 * Activate the research assistant view in the right sidebar.
	 */
	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_RESEARCH_ASSISTANT);
		
		if (existing.length > 0) {
			// View already exists, reveal it
			const leaf = existing[0];
			if (leaf) {
				this.app.workspace.revealLeaf(leaf);
			}
			return;
		}

		// Create new view in right sidebar
		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: VIEW_TYPE_RESEARCH_ASSISTANT,
				active: true,
			});
			this.app.workspace.revealLeaf(rightLeaf);
		}
	}

	/**
	 * Toggle the research assistant view.
	 */
	async toggleView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_RESEARCH_ASSISTANT);
		
		if (existing.length > 0) {
			// View exists, close it
			const leaf = existing[0];
			if (leaf) {
				leaf.detach();
			}
		} else {
			// View doesn't exist, open it
			await this.activateView();
		}
	}
}
