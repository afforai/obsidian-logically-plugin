# Logically Research Assistant (Obsidian Plugin)

## Project Overview

**Logically Research Assistant** is an Obsidian community plugin that integrates AI-powered research capabilities directly into the editor.

- **Plugin ID**: `logically` (immutable after release)
- **Entry point**: `src/main.ts` (LogicallyPluginImpl extends Plugin) → compiled to `main.js`
- **UI**: Svelte components mounted in right sidebar view
- **API integration**: Calls Logically backend for completions, citations, privilege checks
- **Required release artifacts**: `main.js`, `manifest.json`, `styles.css`
- **License**: Non-commercial, no-derivatives (Afforai Inc., see LICENSE.md)

## Environment & Tooling

- **Node.js**: 18+ (LTS)
- **Package manager**: pnpm (required; `pnpm-lock.yaml` is canonical)
- **Bundler**: esbuild (via `esbuild.config.mjs`, outputs `main.js` + `styles.css`)
- **UI framework**: Svelte 4 (`src/ui/*.svelte` components)
- **Language**: TypeScript (strict mode, `tsconfig.json`)
- **Linting**: ESLint with Obsidian plugin rules
- **CI/CD**: GitHub Actions (lint on push, release on tag)

### Quick Start

```bash
pnpm install          # Install dependencies
pnpm dev              # Watch mode (rebuild on file change)
pnpm build            # Production build (minified, typecheck)
pnpm lint             # Check linting
pnpm lint:fix         # Auto-fix linting issues
pnpm dev:install      # Copy built plugin to Obsidian vault (requires OBSIDIAN_VAULT env var)
```

### DevInstall Script

The `dev:install` script copies built artifacts to your vault's plugin folder. **You must provide the vault path:**

```bash
# Via environment variable
export OBSIDIAN_VAULT="/path/to/MyVault"
pnpm dev:install

# Or as argument
pnpm dev:install -- "/path/to/MyVault"
```

**Do not hardcode vault paths in the script.** Paths are developer-specific.

## Folder Structure & Conventions

The project follows Obsidian community plugin conventions with Svelte for UI:

```
obsidian-logically-plugin/
├── src/
│   ├── main.ts                    # Plugin lifecycle (minimal)
│   ├── settings.ts                # Obsidian settings tab UI + login
│   ├── types.ts                   # All TypeScript types, enums, unions
│   ├── views/
│   │   └── researchAssistantView.ts  # Right sidebar view container
│   ├── ui/                        # Svelte components (ra- CSS prefix)
│   │   ├── ResearchAssistantRoot.svelte   # Top-level chat UI
│   │   ├── ChatInput.svelte               # Input + mode/model selectors
│   │   ├── MessageList.svelte             # Chat bubbles + citations
│   │   ├── FilePicker.svelte              # Vault file selector
│   │   ├── SourcesTable.svelte            # Citation sources display
│   │   ├── LoginPrompt.svelte             # Auth UI
│   │   ├── SettingsPanel.svelte           # In-chat settings modal
│   │   ├── UpgradeModal.svelte            # Premium upgrade prompt
│   │   └── (+ 2 unused: ModelSelector, ModeSelector)
│   ├── services/
│   │   └── logicallyApi.ts        # All API calls (single source of truth)
│   └── utils/
│       ├── env.ts                 # IS_DEV_BUILD flag
│       └── authErrors.ts          # Error formatting helpers
│
├── .github/workflows/
│   ├── lint.yml                   # Lint on push
│   └── release.yml                # Release on tag (draft release)
│
├── manifest.json                  # Plugin metadata (id, version, minAppVersion)
├── main.js                        # Bundled plugin (generated)
├── styles.css                     # Bundled styles (generated)
├── esbuild.config.mjs             # Build config
├── tsconfig.json                  # TypeScript config (strict, Node types)
├── eslint.config.mts              # ESLint rules
├── package.json                   # Scripts and dependencies
├── pnpm-lock.yaml                 # Lockfile (canonical)
├── version-bump.mjs               # Version bumper script
│
└── docs/
    ├── README.md                  # User guide (install, setup, usage)
    ├── DEVELOPMENT.md             # Developer setup & release process
    └── AGENTS.md                  # This file (contributor guidelines)
```

### Key Principles

