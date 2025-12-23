<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import { Notice } from "obsidian";
	import type { LogicallyPlugin } from "../types";
	import { formatAuthError } from "../utils/authErrors";

	export let plugin: LogicallyPlugin;

	const dispatch = createEventDispatcher<{ login: void }>();

	let email = "";
	let password = "";
	let isLoading = false;
	let error = "";

	async function handleLogin() {
		if (!email || !password) {
			error = "Please enter email and password";
			return;
		}

		isLoading = true;
		error = "";

		const result = await plugin.api.login(email, password);

		isLoading = false;

		if (result.success && result.data) {
			plugin.settings.userToken = result.data.token;
			await plugin.saveSettings();
			plugin.api.updateSettings(plugin.settings);
			new Notice("✓ Successfully logged in to Logically!");
			dispatch("login");
		} else {
			error = formatAuthError(result.error || "Login failed");
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			handleLogin();
		}
	}
</script>

<div class="login-prompt">
	<div class="login-icon">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<circle cx="12" cy="12" r="10"></circle>
			<path d="M12 16v-4"></path>
			<path d="M12 8h.01"></path>
		</svg>
	</div>

	<h2 class="login-title">Connect to Logically</h2>
	<p class="login-desc">
		Sign in to access your AI research assistant powered by Logically.
	</p>

	{#if error}
		<div class="login-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="15" y1="9" x2="9" y2="15"></line>
				<line x1="9" y1="9" x2="15" y2="15"></line>
			</svg>
			{error}
		</div>
	{/if}

	<div class="login-form">
		<div class="form-field">
			<label for="email">Email</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				on:keydown={handleKeydown}
				placeholder="your@email.com"
				disabled={isLoading}
			/>
		</div>

		<div class="form-field">
			<label for="password">Password</label>
			<input
				id="password"
				type="password"
				bind:value={password}
				on:keydown={handleKeydown}
				placeholder="••••••••"
				disabled={isLoading}
			/>
		</div>

		<button
			class="login-button"
			on:click={handleLogin}
			disabled={isLoading}
		>
			{#if isLoading}
				<svg
					class="spinner"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle
						cx="12"
						cy="12"
						r="10"
						stroke-dasharray="32"
						stroke-dashoffset="12"
					></circle>
				</svg>
				Signing in...
			{:else}
				Sign in
			{/if}
		</button>
	</div>

	<div class="login-footer">
		<p>Don't have an account?</p>
		<a href="https://logically.app/signup" target="_blank" rel="noopener">
			Create one at logically.app
		</a>
	</div>
</div>

<style>
	.login-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 32px 16px;
		text-align: center;
	}

	.login-icon {
		margin-bottom: 16px;
		color: var(--text-accent);
		opacity: 0.8;
	}

	.login-title {
		font-size: 18px;
		font-weight: 600;
		color: var(--text-normal);
		margin: 0 0 8px 0;
	}

	.login-desc {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0 0 24px 0;
		max-width: 280px;
		line-height: 1.5;
	}

	.login-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: var(--background-modifier-error);
		color: var(--text-error);
		border-radius: 8px;
		font-size: 13px;
		margin-bottom: 16px;
		width: 100%;
		max-width: 300px;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		max-width: 300px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: left;
	}

	.form-field label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.form-field input {
		padding: 10px 12px;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		font-size: 14px;
		color: var(--text-normal);
		transition: border-color 0.15s ease;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--text-accent);
	}

	.form-field input::placeholder {
		color: var(--text-faint);
	}

	.form-field input:disabled {
		opacity: 0.6;
	}

	.login-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: 8px;
	}

	.login-button:hover:not(:disabled) {
		background: var(--interactive-accent-hover);
	}

	.login-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.login-footer {
		margin-top: 24px;
		font-size: 12px;
		color: var(--text-muted);
	}

	.login-footer p {
		margin: 0 0 4px 0;
	}

	.login-footer a {
		color: var(--text-accent);
		text-decoration: none;
	}

	.login-footer a:hover {
		text-decoration: underline;
	}
</style>
