// Listens for messages from popup or content scripts
// Handles profile storage and backend communication

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_PROFILE") {
    chrome.storage.local.get("profile", (data) => {
      sendResponse({ profile: data.profile || null });
    });
    return true; // keep channel open for async
  }

  if (msg.type === "SAVE_PROFILE") {
    chrome.storage.local.set({ profile: msg.profile }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "TRIGGER_FILL") {
    // Tell the active tab's content script to start filling
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "FILL_FORM" });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
