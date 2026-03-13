<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Notice } from "obsidian";
  import type { LogicallyPlugin } from "../types";
  import { formatAuthError } from "../utils/authErrors";
  import { handleAccountSwitch } from "../utils/accountSwitch";

  export let plugin: LogicallyPlugin;

  const dispatch = createEventDispatcher<{ login: void }>();

  let isLoading = false;
  let error = "";

  async function handleGoogleLogin(): Promise<void> {
    if (isLoading) return;

    isLoading = true;
    error = "";

    try {
      const accessToken = await plugin.startGoogleLogin();
      const result = await plugin.api.loginWithGoogle(accessToken);

      if (!result.success || !result.data) {
        throw new Error(result.error || "Google login failed");
      }

      const resolvedEmail = result.data.email || result.data.user.email || "";

      handleAccountSwitch(plugin.settings, resolvedEmail);

      plugin.settings.userToken = result.data.token;
      plugin.settings.userEmail = result.data.user.email || result.data.email;

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
      }

      await plugin.saveSettings();

      new Notice("Google login successful");
      dispatch("login");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google login failed";
      if (/cancelled|canceled/i.test(message)) {
        error = "";
        return;
      }

      error = formatAuthError(message);
      new Notice(error, 5000);
    } finally {
      isLoading = false;
    }
  }

  async function handleCancelLogin(): Promise<void> {
    await plugin.cancelGoogleLogin();
    isLoading = false;
    error = "";
    new Notice("Google login cancelled");
  }
</script>

<div class="ra-google-login">
  {#if error}
    <div class="ra-google-login-error">{error}</div>
  {/if}

  <button
    class="google-button"
    on:click={handleGoogleLogin}
    disabled={isLoading}
    type="button"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
    {#if isLoading}
      Connecting...
    {:else}
      Continue with Google
    {/if}
  </button>

  {#if isLoading}
    <button
      class="google-cancel-button"
      on:click={handleCancelLogin}
      type="button"
    >
      Cancel
    </button>
  {/if}
</div>

<style>
  .ra-google-login {
    width: 100%;
  }

  .ra-google-login-error {
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--background-modifier-error);
    color: var(--text-error);
    font-size: 12px;
    text-align: left;
  }

  .google-button {
    width: 100%;
    padding: 11px 12px;
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .google-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--text-muted);
  }

  .google-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .google-button svg {
    margin-right: 8px;
  }

  .google-cancel-button {
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .google-cancel-button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
</style>
