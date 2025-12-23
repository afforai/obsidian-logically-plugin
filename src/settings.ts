import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { LogicallyPlugin, LogicallySettings, BaseModel } from './types';
import { DEFAULT_SETTINGS, AI_MODELS, ModelCategory } from './types';

/**
 * Settings tab for the Logically plugin.
 */
export class LogicallySettingTab extends PluginSettingTab {
	plugin: LogicallyPlugin;
	private loginEmail = '';
	private loginPassword = '';
	private isLoggingIn = false;

	constructor(app: App, plugin: LogicallyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		containerEl.createEl('div', { cls: 'logically-settings-header' }, el => {
			el.createEl('h2', { text: 'Logically Research Assistant' });
			el.createEl('p', { 
				text: 'Configure your connection to Logically for AI-powered research assistance.',
				cls: 'setting-item-description'
			});
		});

		// Account Section
		containerEl.createEl('h3', { text: 'Account' });

		if (this.plugin.settings.userToken) {
			this.displayLoggedInState(containerEl);
		} else {
			this.displayLoginForm(containerEl);
		}

		// API Configuration
		containerEl.createEl('h3', { text: 'API Configuration' });

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('The Logically API endpoint. Default: https://api.logically.app')
			.addText(text => {
				text
					.setPlaceholder('https://api.logically.app')
					.setValue(this.plugin.settings.apiUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiUrl = value || DEFAULT_SETTINGS.apiUrl;
						this.plugin.api.updateSettings(this.plugin.settings);
						await this.plugin.saveSettings();
					});
			});

		// UI Configuration
		containerEl.createEl('h3', { text: 'Interface' });

		new Setting(containerEl)
			.setName('Show ribbon icon')
			.setDesc('Display the Logically icon in the left ribbon for quick access.')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showRibbon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbon = value;
						this.plugin.showRibbon(value);
						await this.plugin.saveSettings();
					});
			});

		// Model Selection
		containerEl.createEl('h3', { text: 'AI Model' });
		
		new Setting(containerEl)
			.setName('Default model')
			.setDesc('Select the AI model to use for research queries.')
			.addDropdown(dropdown => {
				// Group models by category
				const standardModels = AI_MODELS.filter(m => m.category === ModelCategory.standard);
				const advancedModels = AI_MODELS.filter(m => m.category === ModelCategory.advanced);
				const reasoningModels = AI_MODELS.filter(m => m.category === ModelCategory.reasoning);

				// Add standard models
				dropdown.addOption('', '── Standard Models ──');
				standardModels.forEach(model => {
					const label = model.tag ? `${model.name} (${model.tag})` : model.name;
					dropdown.addOption(model.id, label);
				});

				// Add advanced models
				dropdown.addOption('', '── Advanced Models ──');
				advancedModels.forEach(model => {
					const label = model.tag ? `${model.name} (${model.tag})` : model.name;
					dropdown.addOption(model.id, label);
				});

				// Add reasoning models
				dropdown.addOption('', '── Reasoning Models ──');
				reasoningModels.forEach(model => {
					const label = model.tag ? `${model.name} (${model.tag})` : model.name;
					dropdown.addOption(model.id, label);
				});

				dropdown
					.setValue(this.plugin.settings.selectedModel)
					.onChange(async (value) => {
						if (value) {
							this.plugin.settings.selectedModel = value as BaseModel;
							await this.plugin.saveSettings();
						}
					});
			});

		// Add model info
		const selectedModel = AI_MODELS.find(m => m.id === this.plugin.settings.selectedModel);
		if (selectedModel) {
			containerEl.createEl('p', {
				text: selectedModel.description,
				cls: 'setting-item-description logically-model-desc'
			});
		}

		// Footer
		containerEl.createEl('div', { cls: 'logically-settings-footer' }, el => {
			el.createEl('p', { text: 'Need help? Visit ' });
			el.createEl('a', { 
				text: 'logically.app', 
				href: 'https://logically.app',
			});
		});
	}

	private displayLoggedInState(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Logged in')
			.setDesc('You are connected to Logically.')
			.addButton(button => {
				button
					.setButtonText('Logout')
					.onClick(async () => {
						this.plugin.settings.userToken = '';
						this.plugin.api.logout();
						await this.plugin.saveSettings();
						new Notice('Logged out from Logically');
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Verify connection')
			.setDesc('Test your connection to the Logically API.')
			.addButton(button => {
				button
					.setButtonText('Test')
					.onClick(async () => {
						button.setDisabled(true);
						const result = await this.plugin.api.verifyToken();
						button.setDisabled(false);
						
						if (result.success) {
							new Notice('✓ Connection successful!');
						} else {
							new Notice(`✗ Connection failed: ${result.error}`);
						}
					});
			});
	}

	private displayLoginForm(containerEl: HTMLElement): void {
		const loginContainer = containerEl.createEl('div', { cls: 'logically-login-form' });

		new Setting(loginContainer)
			.setName('Email')
			.addText(text => {
				text
					.setPlaceholder('your@email.com')
					.setValue(this.loginEmail)
					.onChange(value => {
						this.loginEmail = value;
					});
				text.inputEl.type = 'email';
			});

		new Setting(loginContainer)
			.setName('Password')
			.addText(text => {
				text
					.setPlaceholder('••••••••')
					.setValue(this.loginPassword)
					.onChange(value => {
						this.loginPassword = value;
					});
				text.inputEl.type = 'password';
			});

		new Setting(loginContainer)
			.addButton(button => {
				button
					.setButtonText('Login')
					.setCta()
					.onClick(async () => {
						if (!this.loginEmail || !this.loginPassword) {
							new Notice('Please enter email and password');
							return;
						}

						if (this.isLoggingIn) return;
						this.isLoggingIn = true;
						button.setDisabled(true);
						button.setButtonText('Logging in...');

						const result = await this.plugin.api.login(this.loginEmail, this.loginPassword);
						
						this.isLoggingIn = false;
						button.setDisabled(false);
						button.setButtonText('Login');

						if (result.success && result.data) {
							this.plugin.settings.userToken = result.data.token;
							await this.plugin.saveSettings();
							this.loginEmail = '';
							this.loginPassword = '';
							new Notice('✓ Successfully logged in to Logically!');
							this.display();
						} else {
							new Notice(`✗ Login failed: ${result.error}`);
						}
					});
			})
			.addButton(button => {
				button
					.setButtonText('Create Account')
					.onClick(() => {
						window.open('https://logically.app/signup', '_blank');
					});
			});
	}
}

export { DEFAULT_SETTINGS };
export type { LogicallySettings };

