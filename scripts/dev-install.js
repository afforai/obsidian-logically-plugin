#!/usr/bin/env node
/**
 * dev-install.js
 * Copies built plugin files into an Obsidian vault's .obsidian/plugins/<plugin-id> folder for testing.
 *
 * Usage:
 *   OBSIDIAN_VAULT="E:\\path\\to\\vault" npm run dev:install
 *   or
 *   npm run dev:install -- "E:\\path\\to\\vault"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function exitWithMsg(msg) {
	console.error(msg);
	process.exit(1);
}

function fileExists(p) {
	try {
		fs.accessSync(p);
		return true;
	} catch {
		return false;
	}
}

// Default vault path - UPDATE THIS to your vault path
const DEFAULT_VAULT = "D:\\Documents\\Obsidian\\Shirayuki";
const vaultArg = process.argv[2] || process.env.OBSIDIAN_VAULT || DEFAULT_VAULT;

if (!vaultArg) {
	exitWithMsg(
		"\nERROR: No vault path provided. Set OBSIDIAN_VAULT env var or pass a path as an argument.\n\n" +
			"Usage:\n" +
			'  OBSIDIAN_VAULT="E:\\\\path\\\\to\\\\vault" npm run dev:install\n' +
			"  or\n" +
			'  npm run dev:install -- "E:\\path\\to\\vault"\n'
	);
}

if (!process.argv[2] && !process.env.OBSIDIAN_VAULT) {
	console.log(`No vault path specified. Using default: ${DEFAULT_VAULT}`);
}

const vaultPath = path.resolve(vaultArg);
if (!fileExists(vaultPath))
	exitWithMsg(`Vault path does not exist: ${vaultPath}`);

const pluginRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(pluginRoot, "manifest.json");
if (!fileExists(manifestPath))
	exitWithMsg(`manifest.json not found in project root: ${manifestPath}`);

let manifest;
try {
	manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
	exitWithMsg("Failed to parse manifest.json: " + e.message);
}

if (!manifest.id) exitWithMsg("manifest.json is missing `id` field");

const destDir = path.join(vaultPath, ".obsidian", "plugins", manifest.id);

console.log(`Installing plugin "${manifest.id}" to ${destDir}`);

try {
	fs.mkdirSync(destDir, { recursive: true });
} catch (e) {
	exitWithMsg(`Failed to create plugin directory: ${e.message}`);
}

const filesToCopy = ["manifest.json", "main.js", "styles.css"];
let copied = 0;

filesToCopy.forEach((file) => {
	const src = path.join(pluginRoot, file);
	if (fileExists(src)) {
		const dest = path.join(destDir, path.basename(file));
		fs.copyFileSync(src, dest);
		console.log("Copied", file, "→", dest);
		copied++;
	}
});

if (copied === 0)
	exitWithMsg("No build artifacts found to install. Run `pnpm build` first.");

console.log(`\n✓ Dev install completed successfully (${copied} files copied)`);
