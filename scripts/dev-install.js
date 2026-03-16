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

// Load .env from project root if it exists
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      const val = rest.join("=").replace(/^["']|["']$/g, "").trim();
      if (key && !(key.trim() in process.env)) process.env[key.trim()] = val;
    });
}

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

const vaultArg = process.argv[2] || process.env.OBSIDIAN_VAULT;

if (!vaultArg) {
  exitWithMsg(
    "\nERROR: No vault path provided. Set OBSIDIAN_VAULT env var or pass a path as an argument.\n\n" +
      "Usage:\n" +
      '  OBSIDIAN_VAULT="E:\\\\path\\\\to\\\\vault" pnpm dev:install\n' +
      "  or\n" +
      '  pnpm dev:install -- "E:\\path\\to\\vault"\n',
  );
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
