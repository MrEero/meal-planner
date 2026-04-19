// Perekonna Ostuabi — background service worker
//
// Keeps ONE prismamarket.ee tab open and reuses it. For each item in the
// queue, we ask the content script to type the query into Prisma's own
// search input, wait for results, and click "Lisa ostukorvi" on the top
// matching product. No URL guessing, no tab churn.

const PRISMA_HOME = "https://www.prismamarket.ee/";
const ITEM_TIMEOUT_MS = 25000;
const BETWEEN_MS_MIN = 700;
const BETWEEN_MS_MAX = 1400;

let queue = [];
let running = false;
let stopRequested = false;
let stats = { total: 0, done: 0, failed: 0, lastMessage: "" };
let prismaTabId = null;
let lastClient = null;

async function saveStats() {
  try {
    await chrome.storage.session.set({ stats, queueLength: queue.length, running });
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(a, b) { return a + Math.floor(Math.random() * (b - a)); }

function notifyPlanner(payload) {
  if (!lastClient) return;
  const msg = { source: "pp-ext", ...payload };
  chrome.tabs.sendMessage(lastClient.tabId, msg).catch(() => {});
}

async function ensurePrismaTab() {
  if (prismaTabId != null) {
    try {
      const t = await chrome.tabs.get(prismaTabId);
      if (t && typeof t.url === "string" && t.url.includes("prismamarket.ee")) {
        return t;
      }
    } catch {
      prismaTabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: PRISMA_HOME, active: false });
  prismaTabId = tab.id;
  await waitForTabComplete(prismaTabId);
  // Give the SPA a beat to mount its UI.
  await sleep(800);
  return tab;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    chrome.tabs.onUpdated.addListener(listener);
    (async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") finish(true);
      } catch { finish(false); }
    })();
    setTimeout(() => finish(false), ITEM_TIMEOUT_MS);
  });
}

async function processOne(item) {
  const tab = await ensurePrismaTab();
  if (!tab || !tab.id) return { ok: false, reason: "no_prisma_tab" };

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: "content_timeout" });
    }, ITEM_TIMEOUT_MS);

    chrome.tabs.sendMessage(
      tab.id,
      { type: "SEARCH_AND_ADD", query: item.name, organic: !!item.organic },
      (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: "sendMessage: " + chrome.runtime.lastError.message });
        } else if (!resp) {
          resolve({ ok: false, reason: "no_response" });
        } else {
          resolve(resp);
        }
      }
    );
  });
}

async function runQueue() {
  if (running) return;
  running = true;
  stopRequested = false;
  await saveStats();
  notifyPlanner({ type: "STATUS", stats, running, queued: queue.length });

  while (queue.length) {
    if (stopRequested) break;
    const item = queue.shift();
    stats.lastMessage = "Otsin: " + item.name;
    await saveStats();
    notifyPlanner({ type: "STATUS", stats, running, queued: queue.length });

    const res = await processOne(item);
    if (stopRequested) break;

    if (res.ok) {
      stats.done++;
      notifyPlanner({ type: "ITEM_DONE", item, ok: true });
    } else {
      stats.failed++;
      stats.lastMessage = "Ebaõnnestus: " + item.name + " (" + res.reason + ")";
      notifyPlanner({ type: "ITEM_DONE", item, ok: false, reason: res.reason });
    }
    await saveStats();

    if (queue.length && !stopRequested) {
      await sleep(rand(BETWEEN_MS_MIN, BETWEEN_MS_MAX));
    }
  }

  if (stopRequested) {
    queue = [];
    stats.lastMessage = "Peatatud. " + stats.done + " lisatud, " + stats.failed + " vahele jäänud.";
  } else {
    stats.lastMessage = "Valmis. " + stats.done + " lisatud, " + stats.failed + " vahele jäänud.";
  }
  running = false;
  stopRequested = false;
  await saveStats();
  notifyPlanner({ type: "DONE", stats, running: false, queued: 0 });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.source === "pp-planner") {
    if (sender.tab) lastClient = { tabId: sender.tab.id };

    if (msg.type === "PING") {
      sendResponse({ source: "pp-ext", type: "PONG", version: chrome.runtime.getManifest().version });
      return true;
    }
    if (msg.type === "ADD_ITEMS") {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const clean = items
        .filter(i => i && typeof i.name === "string" && i.name.trim())
        .map(i => ({ name: i.name.trim(), organic: !!i.organic }));
      stats.total += clean.length;
      queue.push(...clean);
      saveStats();
      sendResponse({ source: "pp-ext", type: "QUEUED", count: clean.length, queued: queue.length });
      runQueue();
      return true;
    }
    if (msg.type === "STOP") {
      stopRequested = true;
      queue = [];
      stats.lastMessage = "Peatamine...";
      saveStats();
      notifyPlanner({ type: "STATUS", stats, running, queued: 0 });
      sendResponse({ source: "pp-ext", type: "STOPPING" });
      return true;
    }
    if (msg.type === "STATUS_REQUEST") {
      sendResponse({ source: "pp-ext", type: "STATUS", stats, running, queued: queue.length });
      return true;
    }
    if (msg.type === "CLEAR") {
      queue = [];
      stats = { total: 0, done: 0, failed: 0, lastMessage: "Tühjendatud." };
      saveStats();
      sendResponse({ source: "pp-ext", type: "CLEARED" });
      return true;
    }
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "popup") return;
  const send = () => port.postMessage({ stats, running, queued: queue.length });
  send();
  const id = setInterval(send, 500);
  port.onDisconnect.addListener(() => clearInterval(id));
  port.onMessage.addListener(msg => {
    if (msg?.type === "CLEAR") {
      queue = [];
      stats = { total: 0, done: 0, failed: 0, lastMessage: "Tühjendatud." };
      saveStats();
      send();
    } else if (msg?.type === "STOP") {
      stopRequested = true;
      queue = [];
      send();
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === prismaTabId) prismaTabId = null;
});
