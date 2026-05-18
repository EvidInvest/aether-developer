#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Aether MCP marketplace updater — mirrors EvidInvest's pattern.
 *
 * CANONICAL LIST OF MARKETPLACES we publish @evidinvest/aether-mcp to:
 *
 *   1. Smithery
 *      File:  mcp/smithery.yaml
 *      Note:  Smithery pulls description/version from GitHub + this file.
 *
 *   2. NPM
 *      Package: @evidinvest/aether-mcp
 *      File:    mcp/package.json
 *      Action:  bumps version + description; with --publish runs `npm publish`.
 *
 *   3. MCP official registry (registry.modelcontextprotocol.io)
 *      File:    mcp/server.json
 *      Action:  updates version + description + npm package version.
 *
 *   4. Claude plugin (anthropic.com/claude/plugins)
 *      File:    mcp/claude-plugin.json
 *      Action:  updates version + description.
 *
 * Source of truth: scripts/marketplace-config.json
 *
 * Usage (Node 22+ runs TypeScript natively via --experimental-strip-types):
 *   node --experimental-strip-types scripts/update-marketplaces.ts            # dry-run
 *   node --experimental-strip-types scripts/update-marketplaces.ts --publish  # runs `npm publish`
 *
 * Or with tsx:
 *   npx tsx scripts/update-marketplaces.ts [--publish]
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MCP_DIR = resolve(REPO_ROOT, "mcp");

const PUBLISH = process.argv.includes("--publish");

type Config = {
  version: string;
  toolCount: number;
  name: string;
  shortDescription: string;
  longDescription: string;
  homepage: string;
  repository: string;
};

type StatusRow = {
  marketplace: string;
  file: string;
  status: "updated" | "skipped" | "missing" | "failed";
  detail: string;
};

const results: StatusRow[] = [];

