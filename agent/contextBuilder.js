'use strict';

const fs = require('fs');
const path = require('path');

/** Directories skipped while scanning for route/page hints. */
const SCAN_IGNORE = new Set([
  'node_modules', '.git', 'outputs', '.venv', '__pycache__', 'dist', 'build',
  'out', '.next', '.cache', 'coverage', 'test', 'tests', '__tests__', 'vendor'
]);

/** Max files inspected while scanning for routes — keeps this fast on huge repos. */
const MAX_SCAN_FILES = 400;

/**
 * Auto-generate a lightweight project context when no hand-written `.runsight`
 * guide exists. This is the "the tool understands your app on its own" layer:
 * it reads package.json metadata and infers routes/pages from common framework
 * directory conventions, then formats it the same way a `.runsight` guide
 * would be — so it can be fed straight into the LLM prompt and into the
 * heuristic destination guesser.
 *
 * This is intentionally best-effort and cheap (no AST parsing, no LLM call):
 * it should add signal, never block or slow down a run.
 *
 * @param {string} projectPath - Absolute path to the project root
 * @param {Object} [project] - Detected project info from detector.js (framework, name)
 * @returns {{ text: string, routes: string[], description: string|null } | null}
 */
function buildProjectContext(projectPath, project = {}) {
  const pkg = readPackageJson(projectPath);
  const description = (pkg && pkg.description) || null;
  const keywords = (pkg && Array.isArray(pkg.keywords)) ? pkg.keywords.slice(0, 8) : [];
  const routes = detectRoutes(projectPath, project.framework);

  if (!description && !keywords.length && !routes.length) return null;

  const lines = [];
  lines.push('# Auto-detected Project Context');
  lines.push('(Generated automatically from package.json and file structure — no .runsight file was found.)');
  lines.push('');

  if (description) {
    lines.push(`## What this project is`);
    lines.push(description);
    lines.push('');
  }
  if (keywords.length) {
    lines.push(`## Keywords`);
    lines.push(keywords.join(', '));
    lines.push('');
  }
  if (routes.length) {
    lines.push('## Detected pages/routes');
    for (const r of routes) lines.push(`- ${r}`);
    lines.push('');
  }

  return { text: lines.join('\n'), routes, description };
}

function readPackageJson(projectPath) {
  try {
    const p = path.join(projectPath, 'package.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Infer route/page paths from common framework directory conventions.
 * Best-effort, no external deps. Supports Next.js (pages/app router),
 * plain React/Vue "views" or "pages" dirs, and static multi-page sites.
 * @param {string} projectPath
 * @param {string} [framework]
 * @returns {string[]}
 */
function detectRoutes(projectPath, framework) {
  const routes = new Set();

  // Next.js — pages/ router (file-based).
  scanDirForRoutes(path.join(projectPath, 'pages'), routes, { stripExt: true, indexIsRoot: true });
  // Next.js — app/ router (folder-based, page.js/tsx marks a route).
  scanAppRouter(path.join(projectPath, 'app'), routes, '');
  // Common "src/pages" or "src/views" layout (Vite/Vue/CRA conventions).
  scanDirForRoutes(path.join(projectPath, 'src', 'pages'), routes, { stripExt: true, indexIsRoot: true });
  scanDirForRoutes(path.join(projectPath, 'src', 'views'), routes, { stripExt: true, indexIsRoot: true });
  // Static multi-page sites — top-level *.html files.
  scanHtmlFiles(projectPath, routes);

  return Array.from(routes).slice(0, 20);
}

function scanDirForRoutes(dir, routes, { stripExt, indexIsRoot }) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (SCAN_IGNORE.has(entry.name.toLowerCase())) continue;
      scanDirForRoutes(path.join(dir, entry.name), routes, { stripExt, indexIsRoot });
      continue;
    }
    if (!/\.(jsx?|tsx?|vue)$/.test(entry.name)) continue;
    if (/\.(test|spec)\./.test(entry.name)) continue;

    let name = stripExt ? entry.name.replace(/\.(jsx?|tsx?|vue)$/, '') : entry.name;
    if (indexIsRoot && /^index$/i.test(name)) name = '';
    if (name === '_app' || name === '_document') continue;

    const routePath = '/' + name;
    routes.add(routePath === '/' ? '/ (home)' : routePath);
  }
}

function scanAppRouter(dir, routes, routePrefix) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  const hasPage = entries.some(e => e.isFile() && /^page\.(jsx?|tsx?)$/.test(e.name));
  if (hasPage) routes.add(routePrefix || '/ (home)');

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (SCAN_IGNORE.has(entry.name.toLowerCase())) continue;
    // Route groups like (marketing) don't add a path segment.
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    scanAppRouter(path.join(dir, entry.name), routes, `${routePrefix}${segment}`);
  }
}

function scanHtmlFiles(projectPath, routes) {
  let entries;
  try { entries = fs.readdirSync(projectPath, { withFileTypes: true }); } catch { return; }
  let scanned = 0;
  for (const entry of entries) {
    if (scanned >= MAX_SCAN_FILES) break;
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    scanned++;
    const name = entry.name.replace(/\.html$/, '');
    routes.add(name === 'index' ? '/ (home)' : `/${name}`);
  }
}

module.exports = { buildProjectContext };