1. **Keep `main.ts` minimal**: Only plugin lifecycle (onload, onunload, view registration, ribbon icon, commands). Delegate logic to services/UI.
2. **Single source of truth for API calls**: All HTTP requests go through `services/logicallyApi.ts`.
3. **Settings via Obsidian**: Use `this.loadData()` / `this.saveData()` (no manual JSON file handling).
4. **Component organization**: Each Svelte component has a single, clear responsibility.
5. **CSS prefix**: All UI CSS classes start with `ra-` (research assistant) to avoid Obsidian collisions.
6. **Types first**: Define all interfaces/unions in `src/types.ts` (central registry).

### File Size Guidelines

- Keep files under ~300 lines; break into smaller modules if larger.
- `main.ts` should be <150 lines.
- Services (like `logicallyApi.ts`) can be larger (domain-specific logic).

## Manifest Rules

**File**: `manifest.json`

```json
{
  "id": "logically",
  "name": "Logically Research Assistant",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "AI-powered research assistant integrated with Logically (logically.app)",
  "author": "Logically",
  "authorUrl": "https://logically.app",
  "isDesktopOnly": false
}
```

**Rules**:
- `id` is immutable after release. Never change it.
- `version` must follow Semantic Versioning (x.y.z, no `v` prefix).
- Bump version with `pnpm run version` (auto-updates `manifest.json` + `versions.json`, commits).
- Keep `minAppVersion` accurate for features used.
- `isDesktopOnly: false` allows mobile (drag-drop may not work, but fallbacks available).

See [canonical Obsidian validation rules](https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml).

## Testing

### Manual Testing

1. **Build**: `pnpm build`
2. **Install**: Copy `main.js`, `manifest.json`, `styles.css` to `<VaultPath>/.obsidian/plugins/logically/`
3. **Reload**: Close and reopen Obsidian, or toggle plugin in **Settings → Community plugins**
4. **Test**: Open Research Assistant via ribbon icon or command palette

### Automated Testing

- **Linting**: `pnpm lint` (ESLint checks TypeScript + Svelte)
- **Build check**: `pnpm build` (includes `tsc -noEmit` for type safety)
- **CI**: `.github/workflows/lint.yml` runs on every push (Node 18.x, pnpm)

No unit test suite yet; rely on manual testing in Obsidian and linting in CI.

## Commands & Settings

### Commands

This plugin registers two commands (see `src/main.ts`):

- **`logically:open-research-assistant`** – Opens the research assistant view in the right sidebar
- **`logically:toggle-research-assistant`** – Toggles view visibility

Use Obsidian's command palette to trigger them.

### Settings

Settings tab is in `src/settings.ts` (LogicallySettingTab extends PluginSettingTab).

**Persisted settings** (see `src/types.ts` LogicallySettings interface):
- `userToken` – JWT/auth token (encrypted by Obsidian)
- `selectedModel` – Current AI model choice
- `searchMode` – Current search mode (files | google | semantic)
- `contextFiles` – Selected vault file paths for reference
- `chatHistory` – Persisted messages (debounced saves)
- `userPrivileges` – Cached privilege flags (used for model gating)
- `customInstruction` – User's free-form instruction (prepended to every request)
- `userEmail`, `lastLoggedInEmail` – For account switching detection

Use `await this.plugin.saveSettings()` to persist changes and notify API client.

## Versioning & Releases

### Bumping Version

```bash
pnpm run version
```

This updates:
- `manifest.json` (`version` field)
- `versions.json` (version history)
- Creates a commit (git)

### Creating a Release

1. Ensure `pnpm build` succeeds locally.
2. Push the version bump commit.
3. Create a git tag matching `manifest.json.version` **exactly** (no `v` prefix):
   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```
4. GitHub Actions (`.github/workflows/release.yml`) automatically:
   - Builds via `pnpm build`
   - Packages `main.js`, `manifest.json`, `styles.css`
   - Creates a **draft release** on GitHub
   - Uploads artifacts + zip file

5. Review the draft, then publish it.

### Community Plugin Submission

After v1.0.0 release:
- Follow [Obsidian community submission process](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- Plugin will appear in **Community plugins → Browse** after approval
- Updates automatically propagate via Obsidian's plugin catalog

## Security, Privacy & Compliance

This plugin calls external API (`https://api.logically.app`) and handles user authentication. Follow Obsidian's **Developer Policies** and **Plugin Guidelines** strictly.

