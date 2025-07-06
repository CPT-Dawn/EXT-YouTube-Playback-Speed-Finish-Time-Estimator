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

  // Update main clock
  function updateMainClock() {
    const mainClockEl = document.getElementById("mainClock");
    if (mainClockEl) {
      const now = new Date();
      mainClockEl.textContent = now.toLocaleTimeString();
    }
  }

  // Show/hide playlist section based on playlist detection
  function updatePlaylistVisibility() {
    const playlistSection = document.getElementById(
      "yt-playlist-expandable-summary"
    );
    if (playlistSection) {
      const hasPlaylist = isPlaylistVideo();
      const hasPlaylistData = getPlaylistInfo() !== null;

      // Only show if we have both playlist detection AND actual playlist data
      const shouldShow = hasPlaylist && hasPlaylistData;

      if (shouldShow) {
        playlistSection.style.display = "block";
        playlistSection.style.visibility = "visible";
        console.log(
          "YouTube Time Estimator: Playlist detected with data, showing playlist section"
        );
      } else {
        playlistSection.style.display = "none";
        playlistSection.style.visibility = "hidden";
        console.log(
          "YouTube Time Estimator: No playlist or playlist data, hiding playlist section"
        );
      }
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

    // Update main clock
    updateMainClock();

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

  // Helper to check if current video is part of a playlist
  function isPlaylistVideo() {
    // Check for playlist panel
    const playlistPanel = document.querySelector("ytd-playlist-panel-renderer");
    if (playlistPanel) return true;

    // Check for queue (watch-next items)
    const queueItems = document.querySelectorAll("ytd-compact-video-renderer");
    if (queueItems.length > 0) return true;

    // Check for playlist in URL
    const url = new URL(window.location.href);
    if (url.searchParams.has("list")) return true;

    // Check for playlist sidebar
    const playlistSidebar = document.querySelector(
      "ytd-playlist-sidebar-renderer"
    );
    if (playlistSidebar) return true;

    // Check for playlist items in the sidebar
    const playlistItems = document.querySelectorAll(
      "ytd-playlist-panel-video-renderer"
    );
    if (playlistItems.length > 0) return true;

    // Check for "Up next" section with multiple videos
    const upNextSection = document.querySelector(
      "ytd-watch-next-secondary-results-renderer"
    );
    if (upNextSection) {
      const upNextVideos = upNextSection.querySelectorAll(
        "ytd-compact-video-renderer"
      );
      if (upNextVideos.length > 1) return true;
    }

    // Check for autoplay queue
    const autoplayQueue = document.querySelector("ytd-autoplay-renderer");
    if (autoplayQueue) return true;

    // Check for watch queue (when videos are added to queue)
    const watchQueue = document.querySelector("ytd-watch-queue-renderer");
    if (watchQueue) return true;

    // Check for any video list in the sidebar
    const videoList = document.querySelector(
      "ytd-video-secondary-info-renderer"
    );
    if (videoList) {
      const relatedVideos = videoList.querySelectorAll(
        "ytd-compact-video-renderer"
      );
      if (relatedVideos.length > 0) return true;
    }

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

  // Setup expandable sections
  function setupExpandableSections(box) {
    // Video expandable summary logic
    const expandable = box.querySelector("#yt-expandable-summary");
    const expandBtn = box.querySelector("#yt-expand-btn");
    let expanded = false;
    function setExpanded(state) {
      expanded = state;
      if (expanded) {
        expandable.classList.add("expanded");
      } else {
        expandable.classList.remove("expanded");
      }
    }
    // Click to toggle
    if (expandBtn) {
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setExpanded(!expanded);
      });
    }
    // Click on card to toggle (except button)
    const header = box.querySelector("#yt-expandable-header");
    if (header) {
      header.addEventListener("click", (e) => {
        if (e.target === expandBtn) return;
        setExpanded(!expanded);
      });
    }
    // Hover to expand (desktop only)
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      expandable.addEventListener("mouseenter", () => setExpanded(true));
      expandable.addEventListener("mouseleave", () => setExpanded(false));
    }

    // Playlist expandable summary logic
    const playlistExpandable = box.querySelector(
      "#yt-playlist-expandable-summary"
    );
    const playlistExpandBtn = box.querySelector("#yt-playlist-expand-btn");
    let playlistExpanded = false;
    function setPlaylistExpanded(state) {
      playlistExpanded = state;
      if (playlistExpanded) {
        playlistExpandable.classList.add("expanded");
      } else {
        playlistExpandable.classList.remove("expanded");
      }
    }
    // Click to toggle
    if (playlistExpandBtn) {
      playlistExpandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setPlaylistExpanded(!playlistExpanded);
      });
    }
    // Click on card to toggle (except button)
    const playlistHeader = box.querySelector("#yt-playlist-expandable-header");
    if (playlistHeader) {
      playlistHeader.addEventListener("click", (e) => {
        if (e.target === playlistExpandBtn) return;
        setPlaylistExpanded(!playlistExpanded);
      });
    }
    // Hover to expand (desktop only)
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      playlistExpandable.addEventListener("mouseenter", () =>
        setPlaylistExpanded(true)
      );
      playlistExpandable.addEventListener("mouseleave", () =>
        setPlaylistExpanded(false)
      );
    }
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
      setInterval(() => updateMainClock(), 1000);
      setInterval(() => updatePlaylistSpeedTimes(video, null), 1000);
      setInterval(() => updatePlaylistCurrentSpeedInfo(video, null), 1000);
      setInterval(() => updatePlaylistEndTimeUI(video, null), 1000);
      setInterval(() => updatePlaylistProgressBar(video, null), 1000);

      // Check playlist visibility every 2 seconds
      setInterval(() => updatePlaylistVisibility(), 2000);

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

      // Initial playlist visibility check
      updatePlaylistVisibility();
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
