# Logically Research Assistant (Obsidian)

Chat with Logically’s research assistant inside Obsidian - in the right sidebar - with optional context from your vault notes.

## What you get

- **Sidebar chat** inside Obsidian
- **Model selection** (Standard / Advanced / Reasoning)
- **Add context from your vault** (select notes, or drag notes into the panel)
- **Insert answers into your current note**
- **Stays signed in** after you log in

## Requirements

- Obsidian desktop or mobile
- A Logically account
- Internet access (messages are sent to Logically’s API)

## Install

### Option A – Community Plugins

1. Open **Settings → Community plugins**
2. Select **Browse** and search for **Logically Research Assistant**
3. Install, then enable the plugin

### Option B – Private distribution

If it is not listed in the Community Plugins browser, you will need a direct install bundle from Logically.
Please reach out to Logically support for access.

## Set up

1. Open **Settings → Logically Research Assistant**
2. Log in with your Logically email + password
3. Pick a **Default model**

Tip: You can use **Verify connection** in settings to test your login/API.

## Use

1. Open the assistant:
  - Click the Logically ribbon icon, or
  - Use command palette: **Logically: Open Research Assistant**
2. Choose a model from the dropdown
3. Ask your question

### Add note context (recommended)

You can include up to **5** Markdown notes as reference context.

- Click **Files** in the assistant header and select notes, or
- Drag a note from Obsidian’s file explorer into the assistant panel

The assistant will read those notes and append them as reference context for your next message.

### Insert an answer into your note

In the chat, use the “insert into note” action on an assistant message to paste the response into the currently open note.

## Privacy & data

- When you send a message, the plugin sends your prompt and relevant chat history to Logically’s API.
- If you add context files, the contents of those selected notes are included with the request.

Avoid adding sensitive/private content you don’t want processed remotely.

## Troubleshooting

- **Login fails**: confirm your credentials work on https://logically.app and try **Verify connection** in settings.
- **Network / connection errors**: check your internet connection and try **Verify connection**.
- **Dragging notes doesn’t add them**: only Markdown notes can be added; try dragging a `.md` note from the Obsidian file explorer.
- **File list looks empty**: ensure your vault contains Markdown files and Obsidian has finished indexing.

## Links

- https://logically.app
- https://obsidian.md
