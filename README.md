# Logically Research Assistant for Obsidian

AI-powered research assistant plugin for Obsidian, integrated with [Logically](https://logically.app).

## Features

- **AI Research Assistant** - Chat with AI directly in Obsidian's right sidebar
- **Multiple AI Models** - Choose from Standard, Advanced, and Reasoning models:
  - **Standard**: Gemini Flash 2.5, GPT-5 mini, Claude Haiku 4.5
  - **Advanced**: Gemini Pro 2.5, GPT-5.1, Claude Sonnet 4.5
  - **Reasoning**: Gemini 3 Pro Preview, GPT-5.2, Claude Opus 4.5
- **Persistent Authentication** - Login once and stay connected
- **Sleek Modern UI** - Clean, responsive design that matches Obsidian's theme
- **Configurable API Endpoint** - Default to api.logically.app with custom override option

## Installation

### Manual Installation

1. Download the latest release from the releases page
2. Extract the files into your vault's `.obsidian/plugins/logically/` folder
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Development Installation

1. Clone this repository into your vault's `.obsidian/plugins/` folder
2. Install dependencies: `pnpm install`
3. Build the plugin: `pnpm build`
4. Reload Obsidian and enable the plugin

## Development

### Prerequisites

- Node.js (v18+)
- pnpm

### Commands

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Development mode with watch
pnpm dev

# Install to your vault (set OBSIDIAN_VAULT env var or pass path)
pnpm dev:install

# Watch mode with auto-install
pnpm dev:watch
```

### Dev Install Script

The `dev:install` script copies the built plugin to your Obsidian vault:

```bash
# Using environment variable
$env:OBSIDIAN_VAULT = 'D:\Documents\Obsidian\MyVault'
pnpm dev:install

# Or pass path as argument
pnpm dev:install -- "D:\Documents\Obsidian\MyVault"
```

Edit `scripts/dev-install.js` to change the default vault path.

## Configuration

After installing, go to Settings → Logically Research Assistant to:

1. **Login** - Enter your Logically credentials
2. **API URL** - Configure custom API endpoint (default: https://api.logically.app)
3. **Show Ribbon** - Toggle the sidebar icon
4. **Default Model** - Select your preferred AI model

## Usage

1. Click the Logically icon in the left ribbon, or use the command palette:
   - `Logically: Open Research Assistant`
   - `Logically: Toggle Research Assistant`
2. Login with your Logically account
3. Select an AI model from the dropdown
4. Start chatting!

## Project Structure

```
src/
├── main.ts                 # Plugin entry point
├── settings.ts             # Settings tab
├── types.ts                # Type definitions
├── services/
│   └── logicallyApi.ts     # API client
├── views/
│   └── researchAssistantView.ts  # Sidebar view
└── ui/
    ├── ResearchAssistantRoot.svelte  # Main component
    ├── ModelSelector.svelte          # Model dropdown
    ├── ChatInput.svelte              # Message input
    ├── MessageList.svelte            # Chat messages
    └── LoginPrompt.svelte            # Login form
```

## License

MIT

## Links

- [Logically](https://logically.app)
- [Obsidian](https://obsidian.md)
