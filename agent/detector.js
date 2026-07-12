'use strict';

const fs = require('fs');
const path = require('path');
const { buildProjectContext } = require('./contextBuilder');

/** Directories that are never independent services */
const IGNORE_DIRS = [
  'node_modules', '.git', 'outputs', '.venv', '__pycache__',
  'dist', 'build', 'out', '.next', '.cache', 'coverage', 'test', 'tests',
  '__tests__', 'scripts', 'docs', 'assets', 'static', 'public', 'vendor'
];

/**
 * Detect project type(s) in a directory and return run configurations.
 * Reads README.md for context, then scans for project markers.
 * @param {string} projectPath - Path to scan
 * @returns {Promise<Array<{type: string, name: string, path: string, installCmd: string, runCmd: string, expectedPort: number, framework: string, readme: string|null}>>}
 */
async function detectProjects(projectPath) {
  const absPath = path.resolve(projectPath);

  // Read README and guide for project context
  const readme = readReadme(absPath);
  const guide = readGuide(absPath);

  // Check root first
  const rootProject = detectSingle(absPath);

  // If root has a runnable server (express, next, vite, etc.), it's the main project.
  // Only scan subdirs if root has NO runnable project (true monorepo).
  if (rootProject) {
    rootProject.readme = readme;
    rootProject.guide = withAutoContext(guide, absPath, rootProject);
    rootProject.guideSource = guide ? 'file' : (rootProject.guide ? 'auto' : null);
    return [rootProject];
  }

  // No root project — scan subdirectories for monorepo services
  const projects = [];
  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORE_DIRS.includes(entry.name.toLowerCase())) continue;
    const subPath = path.join(absPath, entry.name);
    const sub = detectSingle(subPath);
    if (sub && isLikelyService(sub)) {
      sub.readme = readme;
      sub.guide = withAutoContext(guide, subPath, sub);
      sub.guideSource = guide ? 'file' : (sub.guide ? 'auto' : null);
      projects.push(sub);
    }
  }

  return projects;
}

/**
 * Read README.md from a directory if it exists.
 * @param {string} dir
 * @returns {string|null}
 */
function readReadme(dir) {
  const names = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  return null;
}

/**
 * Read the .runsight guide file if it exists.
 * This file tells the agent how to navigate the project.
 * @param {string} dir
 * @returns {string|null}
 */
function readGuide(dir) {
  const names = ['.runsight', '.runsight.md', 'RUNSIGHT.md'];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  return null;
}

/**
 * Merge a hand-written `.runsight` guide (authoritative, if present) with an
 * auto-generated project context (package.json description + detected
 * routes). This is what gives RunSight "understanding" of a project out of
 * the box, without requiring the user to author a guide file first.
 *
 * - If a `.runsight` guide exists, it is used as-is and the auto context is
 *   appended below it as extra background (the guide's explicit instructions
 *   still take priority in the LLM prompt).
 * - If no guide exists, the auto-generated context becomes the guide.
 * - If neither produces anything useful, returns the original (possibly null) guide.
 *
 * @param {string|null} guide
 * @param {string} dir
 * @param {Object} project
 * @returns {string|null}
 */
function withAutoContext(guide, dir, project) {
  let auto = null;
  try {
    auto = buildProjectContext(dir, project);
  } catch { /* best effort — never block a run on this */ }

  if (!auto) return guide;
  if (!guide) return auto.text;
  return `${guide}\n\n${auto.text}`;
}

/**
 * Check if a detected project looks like a runnable service
 * (vs a build tool, test suite, or asset directory).
 */
