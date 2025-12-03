// Background service worker for YouTube Time Manager
// Currently minimal - reserved for future features like cross-tab messaging, settings sync, etc.

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Time Manager installed');
});
