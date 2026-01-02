# Logically AI Research Assistant (Obsidian) — Beta

> **We're in beta!** Thank you for trying out the Logically AI Research Assistant. We'd love your feedback on features, bugs, and ideas for improvement. Please reach out to us at [support@logically.app](mailto:support@logically.app) or visit [logically.app](https://logically.app) to share your thoughts.

[![Release](https://github.com/afforai/obsidian-logically-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/afforai/obsidian-logically-plugin/actions/workflows/release.yml)
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/afforai/obsidian-logically-plugin?style=flat&sort=semver)](https://github.com/afforai/obsidian-logically-plugin/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/afforai/obsidian-logically-plugin/total?style=flat)

Chat with Logically’s AI research assistant inside Obsidian (right sidebar), with optional context from your vault notes.

## What you get

- **Right sidebar chat view** with persistent history
- **Search modes**:
  - **Files** (Document Retrieval): use selected vault notes as reference context
  - **Google**: enrich answers with web results
  - **Scholar** (Semantic Scholar): research paper discovery
- **Model selection** (Standard / Advanced / Reasoning), with **upgrade prompts** for locked tiers
- **Reference files** (up to **5** on free plans, up to **20** on paid plans) via **file picker** or **drag & drop**
- **Citations + sources**:
  - Citation tokens in responses render as clickable superscripts
  - A **Sources table** is shown for assistant messages when sources exist
- **Message actions**:
  - **Insert into active note** (assistant messages)
  - **Regenerate** (assistant messages)
  - **Delete from here down** (user messages)
- **Quick controls**: **Settings** panel and **Clear chat**
- **Custom instruction** (saved, applied to every message)

## Requirements

- Obsidian
- A Logically account (logically.app)
- Internet access (messages are sent to Logically’s API)

## Install

### Option A – Community Plugins

1. Open **Settings → Community plugins**
2. Select **Browse** and search for **Logically AI Research Assistant**
3. Install, then enable the plugin

### Option B – Private distribution

If it is not listed in the Community Plugins browser, you will need a direct install bundle from Logically. Please reach out to Logically support for access.

## Set up

1. Open **Settings → Logically AI Research Assistant**
2. Sign in with your Logically email + password (or paste a token under **Advanced → Login with token**)
3. (Optional) Use **Verify connection** to test your login/API

Notes:

- **Model selection happens inside the chat** (next to the send button). Your choice is remembered.
- When you **log out**, the plugin resets the selected model back to **GPT-5 mini**.

## Use

1. Open the assistant:
   - Click the Logically ribbon icon, or
  - Use command palette: **Open AI research assistant** / **Toggle AI research assistant**
2. Pick a **mode** (Files / Google / Scholar)
3. Pick a **model** (Standard / Advanced / Reasoning)
4. Ask your question

### Files mode: add reference context

You can include up to **5** Markdown notes as reference context for the next message on free plans (up to **20** on paid plans).

- Click **Files** to open the file picker (search your vault and select notes)
- Or drag a note from Obsidian’s file explorer into the assistant panel (you’ll see a drop overlay)
- If the chat is empty, you can also click the hint in the center to open the file picker

Notes:

- Dropping files that are **already selected** won’t error; the plugin will add the new ones and tell you which were already added.
- When the limit is reached, additional dropped/selected files are skipped.

### Citations & sources

- When the backend returns citations, the plugin renders citation markers as clickable superscripts.
- Assistant messages with sources show a **Sources table** where you can:
  - Open external links (Google / Scholar)
  - Open vault notes used as reference files

### Insert an answer into your note

Use **Insert into active note** on an assistant message.

- Citation markers are converted into Obsidian **footnotes** (`[^1]`, `[^2]`, …)
- Footnote definitions are appended at the bottom
- A **Sources** section is added with links to reference files and/or external URLs

### Settings panel (in the assistant header)

- Shows the signed-in email
- Lets you **logout**
- Lets you edit and save a **Custom Instruction** (applied to every message)

## Privacy & data

- When you send a message, the plugin sends your prompt and relevant chat history to Logically’s API.
- If you add reference files, the contents of those selected notes are included with the request.

Avoid adding sensitive/private content you don’t want processed remotely.

## Account switching & history

- If you sign in to a **different Logically account** than last time, the plugin will **clear the existing chat history** to protect your privacy.
- If you log out and sign back in to the **same account**, your chat history is preserved.

## Troubleshooting

- **Google Sign-In**: the button is visible, but Google Sign-In isn’t available in Obsidian yet. For now, please sign in using **email + password** (you can set this up at https://logically.app under **Account Detail**) or use a **login token** (see **Advanced → Log in with token** in plugin settings).
- **Login fails**: confirm your credentials work on https://logically.app and try **Verify connection** in settings.
- **Network / connection errors**: check your internet connection and try **Verify connection**.
- **Dragging notes doesn’t add them**: only Markdown notes can be added; try dragging a `.md` note from the Obsidian file explorer.
- **File picker is empty**: ensure your vault contains Markdown files and Obsidian has finished indexing.

## Links

- https://logically.app
- https://obsidian.md
