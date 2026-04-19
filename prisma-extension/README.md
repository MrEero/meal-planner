# Perekonna Ostuabi — Chrome extension

A tiny Chrome extension that lets the meal planner at
`mreero.github.io/meal-planner/` drop items into your Prisma Market cart using
**your own logged-in browser session**. No backend, no API keys.

## How it works (v0.2)

1. The meal planner page sends your shopping list to the extension via
   `window.postMessage`.
2. The extension opens **one** prismamarket.ee tab and reuses it for the
   whole queue (no churn of opening/closing tabs).
3. For each item, the content script types the query into Prisma's own
   search box, waits for results, and clicks "Lisa ostukorvi" on the top
   matching product.
4. If "Eelista mahe tooteid" is on, the search adds the word `mahe` so
   organic results rank first.
5. You can click **Peata** in the planner modal to stop the queue at any
   point.

## Install (unpacked)

1. Open `chrome://extensions/`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Pick this folder: `prisma-extension/`
5. Make sure you are signed into `www.prismamarket.ee` in Chrome
6. Open the meal planner, tick your shopping list, and click **"Telli Prismast"**

## Updating from an older version

After replacing the files, go to `chrome://extensions/`, find Perekonna
Ostuabi, and click the reload icon.

## If add-to-cart stops working

Prisma's site can change. Open Prisma in Chrome, right-click any "Lisa
ostukorvi" button, pick **Inspect**, and copy a stable selector. Paste it
into one of the selector arrays at the top of `content-prisma.js`. Reload
the extension at `chrome://extensions/`.

The selectors live in:
- `SEARCH_INPUT_SELECTORS` — the search box at the top of Prisma
- `PRODUCT_CARD_SELECTORS` — the search result tiles
- `ADD_BUTTON_SELECTORS` — the "Lisa ostukorvi" button in each tile
- `UNAVAIL_SELECTORS` — markers for out-of-stock items (so we skip them)

## Files

- `manifest.json` — Chrome extension manifest (v3)
- `background.js` — service worker that owns the queue and one Prisma tab
- `content-planner.js` — bridge installed on the meal planner page
- `content-prisma.js` — types into search, clicks add-to-cart on Prisma
- `popup.html` / `popup.js` — tiny status panel shown when you click the extension icon

## Known limits

- One item at a time. Sequential is plenty fast (under a minute for 20 items)
  and avoids hammering Prisma.
- Only the **top viable search result** is added. If the top hit is wrong,
  fix it in the cart before checking out.
- No login handling. The extension reuses your existing Chrome session on
  `prismamarket.ee`. If the cart click silently does nothing, you may be
  logged out — add a single item by hand to trigger the login flow, then
  rerun the queue.
- The first request after a fresh install opens the Prisma homepage in the
  background. If a cookie banner blocks the search box, dismiss it once and
  retry.
