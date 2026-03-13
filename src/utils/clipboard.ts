/**
 * Copy text to clipboard using Electron first, with navigator fallback.
 * Electron's clipboard API is reliable in Obsidian's desktop Electron shell.
 * navigator.clipboard.writeText() may silently fail in Electron sidebar
 * when the webview doesn't have focus, so it's used only as a fallback.
 * Returns true on success, false on failure. Never throws.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Electron clipboard available in desktop-only Obsidian plugins
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("electron") as {
      clipboard: { writeText(text: string): void };
    };
    clipboard.writeText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
