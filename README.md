# Logically AI Research Assistant (Obsidian) — Beta

> **We're in beta!** Thank you for trying out the Logically AI Research Assistant in Obsidian. We'd love your feedback on features, bugs, and ideas for improvement. Please reach out to us at [support@logically.app](mailto:support@logically.app) to share your thoughts, or visit [logically.app](http://logically.app) see how you can use Logically to help you research, cite, and write with AI.

[![Release](https://github.com/afforai/obsidian-logically-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/afforai/obsidian-logically-plugin/actions/workflows/release.yml)
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/afforai/obsidian-logically-plugin?style=flat&sort=semver)](https://github.com/afforai/obsidian-logically-plugin/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/afforai/obsidian-logically-plugin/total?style=flat)

Use Logically’s AI Research Assistant directly inside Obsidian and conduct citation-backed research on the files in your vault.

## Features

* **Access to Logically AI Research Assistant** next to your writing canvas.
* All search modes, including **Semantic Scholar Mode**, **Google Mode**, and **Document Retrieval Mode**, where you **can connect files from your vault**.
* The latest AI models from **OpenAI, Anthropic, and Gemini.**
* Access to standard AI models if you're subscribed to the Free plan, and access to standard, advanced, and reasoning AI models if you're subscribed to the Unlimited plan.
* **Inline citations and data sources with every answer.** Data sources will appear inside a table when shown.
* The ability to **add your chat output to your active Obsidian document** in one click.
* **Custom instructions** for your chat, which can be edited at any time.

## Requirements

* Obsidian.
* A Logically (<https://www.logically.app>) account.
* Internet access (messages are sent to Logically’s API).

## Installation Guide

### Option A - Community Plugins

1. **Inside Obsidian**, open **Settings → Community plugins**
2. Select **Browse** and search for **Logically AI Research Assistant**
3. Install, then enable the plugin

### Option B - Contact Us

If you don’t see Logically listed in the Community Plugins browser, contact [team@logically.app](mailto:team@logically.app), and we will send you a direct bundle that can be installed manually.

## Set Up

1. **Inside Obsidian**, Open **Settings → Logically AI Research Assistant**
2. Sign in with your Logically email and password (or paste a token under **Advanced → Login with token**)
3. (Optional) Use **Verify connection** to test your login/API

[placeholder image](<abc.com>)

## Using The Plugin

1. Open the AI Research Assistant by clicking the Logically ribbon icon or using the command palette (if using the command palette, type: **Logically: Open Research Assistant** / **Logically: Toggle Research Assistant)**
2. Select a search mode (Document Retrieval, Google, Semantic Scholar).
3. Select an AI model.
4. Ask your question.

[placeholder image](<abc.com>)

### Using Document Retrieval Mode

* When in Document Retrieval mode, click **"Files"** to open the file picker. From here, you can (search your vault and select notes) or drag a note from Obsidian’s file explorer into the assistant panel.

[placeholder image](<abc.com>)

**Notes:**

* Dropping files that are **already selected** won’t error; the plugin will add the new ones and tell you which were already added.
* When the limit is reached, additional dropped/selected files are skipped.

## Citations & Sources

* When the backend returns citations, the plugin renders citation markers as clickable superscripts.
* Messages with sources included show a **Sources table** where you can:
  * Open external links (Google / Scholar).
  * Open vault notes used as reference files.

[placeholder image](<abc.com>)

### Inserting an Answer into Your Note

Press the ”**Insert into active note”** icon button to add a chat output to your note.

* Citation markers are converted into Obsidian **footnotes** (`[^1]`, `[^2]`, …).
* Footnote definitions will appear at the bottom of your note.
* A dedicated **Sources** section will be added with links to reference files and/or external URLs.

[placeholder image](<abc.com>)

### Settings panel (in the AI Research Assistant Header)

* Shows the signed-in email
* Lets you **logout**
* Lets you edit and save a **Custom Instruction** (applied to every message)

[placeholder image](<abc.com>)

## Privacy & data

* When you send a message, the plugin sends your prompt and relevant chat history to Logically’s API.
* If you add reference files from external sources, the contents of those selected notes are included with the request.
* Avoid adding sensitive/private content you don’t want processed remotely.

## Account switching & history

* If you sign in to a **different Logically account** than the one you used last time, the plugin will **clear the existing chat history** to protect your privacy.
* If after logging out, you log back in to your account, your chat history will be preserved.

## Troubleshooting

* **Google Sign-In**: the button is visible, but Google Sign-In isn’t available in Obsidian yet. For now, please sign in using **email + password** (you can set this up at <https://logically.app> under **Account Details**) or use a **login token** (see **Advanced → Log in with token** in plugin settings).
* **Login fails**: confirm your credentials work on <https://logically.app> and try **Verify connection** in settings.
* **Network / connection errors**: check your internet connection and try **Verify connection**.
* **Dragging notes doesn’t add them**: only Markdown notes can be added; try dragging a `.md` note from the Obsidian file explorer.
* **File picker is empty**: ensure your vault contains Markdown files and Obsidian has finished indexing.

## Links

* <https://logically.app>
* <https://obsidian.md>
