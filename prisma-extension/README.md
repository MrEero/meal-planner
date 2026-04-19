# Perekonna Ostuabi — Chrome extension

A tiny Chrome extension that lets the meal planner at
`mreero.github.io/meal-planner/` drop items into your Prisma Market cart using
**your own logged-in browser session**. No backend, no API keys.

## How it works

1. The meal planner page sends your shopping list to the extension via
   `window.postMessage`.
2. The extension opens a Prisma search tab for each item (one at a time),
   waits for results to render, clicks "Add to cart" on the top product,
   and closes the tab.
3. If "Eelista mahe tooteid" is on, the search adds the word `mahe` so
   organic results rank first.

## Install (unpacked)

1. Open `chrome://extensions/`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Pick this folder: `prisma-extension/`
5. Make sure you are signed into `www.prismamarket.ee` in Chrome
6. Open the meal planner, tick your shopping list, and click **"Lisa Prismasse"**

## If add-to-cart stops working

Prisma's site can change. Open Prisma in Chrome, right-click any "Lisa
ostukorvi" button, pick **Inspect**, and copy a stable selector. Paste it
into the top of `content-prisma.js` (the `SELECTORS` object). Reload the
extension at `chrome://extensions/`.

## Files

- `manifest.json` — Chrome extension manifest (v3)
- `background.js` — service worker that owns the queue and drives tabs
- `content-planner.js` — bridge installed on the meal planner page
- `content-prisma.js` — clicks add-to-cart on Prisma search results
- `popup.html` / `popup.js` — tiny status panel shown when you click the extension icon

## Known limits

- One item at a time. Bulk parallel adds get Prisma angry, and sequential
  is plenty fast enough (under a minute for 20 items).
- Only the **top search result** is added. If the top hit is wrong, fix it
  in the cart before checking out.
- No login handling. The extension reuses your existing Chrome session on
  `prismamarket.ee`. If you're logged out, add a single item by hand first
  to trigger Prisma's login flow, then rerun the queue.
