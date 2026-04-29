'use strict';

const SELECTORS = 'a[href], button, [role="button"], input, textarea, select, [onclick]';

const DUMMY_DATA = {
  email: 'test@example.com',
  password: 'Password123!',
  text: 'Test User',
  search: 'test query',
  tel: '5551234567',
  url: 'https://example.com',
  number: '42'
};

/**
 * Find all interactable elements on the page.
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<{selector: string, tagName: string, text: string, type: string, href: string|null, boundingBox: Object, inputType: string|null}>>}
 */
async function findInteractableElements(page) {
  const raw = await page.evaluate((sel) => {
    const els = Array.from(document.querySelectorAll(sel));
    return els.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        index: i,
        tagName: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 100),
        type: el.getAttribute('type') || '',
        href: el.getAttribute('href') || null,
        inputType: el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text') : null,
        name: el.getAttribute('name') || '',
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0,
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        inNav: !!el.closest('nav, header, [role="navigation"]'),
        classes: el.className || ''
      };
    });
  }, SELECTORS);

  // Filter: visible, enabled, minimum size
  const filtered = raw.filter(el =>
    el.visible && !el.disabled && el.boundingBox.width > 10 && el.boundingBox.height > 10
  );

  // Deduplicate by text + href + tagName
  const seen = new Set();
  const unique = [];
  for (const el of filtered) {
    const key = `${el.tagName}|${el.text}|${el.href || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      el.selector = buildSelector(el);
      unique.push(el);
    }
  }

  return unique;
}

function buildSelector(el) {
  if (el.href && el.tagName === 'a') return `a[href="${el.href}"]`;
  if (el.name) return `${el.tagName}[name="${el.name}"]`;
  if (el.text) return `${el.tagName}:has-text("${el.text.slice(0, 50)}")`;
  return `${el.tagName}:nth-of-type(${el.index + 1})`;
}

/** Input types that should NOT be filled with text */
const NON_FILLABLE = ['range', 'hidden', 'checkbox', 'radio', 'color', 'file', 'image', 'button', 'submit', 'reset'];

/**
 * Execute an action on an element.
 * @param {import('playwright').Page} page
 * @param {Object} element - From findInteractableElements
 * @returns {Promise<string>} Description of action taken
 */
async function executeAction(page, element) {
  const { tagName, inputType, text, href } = element;

  if (tagName === 'input' || tagName === 'textarea') {
    // Non-fillable inputs: click/toggle instead of fill
    if (NON_FILLABLE.includes(inputType)) {
      const locator = page.locator(element.selector).first();
      await locator.click({ timeout: 3000 });
      return `Clicked ${inputType} input "${element.name || text}"`;
    }

    const value = getDummyValue(inputType, element.name);
    const locator = page.locator(element.selector).first();
    await locator.click({ timeout: 3000 }).catch(() => {});
    await locator.fill(value, { timeout: 3000 });
    return `Filled ${inputType || 'text'} input "${element.name || text}" with "${value}"`;
  }

  if (tagName === 'select') {
    const locator = page.locator(element.selector).first();
    const options = await locator.locator('option').allTextContents();
    if (options.length > 1) {
      await locator.selectOption({ index: 1 }, { timeout: 3000 });
      return `Selected option "${options[1]}" in dropdown`;
    }
    return 'No options to select in dropdown';
  }

  // Default: click (buttons, links, role=button)
  const locator = page.locator(element.selector).first();
  await locator.click({ timeout: 3000 });
  return `Clicked ${tagName} "${text || href || 'element'}"`;
}

function getDummyValue(inputType, name) {
  const n = (name || '').toLowerCase();
  if (n.includes('email') || inputType === 'email') return DUMMY_DATA.email;
  if (n.includes('pass') || inputType === 'password') return DUMMY_DATA.password;
  if (n.includes('phone') || n.includes('tel') || inputType === 'tel') return DUMMY_DATA.tel;
  if (n.includes('url') || inputType === 'url') return DUMMY_DATA.url;
  if (n.includes('search') || inputType === 'search') return DUMMY_DATA.search;
  if (inputType === 'number') return DUMMY_DATA.number;
  return DUMMY_DATA.text;
}

module.exports = { findInteractableElements, executeAction };