function loadConfig(): Config {
  const cfgPath = join(REPO_ROOT, "scripts", "marketplace-config.json");
  if (!existsSync(cfgPath)) {
    throw new Error(`Marketplace config not found: ${cfgPath}`);
  }
  return JSON.parse(readFileSync(cfgPath, "utf8")) as Config;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, obj: unknown): void {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function shortPath(p: string): string {
  return p.replace(process.env.HOME ?? "", "~");
}

// ── 1. Smithery ─────────────────────────────────────────────────────────────
function updateSmithery(_cfg: Config): void {
  const file = join(MCP_DIR, "smithery.yaml");
  if (!existsSync(file)) {
    results.push({
      marketplace: "Smithery",
      file: shortPath(file),
      status: "missing",
      detail: "smithery.yaml not found",
    });
    return;
  }
  results.push({
    marketplace: "Smithery",
    file: shortPath(file),
    status: "skipped",
    detail: "Smithery reads metadata from GitHub; smithery.yaml unchanged",
  });
}

// ── 2. NPM (@evidinvest/aether-mcp) ─────────────────────────────────────────
function updateNpm(cfg: Config): { pkgPath: string; pkgDir: string } {
  const pkgDir = MCP_DIR;
  const pkgPath = join(pkgDir, "package.json");
  if (!existsSync(pkgPath)) {
    results.push({
      marketplace: "NPM",
      file: shortPath(pkgPath),
      status: "missing",
      detail: "mcp/package.json not found",
    });
    return { pkgPath, pkgDir };
  }
  const pkg = readJson<Record<string, unknown>>(pkgPath);
  const before = pkg.version;
  pkg.version = cfg.version;
  pkg.description = cfg.longDescription;
  if (typeof pkg.homepage !== "undefined") pkg.homepage = cfg.homepage;
  writeJson(pkgPath, pkg);
  results.push({
    marketplace: "NPM",
    file: shortPath(pkgPath),
    status: "updated",
    detail: `version ${before} → ${cfg.version}`,
  });
  return { pkgPath, pkgDir };
}

function publishNpm(pkgDir: string): void {
  if (!PUBLISH) {
    results.push({
      marketplace: "NPM (publish)",
      file: pkgDir,
      status: "skipped",
      detail: "dry-run; pass --publish to run `npm publish`",
    });
    return;
  }
  try {
    // Build first so dist/ is fresh (prepublishOnly script also runs build).
    execSync("npm run build", { cwd: pkgDir, stdio: "inherit" });
    execSync("npm publish --access public", { cwd: pkgDir, stdio: "inherit" });
    results.push({
      marketplace: "NPM (publish)",
      file: pkgDir,
      status: "updated",
      detail: "npm publish succeeded",
    });
  } catch (err) {
    results.push({
      marketplace: "NPM (publish)",
      file: pkgDir,
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── 3. MCP official registry ────────────────────────────────────────────────
function updateMcpRegistry(cfg: Config): void {
  const file = join(MCP_DIR, "server.json");
  if (!existsSync(file)) {
    results.push({
      marketplace: "MCP official registry",
      file: shortPath(file),
      status: "missing",
      detail: "server.json not found",
    });
    return;
  }
  type ServerJson = {
    version?: string;
    description?: string;
    packages?: Array<{ identifier?: string; version?: string }>;
    [k: string]: unknown;
  };
  const server = readJson<ServerJson>(file);
  const before = server.version;
  server.version = cfg.version;
  server.description = cfg.shortDescription;
  if (Array.isArray(server.packages)) {
    for (const p of server.packages) {
      if (p.identifier === "@evidinvest/aether-mcp") p.version = cfg.version;
    }
  }
  writeJson(file, server);
  results.push({
    marketplace: "MCP official registry",
    file: shortPath(file),
    status: "updated",
    detail: `version ${before} → ${cfg.version}`,
  });
}

// ── 4. Claude plugin ────────────────────────────────────────────────────────
function updateClaudePlugin(cfg: Config): void {
  const file = join(MCP_DIR, "claude-plugin.json");
  if (!existsSync(file)) {
    results.push({
      marketplace: "Claude plugin",
      file: shortPath(file),
      status: "missing",
      detail: "claude-plugin.json not found",
    });
    return;
  }
  const plugin = readJson<Record<string, unknown>>(file);
  const before = plugin.version;
  plugin.version = cfg.version;
  plugin.description = cfg.longDescription;
  writeJson(file, plugin);
  results.push({
    marketplace: "Claude plugin",
    file: shortPath(file),
    status: "updated",
    detail: `version ${before} → ${cfg.version}`,
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
function printChecklist(cfg: Config): void {
  console.log("");
  console.log(`Aether MCP — marketplace sync (v${cfg.version}, ${cfg.toolCount} tools)`);
  console.log("=".repeat(72));
  for (const r of results) {
    const icon =
      r.status === "updated" ? "[OK]"
      : r.status === "skipped" ? "[--]"
      : r.status === "missing" ? "[??]"
      : "[!!]";
    console.log(`${icon} ${r.marketplace.padEnd(25)} ${r.detail}`);
    console.log(`     ${r.file}`);
  }
  console.log("");
  const failed = results.filter((r) => r.status === "failed").length;
  const missing = results.filter((r) => r.status === "missing").length;
  if (failed > 0) {
    console.log(`${failed} marketplace(s) failed. See messages above.`);
    process.exit(1);
  }
  if (missing > 0) {
    console.log(`${missing} marketplace file(s) missing — verify paths.`);
  }
  if (!PUBLISH) {
    console.log("Dry-run only. Re-run with --publish to push the npm package.");
  }
}

function main(): void {
  const cfg = loadConfig();
  updateSmithery(cfg);
  const { pkgDir } = updateNpm(cfg);
  updateMcpRegistry(cfg);
  updateClaudePlugin(cfg);
  publishNpm(pkgDir);
  printChecklist(cfg);
}

main();
