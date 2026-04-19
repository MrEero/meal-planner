// content-prisma.js — runs on www.prismamarket.ee/*
//
// When the background service worker sends {type: "ADD_TOP_RESULT", query},
// this script waits for the search results to render, picks the top product
// tile, and clicks its add-to-cart button.
//
// The DOM on prismamarket.ee changes from time to time, so all selectors are
// collected at the top of this file. If the extension stops working, open a
// Prisma search page, right-click the add-to-cart button, Inspect, and adjust
// the SELECTORS list below.

const SELECTORS = {
  // Container of a single product tile in the search grid.
  productCard: [
    '[data-test-id="product-card"]',
    'article[data-test-id*="product"]',
    'article.product-card',
    'li[data-test-id*="product"]',
    'div[data-product-ean]',
    'div[class*="ProductCard"]',
    'article[class*="product"]'
  ],
  // Add-to-cart button inside a card (or anywhere on a product detail page).
  addButton: [
    'button[data-test-id*="add-to-cart"]',
    'button[aria-label*="ostukorvi" i]',
    'button[aria-label*="lisa" i]',
    'button[title*="ostukorvi" i]',
    'button[class*="AddToCart"]',
    'button[class*="add-to-cart"]'
  ],
  // "Not available" indicator — if present in a card, skip it.
  unavailable: [
    '[data-test-id*="unavailable"]',
    '[class*="unavailable" i]',
    '[class*="out-of-stock" i]'
  ]
};

const MAX_WAIT_MS = 15000;
const POLL_MS = 250;

function firstMatch(root, selectorList) {
  for (const sel of selectorList) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
function allMatches(root, selectorList) {
  const out = [];
  for (const sel of selectorList) {
    root.querySelectorAll(sel).forEach(el => out.push(el));
    if (out.length) return out;
  }
  return out;
}

function waitFor(testFn, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const immediate = testFn();
    if (immediate) return resolve(immediate);
    const id = setInterval(() => {
      const r = testFn();
      if (r) { clearInterval(id); resolve(r); return; }
      if (Date.now() - started > timeoutMs) { clearInterval(id); resolve(null); }
    }, POLL_MS);
  });
}

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

async function addTopResult(query) {
  // Wait for at least one product card to appear.
  const firstCard = await waitFor(() => {
    const cards = allMatches(document, SELECTORS.productCard).filter(isVisible);
    return cards.length ? cards[0] : null;
  }, MAX_WAIT_MS);

  if (!firstCard) {
    // Fallback: search UI might have rendered a single product detail page.
    const btn = firstMatch(document, SELECTORS.addButton);
    if (btn && isVisible(btn) && !btn.disabled) {
      btn.scrollIntoView({ block: "center" });
      btn.click();
      return { ok: true, reason: "added_from_detail_page" };
    }
    return { ok: false, reason: "no_product_card" };
  }

  // Skip unavailable cards: iterate a few tiles until we find one that works.
  const cards = allMatches(document, SELECTORS.productCard).filter(isVisible);
  for (const card of cards.slice(0, 5)) {
    if (firstMatch(card, SELECTORS.unavailable)) continue;
    const btn = firstMatch(card, SELECTORS.addButton);
    if (!btn || !isVisible(btn) || btn.disabled) continue;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return { ok: true, reason: "added_from_search", card: card.outerHTML.slice(0, 200) };
  }
  return { ok: false, reason: "no_clickable_button" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "ADD_TOP_RESULT") return;
  addTopResult(msg.query || "").then(sendResponse).catch(e => {
    sendResponse({ ok: false, reason: "exception: " + (e && e.message || String(e)) });
  });
  return true; // keep sendResponse alive for async
});
