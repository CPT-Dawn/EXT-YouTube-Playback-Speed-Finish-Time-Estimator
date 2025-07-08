// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const timeFormatInputs = document.querySelectorAll(
    'input[name="timeFormat"]'
  );
  const showSecondsInput = document.getElementById("showSeconds");
  const form = document.getElementById("settingsForm");

  // Load settings
  chrome.storage.sync.get(["timeFormat", "showSeconds"], (data) => {
    const timeFormat = data.timeFormat || "24";
    const showSeconds =
      data.showSeconds !== undefined ? data.showSeconds : true;
    timeFormatInputs.forEach((input) => {
      input.checked = input.value === timeFormat;
    });
    showSecondsInput.checked = showSeconds;
  });

  // Save settings
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const timeFormat =
      Array.from(timeFormatInputs).find((i) => i.checked)?.value || "24";
    const showSeconds = showSecondsInput.checked;
    chrome.storage.sync.set({ timeFormat, showSeconds }, () => {
      // Notify content script to update UI
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: "UPDATE_TIME_SETTINGS" });
      });
      window.close();
    });
  });
});
