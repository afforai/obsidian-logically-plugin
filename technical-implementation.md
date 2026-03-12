# Technical Implementation: Auto Suggest (Obsidian + CodeMirror 6)

## 1) Architecture Overview

Implement auto-suggest as an editor-level feature attached to the active Markdown editor.

### Main components

- SuggestController
  - Lifecycle, debounce, request orchestration, validation.
- SuggestContextExtractor
  - Reads current paragraph / nearest previous paragraph.
- SuggestApiClient integration
  - Adds `getAutoSuggestion(...)` method in existing API service.
- GhostTextRenderer (CodeMirror extension)
  - Renders inline ghost text via decoration/widget.
- TabAcceptKeymap
  - Commits active suggestion when valid.

## 2) Proposed File Changes

- src/services/logicallyApi.ts
  - Add `getAutoSuggestion(payload, signal?)`.
- src/types.ts
  - Add request/response/state types.
- src/main.ts
  - Register/unregister editor extension lifecycle hooks.
- src/views/researchAssistantView.ts (or dedicated editor module)
  - Instantiate controller when plugin/view is active.
- New files (recommended)
  - src/editor/autoSuggest/controller.ts
  - src/editor/autoSuggest/context.ts
  - src/editor/autoSuggest/renderer.ts
  - src/editor/autoSuggest/keymap.ts
  - src/editor/autoSuggest/types.ts (or keep in src/types.ts if preferred)

Note: If the team prefers minimal surface area, keep everything under one module first, then split after stabilization.

## 3) Data Models

```ts
export interface AutoSuggestRequest {
  text: string;
  documentId: string;
  options?: {
    regenerate?: boolean;
    temperature?: number;
    citationStyle?: string;
    model?: string;
  };
}

export interface AutoSuggestResponse {
  suggestion: string;
}

export interface SuggestInvocationSnapshot {
  requestId: string;
  filePath: string;
  cursorDocOffset: number;
  paragraphFrom: number;
  paragraphTo: number;
  paragraphHash: string;
  sourceText: string;
  requestedAt: number;
  documentId: string;
}

export interface ActiveSuggestion {
  requestId: string;
  anchorOffset: number;
  text: string;
  paragraphHash: string;
}
```

## 4) Event Flow

1. User types in Markdown editor.
2. Change listener fires.
3. If composing IME, skip.
4. Reset debounce timer (500ms).
5. When timer fires:
   - Extract context paragraph.
   - Build snapshot + request payload.
   - Cancel previous request via AbortController.
   - Send request to backend.
6. Response returns:
   - Validate snapshot against current editor state.
   - If invalid => discard.
   - If valid => set active suggestion and render ghost text.
7. User presses Tab:
   - If active suggestion still valid, insert text at anchor.
   - Clear active suggestion.
   - Prevent default Tab.
8. Any mutation/selection move/file switch:
   - Clear active suggestion and cancel request.

## 5) Context Extraction Rules

### Current paragraph detection

- Use editor doc line boundaries around caret.
- Expand to paragraph boundaries by scanning adjacent non-empty lines.
- Normalize newline handling before hashing.

### Empty paragraph rule

- If current paragraph is empty (or whitespace only), scan upward to nearest non-empty paragraph.
- If no previous paragraph exists, skip request.

### Hashing

- Compute stable hash from normalized paragraph text.
- Include optional anchor metadata if needed.

## 6) Validation Logic (Anti-stale)

Before rendering or accepting suggestion, ensure:

- Active file path is same as invocation filePath.
- Selection is single caret.
- Caret doc offset equals snapshot cursorDocOffset.
- Current paragraph boundaries still match or paragraph hash unchanged.
- requestId is latest request.

If any check fails, drop suggestion immediately.

## 7) Ghost Text Rendering

Use CodeMirror `Decoration.widget` (or inline decoration) anchored at caret offset.

### Rendering constraints

- Non-destructive: does not modify document.
- One ghost suggestion at a time.
- Styled with low opacity and clear distinction.
- Remove on blur/move/change.

### Suggested CSS hooks

- `.ra-auto-suggest-ghost`
- `.ra-auto-suggest-ghost-inline`

## 8) Tab Acceptance Behavior

