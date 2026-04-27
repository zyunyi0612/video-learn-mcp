#!/usr/bin/env node
/**
 * Install script for video-learn plugin
 * Ensures node_modules are installed for the MCP server.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

function resolveRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const root = process.env.CLAUDE_PLUGIN_ROOT;
    if (existsSync(join(root, 'package.json'))) return root;
  }
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const candidate = dirname(scriptDir);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  } catch {}
  return join(homedir(), '.claude', 'plugins', 'cache', 'video-learn-mcp', 'video-learn', '1.2.2');
}

const ROOT = resolveRoot();
const MARKER = join(ROOT, '.install-version');

function getInstalledVersion() {
  try { return readFileSync(MARKER, 'utf-8').trim(); } catch { return ''; }
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '';
  } catch { return ''; }
}

if (getInstalledVersion() === getPackageVersion() && existsSync(join(ROOT, 'node_modules'))) {
  process.exit(0);
}

console.error('📦 Installing video-learn dependencies...');
try {
  execSync('npm install', { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
  writeFileSync(MARKER, getPackageVersion());
  console.error('✅ Dependencies installed');
} catch (e) {
  console.error('❌ Failed to install dependencies:', e.message);
  process.exit(1);
}
