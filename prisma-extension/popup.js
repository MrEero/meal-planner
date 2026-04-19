const port = chrome.runtime.connect({ name: "popup" });
const $ = (id) => document.getElementById(id);

port.onMessage.addListener(({ stats, running, queued }) => {
  $("q").textContent = queued ?? 0;
  $("d").textContent = stats?.done ?? 0;
  $("f").textContent = stats?.failed ?? 0;
  $("msg").textContent = stats?.lastMessage ?? "";
  const s = $("state");
  if (running) { s.textContent = "töötab"; s.className = "pill on"; }
  else { s.textContent = "puhkab"; s.className = "pill off"; }
});

$("clear").addEventListener("click", () => port.postMessage({ type: "CLEAR" }));
