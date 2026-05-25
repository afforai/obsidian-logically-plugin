/**
 * Copy text to clipboard using Electron first, with navigator fallback.
 * Electron's clipboard API is reliable in Obsidian's desktop Electron shell.
 * navigator.clipboard.writeText() may silently fail in Electron sidebar
 * when the webview doesn't have focus, so it's used only as a fallback.
 * Returns true on success, false on failure. Never throws.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Electron's clipboard module is a CommonJS module bundled with Obsidian's
    // desktop shell. It is not available as an ES module import and must be
    // loaded via require() at runtime. This plugin is marked isDesktopOnly,
    // so the require("electron") call is always safe in supported environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron is a CommonJS-only module in Obsidian's desktop shell; require() is the only supported access path
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
