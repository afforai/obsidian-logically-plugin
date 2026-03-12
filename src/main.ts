import { addIcon, Plugin, WorkspaceLeaf } from "obsidian";
import type { App, PluginManifest } from "obsidian";
import type { LogicallyPlugin, LogicallySettings } from "./types";
import { DEFAULT_SETTINGS, VIEW_TYPE_RESEARCH_ASSISTANT } from "./types";
import { LogicallyApi } from "./services/logicallyApi";
import { LogicallySettingTab } from "./settings";
import { ResearchAssistantView } from "./views/researchAssistantView";
import { createAutoSuggestExtension } from "./editor/autoSuggest/extension";
import {
  cancelGoogleLogin as cancelGoogleLoginFlow,
  startGoogleLogin as startGoogleLoginFlow,
} from "./auth/googleAuth";

// Logically brand icon (matches frontend logo)
const LOGICALLY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 26" fill="currentColor">
	<circle cx="17.4406" cy="7.44062" r="3.44062"/>
	<path fill-rule="evenodd" clip-rule="evenodd" d="M8.404 21.2031C6.86245 21.2031 6.09168 21.2031 5.50289 20.9031C4.98497 20.6392 4.5639 20.2181 4.3 19.7002C4 19.1114 4 18.3407 4 16.7991V8.12875C4 7.48947 4 7.16984 4.04236 6.90239C4.27554 5.43017 5.43017 4.27554 6.90239 4.04236C7.16984 4 7.48947 4 8.12875 4C8.76802 4 9.08765 4 9.3551 4.04236C10.8273 4.27554 11.982 5.43017 12.2151 6.90239C12.2575 7.16984 12.2575 7.48947 12.2575 8.12875V12.9455H17.073C17.7123 12.9455 18.0319 12.9455 18.2994 12.9879C19.7716 13.2211 20.9262 14.3757 21.1594 15.8479C21.2017 16.1154 21.2017 16.435 21.2017 17.0743C21.2017 17.7136 21.2017 18.0332 21.1594 18.3006C20.9262 19.7729 19.7716 20.9275 18.2994 21.1607C18.0319 21.203 17.7123 21.203 17.073 21.203H12.2575V21.2031H8.404ZM10.8807 12.9455H10.8799V19.8262H6.75195L6.75195 7.43993C6.75195 6.29981 7.6762 5.37556 8.81633 5.37556C9.95645 5.37556 10.8807 6.29981 10.8807 7.43994V12.9455ZM12.2575 19.8272H17.7589C18.899 19.8272 19.8233 18.903 19.8233 17.7628C19.8233 16.6227 18.899 15.6985 17.7589 15.6985H12.2575V19.8272Z"/>
</svg>`;

/**
 * Logically Plugin - AI-powered research assistant for Obsidian
 */
export default class LogicallyPluginImpl
  extends Plugin
  implements LogicallyPlugin
{
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
    console.debug("Loading Logically plugin...");

    await this.loadSettings();
    this.api.updateSettings(this.settings);

    // Register custom icon
    addIcon("logically-icon", LOGICALLY_ICON);

    // Register the research assistant view
    this.registerView(
      VIEW_TYPE_RESEARCH_ASSISTANT,
      (leaf: WorkspaceLeaf) => new ResearchAssistantView(leaf, this),
    );

    // Register inline editor auto-suggest extension
    this.registerEditorExtension(createAutoSuggestExtension(this));

    // Add settings tab
    this.addSettingTab(new LogicallySettingTab(this.app, this));

    // Add ribbon icon if enabled
    this.showRibbon(this.settings.showRibbon);

    // Add command to open research assistant
    this.addCommand({
      id: "open-research-assistant",
      name: "Open AI research assistant",
      callback: () => {
        void this.activateView();
      },
    });

    // Add command to toggle research assistant
    this.addCommand({
      id: "toggle-research-assistant",
      name: "Toggle AI research assistant",
      callback: () => {
        void this.toggleView();
      },
    });

    console.debug("Logically plugin loaded");
  }

  onunload(): void {
    // Remove ribbon if it exists
    if (this.ribbon) {
      this.ribbon.remove();
      this.ribbon = null;
    }

    console.debug("Logically plugin unloaded");
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<LogicallySettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.api.updateSettings(this.settings);
  }

  async startGoogleLogin(): Promise<string> {
    const token = await startGoogleLoginFlow();
    this.settings.googleToken = token;
    await this.saveSettings();
    return token;
  }

  async cancelGoogleLogin(): Promise<void> {
    await cancelGoogleLoginFlow();
  }

  /**
   * Show or hide the ribbon icon.
   */
  showRibbon(show: boolean): void {
    if (show) {
      if (!this.ribbon) {
        this.ribbon = this.addRibbonIcon(
          "logically-icon",
          "Logically AI research assistant",
          () => {
            void this.toggleView();
          },
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
    const existing = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_RESEARCH_ASSISTANT,
    );

    if (existing.length > 0) {
      // View already exists, reveal it
      const leaf = existing[0];
      if (leaf) {
        await this.app.workspace.revealLeaf(leaf);
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
      await this.app.workspace.revealLeaf(rightLeaf);
    }
  }

  /**
   * Toggle the research assistant view.
   */
  async toggleView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_RESEARCH_ASSISTANT,
    );

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
