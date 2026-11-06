(() => {
  if (window.__contadorBridgeReady) return;
  window.__contadorBridgeReady = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "contador-ig") return;
    chrome.runtime.sendMessage(data).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "START") return;
    window.postMessage(
      { source: "contador-ext", type: "START", payload: msg.payload },
      "*"
    );
  });
})();