function isLikelyService(project) {
  // Has a start or dev script → likely a service
  if (project.framework !== 'node') return true;
  try {
    const pkgPath = path.join(project.path, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    return !!(scripts.start || scripts.dev || scripts.serve);
  } catch {
    return true;
  }
}

/**
 * Detect a single project in a directory.
 * @param {string} dir
 * @returns {Object|null}
 */
function detectSingle(dir) {
  const pkgPath = path.join(dir, 'package.json');
  const reqPath = path.join(dir, 'requirements.txt');
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  const indexPath = path.join(dir, 'index.html');

  if (fs.existsSync(pkgPath)) {
    const node = detectNodeProject(dir, pkgPath);
    // A package.json with no start/dev/serve script isn't actually runnable as
    // a Node service (common for demo/static repos that only ship metadata,
    // e.g. description/keywords, alongside plain HTML). Fall back to static
    // serving instead of failing the whole run with `npm start`.
    if (!hasRunnableScript(node) && fs.existsSync(indexPath)) return detectStaticProject(dir);
    return node;
  }
  if (fs.existsSync(reqPath)) return detectPythonProject(dir, reqPath);
  if (fs.existsSync(pyprojectPath)) return detectPythonProject(dir, null);
  // Only treat as static if there's no package.json in parent (avoids public/ dirs)
  if (fs.existsSync(indexPath)) return detectStaticProject(dir);
  return null;
}

/** Whether a detected Node project has an actual start/dev/serve script to run. */
function hasRunnableScript(project) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(project.path, 'package.json'), 'utf8'));
    const scripts = pkg.scripts || {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    // Known frameworks are runnable even without an explicit script (e.g. `npx next dev`).
    if (['nextjs', 'vite', 'cra', 'nuxt'].includes(project.framework)) return true;
    return !!(scripts.start || scripts.dev || scripts.serve || deps['express']);
  } catch {
    return false;
  }
}

function detectNodeProject(dir, pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts || {};

  let framework = 'node';
  let expectedPort = 3000;
  let runCmd = 'npm start';

  if (deps['next']) {
    framework = 'nextjs';
    expectedPort = 3000;
    runCmd = scripts.dev ? 'npm run dev' : 'npx next dev';
  } else if (deps['vite'] || deps['@vitejs/plugin-react']) {
    framework = 'vite';
    expectedPort = 5173;
    runCmd = scripts.dev ? 'npm run dev' : 'npx vite';
  } else if (deps['react-scripts']) {
    framework = 'cra';
    expectedPort = 3000;
    runCmd = 'npm start';
  } else if (deps['express']) {
    framework = 'express';
    expectedPort = 3000;
    runCmd = scripts.dev ? 'npm run dev' : (scripts.start ? 'npm start' : 'node index.js');
  } else if (deps['nuxt']) {
    framework = 'nuxt';
    expectedPort = 3000;
    runCmd = scripts.dev ? 'npm run dev' : 'npx nuxt dev';
  } else if (scripts.dev) {
    runCmd = 'npm run dev';
  } else if (scripts.start) {
    runCmd = 'npm start';
  }

  return {
    type: 'nodejs',
    name: pkg.name || path.basename(dir),
    path: dir,
    installCmd: 'npm install',
    runCmd,
    expectedPort,
    framework
  };
}

function detectPythonProject(dir, reqPath) {
  let framework = 'python';
  let expectedPort = 8000;
  let runCmd = 'python app.py';
  let installCmd = reqPath
    ? 'pip install -r requirements.txt'
    : 'pip install .';

  if (reqPath && fs.existsSync(reqPath)) {
    const reqs = fs.readFileSync(reqPath, 'utf8').toLowerCase();
    if (reqs.includes('django')) {
      framework = 'django';
      expectedPort = 8000;
      runCmd = 'python manage.py runserver';
    } else if (reqs.includes('fastapi') || reqs.includes('uvicorn')) {
      framework = 'fastapi';
      expectedPort = 8000;
      runCmd = 'uvicorn app.main:app --reload --port 8000';
    } else if (reqs.includes('flask')) {
      framework = 'flask';
      expectedPort = 5000;
      runCmd = 'flask run';
    }
  }

  if (fs.existsSync(path.join(dir, 'manage.py'))) {
    framework = 'django';
    runCmd = 'python manage.py runserver';
  }

  return {
    type: 'python',
    name: path.basename(dir),
    path: dir,
    installCmd,
    runCmd,
    expectedPort,
    framework
  };
}

function detectStaticProject(dir) {
  return {
    type: 'static',
    name: path.basename(dir),
    path: dir,
    installCmd: null,
    runCmd: 'npx serve .',
    expectedPort: 3000,
    framework: 'static'
  };
}

module.exports = { detectProjects, readReadme, readGuide };
