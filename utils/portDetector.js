'use strict';

const net = require('net');
const { execSync } = require('child_process');

/** Regex patterns for common dev server port output */
const PORT_PATTERNS = [
  /https?:\/\/localhost:(\d+)/i,
  /https?:\/\/127\.0\.0\.1:(\d+)/i,
  /https?:\/\/0\.0\.0\.0:(\d+)/i,
  /https?:\/\/\[::1?\]:(\d+)/i,
  /(?:listening|running|started|ready)\s+(?:on|at)\s+(?:port\s+)?:?(\d{4,5})/i,
  /port\s+(\d{4,5})/i
];

/**
 * Parse a port number from dev server stdout/stderr text.
 * @param {string} text
 * @returns {number|null}
 */
function parsePortFromOutput(text) {
  for (const pattern of PORT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) return port;
    }
  }
  return null;
}

/**
 * Check if a port is currently in use.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Kill whatever process is using a port.
 * @param {number} port
 * @returns {boolean} true if a process was killed
 */
function killPortProcess(port) {
  try {
    const result = execSync(`lsof -t -i:${port} 2>/dev/null`).toString().trim();
    if (result) {
      const pids = result.split('\n').filter(Boolean);
      for (const pid of pids) {
        try { execSync(`kill -9 ${pid} 2>/dev/null`); } catch { /* already dead */ }
      }
      return true;
    }
  } catch { /* lsof not found or no process */ }

  // Fallback: try fuser (common on Linux)
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null`);
    return true;
  } catch { /* no process or fuser not available */ }

  return false;
}

/**
 * Ensure a port is free — kill existing process if occupied.
 * @param {number} port
 * @returns {Promise<void>}
 */
async function ensurePortFree(port) {
  const inUse = await isPortInUse(port);
  if (inUse) {
    const killed = killPortProcess(port);
    if (killed) {
      // Wait a moment for the port to be released
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

/**
 * Wait for a TCP port to accept connections.
 * @param {number} port
 * @param {Object} [opts]
 * @param {number} [opts.timeout=30000]
 * @param {number} [opts.interval=500]
 * @param {string} [opts.host='127.0.0.1']
 * @returns {Promise<void>}
 */
function waitForPort(port, { timeout = 30000, interval = 500, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(`Port ${port} not ready after ${timeout}ms`));
      }
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

module.exports = { parsePortFromOutput, waitForPort, isPortInUse, killPortProcess, ensurePortFree };
