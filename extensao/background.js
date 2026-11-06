const IG_POST = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\//i;

chrome.action.onClicked.addListener(async (tab) => {
  const appUrl = chrome.runtime.getURL("app.html");

  if (tab?.url && IG_POST.test(tab.url) && !tab.url.startsWith("chrome-extension://")) {
    await chrome.storage.local.set({ pendingUrl: tab.url });
  }

  const existing = await chrome.tabs.query({ url: appUrl });
  if (existing[0]?.id) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId != null) {
      try {
        await chrome.windows.update(existing[0].windowId, { focused: true });
      } catch (_) {
        /* janela pode ter sido fechada no meio do clique */
      }
    }
    return;
  }

  await chrome.tabs.create({ url: appUrl });
});
