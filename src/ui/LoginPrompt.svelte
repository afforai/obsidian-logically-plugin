<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Notice } from "obsidian";
  import type { LogicallyPlugin } from "../types";
  import { formatAuthError } from "../utils/authErrors";
  import { handleAccountSwitch } from "../utils/accountSwitch";
  import GoogleLogin from "./GoogleLogin.svelte";

  export let plugin: LogicallyPlugin;

  const dispatch = createEventDispatcher<{ login: void }>();

  let email = "";
  let password = "";
  let isLoading = false;
  let error = "";

  async function handleLogin() {
    if (!email || !password) {
      error = "Please enter your email and password to continue";
      return;
    }

    isLoading = true;
    error = "";

    const result = await plugin.api.login(email, password);

    if (result.success && result.data) {
      plugin.settings.userToken = result.data.token;
      plugin.settings.userEmail = email;

      handleAccountSwitch(plugin.settings, email);

      await plugin.saveSettings();
      plugin.api.updateSettings(plugin.settings);

      // Fetch user profile to get name and privileges
      const userResult = await plugin.api.getCurrentUser();
      if (userResult.success && userResult.data) {
        const user = userResult.data;
        const nameParts = [user.first, user.last].filter(Boolean);
        plugin.settings.userName = nameParts.join(" ") || user.email;
        await plugin.saveSettings();
      }

      const planResult = await plugin.api.getUserPlan();
      if (planResult.success && planResult.data) {
        plugin.settings.userPrivileges = planResult.data.privileges ?? [];
        if (planResult.data.has_addon && planResult.data.addon_privileges) {
          plugin.settings.userPrivileges = [
            ...new Set([
              ...plugin.settings.userPrivileges,
              ...planResult.data.addon_privileges,
            ]),
          ];
        }
        await plugin.saveSettings();
      }

      isLoading = false;
      new Notice("✓ Welcome back! You're now logged in.");
      dispatch("login");
    } else {
      isLoading = false;
      error = formatAuthError(result.error || "Login failed");
    }
  }

  function handleGoogleLoginSuccess(): void {
    dispatch("login");
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
      viewBox="0 0 25 26"
      fill="currentColor"
    >
      <circle cx="17.4406" cy="7.44062" r="3.44062" />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M8.404 21.2031C6.86245 21.2031 6.09168 21.2031 5.50289 20.9031C4.98497 20.6392 4.5639 20.2181 4.3 19.7002C4 19.1114 4 18.3407 4 16.7991V8.12875C4 7.48947 4 7.16984 4.04236 6.90239C4.27554 5.43017 5.43017 4.27554 6.90239 4.04236C7.16984 4 7.48947 4 8.12875 4C8.76802 4 9.08765 4 9.3551 4.04236C10.8273 4.27554 11.982 5.43017 12.2151 6.90239C12.2575 7.16984 12.2575 7.48947 12.2575 8.12875V12.9455H17.073C17.7123 12.9455 18.0319 12.9455 18.2994 12.9879C19.7716 13.2211 20.9262 14.3757 21.1594 15.8479C21.2017 16.1154 21.2017 16.435 21.2017 17.0743C21.2017 17.7136 21.2017 18.0332 21.1594 18.3006C20.9262 19.7729 19.7716 20.9275 18.2994 21.1607C18.0319 21.203 17.7123 21.203 17.073 21.203H12.2575V21.2031H8.404ZM10.8807 12.9455H10.8799V19.8262H6.75195L6.75195 7.43993C6.75195 6.29981 7.6762 5.37556 8.81633 5.37556C9.95645 5.37556 10.8807 6.29981 10.8807 7.43994V12.9455ZM12.2575 19.8272H17.7589C18.899 19.8272 19.8233 18.903 19.8233 17.7628C19.8233 16.6227 18.899 15.6985 17.7589 15.6985H12.2575V19.8272Z"
      />
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

    <button class="login-button" on:click={handleLogin} disabled={isLoading}>
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

    <div class="login-divider">
      <span>or</span>
    </div>

    <GoogleLogin {plugin} on:login={handleGoogleLoginSuccess} />
  </div>

  <div class="login-footer">
    <p>New to Logically?</p>
    <a href="https://logically.app/signup" target="_blank" rel="noopener">
      Create your free account →
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

  .login-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    width: 100%;
  }

  .login-divider::before,
  .login-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--background-modifier-border);
  }

  .login-divider span {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: lowercase;
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
