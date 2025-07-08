(function () {
  let injected = false;
  let lastUrl = location.href;

  // SETTINGS STATE
  let userSettings = {
    timeFormat: "24", // '24' or '12'
    showSeconds: true,
  };

  function loadUserSettings(cb) {
    chrome.storage &&
      chrome.storage.sync.get(["timeFormat", "showSeconds"], (data) => {
        userSettings.timeFormat = data.timeFormat || "24";
        userSettings.showSeconds =
          data.showSeconds !== undefined ? data.showSeconds : true;
        if (cb) cb();
      });
  }

  // Listen for popup message to update settings live
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "UPDATE_TIME_SETTINGS") {
        loadUserSettings(() => {
          // Re-render UI with new settings
          const video = document.querySelector("video");
          if (video) updateUI(video);
          updateMainClock();
          updatePlaylistSpeedTimes(video, null);
          updatePlaylistCurrentSpeedInfo(video, null);
          updatePlaylistEndTimeUI(video, null);
          updatePlaylistProgressBar(video, null);
        });
      }
    });
  }

  function formatTimeDisplay(dateOrSeconds, opts = {}) {
    // Accepts Date or seconds
    let date;
    if (typeof dateOrSeconds === "number") {
      date = new Date(dateOrSeconds * 1000);
    } else {
      date = dateOrSeconds;
    }
    let hour12 = userSettings.timeFormat === "12";
    let showSeconds =
      opts.showSeconds !== undefined
        ? opts.showSeconds
        : userSettings.showSeconds;
    let options = {
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    };
    if (showSeconds) options.second = "2-digit";
    return date.toLocaleTimeString([], options);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0)
      return userSettings.showSeconds ? "00:00:00" : "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (userSettings.showSeconds) {
      return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
    } else {
      return [h, m].map((v) => v.toString().padStart(2, "0")).join(":");
    }
  }

  // Check if current page is a valid watch page
  function isValidWatchPage() {
    try {
      const url = new URL(window.location.href);
      return url.pathname === "/watch" && url.searchParams.has("v");
    } catch {
      return false;
    }
  }

  // Update main clock
  function updateMainClock() {
    const mainClock = document.getElementById("mainClock");
    if (mainClock) {
      mainClock.textContent = formatTimeDisplay(new Date(), {
        showSeconds: userSettings.showSeconds,
      });
    }
  }

  // Show/hide playlist section based on playlist detection
  function updatePlaylistVisibility() {
    const playlistSection = document.getElementById("playlistSection");
    if (playlistSection) {
      const hasPlaylist = isPlaylistVideo();
      const hasPlaylistData = getPlaylistInfo() !== null;

      // Only show if we have both playlist detection AND actual playlist data
      const shouldShow = hasPlaylist && hasPlaylistData;

      if (shouldShow) {
        playlistSection.style.display = "block";
        playlistSection.style.visibility = "visible";
        playlistSection.style.opacity = "1";
        console.log(
          "YouTube Time Estimator: Playlist detected with data, showing playlist section"
        );
      } else {
        playlistSection.style.display = "none";
        playlistSection.style.visibility = "hidden";
        playlistSection.style.opacity = "0";
        console.log(
          "YouTube Time Estimator: No playlist or playlist data, hiding playlist section"
        );
      }
    } else {
      console.log("YouTube Time Estimator: Playlist section element not found");
    }
  }

  // Update UI elements with timing info
  function updateUI(video) {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const currentTime = video.currentTime;
    const duration = video.duration;
    if (isNaN(currentTime) || isNaN(duration) || duration <= 0) return;

    const remaining = (duration - currentTime) / video.playbackRate;
    const finish = new Date(Date.now() + remaining * 1000);

    updateMainClock();

    const remainingTimeEl = document.getElementById("remainingTime");
    const finishTimeEl = document.getElementById("finishTime");
    if (remainingTimeEl)
      remainingTimeEl.textContent = formatTime(
        userSettings.showSeconds ? remaining : Math.round(remaining)
      );
    if (finishTimeEl)
      finishTimeEl.textContent = formatTimeDisplay(finish, {
        showSeconds: userSettings.showSeconds,
      });

    speeds.forEach((s) => {
      const end = new Date(
        Date.now() + ((remaining * video.playbackRate) / s) * 1000
      );
      const el = document.querySelector(
        `#speed-${s.toString().replace(".", "-")}x-time`
      );
      if (el)
        el.textContent = formatTime(
          userSettings.showSeconds
            ? (end.getTime() - Date.now()) / 1000
            : Math.round((end.getTime() - Date.now()) / 1000)
        );
    });

    const bar = document.getElementById("progressBar");
    if (bar) bar.style.width = `${(currentTime / duration) * 100}%`;

    speeds.forEach((s) => {
      const btn = document.getElementById(
        `speed-${s.toString().replace(".", "-")}x`
      );
      if (btn) btn.classList.toggle("selected", s === video.playbackRate);
    });
  }

  // Helper to check if current video is part of a playlist
  function isPlaylistVideo() {
    // Check for playlist in URL (most reliable)
    const url = new URL(window.location.href);
    if (url.searchParams.has("list")) {
      console.log(
        "YouTube Time Estimator: Playlist detected via URL parameter"
      );
      return true;
    }

    // Check for playlist panel (official YouTube playlist)
    const playlistPanel = document.querySelector("ytd-playlist-panel-renderer");
    if (playlistPanel) {
      console.log(
        "YouTube Time Estimator: Playlist detected via playlist panel"
      );
      return true;
    }

    // Check for playlist sidebar
    const playlistSidebar = document.querySelector(
      "ytd-playlist-sidebar-renderer"
    );
    if (playlistSidebar) {
      console.log(
        "YouTube Time Estimator: Playlist detected via playlist sidebar"
      );
      return true;
    }

    // Check for playlist items in the sidebar (more specific)
    const playlistItems = document.querySelectorAll(
      "ytd-playlist-panel-video-renderer"
    );
    if (playlistItems.length > 1) {
      // Must have more than 1 item to be a playlist
      console.log(
        "YouTube Time Estimator: Playlist detected via playlist items",
        playlistItems.length
      );
      return true;
    }

    // Check for watch queue (when videos are added to queue)
    const watchQueue = document.querySelector("ytd-watch-queue-renderer");
    if (watchQueue) {
      console.log("YouTube Time Estimator: Playlist detected via watch queue");
      return true;
    }

    // Check for autoplay queue
    const autoplayQueue = document.querySelector("ytd-autoplay-renderer");
    if (autoplayQueue) {
      console.log(
        "YouTube Time Estimator: Playlist detected via autoplay queue"
      );
      return true;
    }

    console.log("YouTube Time Estimator: No playlist detected");
    return false;
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
    const skipWatched = false;
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
    const skipWatched = false;
    if (!skipWatched) {
      completed = info.currentIndex;
    }
    const currentProgress = video.currentTime / video.duration;
    const progress =
      (completed + currentProgress) /
      (total + (skipWatched ? 0 : info.currentIndex));
    bar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  }

  // Setup expandable sections
  function setupExpandableSections(box) {
    // Timing section toggle (includes speed options)
    const timingSection = box.querySelector(".timing-section");
    const timingToggle = box.querySelector("#timingToggle");
    const timingHeader = box.querySelector(".timing-header");
    let timingExpanded = false;

    function setTimingExpanded(state) {
      timingExpanded = state;
      if (timingExpanded) {
        timingSection.classList.add("expanded");
      } else {
        timingSection.classList.remove("expanded");
      }
    }

    if (timingToggle) {
      timingToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setTimingExpanded(!timingExpanded);
      });
    }

    if (timingHeader) {
      timingHeader.addEventListener("click", (e) => {
        if (e.target === timingToggle) return;
        setTimingExpanded(!timingExpanded);
      });
    }

    // Playlist section toggle
    const playlistSection = box.querySelector(".playlist-section");
    const playlistToggle = box.querySelector("#playlistToggle");
    const playlistHeader = box.querySelector(".playlist-header");
    let playlistExpanded = false;

    function setPlaylistExpanded(state) {
      playlistExpanded = state;
      if (playlistExpanded) {
        playlistSection.classList.add("expanded");
      } else {
        playlistSection.classList.remove("expanded");
      }
    }

    if (playlistToggle) {
      playlistToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setPlaylistExpanded(!playlistExpanded);
      });
    }

    if (playlistHeader) {
      playlistHeader.addEventListener("click", (e) => {
        if (e.target === playlistToggle) return;
        setPlaylistExpanded(!playlistExpanded);
      });
    }
  }

  // Inject your UI once video and container are ready
  async function injectUI(video) {
    if (injected) return;

    console.log("YouTube Time Estimator: Starting injection...");

    // Remove any existing injected UI to prevent duplicates
    document.querySelectorAll(".blank-box").forEach((el) => el.remove());

    // Try multiple container selectors in case YouTube changed their DOM
    let container = document.querySelector(
      ".style-scope.yt-chip-cloud-renderer"
    );
    if (!container) {
      container = document.querySelector("#below");
    }
    if (!container) {
      container = document.querySelector("#secondary");
    }
    if (!container) {
      container = document.querySelector("#secondary-inner");
    }
    if (!container || !video) {
      console.log("YouTube Time Estimator: Container or video not found", {
        container: !!container,
        video: !!video,
      });
      return;
    }

    console.log(
      "YouTube Time Estimator: Found container and video, injecting UI..."
    );

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
      setInterval(() => updateMainClock(), 1000);
      setInterval(() => updatePlaylistSpeedTimes(video, null), 1000);
      setInterval(() => updatePlaylistCurrentSpeedInfo(video, null), 1000);
      setInterval(() => updatePlaylistEndTimeUI(video, null), 1000);
      setInterval(() => updatePlaylistProgressBar(video, null), 1000);

      // Check playlist visibility immediately and then every second
      updatePlaylistVisibility();
      setInterval(() => updatePlaylistVisibility(), 1000);

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
        updateMainClock();
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

      setupExpandableSections(box);

      // Initial playlist visibility check with delay to ensure DOM is loaded
      setTimeout(() => {
        updatePlaylistVisibility();
        console.log(
          "YouTube Time Estimator: Initial playlist visibility check completed"
        );
      }, 500);

      console.log(
        "YouTube Time Estimator: UI injection completed successfully!"
      );
    } catch (e) {
      console.error("YouTube Time Estimator: Failed to load content.html", e);
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
        const video = document.querySelector(selectorVideo);
        let container = document.querySelector(
          ".style-scope.yt-chip-cloud-renderer"
        );
        if (!container) {
          container = document.querySelector("#below");
        }
        if (!container) {
          container = document.querySelector("#secondary");
        }
        if (!container) {
          container = document.querySelector("#secondary-inner");
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
      const { video } = await waitForElements("video");
      injectUI(video);
    } catch {
      // ignore and retry later
    }
  }

  // Load settings and start injection
  loadUserSettings(() => {
    // Detect SPA navigation by polling URL
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        injected = false;
        console.log("YouTube Time Estimator: URL changed, reinjecting...");
        tryInject();
      }
    }, 500);

    // Initial attempt
    tryInject();
  });
})();
