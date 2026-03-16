import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Build-time defines from esbuild
        __LOGICALLY_DEV__: "readonly",
        // Node.js globals used in Electron/Obsidian context
        Buffer: "readonly",
        NodeJS: "readonly",
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "manifest.json",
            "scripts/dev-install.js",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  globalIgnores([
    "node_modules",
    "dist",
    "esbuild.config.mjs",
    "eslint.config.js",
    "version-bump.mjs",
    "versions.json",
    "main.js",
    "scripts/",
  ]),
  // Project-specific rule overrides
  {
    rules: {
      // Allow Node.js imports for Obsidian (Electron) context - needed for CORS bypass
      "import/no-nodejs-modules": "off",
      // Allow console.log during development - we use it sparingly for plugin lifecycle
      "no-console": ["warn", { allow: ["warn", "error", "debug", "log"] }],
      "obsidianmd/ui/sentence-case": "off", // Allow sentence case in UI text for better readability
    },
  },
  // Prettier config must be last to override formatting rules
  eslintConfigPrettier,
);
