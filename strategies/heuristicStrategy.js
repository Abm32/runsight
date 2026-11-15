'use strict';

const SELECTORS = 'a[href], button, [role="button"], input, textarea, select, [onclick]';

/** Input types to skip entirely during discovery — not useful for exploration */
const SKIP_INPUT_TYPES = ['hidden', 'range', 'color', 'file', 'image'];

/**
 * Demo persona — realistic, consistent values so forms look like a real person
 * used them, and so sign-up followed by login reuses the same credentials.
 */
const PERSONA = {
  first: 'Alex',
  last: 'Morgan',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  password: 'Sunny-Harbor-42',
  username: 'alexmorgan',
  tel: '(415) 555-0132',
  url: 'https://example.com',
  company: 'Acme Studio',
  address: '500 Market Street',
  city: 'San Francisco',
  zip: '94107',
  number: '3',
  search: 'getting started',
  title: 'Plan the product launch',
  message: "Hi! I'd love to learn more about this.",
  text: 'Demo'
};

/** Field-hint patterns → persona key. First match wins. */
const FIELD_RULES = [
  [/e-?mail/, 'email'],
  [/pass|pwd/, 'password'],
  [/first.?name|given/, 'first'],
  [/last.?name|surname|family/, 'last'],
  [/user.?name|login|handle/, 'username'],
  [/phone|mobile|\btel\b/, 'tel'],
  [/company|organi[sz]ation|business|workspace|team.?name/, 'company'],
  [/address|street/, 'address'],
  [/city|town/, 'city'],
  [/zip|postal/, 'zip'],
  [/website|\burl\b|link/, 'url'],
  [/search|query|find/, 'search'],
  [/message|comment|description|feedback|note|bio|about/, 'message'],
  [/title|subject|task|todo|item|project|topic/, 'title'],
  [/name/, 'name']
];

/** Input types typed character-by-character on camera (others are set instantly). */
const TYPEABLE = ['text', 'email', 'password', 'search', 'tel', 'url', '', null, undefined];

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
        // Visible label: own text, then (for form fields) the <label>, aria-label, placeholder, value.
        text: (el.innerText || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label')
          || el.getAttribute('placeholder') || el.value || '').trim().split('\n')[0].slice(0, 100),
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

  // Filter: visible, enabled, minimum size, skip non-useful input types
  const filtered = raw.filter(el =>
    el.visible && !el.disabled && el.boundingBox.width > 10 && el.boundingBox.height > 10
    && !SKIP_INPUT_TYPES.includes(el.inputType)
  );

  // Deduplicate by text + href + tagName (+ field name/type, so unlabeled
  // form fields are not collapsed into one)
  const seen = new Set();
  const unique = [];
  for (const el of filtered) {
    const key = `${el.tagName}|${el.text}|${el.href || ''}|${el.name}|${el.inputType || ''}`;
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
  // `el.type` is the raw attribute: an <input> with no type attribute is a text
  // field, but `[type="text"]` would not match it.
  if (el.tagName === 'input' && el.type && el.name) return `input[type="${el.type}"][name="${el.name}"]`;
  if (el.tagName === 'input' && el.name) return `input[name="${el.name}"]`;
  if (el.tagName === 'input' && el.type) return `input[type="${el.type}"]`;
  if (el.name) return `${el.tagName}[name="${el.name}"]`;
  if (el.text && el.tagName !== 'input') return `${el.tagName}:has-text("${el.text.slice(0, 50)}")`;
  return `${el.tagName}:nth-of-type(${el.index + 1})`;
}

/** Input types that should NOT be filled with text */
const NON_FILLABLE = ['range', 'hidden', 'checkbox', 'radio', 'color', 'file', 'image', 'button', 'submit', 'reset'];

/**
 * Execute an action on an element.
 * @param {import('playwright').Page} page
 * @param {Object} element - From findInteractableElements
 * @param {Object} [opts]
 * @param {string} [opts.value] - value to enter (e.g. chosen by the LLM); defaults to demo persona data
 * @param {number} [opts.typeDelay] - ms between keystrokes; 0/omitted fills instantly
 * @param {string|null} [opts.guide] - project guide; its "Demo data" section overrides persona values
 * @returns {Promise<string>} Description of action taken
 */
async function executeAction(page, element, opts = {}) {
  const { tagName, inputType, text, href } = element;

  if (tagName === 'input' || tagName === 'textarea') {
    // Non-fillable inputs: click/toggle instead of fill
    if (NON_FILLABLE.includes(inputType)) {
      const locator = page.locator(element.selector).first();
      await locator.click({ timeout: 3000 });
      return `Clicked ${inputType} input "${element.name || text}"`;
    }

    const value = opts.value || getDemoValue(element, opts.guide);
    const locator = page.locator(element.selector).first();
    await locator.click({ timeout: 3000 }).catch(() => {});
    if (opts.typeDelay && (tagName === 'textarea' || TYPEABLE.includes(inputType))) {
      // Type like a person so the viewer can follow what is being entered.
      await locator.fill('', { timeout: 3000 });
      await locator.pressSequentially(value, { delay: opts.typeDelay, timeout: 15000 });
    } else {
      await locator.fill(value, { timeout: 3000 });
    }
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

/**
 * Parse `- key: value` lines under a "Demo data" / "Test data" / "Credentials"
 * heading in the project guide (e.g. a real demo account for login flows).
 * @param {string|null} guide
 * @returns {Array<[string, string]>} [lowercase key, value] pairs
 */
function parseDemoData(guide) {
  if (!guide) return [];
  const section = guide.match(/^#+\s*(?:demo data|test data|credentials)[^\n]*\n([\s\S]*?)(?=^#|(?![\s\S]))/im);
  if (!section) return [];
  const pairs = [];
  for (const line of section[1].split('\n')) {
    const m = line.match(/^\s*[-*]\s*([^:]{1,40}):\s*(.+)$/);
    if (m) pairs.push([m[1].trim().toLowerCase(), m[2].trim().replace(/^[`"']|[`"']$/g, '')]);
  }
  return pairs;
}

/**
 * Pick a realistic value for a form field: guide-provided demo data first,
 * then the demo persona matched on the field's name / placeholder / type.
 * @param {{inputType: string|null, name: string, text: string, tagName: string}} el
 * @param {string|null} [guide]
 * @returns {string}
 */
function getDemoValue(el, guide) {
  const hint = `${el.name || ''} ${el.text || ''} ${el.inputType || ''}`.toLowerCase();
  for (const [key, value] of parseDemoData(guide)) {
    if (hint.includes(key)) return value;
  }
  if (el.inputType === 'number') return PERSONA.number;
  if (el.inputType === 'date') return new Date().toISOString().slice(0, 10);
  for (const [pattern, key] of FIELD_RULES) {
    if (pattern.test(hint)) return PERSONA[key];
  }
  return el.tagName === 'textarea' ? PERSONA.message : PERSONA.text;
}

module.exports = { findInteractableElements, executeAction, getDemoValue, PERSONA };
