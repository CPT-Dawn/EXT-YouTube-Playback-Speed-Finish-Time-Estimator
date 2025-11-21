(function () {
  let injected = false;
  let lastUrl = location.href;

  // Check if current page is a valid watch page
  function isValidWatchPage() {
    try {
      const url = new URL(window.location.href);
      return url.pathname === "/watch" && url.searchParams.has("v");
    } catch {
      return false;
    }
  }

  // Format seconds to HH:MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
  }

  // Update UI elements with timing info
  function updateUI(video) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const currentTime = video.currentTime;
    const duration = video.duration;
    if (isNaN(currentTime) || isNaN(duration) || duration <= 0) return;

    const remaining = (duration - currentTime) / video.playbackRate;
    const finish = new Date(Date.now() + remaining * 1000);

    const currentTimeEl = document.getElementById("currentTime");
    const remainingTimeEl = document.getElementById("remainingTime");
    const finishTimeEl = document.getElementById("finishTime");
    if (currentTimeEl)
      currentTimeEl.textContent = new Date().toLocaleTimeString();
    if (remainingTimeEl) remainingTimeEl.textContent = formatTime(remaining);
    if (finishTimeEl) finishTimeEl.textContent = finish.toLocaleTimeString();

    speeds.forEach((s) => {
      const end = new Date(
        Date.now() + ((remaining * video.playbackRate) / s) * 1000
      );
      const el = document.querySelector(
        `#speed-${s.toString().replace(".", "-")}x-time`
      );
      if (el) el.textContent = formatTime((end.getTime() - Date.now()) / 1000);
    });

    const bar = document.getElementById("progressBar");
    if (bar) bar.style.width = `${(currentTime / duration) * 100}%`;

    speeds.forEach((s) => {
      const btn = document.getElementById(
        `speed-${s.toString().replace(".", "-")}x`
      );
      if (btn) btn.classList.toggle("selected-speed", s === video.playbackRate);
    });
  }

  // Selectors to try for injection (in order of preference)
  const CONTAINER_SELECTORS = [
    "ytd-watch-next-secondary-results-renderer",
    "#secondary",
    "yt-carousel-title-view-model", // For live streams
  ];

  // Inject your UI once video and container are ready
  async function injectUI(video, container) {
    if (!container || !video) return;

    const existing = document.getElementById("yt-finish-time-estimator-container");
    if (existing) {
      existing.remove();
    }

    const box = document.createElement("div");
    box.id = "yt-finish-time-estimator-container";
    box.className = "blank-box";

    // Insert before the container (or prepend if it's #secondary to be at the top)
    if (container.id === "secondary") {
      container.prepend(box);
    } else {
      container.parentNode.insertBefore(box, container);
    }

    try {
      const response = await fetch(chrome.runtime.getURL("content.html"));
      const html = await response.text();
      box.innerHTML = html;

      // Attach speed button click handlers
      box.querySelectorAll(".speed-option").forEach((el) => {
        el.addEventListener("click", () => {
          const speed = parseFloat(
            el.id.replace("speed-", "").replace("x", "").replace("-", ".")
          );
          if (!isNaN(speed)) {
            video.playbackRate = speed;
            updateUI(video);
          }
        });
      });

      // Update UI every second
      setInterval(() => updateUI(video), 1000);
    } catch (e) {
      console.error("Failed to load content.html", e);
    }

    // Load styles.css once
    if (!document.getElementById("yt-time-estimator-styles")) {
      const link = document.createElement("link");
      link.id = "yt-time-estimator-styles";
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles.css");
      document.head.appendChild(link);
    }

    injected = true;
  }

  // Wait for video and container elements (timeout 10s)
  function waitForElements(selectorVideo, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const intervalTime = 100;
      let elapsed = 0;

      const interval = setInterval(() => {
        // Stop if we are no longer on a valid watch page
        if (!isValidWatchPage()) {
          clearInterval(interval);
          reject(new Error("Not a watch page"));
          return;
        }

        const video = document.querySelector(selectorVideo);
        let container = null;
        
        for (const selector of CONTAINER_SELECTORS) {
          container = document.querySelector(selector);
          if (container) break;
        }

        if (video && container) {
          clearInterval(interval);
          resolve({ video, container });
        } else {
          elapsed += intervalTime;
          if (elapsed >= timeout) {
            clearInterval(interval);
            reject(new Error("Timeout waiting for elements"));
          }
        }
      }, intervalTime);
    });
  }

  // Try to inject UI only on valid watch page
  async function tryInject() {
    if (!isValidWatchPage()) {
      if (injected) {
        // Optional: remove UI on leaving watch page (not mandatory)
        injected = false;
      }
      return;
    }
    if (injected) return;

    try {
      const { video, container } = await waitForElements("video");
      // Double check before injecting
      if (isValidWatchPage()) {
        injectUI(video, container);
      }
    } catch {
      // ignore and retry later
    }
  }

  // Detect SPA navigation by polling URL
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      injected = false;
      tryInject();
    }
  }, 500);

  // Initial attempt
  tryInject();
})();
