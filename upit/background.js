// Clicking the toolbar icon opens the upit side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error("[upit] setPanelBehavior failed", e));