### Do's
✅ **Minimal network calls**: Only request data when essential to the feature (e.g., completion, privilege check).  
✅ **Explicit opt-in**: Network requests are initiated by user actions (send message, login, verify token).  
✅ **Clear disclosure**: README documents "messages sent to Logically API" and privacy implications.  
✅ **Secure token storage**: Authentication tokens stored via Obsidian's encrypted settings (no plaintext files).  
✅ **Clean up listeners**: Use `this.register*` helpers for all DOM, app, and interval listeners.  
✅ **Validate input**: Sanitize chat messages, file paths, custom instructions before sending.  
✅ **Handle errors gracefully**: Show user-friendly error messages (see `utils/authErrors.ts`).

### Don'ts
❌ **No hidden telemetry**: Never send usage data without explicit user consent.  
❌ **No remote code execution**: Do not fetch and eval scripts, auto-update, or execute backend commands.  
❌ **No vault sniffing**: Only read files the user explicitly selects (file context mode).  
❌ **No email harvesting**: Don't collect or log email addresses beyond what's necessary for auth.  
❌ **No credential logging**: Never log tokens, passwords, or API keys to console or files.  
❌ **No cross-site requests**: Don't make requests to unrelated third-party services.  
❌ **No ads or spam**: No notifications, badges, or persistent UI clutter for promoting services.

### Privacy Notes

- **Chat messages**: Sent to Logically API for processing. Users should avoid sensitive/private content.
- **Reference files**: Only included when user explicitly selects them in Files mode.
- **Account switching**: Automatically wipes chat history when logging into a different Logically account (privacy protection).
- **Custom instructions**: Sent as `session.system` to backend; users should not include sensitive prompts.

See [README.md](README.md) **Privacy & Data** section for user-facing guidance.

## UI & Copy Guidelines

**In-app text** (buttons, headings, labels):
- Sentence case for headings: "Research Assistant", "Custom Instruction"
- Action-oriented imperatives: "Send Message", "Insert into Note", "Add Files"
- Use **bold** for UI labels: **Settings → Logically Research Assistant**
- Use arrow notation for navigation paths
- Keep strings short and jargon-free (e.g., "Models" instead of "Language Models")

**User-facing messages**:
- Errors: Clear, actionable guidance (e.g., "Token expired. Please log in again.")
- Success: Brief confirmation (e.g., "Message inserted!")
- Warnings: Explain what went wrong and how to fix (e.g., "Vault contains no Markdown files.")

**Svelte Component Text**:
- Prefer slot content over magic strings
- Use comments to document complex UX patterns (e.g., drag-drop behavior)
- Keep component-specific text in `<script>` blocks, not hardcoded in templates

## Performance & Bundle

### Keep it Light

- **Defer heavy work**: Load API client, UI components lazily (avoid blocking onload).
- **Minimize bundle**: No heavy dependencies; prefer Obsidian built-ins where possible.
- **Debounce**: Chat history saves are debounced (avoid excessive disk writes).
- **Lazy file scanning**: FilePicker scans vault structure only when opened.
- **No continuous polling**: No background loops or interval watchers.

### Bundle Optimization

- **Svelte**: Compiler handles dead-code elimination; keep components focused.
- **esbuild**: Minifies in production (`pnpm build`), leaves readable in dev (`pnpm dev`).
- **Avoid large libs**: Use Node `https` module instead of axios/node-fetch.
- **No external CDN**: All assets bundled; no runtime network calls for vendor code.

### Memory

- **Chat history**: Stored in settings (persisted to disk, debounced).
- **File list**: Cached during FilePicker session; cleared on close.
- **DOM**: Svelte reactivity handles cleanup; use `{#if}` blocks for conditional rendering.
- **Listeners**: Always use `this.register*` helpers (auto-cleanup on unload).

## Coding Conventions

### TypeScript
- **Strict mode**: `"strict": true` in `tsconfig.json` (no implicit any, null checks, etc.).
- **Type first**: Define all interfaces/unions in `src/types.ts` (single source of truth).
- **Prefer `async/await`** over promise chains.
- **Error handling**: Catch errors, log for debugging, return user-friendly messages.
- **No `any` types**: Use unions, interfaces, or generics instead.

### Svelte Components
- **Single responsibility**: Each `.svelte` file handles one feature/view.
- **Props**: Use TypeScript types for all component props.
- **CSS prefix**: All classes start with `ra-` (research assistant).
- **Event dispatch**: Use `createEventDispatcher()` for parent→child communication.
- **Reactive blocks**: Use `$:` for computed values, not side effects.
- **Keyboard handling**: Add `|stopPropagation` modifiers to prevent event bubbling to modals.

