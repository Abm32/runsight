'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detect project type(s) in a directory and return run configurations.
 * Scans root and immediate subdirectories for markers.
 * @param {string} projectPath - Path to scan
 * @returns {Promise<Array<{type: string, name: string, path: string, installCmd: string, runCmd: string, expectedPort: number, framework: string}>>}
 */
async function detectProjects(projectPath) {
  const absPath = path.resolve(projectPath);
  const projects = [];

  // Scan root
  const rootProject = detectSingle(absPath);
  if (rootProject) projects.push(rootProject);

  // Scan immediate subdirectories for monorepo/multi-service
  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (['node_modules', '.git', 'outputs', '.venv', '__pycache__'].includes(entry.name)) continue;
    const subPath = path.join(absPath, entry.name);
    const sub = detectSingle(subPath);
    if (sub) projects.push(sub);
  }

  return projects;
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

  if (fs.existsSync(pkgPath)) return detectNodeProject(dir, pkgPath);
  if (fs.existsSync(reqPath)) return detectPythonProject(dir, reqPath);
  if (fs.existsSync(pyprojectPath)) return detectPythonProject(dir, null);
  if (fs.existsSync(indexPath)) return detectStaticProject(dir);
  return null;
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

  // Read requirements to detect framework
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

  // Check for manage.py (Django)
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

module.exports = { detectProjects };
