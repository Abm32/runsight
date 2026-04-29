'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { parsePortFromOutput, waitForPort, ensurePortFree } = require('../utils/portDetector');

/**
 * Install dependencies and start dev servers for detected projects.
 * @param {Array} projects - From detectProjects()
 * @param {import('../utils/logger').Logger} logger
 * @returns {Promise<Array<{process: ChildProcess, url: string, type: string, framework: string}>>}
 */
async function runProjects(projects, logger) {
  const running = [];

  for (const project of projects) {
    try {
      logger.info(`Setting up ${project.name} (${project.framework})`);

      // Install dependencies
      if (project.installCmd) {
        logger.info(`Installing: ${project.installCmd}`);
        await runCommand(project.installCmd, project.path, 120000, logger);
      }

      // Start dev server (with EADDRINUSE retry)
      logger.info(`Starting: ${project.runCmd}`);
      await ensurePortFree(project.expectedPort);
      let serverResult;
      try {
        serverResult = await startServer(project, logger);
      } catch (firstErr) {
        // If EADDRINUSE, parse the port, kill it, retry once
        const busyPort = parseEADDRINUSE(firstErr.processOutput || firstErr.message);
        if (busyPort) {
          logger.info(`Port ${busyPort} in use — killing and retrying...`);
          await ensurePortFree(busyPort);
          serverResult = await startServer(project, logger);
        } else {
          throw firstErr;
        }
      }
      const { proc, port } = serverResult;
      const url = `http://localhost:${port}`;
      logger.info(`${project.name} ready at ${url}`);

      running.push({
        process: proc,
        url,
        type: project.type,
        framework: project.framework,
        name: project.name
      });
    } catch (err) {
      logger.error(`Failed to start ${project.name}: ${err.message} — skipping`);
      // Save detailed error log to outputs
      saveErrorLog(project, err);
    }
  }

  return running;
}

/**
 * Parse port number from EADDRINUSE error output.
 * @param {string} text
 * @returns {number|null}
 */
function parseEADDRINUSE(text) {
  const match = text.match(/EADDRINUSE[^]*?port[:\s]+(\d+)/i)
    || text.match(/address already in use[^]*?:(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Save detailed error output to <projectPath>/outputs/error-<name>.log
 */
function saveErrorLog(project, err) {
  try {
    const outDir = path.join(project.path, 'outputs');
    fs.mkdirSync(outDir, { recursive: true });
    const logPath = path.join(outDir, `error-${project.name}.log`);
    const content = [
      `RunSight Error Log — ${new Date().toISOString()}`,
      `Project: ${project.name} (${project.framework})`,
      `Path: ${project.path}`,
      `Install command: ${project.installCmd || 'none'}`,
      `Run command: ${project.runCmd}`,
      `Expected port: ${project.expectedPort}`,
      '',
      '--- Error ---',
      err.message,
      '',
      '--- Process Output ---',
      err.processOutput || '(no output captured)',
    ].join('\n');
    fs.writeFileSync(logPath, content);
    console.error(`  📄 Error details saved to ${logPath}`);
  } catch { /* best effort */ }
}

/**
 * Run a command and wait for it to complete.
 */
function runCommand(cmd, cwd, timeout = 120000, logger) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = cmd.split(' ');
    const proc = spawn(bin, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      const err = new Error(`Command timed out after ${timeout}ms: ${cmd}`);
      err.processOutput = output;
      reject(err);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const err = new Error(`Command failed with code ${code}: ${cmd}`);
        err.processOutput = output;
        reject(err);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      err.processOutput = output;
      reject(err);
    });
  });
}

/**
 * Start a dev server and detect its port.
 */
function startServer(project, logger) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = project.runCmd.split(' ');
    const proc = spawn(bin, args, { cwd: project.path, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        waitForPort(project.expectedPort, { timeout: 10000 })
          .then(() => resolve({ proc, port: project.expectedPort }))
          .catch(() => {
            proc.kill('SIGTERM');
            const err = new Error(`Server did not start: ${project.runCmd}`);
            err.processOutput = output;
            reject(err);
          });
      }
    }, 15000);

    function checkOutput(data) {
      const text = data.toString();
      output += text;
      if (resolved) return;
      const port = parsePortFromOutput(text);
      if (port) {
        resolved = true;
        clearTimeout(timeout);
        waitForPort(port, { timeout: 10000 })
          .then(() => resolve({ proc, port }))
          .catch(() => {
            const err = new Error(`Port ${port} detected but not connectable`);
            err.processOutput = output;
            reject(err);
          });
      }
    }

    proc.stdout.on('data', checkOutput);
    proc.stderr.on('data', checkOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        err.processOutput = output;
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const err = new Error(`Server exited with code ${code}: ${project.runCmd}`);
        err.processOutput = output;
        reject(err);
      }
    });
  });
}

/**
 * Kill all running server processes.
 * @param {Array<{process: ChildProcess}>} running
 */
function killAll(running) {
  for (const r of running) {
    if (r.process && !r.process.killed) {
      r.process.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        if (!r.process.killed) r.process.kill('SIGKILL');
      }, 5000);
    }
  }
}

/**
 * Identify the frontend service from running services.
 * Prefers static > nodejs > python.
 */
function identifyFrontend(running) {
  return running.find(r => r.type === 'static')
    || running.find(r => r.type === 'nodejs')
    || running[0]
    || null;
}

module.exports = { runProjects, killAll, identifyFrontend };