### Module Organization
```ts
// main.ts – Minimal
import { Plugin } from 'obsidian';
import { LogicallySettingTab } from './settings';
import { ResearchAssistantView } from './views/researchAssistantView';

export default class LogicallyPluginImpl extends Plugin {
  async onload() {
    this.registerView(...);
    this.addSettingTab(new LogicallySettingTab(...));
    this.addCommand(...);
  }
}
```

```ts
// services/logicallyApi.ts – Domain logic
export class LogicallyApi {
  async signin(email, password) { /* HTTP request */ }
  async streamMessage(prompt, model) { /* Stream handler */ }
  // ... all API calls here
}
```

```ts
// UI components – Presentation
// <ChatInput.svelte> – Input bar + selectors
// <MessageList.svelte> – Display + rendering
// Emit events up to ResearchAssistantRoot.svelte (orchestrator)
```

### Naming Conventions
- **Classes**: `PascalCase` (LogicallyPlugin, ResearchAssistantView)
- **Functions**: `camelCase` (streamMessage, formatAuthError)
- **Constants**: `UPPER_SNAKE_CASE` (DEFAULT_SETTINGS, SEARCH_MODE_TO_TOOL)
- **Types/Interfaces**: `PascalCase` (ChatMessage, SourceNode, SearchMode)
- **CSS classes**: `kebab-case` with `ra-` prefix (ra-chat-input, ra-citation-link)

## Mobile Compatibility

This plugin supports mobile (`isDesktopOnly: false`), but some features may not work on all platforms.

### Known Limitations
- **Drag-drop**: File explorer not available on iOS/Android; FilePicker dropdown still works.
- **Custom instructions**: Text input works on mobile (keyboard shown).
- **Citation rendering**: Works but limited screen space.

### Testing
- Test on iOS Obsidian (iPad/iPhone) and Android Obsidian if possible.
- Fallbacks: Ensure features degrade gracefully (e.g., FilePicker for drag-drop alternatives).
- Touch UX: Buttons should be ≥44px for touch targets.

## Contributor Do's & Don'ts

### Do
✅ Keep `main.ts` under 150 lines (delegate logic to services/UI).
✅ Use `services/logicallyApi.ts` for all API calls.
✅ Define types in `src/types.ts` (central registry).
✅ Use `this.register*` helpers for cleanup (registerEvent, registerDomEvent, registerInterval).
✅ Test locally: `pnpm dev` + copy to vault + reload Obsidian.
✅ Run `pnpm lint` before pushing.
✅ Use TypeScript `strict: true` (no implicit any).
✅ Provide sensible defaults in settings.

### Don't
❌ Hardcode developer-specific paths (vault paths, API URLs in production).  
❌ Introduce network calls without documenting them.  
❌ Commit `node_modules/`, `main.js`, or build artifacts.  
❌ Use `any` types; use unions/interfaces instead.  
❌ Make UI changes without testing in actual Obsidian.  
❌ Store secrets or credentials in code/settings (use token-based auth).  
❌ Rename stable command IDs once released (breaking change).  
❌ Add large dependencies without justification (check bundle impact).  
❌ Ignore linting errors (they catch real bugs).

### Code Review Checklist

Before submitting a PR:
- [ ] `pnpm build` passes (no TypeScript errors)
- [ ] `pnpm lint` passes (no ESLint warnings)
- [ ] Tested locally in Obsidian (dev vault)
- [ ] No hardcoded paths or secrets
- [ ] Updated types in `src/types.ts` if adding new fields
- [ ] Preserved backward compatibility (no breaking changes to public APIs)

## Common Tasks

### Add a New Command

In `src/main.ts`:

```ts
async onload(): Promise<void> {
  this.addCommand({
    id: 'clear-chat',
    name: 'Clear chat history',
    callback: async () => {
      this.settings.chatHistory = [];
      await this.saveSettings();
    },
  });
}
```

