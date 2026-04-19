// content-prisma.js — runs on www.prismamarket.ee/*
//
// Background sends {type: "SEARCH_AND_ADD", query, organic}. We type the
// query into Prisma's own search box, wait for results, click "Lisa
// ostukorvi" on the first viable product, and report back. Everything
// stays in ONE tab.
//
// If the site changes, tweak the selector arrays below. Install dev tools
// on a Prisma search page, inspect the element, and add a stable selector.

const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[name="q"]',
  'input[name="search"]',
  'input[placeholder*="otsi" i]',
  'input[placeholder*="otsing" i]',
  'input[aria-label*="otsi" i]',
  'input[id*="search" i]',
  'input[data-test-id*="search"]',
  'input[class*="search" i]'
];

const PRODUCT_CARD_SELECTORS = [
  '[data-test-id="product-card"]',
  'article[data-test-id*="product"]',
  'article.product-card',
  'li[data-test-id*="product"]',
  'div[data-product-ean]',
  'div[class*="ProductCard"]',
  'article[class*="product"]',
  'div[class*="product-card"]',
  'li[class*="product-card"]'
];

const ADD_BUTTON_SELECTORS = [
  'button[data-test-id*="add-to-cart"]',
  'button[aria-label*="ostukorvi" i]',
  'button[aria-label*="lisa" i]',
  'button[title*="ostukorvi" i]',
  'button[class*="AddToCart"]',
  'button[class*="add-to-cart"]',
  'button[class*="addToCart"]'
];

const UNAVAIL_SELECTORS = [
  '[data-test-id*="unavailable"]',
  '[class*="unavailable" i]',
  '[class*="out-of-stock" i]',
  '[class*="soldOut" i]',
  '[class*="sold-out" i]'
];

const SEARCH_TIMEOUT = 15000;
const INPUT_WAIT = 6000;

function first(root, sels) { for (const s of sels) { const el = root.querySelector(s); if (el) return el; } return null; }
function all(root, sels) { const out = []; for (const s of sels) { root.querySelectorAll(s).forEach(el => out.push(el)); if (out.length) return out; } return out; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
}

function waitFor(testFn, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => testFn();
    const first = attempt();
    if (first) return resolve(first);
    const iv = setInterval(() => {
      const r = attempt();
      if (r) { clearInterval(iv); resolve(r); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(null); }
    }, 200);
  });
}

// Set value on React-controlled inputs (bypass React's synthetic event guard).
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = desc && desc.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function pressEnter(el) {
  const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

async function searchAndAdd(query) {
  // 1. Find the search input.
  const input = await waitFor(() => {
    const el = first(document, SEARCH_INPUT_SELECTORS);
    return el && isVisible(el) ? el : null;
  }, INPUT_WAIT);
  if (!input) return { ok: false, reason: "no_search_input" };

  // 2. Clear + type.
  input.focus();
  setNativeValue(input, "");
  await sleep(60);
  setNativeValue(input, query);
  await sleep(120);

  // Snapshot before submit so we can detect fresh results.
  const urlBefore = location.href;
  const cardsBefore = all(document, PRODUCT_CARD_SELECTORS).length;

  // 3. Submit via Enter; fall back to form.submit() / search button click.
  pressEnter(input);
  const form = input.closest("form");
  if (form) {
    try { if (form.requestSubmit) form.requestSubmit(); else form.submit(); } catch {}
  }
  const submitBtn = document.querySelector(
    'button[type="submit"][aria-label*="otsi" i], button[class*="search" i][type="submit"]'
  );
  if (submitBtn && isVisible(submitBtn)) { try { submitBtn.click(); } catch {} }

  // 4. Wait for new results.
  const cards = await waitFor(() => {
    const cs = all(document, PRODUCT_CARD_SELECTORS).filter(isVisible);
    if (!cs.length) return null;
    if (location.href !== urlBefore) return cs;
    if (cs.length !== cardsBefore) return cs;
    const q = query.toLowerCase().split(/\s+/)[0];
    if (q && cs.some(c => c.textContent.toLowerCase().includes(q))) return cs;
    return null;
  }, SEARCH_TIMEOUT);

  if (!cards || !cards.length) return { ok: false, reason: "no_results" };

  // 5. Click add-to-cart on the first viable card.
  for (const card of cards.slice(0, 6)) {
    if (first(card, UNAVAIL_SELECTORS)) continue;
    const btn = first(card, ADD_BUTTON_SELECTORS);
    if (!btn || !isVisible(btn) || btn.disabled) continue;
    btn.scrollIntoView({ block: "center" });
    await sleep(80);
    btn.click();
    await sleep(200); // let the click register / cart animate
    return { ok: true, reason: "added" };
  }

  // Detail-page fallback: whole page is a single product.
  const loneBtn = first(document, ADD_BUTTON_SELECTORS);
  if (loneBtn && isVisible(loneBtn) && !loneBtn.disabled) {
    loneBtn.scrollIntoView({ block: "center" });
    loneBtn.click();
    return { ok: true, reason: "added_from_detail" };
  }

  return { ok: false, reason: "no_clickable_button" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "SEARCH_AND_ADD") return;
  const q = (msg.organic ? (msg.query || "") + " mahe" : (msg.query || "")).trim();
  searchAndAdd(q).then(sendResponse).catch((e) => {
    sendResponse({ ok: false, reason: "exception: " + (e && e.message || String(e)) });
  });
  return true; // keep sendResponse async
});
