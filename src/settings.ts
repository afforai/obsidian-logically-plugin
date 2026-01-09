import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type { LogicallyPlugin, LogicallySettings } from "./types";
import { DEFAULT_SETTINGS, VIEW_TYPE_RESEARCH_ASSISTANT } from "./types";
import { IS_DEV_BUILD } from "./utils/env";
import { formatAuthError } from "./utils/authErrors";

/**
 * Settings tab for the Logically plugin.
 */
export class LogicallySettingTab extends PluginSettingTab {
  plugin: LogicallyPlugin;
  private loginEmail = "";
  private loginPassword = "";
  private isLoggingIn = false;

  private refreshResearchAssistantView(): void {
    const leaves = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_RESEARCH_ASSISTANT,
    );
    for (const leaf of leaves) {
      const viewUnknown: unknown = leaf.view;
      if (!viewUnknown || typeof viewUnknown !== "object") continue;
      const maybeRefresh = (viewUnknown as { refresh?: unknown }).refresh;
      if (typeof maybeRefresh === "function") {
        (viewUnknown as { refresh: () => void }).refresh();
      }
    }
  }

  constructor(app: App, plugin: LogicallyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Header
    new Setting(containerEl).setName("AI research assistant").setHeading();

    containerEl.createEl("p", {
      text: "Configure your connection for AI-powered research assistance.",
      cls: "setting-item-description",
    });

    // Account Section
    new Setting(containerEl).setName("Account").setHeading();

    if (this.plugin.settings.userToken) {
      this.displayLoggedInState(containerEl);
    } else {
      this.displayLoginForm(containerEl);
    }

    if (IS_DEV_BUILD) {
      // API Configuration
      new Setting(containerEl).setName("API configuration").setHeading();

      new Setting(containerEl)
        .setName("API URL")
        .setDesc(
          "The Logically API endpoint. Default: https://api.logically.app",
        )
        .addText((text) => {
          text
            .setPlaceholder("https://api.logically.app")
            .setValue(this.plugin.settings.apiUrl)
            .onChange(async (value) => {
              this.plugin.settings.apiUrl = value || DEFAULT_SETTINGS.apiUrl;
              this.plugin.api.updateSettings(this.plugin.settings);
              await this.plugin.saveSettings();
            });
        });
    }

    // UI configuration
    new Setting(containerEl).setName("Interface").setHeading();

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .setDesc("Display the icon in the left ribbon for quick access.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showRibbon)
          .onChange(async (value) => {
            this.plugin.settings.showRibbon = value;
            this.plugin.showRibbon(value);
            await this.plugin.saveSettings();
          });
      });

    // Advanced section
    new Setting(containerEl).setName("Advanced").setHeading();

    this.displayTokenLogin(containerEl);

    // Footer with link to documentation
    const footerEl = containerEl.createEl("div", {
      cls: "logically-settings-footer",
    });
    const footerLink = footerEl.createEl("a", {
      href: "https://logically.app",
    });
    footerLink.innerText = "Logically.app";
    footerLink.setAttribute("target", "_blank");
  }

  private tokenInput = "";
  private isValidatingToken = false;

  private displayTokenLogin(containerEl: HTMLElement): void {
    const tokenContainer = containerEl.createEl("div", {
      cls: "logically-token-login",
    });

    new Setting(tokenContainer)
      .setName("Log in with token")
      .setDesc(
        "For advanced users: paste your token to log in directly. If you really need this, please reach out to our support team.",
      )
      .addText((text) => {
        text
          .setPlaceholder("Paste your token here...")
          .setValue(this.tokenInput)
          .onChange((value) => {
            this.tokenInput = value;
          });
        text.inputEl.type = "password";
        text.inputEl.addClass("logically-token-input");
      });

    new Setting(tokenContainer).addButton((button) => {
      button.setButtonText("Validate & login").onClick(async () => {
        if (!this.tokenInput.trim()) {
          new Notice("Please enter a token");
          return;
        }

        if (this.isValidatingToken) return;
        this.isValidatingToken = true;
        button.setDisabled(true);
        button.setButtonText("Validating...");

        // Temporarily set the token to validate it
        const oldToken = this.plugin.settings.userToken;
        const oldEmail = this.plugin.settings.userEmail;
        const oldPrivileges = this.plugin.settings.userPrivileges;
        this.plugin.settings.userToken = this.tokenInput.trim();
        this.plugin.api.updateSettings(this.plugin.settings);

        const result = await this.plugin.api.verifyToken();

        if (result.success && result.data) {
          // Token is valid, fetch user plan for privileges
          const planResult = await this.plugin.api.getUserPlan();

          const newEmail = (result.data.email || "").toLowerCase();
          const lastEmail = this.plugin.settings.lastLoggedInEmail;

          // Check for account switch - wipe history if different user
          if (lastEmail && lastEmail !== newEmail) {
            this.plugin.settings.chatHistory = [];
            new Notice(
              "Welcome! Your previous chat history has been cleared for privacy.",
              5000,
            );
          }

          this.plugin.settings.userEmail = result.data.email || "";
          this.plugin.settings.lastLoggedInEmail = newEmail;
          this.plugin.settings.userPrivileges =
            planResult.data?.privileges || result.data.privileges || [];
          this.plugin.api.updateSettings(this.plugin.settings);
          await this.plugin.saveSettings();
          this.refreshResearchAssistantView();

          new Notice("Token validated. Welcome back!");
          this.tokenInput = "";
          this.display();
        } else {
          // Token is invalid, restore the previous account context
          this.plugin.settings.userToken = oldToken;
          this.plugin.settings.userEmail = oldEmail;
          this.plugin.settings.userPrivileges = oldPrivileges;
          this.plugin.api.updateSettings(this.plugin.settings);
          new Notice(`✗ Invalid token: ${result.error || "Validation failed"}`);
        }

        this.isValidatingToken = false;
        button.setDisabled(false);
        button.setButtonText("Validate & log in");
      });
    });
  }

  private displayLoggedInState(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Logged in")
      .setDesc("You are connected.")
      .addButton((button) => {
        button.setButtonText("Log out").onClick(async () => {
          this.plugin.settings.userToken = "";
          this.plugin.settings.userPrivileges = [];
          this.plugin.settings.userEmail = "";
          this.plugin.settings.selectedModel = "openai_gpt_5_mini";
          this.plugin.api.logout();
          await this.plugin.saveSettings();
          this.refreshResearchAssistantView();
          new Notice("Logged out successfully");
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Verify connection")
      .setDesc("Test your connection to the API.")
      .addButton((button) => {
        button.setButtonText("Test").onClick(async () => {
          button.setDisabled(true);
          const result = await this.plugin.api.verifyToken();
          button.setDisabled(false);

          if (result.success) {
            new Notice("Connection successful");
          } else {
            new Notice(`Connection failed: ${result.error}`);
          }
        });
      });
  }

  private displayLoginForm(containerEl: HTMLElement): void {
    const loginContainer = containerEl.createEl("div", {
      cls: "logically-login-form",
    });

    new Setting(loginContainer).setName("Email").addText((text) => {
      text.setValue(this.loginEmail).onChange((value) => {
        this.loginEmail = value;
      });
      text.inputEl.type = "email";
    });

    new Setting(loginContainer).setName("Password").addText((text) => {
      text
        .setPlaceholder("••••••••")
        .setValue(this.loginPassword)
        .onChange((value) => {
          this.loginPassword = value;
        });
      text.inputEl.type = "password";
    });

    new Setting(loginContainer)
      .addButton((button) => {
        button
          .setButtonText("Log in")
          .setCta()
          .onClick(async () => {
            if (!this.loginEmail || !this.loginPassword) {
              new Notice("Please enter email and password");
              return;
            }

            if (this.isLoggingIn) return;
            this.isLoggingIn = true;
            button.setDisabled(true);
            button.setButtonText("Logging in...");

            const result = await this.plugin.api.login(
              this.loginEmail,
              this.loginPassword,
            );

            this.isLoggingIn = false;
            button.setDisabled(false);
            button.setButtonText("Log in");

            if (result.success && result.data) {
              const newEmail = this.loginEmail.toLowerCase();
              const lastEmail = this.plugin.settings.lastLoggedInEmail;

              // Check for account switch - wipe history if different user
              if (lastEmail && lastEmail !== newEmail) {
                this.plugin.settings.chatHistory = [];
                new Notice(
                  "Welcome! Your previous chat history has been cleared for privacy.",
                  5000,
                );
              }

              this.plugin.settings.userToken = result.data.token;
              this.plugin.settings.lastLoggedInEmail = newEmail;
              await this.plugin.saveSettings();

              // Fetch user profile to get name
              const userResult = await this.plugin.api.getCurrentUser();
              if (userResult.success && userResult.data) {
                const user = userResult.data;
                const nameParts = [user.first, user.last].filter(Boolean);
                this.plugin.settings.userName =
                  nameParts.join(" ") || this.loginEmail;
                await this.plugin.saveSettings();
              }

              this.loginEmail = "";
              this.loginPassword = "";
              new Notice("Welcome back! You are now logged in.");
              this.display();
            } else {
              const message = formatAuthError(result.error ?? "Login failed");
              new Notice(`✗ ${message}`);
            }
          });
      })
      .addButton((button) => {
        button.setButtonText("Create account").onClick(() => {
          window.open("https://logically.app/signup", "_blank");
        });
      });
  }
}

export { DEFAULT_SETTINGS };
export type { LogicallySettings };
