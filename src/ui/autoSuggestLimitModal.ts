import type { App } from "obsidian";
import { Modal } from "obsidian";

export class AutoSuggestLimitModal extends Modal {
  private onClosed: () => void;

  constructor(
    app: App,
    private onUpgrade: () => void,
    onClosed: () => void,
  ) {
    super(app);
    this.onClosed = onClosed;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Auto-suggest quota reached" });
    contentEl.createEl("p", {
      text: "You have reached your daily auto-suggest limit. Upgrade your plan to continue.",
    });

    const actions = contentEl.createDiv({
      cls: "logically-limit-modal-actions",
    });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const upgradeBtn = actions.createEl("button", {
      text: "Upgrade",
      cls: "mod-cta",
    });
    upgradeBtn.addEventListener("click", () => {
      this.onUpgrade();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}
