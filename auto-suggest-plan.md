# Auto Suggest Plan (Obsidian Plugin)

## 1) Goal

Build an inline auto-suggest feature for Obsidian editor:

- Trigger suggestion after user stops typing for 500ms.
- Send paragraph context to backend API.
- Show returned suggestion as ghost text (not inserted yet).
- Accept suggestion by pressing Tab.
- Only show suggestion if cursor and paragraph snapshot are still valid.

## 2) Scope

- Supported: Markdown editor (Source mode / Live Preview, CodeMirror 6).
- Not in scope (phase 1): Reading view.
- Optional for phase 1: skip code blocks/math blocks for simpler rollout.

## 3) User Experience

- While typing: no disruption.
- After 500ms idle: fetch suggestion in background.
- If valid response arrives: render subtle ghost text at caret.
- Press Tab: suggestion is committed to document.
- Any cursor move/content change: ghost suggestion is cleared.

## 4) Core Rules

- Debounce interval: 500ms.
- Single active suggestion at a time.
- New request cancels previous in-flight request.
- Response is ignored unless all validation checks pass:
  - Cursor still at exact original position.
  - Selection is still collapsed (caret only).
  - Paragraph source snapshot/hash unchanged.
  - Response belongs to latest requestId.

## 5) Input Selection for API

- If current paragraph has text: use current paragraph.
- If user starts a new empty paragraph: use nearest previous non-empty paragraph.
- Payload recommendation:
  - filePath (or note identifier)
  - paragraphText
  - paragraphStart/End offsets (optional)
  - cursorOffset (document and/or paragraph-relative)
  - requestId

## 6) Delivery Milestones

1. Infrastructure

- Add editor event wiring + debounce + cancellation.
- Add API method for auto-suggest.

2. Rendering

- Add CodeMirror decoration/widget for ghost text.
- Add state validation before render.

3. Acceptance flow

- Add Tab key handler for commit.
- Preserve default Tab behavior when no active suggestion.

4. Hardening

- Add settings toggle + debounce config.
- Add rate limiting, timeout, and error handling.
- Add mobile fallback action (optional button if needed).

## 7) Quality Gates

- No suggestion flicker during fast typing.
- No stale suggestion after paragraph edit/cursor move.
- No duplicate insertion on repeated Tab press.
- Works with IME composition (no API trigger during composition).
- Graceful behavior on API timeout/failure.

## 8) Testing Checklist

- Typing bursts trigger exactly one request after pause.
- Cursor moved before response => suggestion not shown.
- Paragraph edited before response => suggestion not shown.
- Tab with suggestion => inserts expected text.
- Tab without suggestion => default editor behavior.
- Empty line scenario uses nearest previous paragraph.
- File switch/editor switch clears in-flight and active suggestion.

## 9) Rollout Strategy

- Feature flag in plugin settings: Enable auto-suggest.
- Ship as beta behind default-off toggle.
- Collect telemetry only if policy allows and user consents.
- Enable by default after stability validation.