Use stable command IDs (don't rename after release).

### Add a Setting

In `src/settings.ts`:

```ts
new Setting(containerEl)
  .setName('Max file context')
  .setDesc('Maximum number of files to include as reference')
  .addSlider(slider => {
    slider
      .setLimits(1, 10, 1)
      .setValue(this.plugin.settings.maxFiles)
      .onChange(async (value) => {
        this.plugin.settings.maxFiles = value;
        await this.plugin.saveSettings();
      });
  });
```

The setting is auto-persisted via `saveSettings()`.

### Add a Svelte Component

Create `src/ui/MyComponent.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let title: string = 'Default';
  
  const dispatch = createEventDispatcher<{ action: string }>();
  
  function handleClick() {
    dispatch('action', { detail: 'clicked' });
  }
</script>

<div class="ra-my-component">
  <h3>{title}</h3>
  <button on:click={handleClick}>Click me</button>
</div>

<style>
  .ra-my-component {
    padding: 1rem;
    background: var(--background-secondary);
  }
</style>
```

Import in parent component and bind events:

```svelte
<MyComponent title="My Title" on:action={(e) => handleAction(e.detail)} />
```

### Make an API Call

All API calls go through `services/logicallyApi.ts`. Add method:

```ts
async getUserData(): Promise<UserInfo | null> {
  const response = await this.request<UserInfo>('/user/profile');
  if (response.success && response.data) {
    return response.data;
  }
  return null;
}
```

Call from UI/settings:

```ts
const user = await this.api.getUserData();
if (user) {
  console.log('Logged in as:', user.email);
}
```

### Handle an Error

Use `utils/authErrors.ts` for auth errors:

```ts
import { formatAuthError } from './utils/authErrors';

async function login(email: string, password: string) {
  try {
    const response = await this.api.signin(email, password);
    if (!response.success) {
      const friendlyMsg = formatAuthError(response.error);
      new Notice(friendlyMsg, 5000); // 5s toast
      return;
    }
    // success
  } catch (error) {
    console.error('[Logically] Login failed:', error);
    new Notice('An unexpected error occurred. Please try again.');
  }
}
```

### Update Types

In `src/types.ts`:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: SourceNode[];  // Add new field
}

export interface LogicallySettings {
  // ... existing fields
  maxFiles: number;  // Add new setting
}
```

Update `DEFAULT_SETTINGS`:

```ts
export const DEFAULT_SETTINGS: LogicallySettings = {
  // ... existing defaults
  maxFiles: 5,
};
```

## Troubleshooting

### Plugin doesn't load after build
- Ensure `main.js` and `manifest.json` are at the top level of `<Vault>/.obsidian/plugins/logically/`
- Check browser console (F12) and Obsidian console for error messages
- Try reloading Obsidian completely (`Ctrl+R` on Windows/Linux, `Cmd+R` on macOS)

### Build fails
- Run `pnpm install` to ensure all dependencies are installed
- Check `tsconfig.json`: Node types must include `https`, `url`
- Verify Node.js version: `node --version` (should be 18+)

### Types not recognized
- Run `pnpm build` to trigger type checking (`tsc -noEmit`)
- Check `src/types.ts` for the type definition
- Verify imports are correct (check relative paths)

### Linting errors
- Run `pnpm lint:fix` to auto-fix common issues
- Review ESLint rules in `eslint.config.mts` (Obsidian plugin rules)
- Check for missing imports or unused variables

### UI not rendering
- Check browser console (F12) for JavaScript errors
- Verify Svelte component syntax (closing tags, event handlers)
- Ensure CSS classes use `ra-` prefix to avoid Obsidian collisions
- Test component in isolation before integrating

### API calls failing
- Check network tab (F12) for request/response details
- Verify token is valid: use "Verify connection" in settings
- Check API base URL: should be `https://api.logically.app` in production
- Log request/response for debugging: add `console.debug()` in `logicallyApi.ts`

### Settings not persisting
- Ensure `await this.saveSettings()` is called (async)
- Verify setting exists in `LogicallySettings` interface and `DEFAULT_SETTINGS`
- Check Obsidian console for save errors
- Try reloading plugin after manual save

### Commands not appearing
- Verify `addCommand()` is called in `onload()` (not in `onunload()`)
- Check command `id` is unique (no duplicates)
- Reload plugin or restart Obsidian
- Look for typos in `name` or `callback` fields

## References & Resources

### Official Documentation
- [Obsidian Plugin API](https://docs.obsidian.md)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Developer Policies](https://docs.obsidian.md/Developer+policies)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian Style Guide](https://help.obsidian.md/style-guide)

### Project Documentation
- [README.md](README.md) – User guide (install, setup, usage)
- [DEVELOPMENT.md](DEVELOPMENT.md) – Developer setup & release

### Tools & Frameworks
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Svelte Documentation](https://svelte.dev/docs)
- [esbuild Guide](https://esbuild.github.io/)
- [ESLint Rules](https://eslint.org/docs/rules/)
