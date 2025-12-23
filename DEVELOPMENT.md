# Developer Notes (Obsidian Logically Plugin)

This file is for contributors. For end-user install/setup/usage, see README.

## Prerequisites

- Node.js 18+
- pnpm (recommended via Corepack)

## Commands

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Development mode (watch)
pnpm dev

# Install to your vault (set OBSIDIAN_VAULT env var or pass path)
pnpm dev:install

# Watch mode with auto-install
pnpm dev:watch
```

## Dev install script

The `dev:install` script copies the built plugin into your vault’s plugin folder.

```powershell
# Using environment variable
$env:OBSIDIAN_VAULT = 'D:\Documents\Obsidian\MyVault'
pnpm dev:install

# Or pass path as argument
pnpm dev:install -- "D:\Documents\Obsidian\MyVault"
```

If you need to change the default vault path, edit `scripts/dev-install.js`.

## Releases

Releases are automated via GitHub Actions when a tag is pushed.

- Update versions:

```bash
pnpm run version
```

- Create and push a tag that exactly matches `manifest.json.version` (no leading `v`).

```bash
git tag 1.0.1
git push origin 1.0.1
```

The workflow creates a draft GitHub release and uploads:

- `main.js`
- `manifest.json`
- `styles.css`
- `obsidian-logically-plugin-<tag>.zip`

## CI

- Lint/build: `pnpm install --frozen-lockfile`, then `pnpm run build` and `pnpm run lint`.
- Release: same pnpm install/build steps, then packages and uploads release assets.
