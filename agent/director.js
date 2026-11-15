'use strict';

/**
 * Director — the on-camera presentation layer.
 *
 * Playwright recordings show no mouse pointer and perform every action
 * instantly, which reads as a glitchy screen capture rather than a demo.
 * This module makes the recording watchable: a visible cursor that glides to
 * its target, a click ripple, smooth scrolling, title cards, and pacing that
 * gives the viewer time to read.
 */

/**
 * Runs inside every page (via addInitScript). Draws a fake cursor that follows
 * real mouse events, and a ripple on mousedown. Built with DOM APIs only (no
 * innerHTML / <style>) so strict CSP and Trusted Types pages still work.
 */
function cursorInit() {
  if (window.top !== window || window.__rsCursor) return;
  window.__rsCursor = true;

  const mount = () => {
    const NS = 'http://www.w3.org/2000/svg';
    const cursor = document.createElement('div');
    cursor.id = '__rs_cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;' +
      'pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '30');
    svg.setAttribute('height', '30');
    const arrow = document.createElementNS(NS, 'path');
    arrow.setAttribute('d', 'M3 2 L3 20 L8 15.5 L11.2 22.5 L14 21.2 L10.9 14.4 L17.5 14.4 Z');
    arrow.setAttribute('fill', '#111');
    arrow.setAttribute('stroke', '#fff');
    arrow.setAttribute('stroke-width', '1.4');
    arrow.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(arrow);
    cursor.appendChild(svg);

    // Resume where the pointer was on the previous page so it doesn't teleport.
    let x = window.innerWidth * 0.5;
    let y = window.innerHeight * 0.6;
    try {
      const saved = (sessionStorage.getItem('__rs_cursor') || '').split(',').map(Number);
      if (saved.length === 2 && saved.every(Number.isFinite)) [x, y] = saved;
    } catch { /* storage blocked — start from the default position */ }

    const place = () => { cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`; };
    place();
    document.documentElement.appendChild(cursor);
    // Enable the glide only after the first paint, so the initial placement is instant.
    requestAnimationFrame(() => { cursor.style.transition = 'transform .55s cubic-bezier(.22,.8,.3,1)'; });

    window.addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY;
      place();
      try { sessionStorage.setItem('__rs_cursor', `${x},${y}`); } catch { /* storage blocked */ }
    }, true);

    window.addEventListener('mousedown', (e) => {
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:50%;z-index:2147483646;' +
        'pointer-events:none;background:rgba(99,91,255,.35);border:2px solid rgba(99,91,255,.9);' +
        `left:${e.clientX - 22}px;top:${e.clientY - 22}px`;
      document.documentElement.appendChild(ring);
      const anim = ring.animate(
        [{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.9)', opacity: 0 }],
        { duration: 520, easing: 'ease-out' }
      );
      anim.onfinish = () => ring.remove();
    }, true);
  };

  if (document.documentElement && document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

/**
 * Make the mouse pointer visible in every page of a browser context.
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<void>}
 */
async function installCursor(context) {
  await context.addInitScript(cursorInit);
}

/**
 * Bring an element into view with a smooth scroll and glide the cursor onto it.
 * Purely cosmetic: if it fails the caller still performs the real action, so
 * failures are reported as `null` rather than thrown.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 * @returns {Promise<{x: number, y: number}|null>} viewport point the cursor landed on
 */
async function pointAt(page, locator) {
  try {
    const scrolled = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 90 || r.bottom > window.innerHeight - 90;
      if (offscreen) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return offscreen;
    }, null, { timeout: 3000 });
    if (scrolled) await page.waitForTimeout(800);

    const box = await locator.boundingBox({ timeout: 3000 });
    if (!box) return null;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(650); // let the cursor finish its glide before acting
    return point;
  } catch {
    return null;
  }
}

/** Escape text for safe inclusion in card HTML. */
function esc(text) {
  return String(text || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Show a full-screen title card (intro / outro) in the recorded page.
 * @param {import('playwright').Page} page
 * @param {{title: string, subtitle?: string, footer?: string}} card
 * @param {number} ms - how long to hold the card on screen
 * @returns {Promise<void>}
 */
async function showCard(page, card, ms) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
      background:radial-gradient(800px 480px at 50% 35%,#252c5c 0%,#0b1020 70%);color:#fff;
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}
    h1{font-size:76px;line-height:1.05;margin:0 60px;font-weight:800;letter-spacing:-1.5px;animation:up .7s ease-out both}
    p{font-size:27px;line-height:1.4;max-width:900px;margin:24px 60px 0;color:#b9c4e6;animation:up .7s .15s ease-out both}
    small{position:fixed;bottom:36px;font-size:16px;color:#6f7ca8;letter-spacing:.5px}
    #__rs_cursor{display:none}
    @keyframes up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  </style></head><body><h1>${esc(card.title)}</h1>${card.subtitle ? `<p>${esc(card.subtitle)}</p>` : ''}
  ${card.footer ? `<small>${esc(card.footer)}</small>` : ''}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(ms);
}

/**
 * How long a line should stay on screen: long enough to be read as a caption
 * and to be spoken as narration.
 * ponytail: estimate (~2.4 words/s), not measured from the synthesized audio —
 * measure clip durations if narration ever overlaps the next step.
 * @param {string} text
 * @returns {number} milliseconds
 */
function holdMs(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1500, Math.round((words / 2.4) * 1000) + 500);
}

module.exports = { installCursor, pointAt, showCard, holdMs };