Keymap priority should capture Tab only when valid suggestion exists.

Pseudo behavior:

- if `hasValidSuggestion()`:
  - transaction insert `suggestion.text` at `anchorOffset`
  - clear state
  - return true (handled)
- else:
  - return false (let default Tab behavior continue)

## 9) API Contract Proposal

Endpoints (from existing FE behavior):

- Authenticated: `POST /autosuggest/suggest`
- Visitor/no token: `POST /public/visitor/autosuggest`

Headers:

- `Content-Type: application/json`
- `x-access-token: <jwt>` only when token is available

Client routing rule:

- Start with backend base URL (trim trailing slash).
- If JWT exists, call authenticated endpoint.
- If JWT is missing/null, call visitor endpoint.

Request:

```json
{
  "text": "...",
  "documentId": "note-or-doc-id",
  "options": {
    "regenerate": false,
    "temperature": 0.7,
    "citationStyle": "apa",
    "model": "gpt-4.1"
  }
}
```

Response:

```json
{
  "suggestion": " continued sentence..."
}
```

Backend notes:

- Return empty suggestion when no confident continuation.
- Keep latency low; target p95 under 1s where possible.
- Ignore `source/citation`, `quota`, and signup modal side-effects for plugin scope.

Service mapping in plugin (`src/services/logicallyApi.ts`):

```ts
async getAutoSuggestion(
  text: string,
  documentId: string,
  signal: AbortSignal,
  options?: {
    regenerate?: boolean;
    temperature?: number;
    citationStyle?: string;
    model?: string;
  },
): Promise<string> {
  const base = this.baseUrl.replace(/\/$/, "");
  const token = this.token;
  const hasToken = Boolean(token && token !== "null");
  const url = hasToken
    ? `${base}/autosuggest/suggest`
    : `${base}/public/visitor/autosuggest`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (hasToken && token) {
    headers["x-access-token"] = token;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, documentId, options }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Autosuggest failed: ${res.status}`);
  }

  const json = (await res.json()) as { suggestion?: string };
  return json.suggestion ?? "";
}
```

## 10) Error Handling and Timeouts

- Timeout request (2-4s).
- Abort on next keystroke/new request.
- Silent fail in UI (no blocking notice for normal transient errors).
- Optional debug logs gated by dev flag.
- Keep error handling simple for phase 1: no signup modal/quota UI handling.

## 11) Settings Integration

Add to plugin settings:

- `autoSuggestEnabled: boolean` (default false for beta)
- `autoSuggestDebounceMs: number` (default 500)

Optional:

- `autoSuggestInCodeBlocks: boolean` (default false)

## 12) Performance Considerations

- Debounce + cancel in-flight request.
- Skip API call for very short input (e.g., less than 10 chars) if desired.
- Avoid recomputing heavy scans; use line-level operations.
- Reuse extension instance per editor where possible.

## 13) IME and International Input

Do not trigger requests during composition events.
Only schedule debounce after composition ends.

## 14) Mobile Compatibility

- Tab key may be unavailable.
- Add optional quick action button:
  - "Accept suggestion"
  - only visible when active suggestion is valid.

## 15) Security and Privacy

- Send only required context.
- Never log auth tokens.
- Respect user consent and plugin privacy documentation.
- Support both authenticated and visitor endpoints based on token presence.

## 16) Implementation Sequence (Practical)

1. Add types + API method.
2. Build SuggestContextExtractor with tests/manual verification.
3. Implement controller with debounce + abort + validation.
4. Add ghost renderer extension.
5. Add Tab keymap accept.
6. Add settings toggle/debounce config UI.
7. Manual QA in Obsidian desktop + mobile sanity check.

## 17) Manual QA Matrix

- Fast typing, pause, receive suggestion.
- Move cursor before response.
- Edit source paragraph before response.
- Switch file during in-flight request.
- Accept with Tab.
- No suggestion: Tab still indents/navigates as normal.
- IME composition path.
- Toggle feature off/on from settings.

## 18) Future Enhancements

- Accept by Right Arrow in addition to Tab.
- Partial accept by word.
- Multi-candidate suggestion cycling.
- Personalization via custom instruction context.
