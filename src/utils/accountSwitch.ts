import { Notice } from "obsidian";
import type { LogicallySettings } from "../types";

/**
 * Check if logging in as a different user than before, and wipe chat history if so.
 * Updates `lastLoggedInEmail` to the new email (normalized to lowercase).
 *
 * @returns true if the account was switched (history wiped), false otherwise.
 */
export function handleAccountSwitch(
  settings: LogicallySettings,
  newEmail: string,
): boolean {
  const normalizedNew = newEmail.toLowerCase();
  const normalizedLast = settings.lastLoggedInEmail.toLowerCase();

  const switched = normalizedLast !== "" && normalizedLast !== normalizedNew;

  if (switched) {
    settings.chatHistory = [];
    new Notice(
      "Welcome! Your previous chat history has been cleared for privacy.",
      5000,
    );
  }

  settings.lastLoggedInEmail = normalizedNew;
  return switched;
}
