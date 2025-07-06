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

  // Helper to get playlist info and calculate remaining time
  function getPlaylistInfo(selectedEndNum = null) {
    const items = Array.from(
      document.querySelectorAll("ytd-playlist-panel-video-renderer")
    );
    if (!items.length) return null;
    const currentIndex = items.findIndex((item) =>
      item.hasAttribute("selected")
    );
    if (currentIndex === -1) return null;
    const skipWatched = document.getElementById(
      "skip-watched-checkbox"
    )?.checked;
    let durations = items.slice(currentIndex).map((item) => {
      const timeNode = item.querySelector("#text");
      if (!timeNode) return 0;
      const parts = timeNode.textContent.trim().split(":").map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
    });
    // If skipping watched, filter out watched videos (except current)
    if (skipWatched) {
      durations = durations.filter((dur, idx) => {
        if (idx === 0) return true; // always include current
        const item = items[currentIndex + idx];
        const progress = item.querySelector(
          "ytd-thumbnail-overlay-resume-playback-renderer"
        );
        const watchedBadge = item.querySelector(
          "ytd-thumbnail-overlay-playback-status-renderer"
        );
        if (
          watchedBadge &&
          watchedBadge.textContent.toLowerCase().includes("watched")
        )
          return false;
        if (progress && progress.style.width === "100%") return false;
        return true;
      });
    }
    // Limit to selected end video number
    if (selectedEndNum && selectedEndNum > 0) {
      durations = durations.slice(0, selectedEndNum);
    }
    return { durations, currentIndex };
  }

  function updatePlaylistSpeedTimes(video, selectedEndNum) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const info = getPlaylistInfo(selectedEndNum);
    if (!info) {
      speeds.forEach((s) => {
        const el = document.getElementById(
          `playlist-speed-${s.toString().replace(".", "-")}x-time`
        );
        if (el) el.textContent = "00:00:00";
      });
      return;
    }
    if (info.durations.length) {
      info.durations[0] = Math.max(0, info.durations[0] - video.currentTime);
    }
    const totalSeconds = info.durations.reduce((a, b) => a + b, 0);
    speeds.forEach((s) => {
      const el = document.getElementById(
        `playlist-speed-${s.toString().replace(".", "-")}x-time`
      );
      if (el) el.textContent = formatTime(totalSeconds / s);
    });
  }

  function updatePlaylistCurrentSpeedInfo(video, selectedEndNum) {
    const info = getPlaylistInfo(selectedEndNum);
    const remainingEl = document.getElementById("playlist-remaining-time");
    const finishingEl = document.getElementById("playlist-finishing-time");
    if (!info) {
      if (remainingEl) remainingEl.textContent = "00:00:00";
      if (finishingEl) finishingEl.textContent = "--:--:--";
      return;
    }
    if (info.durations.length) {
      info.durations[0] = Math.max(0, info.durations[0] - video.currentTime);
    }
    const totalSeconds = info.durations.reduce((a, b) => a + b, 0);
    const speed = video.playbackRate || 1;
    if (remainingEl) remainingEl.textContent = formatTime(totalSeconds / speed);
    if (finishingEl) {
      const end = new Date(Date.now() + (totalSeconds / speed) * 1000);
      finishingEl.textContent = end.toLocaleTimeString();
    }
  }

  function updatePlaylistUI(video, selectedEndNum) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const info = getPlaylistInfo(selectedEndNum);
    if (!info) {
      speeds.forEach((s) => {
        const el = document.getElementById(
          `playlist-${s.toString().replace(".", "-")}x-time`
        );
        if (el) el.textContent = "00:00:00";
      });
      return;
    }
    if (info.durations.length) {
      info.durations[0] = Math.max(0, info.durations[0] - video.currentTime);
    }
    const totalSeconds = info.durations.reduce((a, b) => a + b, 0);
    speeds.forEach((s) => {
      const el = document.getElementById(
        `playlist-${s.toString().replace(".", "-")}x-time`
      );
      if (el) el.textContent = formatTime(totalSeconds / s);
    });
  }

  function updatePlaylistEndTimeUI(video, selectedEndNum) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const info = getPlaylistInfo(selectedEndNum);
    if (!info) {
      speeds.forEach((s) => {
        const el = document.getElementById(
          `playlist-${s.toString().replace(".", "-")}x-end-time`
        );
        if (el) el.textContent = "--:--:--";
      });
      return;
    }
    if (info.durations.length) {
      info.durations[0] = Math.max(0, info.durations[0] - video.currentTime);
    }
    const totalSeconds = info.durations.reduce((a, b) => a + b, 0);
    speeds.forEach((s) => {
      const el = document.getElementById(
        `playlist-${s.toString().replace(".", "-")}x-end-time`
      );
      if (el) {
        const end = new Date(Date.now() + (totalSeconds / s) * 1000);
        el.textContent = end.toLocaleTimeString();
      }
    });
  }

  function updatePlaylistProgressBar(video, selectedEndNum) {
    const info = getPlaylistInfo(selectedEndNum);
    const bar = document.getElementById("playlistProgressBar");
    if (!info || !bar) {
      if (bar) bar.style.width = "0%";
      return;
    }
    const total = info.durations.length;
    if (total === 0) {
      bar.style.width = "0%";
      return;
    }
    let completed = 0;
    const skipWatched = document.getElementById(
      "skip-watched-checkbox"
    )?.checked;
    if (!skipWatched) {
      completed = info.currentIndex;
    }
    const currentProgress = video.currentTime / video.duration;
    const progress =
      (completed + currentProgress) /
      (total + (skipWatched ? 0 : info.currentIndex));
    bar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  }

  function getCurrentChapter(video) {
    // Try to find chapter markers in the progress bar
    const chapters = Array.from(
      document.querySelectorAll(
        ".ytp-chapter-hover-container, .ytp-chapter-marker"
      )
    );
    if (!chapters.length) return null;
    // Get chapter times from aria-labels or data attributes
    let chapterTimes = [];
    chapters.forEach((ch) => {
      let start = null;
      if (ch.dataset && ch.dataset.chapterStartTimeSecs) {
        start = parseFloat(ch.dataset.chapterStartTimeSecs);
      } else if (ch.getAttribute("aria-label")) {
        // aria-label: "Chapter: Intro. Starts at 0:00"
        const match = ch
          .getAttribute("aria-label")
          .match(/(\d+):(\d+)(?::(\d+))?/);
        if (match) {
          start = parseInt(match[1]) * 60 + parseInt(match[2]);
          if (match[3]) start += parseInt(match[3]);
        }
      }
      if (start !== null) chapterTimes.push(start);
    });
    chapterTimes = chapterTimes.sort((a, b) => a - b);
    if (!chapterTimes.length) return null;
    // Find current chapter index
    const currentTime = video.currentTime;
    let idx = 0;
    for (let i = 0; i < chapterTimes.length; i++) {
      if (currentTime >= chapterTimes[i]) idx = i;
    }
    const start = chapterTimes[idx];
    const end =
      chapterTimes[idx + 1] !== undefined
        ? chapterTimes[idx + 1]
        : video.duration;
    return { start, end };
  }

  function updateChapterUI(video) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const chapter = getCurrentChapter(video);
    const section = document.querySelector(".chapter-section");
    if (!chapter) {
      // Remove any previous message
      let msg = section.querySelector(".no-chapters-msg");
      if (!msg) {
        msg = document.createElement("div");
        msg.className = "no-chapters-msg";
        msg.textContent = "No chapters present in this video";
        section.appendChild(msg);
      }
      // Hide all chapter-option rows
      section
        .querySelectorAll(".chapter-option")
        .forEach((opt) => (opt.style.display = "none"));
      return;
    } else {
      // Remove message if present
      const msg = section.querySelector(".no-chapters-msg");
      if (msg) msg.remove();
      section
        .querySelectorAll(".chapter-option")
        .forEach((opt) => (opt.style.display = "flex"));
    }
    const remaining = Math.max(0, chapter.end - video.currentTime);
    speeds.forEach((s) => {
      const tEl = document.getElementById(
        `chapter-${s.toString().replace(".", "-")}x-time`
      );
      const eEl = document.getElementById(
        `chapter-${s.toString().replace(".", "-")}x-end`
      );
      if (tEl) tEl.textContent = formatTime(remaining / s);
      if (eEl) {
        const endTime = new Date(Date.now() + (remaining / s) * 1000);
        eEl.textContent = endTime.toLocaleTimeString();
      }
    });
  }

  // Tab switching logic
  function setupTabs(box) {
    const tabBtns = box.querySelectorAll(".yt-tab-btn");
    const tabPanels = box.querySelectorAll(".yt-tab-panel");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.getAttribute("data-tab");
        tabPanels.forEach((panel) => {
          if (panel.id === `yt-tab-${tab}`) {
            panel.style.display = "block";
          } else {
            panel.style.display = "none";
          }
        });
      });
    });
  }

  // Inject your UI once video and container are ready
  async function injectUI(video) {
    if (injected) return;

    // Remove any existing injected UI to prevent duplicates
    document.querySelectorAll(".blank-box").forEach((el) => el.remove());

    const container = document.querySelector(
      ".style-scope.yt-chip-cloud-renderer"
    );
    if (!container || !video) return;

    const box = document.createElement("div");
    box.className = "blank-box";

    container.parentNode.insertBefore(box, container);

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
      setInterval(() => updatePlaylistSpeedTimes(video, null), 1000);
      setInterval(() => updatePlaylistCurrentSpeedInfo(video, null), 1000);
      setInterval(() => updatePlaylistEndTimeUI(video, null), 1000);
      setInterval(() => updatePlaylistProgressBar(video, null), 1000);
      setInterval(() => updateChapterUI(video), 1000);

      // Populate playlist-video-select dropdown
      const playlistSelect = box.querySelector("#playlist-video-select");
      const skipWatchedCheckbox = box.querySelector("#skip-watched-checkbox");
      let lastSelectedNum = null;
      function refreshPlaylistDropdown() {
        const items = Array.from(
          document.querySelectorAll("ytd-playlist-panel-video-renderer")
        );
        playlistSelect.innerHTML = "";
        const endOpt = document.createElement("option");
        endOpt.value = "end";
        endOpt.textContent = "End";
        playlistSelect.appendChild(endOpt);
        for (let i = 1; i <= items.length; i++) {
          const opt = document.createElement("option");
          opt.value = i;
          opt.textContent = i;
          playlistSelect.appendChild(opt);
        }
        // Default to 'End'
        playlistSelect.value = "end";
        lastSelectedNum = "end";
      }
      refreshPlaylistDropdown();
      playlistSelect.addEventListener("change", () => {
        lastSelectedNum = playlistSelect.value;
        updatePlaylistSpeedTimes(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistCurrentSpeedInfo(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistEndTimeUI(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistProgressBar(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
      });
      setInterval(() => {
        updatePlaylistSpeedTimes(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistCurrentSpeedInfo(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistEndTimeUI(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
        updatePlaylistProgressBar(
          video,
          lastSelectedNum === "end" ? null : parseInt(lastSelectedNum, 10)
        );
      }, 1000);

      setupTabs(box);
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
  function waitForElements(selectorVideo, selectorContainer, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const intervalTime = 100;
      let elapsed = 0;

      const interval = setInterval(() => {
        const video = document.querySelector(selectorVideo);
        const container = document.querySelector(selectorContainer);

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
      const { video } = await waitForElements(
        "video",
        ".style-scope.yt-chip-cloud-renderer"
      );
      injectUI(video);
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
