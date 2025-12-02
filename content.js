(function () {
  let injected = false;
  let lastUrl = location.href;
  let updateInterval = null;
  let playlistTargetIndex = null; // Store user preference
  let is24HourMode = true; // Default to 24h


  // --- 1. UTILITIES ---

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
  }

  function formatTimeShort(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getFinishTime(secondsFromNow) {
    const date = new Date(Date.now() + secondsFromNow * 1000);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !is24HourMode });
  }

  function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  // --- 1.5 SETTINGS ---

  async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['is24HourMode']);
        if (result.is24HourMode !== undefined) {
            is24HourMode = result.is24HourMode;
        }
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
  }

  function saveSettings() {
    try {
        chrome.storage.local.set({ is24HourMode });
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
  }

  // --- 2. SCRAPERS ---

  function getChapterInfo(video) {
    const duration = video.duration;
    const currentTime = video.currentTime;
    if (isNaN(duration) || isNaN(currentTime)) return null;

    let chapters = [];

    // Strategy 1: Macro Markers List (Most reliable if available)
    const macroMarkers = document.querySelectorAll('ytd-macro-markers-list-item-renderer');
    if (macroMarkers.length > 0) {
        macroMarkers.forEach(marker => {
            const timeStr = marker.querySelector('#time')?.textContent?.trim();
            const title = marker.querySelector('#title')?.textContent?.trim();
            if (timeStr) {
                const time = parseDuration(timeStr);
                chapters.push({ time, title });
            }
        });
    }

    // Strategy 2: Visual Markers (Progress Bar)
    if (chapters.length === 0) {
        const markers = Array.from(document.querySelectorAll('.ytp-chapter-marker'));
        if (markers.length > 0) {
            chapters = markers.map(marker => {
                let pct = parseFloat(marker.style.left);
                if (isNaN(pct)) pct = parseFloat(marker.style.paddingLeft);
                return {
                    time: (pct / 100) * duration,
                    title: null 
                };
            }).sort((a, b) => a.time - b.time);
        }
    }

    // Strategy 3: Description Timestamps (Fallback)
    if (chapters.length === 0) {
        const descriptionEl = document.querySelector('#description-inline-expander') || document.querySelector('#description');
        if (descriptionEl) {
            const text = descriptionEl.innerText;
            const regex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.*)/g;
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                const h = match[1] ? parseInt(match[1]) : 0;
                const m = parseInt(match[2]);
                const s = parseInt(match[3]);
                const title = match[4]?.trim().split('\n')[0]; 
                const seconds = h * 3600 + m * 60 + s;
                if (seconds < duration) {
                    chapters.push({ time: seconds, title });
                }
            }
        }
    }

    chapters.sort((a, b) => a.time - b.time);
    chapters = chapters.filter((c, index, self) => {
        return c.time >= 0 && c.time < duration && (index === 0 || c.time > self[index-1].time + 1);
    });

    if (chapters.length === 0) return null;

    let currentChapter = null;
    let nextChapterTime = duration;

    for (let i = 0; i < chapters.length; i++) {
        if (currentTime >= chapters[i].time) {
            currentChapter = chapters[i];
            nextChapterTime = (i + 1 < chapters.length) ? chapters[i + 1].time : duration;
        } else {
            break;
        }
    }

    if (!currentChapter) {
        if (chapters[0].time > 0) {
             currentChapter = { time: 0, title: "Intro" };
             nextChapterTime = chapters[0].time;
        } else {
            return null;
        }
    }

    if (!currentChapter.title) {
        const hoverTitle = document.querySelector('.ytp-chapter-title-content')?.textContent;
        currentChapter.title = hoverTitle || "Chapter";
    }

    return {
        title: currentChapter.title,
        remaining: nextChapterTime - currentTime,
        endTime: nextChapterTime,
        startTime: currentChapter.time,
        duration: nextChapterTime - currentChapter.time,
        progress: (currentTime - currentChapter.time) / (nextChapterTime - currentChapter.time)
    };
  }

  function getPlaylistInfo(video, targetIndex = null) {
    const playlistPanel = document.querySelector('ytd-playlist-panel-renderer');
    if (!playlistPanel) return null;

    const currentVideoItem = playlistPanel.querySelector('ytd-playlist-panel-video-renderer[selected]');
    if (!currentVideoItem) return null;

    let totalRemaining = 0;
    let count = 0;
    let foundCurrent = false;
    let totalDuration = 0;
    let currentElapsed = 0;
    
    const items = Array.from(playlistPanel.querySelectorAll('ytd-playlist-panel-video-renderer'));
    if (items.length === 0) return null;

    // Attempt to determine absolute indices
    let firstAbsoluteIndex = -1;
    let firstDomIndexWithNumber = -1;

    for (let i = 0; i < items.length; i++) {
        const indexEl = items[i].querySelector('#index');
        if (indexEl) {
            const val = parseInt(indexEl.textContent.trim());
            if (!isNaN(val)) {
                firstAbsoluteIndex = val;
                firstDomIndexWithNumber = i;
                break;
            }
        }
    }

    // Fallback: assume 1-based from start of DOM if no index found
    if (firstAbsoluteIndex === -1) {
        firstAbsoluteIndex = 1;
        firstDomIndexWithNumber = 0;
    }

    // Calculate current video's absolute index
    const currentDomIndex = items.indexOf(currentVideoItem);
    const currentAbsoluteIndex = firstAbsoluteIndex + (currentDomIndex - firstDomIndexWithNumber);
    
    // Determine the last available index in DOM
    const lastDomIndex = items.length - 1;
    const lastAbsoluteIndex = firstAbsoluteIndex + (lastDomIndex - firstDomIndexWithNumber);

    // Determine target index
    // If not set, default to last available (this is the only time we "change" it for the user)
    let effectiveTargetIndex = targetIndex;
    if (effectiveTargetIndex === null) {
        effectiveTargetIndex = lastAbsoluteIndex;
    }

    // Calculation Logic
    // We only sum up to the target. 
    // If target < current, we effectively calculate nothing (or just current video remainder?)
    // Let's stick to the loop logic: it breaks if index > target.
    // If target < current, the loop will break before adding any *future* videos.
    // But we still add the current video's remainder if we are ON the current video.
    
    // We clamp the calculation loop to what is loaded in DOM
    const calculationTargetIndex = Math.min(effectiveTargetIndex, lastAbsoluteIndex);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const absoluteIndex = firstAbsoluteIndex + (i - firstDomIndexWithNumber);

        // Stop if we passed the target
        if (absoluteIndex > calculationTargetIndex) break;

        const durationStr = item.querySelector('#text.ytd-thumbnail-overlay-time-status-renderer')?.textContent?.trim();
        const itemDuration = parseDuration(durationStr);
        
        totalDuration += itemDuration;

        if (item === currentVideoItem) {
            foundCurrent = true;
            if (video && !isNaN(video.duration) && !isNaN(video.currentTime)) {
                 totalRemaining += (video.duration - video.currentTime);
                 currentElapsed += video.currentTime;
            }
             continue;
        }
        
        if (foundCurrent) {
            // Only add if we are <= target (checked by loop break above)
            // But wait, if target < current, we shouldn't be here?
            // If target < current, absoluteIndex > calculationTargetIndex will trigger BEFORE we reach current?
            // No, current is at `currentAbsoluteIndex`.
            // If target (50) < current (100). calculationTargetIndex is 50.
            // Loop runs 1..50. Breaks.
            // We never reach current (100).
            // So foundCurrent is false. totalRemaining is 0.
            // This is correct: "Finish at 50" when at 100 means "Already finished".
            
            if (durationStr) {
                totalRemaining += itemDuration;
                count++;
            }
        } else {
            currentElapsed += itemDuration;
        }
    }

    return {
        videosRemaining: count,
        totalSeconds: totalRemaining,
        progress: totalDuration > 0 ? (currentElapsed / totalDuration) : 0,
        currentIndex: currentAbsoluteIndex,
        totalVideos: lastAbsoluteIndex, 
        targetIndex: effectiveTargetIndex // Return the user's target (or default), NOT clamped to current
    };
  }

  // --- 3. UI CONSTRUCTION ---

  function createUI() {
    const container = document.createElement('div');
    container.id = 'yt-time-manager-container';
    
    const settingsIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    const videoIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H5v-2h6v2zm0-4H5V7h6v2zm8 4h-6v-2h6v2zm0-4h-6V7h6v2z"/></svg>`;
    const chapterIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>`;
    const playlistIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`;

    // Helper to create details panel structure
    const createDetailsPanel = (idPrefix, extraContent = '') => `
        <div class="dt-details-panel">
            ${extraContent}
            <div class="dt-detail-header">
                <span>Time Remaining</span>
                <span>Speed</span>
                <span>Finishing At</span>
            </div>
            <div id="${idPrefix}-details-list" class="dt-detail-list"></div>
        </div>
    `;

    const playlistControls = `
        <div class="dt-playlist-controls">
            <span>Calculate until video:</span>
            <div class="dt-input-wrapper">
                <input type="number" id="dt-playlist-target-input" min="1" class="dt-playlist-input">
                <span id="dt-playlist-total-count" class="dt-playlist-total">/ --</span>
            </div>
        </div>
    `;

    const settingsPanel = `
        <div id="dt-settings-panel" class="dt-settings-panel hidden">
            <div class="dt-setting-row">
                <span>24-Hour Clock</span>
                <label class="dt-toggle-switch">
                    <input type="checkbox" id="dt-24h-toggle" ${is24HourMode ? 'checked' : ''}>
                    <span class="dt-slider"></span>
                </label>
            </div>
        </div>
    `;

    container.innerHTML = `
      <!-- Header -->
      <div class="dt-header">
        <div class="dt-speed-control">
            <div class="dt-speed-wrapper">
                <span class="dt-speed-label">Cur. Speed:</span>
                <div class="dt-speed-actions">
                    <span id="dt-speed-down" class="dt-speed-btn">−</span>
                    <span id="dt-speed-val">1.0</span>
                    <span id="dt-speed-up" class="dt-speed-btn">+</span>
                </div>
            </div>
        </div>
        <div id="dt-current-clock" class="dt-main-clock">--:--:--</div>
        <div class="dt-settings-icon" id="dt-settings-btn">${settingsIcon}</div>
        ${settingsPanel}
      </div>

      <!-- Video Section -->
      <div class="dt-section-card">
        <div class="dt-section-header dt-color-video">
            <span class="dt-icon">${videoIcon}</span>
            <span>Video</span>
            <div class="dt-progress-track">
                <div id="dt-video-progress" class="dt-progress-fill dt-bg-video"></div>
            </div>
        </div>
        <div class="dt-stats-row">
            <div class="dt-stat-box">
                <span class="dt-stat-label">Time Remaining:</span>
                <span id="dt-video-remaining" class="dt-stat-value">--:--</span>
            </div>
            <div class="dt-stat-box">
                <span class="dt-stat-label">Finishing At:</span>
                <span id="dt-video-finish" class="dt-stat-value">--:--</span>
            </div>
        </div>
        ${createDetailsPanel('dt-video')}
      </div>

      <!-- Chapter Section -->
      <div id="dt-chapter-section" class="dt-section-card hidden">
        <div class="dt-section-header dt-color-chapter">
            <span class="dt-icon">${chapterIcon}</span>
            <span id="dt-chapter-name">Chapter</span>
            <div class="dt-progress-track">
                <div id="dt-chapter-progress" class="dt-progress-fill dt-bg-chapter"></div>
            </div>
        </div>
        <div class="dt-stats-row">
            <div class="dt-stat-box">
                <span class="dt-stat-label">Time Remaining:</span>
                <span id="dt-chapter-remaining" class="dt-stat-value">--:--</span>
            </div>
            <div class="dt-stat-box">
                <span class="dt-stat-label">Finishing At:</span>
                <span id="dt-chapter-finish" class="dt-stat-value">--:--</span>
            </div>
        </div>
        ${createDetailsPanel('dt-chapter')}
      </div>

      <!-- Playlist Section -->
      <div id="dt-playlist-section" class="dt-section-card hidden">
        <div class="dt-section-header dt-color-playlist">
            <span class="dt-icon">${playlistIcon}</span>
            <span>Playlist</span>
            <div class="dt-progress-track">
                <div id="dt-playlist-progress" class="dt-progress-fill dt-bg-playlist"></div>
            </div>
        </div>
        <div class="dt-stats-row">
            <div class="dt-stat-box">
                <span class="dt-stat-label">Time Remaining:</span>
                <span id="dt-playlist-remaining" class="dt-stat-value">--:--</span>
            </div>
            <div class="dt-stat-box">
                <span class="dt-stat-label">Finishing At:</span>
                <span id="dt-playlist-finish" class="dt-stat-value">--:--</span>
            </div>
        </div>
        ${createDetailsPanel('dt-playlist', playlistControls)}
      </div>
    `;

    const speedDown = container.querySelector('#dt-speed-down');
    const speedUp = container.querySelector('#dt-speed-up');
    const playlistInput = container.querySelector('#dt-playlist-target-input');

    speedDown.addEventListener('click', () => changeSpeed(-0.25));
    speedUp.addEventListener('click', () => changeSpeed(0.25));
    
    // Playlist Input Listener
    playlistInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val > 0) {
            playlistTargetIndex = val;
            const video = document.querySelector('video');
            if (video) updateUI(video);
        }
    });


    // Settings Listeners
    const settingsBtn = container.querySelector('#dt-settings-btn');
    const settingsPanelEl = container.querySelector('#dt-settings-panel');
    const toggle24h = container.querySelector('#dt-24h-toggle');

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanelEl.classList.toggle('hidden');
    });

    // Close settings when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanelEl.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanelEl.classList.add('hidden');
        }
    });

    toggle24h.addEventListener('change', (e) => {
        is24HourMode = e.target.checked;
        saveSettings();
        const video = document.querySelector('video');
        if (video) updateUI(video);
    });

    return container;
  }

  function changeSpeed(delta) {
    const video = document.querySelector('video');
    if (video) {
        let newRate = video.playbackRate + delta;
        if (newRate < 0.25) newRate = 0.25;
        if (newRate > 16) newRate = 16;
        video.playbackRate = newRate;
        updateUI(video);
    }
  }

  function updateDetailsList(listId, remainingSeconds, currentSpeed, activeClass) {
    const list = document.getElementById(listId);
    if (!list) return;

    const speeds = [1, 1.25, 1.5, 1.75, 2];
    if (!speeds.includes(currentSpeed)) {
        speeds.push(currentSpeed);
        speeds.sort((a, b) => a - b);
    }

    let html = '';
    speeds.forEach(speed => {
        const adjustedRemaining = remainingSeconds / speed;
        const isActive = speed === currentSpeed;
        const activeClassStr = isActive ? `active ${activeClass}` : '';
        
        html += `
            <div class="dt-detail-row ${activeClassStr}">
                <span>${formatTimeShort(adjustedRemaining)}</span>
                <span>${speed}x</span>
                <span>${getFinishTime(adjustedRemaining)}</span>
            </div>
        `;
    });
    list.innerHTML = html;
  }

  function updateUI(video) {
    const container = document.getElementById('yt-time-manager-container');
    if (!container) return;

    const duration = video.duration;
    const currentTime = video.currentTime;
    const playbackRate = video.playbackRate;

    if (isNaN(duration) || duration <= 0) return;

    // 1. Update Header
    document.getElementById('dt-speed-val').textContent = playbackRate.toFixed(2);
    document.getElementById('dt-current-clock').textContent = new Date().toLocaleTimeString([], { hour12: !is24HourMode });

    // 2. Update Video Section
    const videoRemainingRaw = duration - currentTime;
    const videoRemaining = videoRemainingRaw / playbackRate;
    document.getElementById('dt-video-remaining').textContent = formatTimeShort(videoRemaining);
    document.getElementById('dt-video-finish').textContent = getFinishTime(videoRemaining);
    
    const videoProgress = (currentTime / duration) * 100;
    document.getElementById('dt-video-progress').style.width = `${videoProgress}%`;

    // Update Video Details
    updateDetailsList('dt-video-details-list', videoRemainingRaw, playbackRate, 'video-active');

    // 3. Update Chapter Section
    const chapterInfo = getChapterInfo(video);
    const chapterSection = document.getElementById('dt-chapter-section');
    
    if (chapterInfo && chapterInfo.remaining > 0) {
        chapterSection.classList.remove('hidden');
        document.getElementById('dt-chapter-name').textContent = chapterInfo.title;
        
        const chapterRemaining = chapterInfo.remaining / playbackRate;
        document.getElementById('dt-chapter-remaining').textContent = formatTimeShort(chapterRemaining);
        document.getElementById('dt-chapter-finish').textContent = getFinishTime(chapterRemaining);
        
        const chapterProgress = Math.max(0, Math.min(100, chapterInfo.progress * 100));
        document.getElementById('dt-chapter-progress').style.width = `${chapterProgress}%`;

        // Update Chapter Details (using raw remaining time for calculation)
        updateDetailsList('dt-chapter-details-list', chapterInfo.remaining, playbackRate, 'chapter-active');
    } else {
        chapterSection.classList.add('hidden');
    }

    // 4. Update Playlist Section
    const playlistInfo = getPlaylistInfo(video, playlistTargetIndex);
    const playlistSection = document.getElementById('dt-playlist-section');

    if (playlistInfo && playlistInfo.totalVideos > 0) {
        playlistSection.classList.remove('hidden');
        
        // Update Inputs
        const input = document.getElementById('dt-playlist-target-input');
        const totalLabel = document.getElementById('dt-playlist-total-count');
        
        if (input && totalLabel) {
            // If user hasn't set a custom target, always default to playlist total
            if (playlistTargetIndex === null) {
                input.value = playlistInfo.totalVideos;
            } else if (document.activeElement !== input) {
                // If user has set a value, keep it displayed (unless they're typing)
                if (parseInt(input.value) !== playlistTargetIndex) {
                    input.value = playlistTargetIndex;
                }
            }
            
            totalLabel.textContent = `/ ${playlistInfo.totalVideos}`;
        }

        const playlistRemaining = playlistInfo.totalSeconds / playbackRate;
        document.getElementById('dt-playlist-remaining').textContent = formatTimeShort(playlistRemaining);
        document.getElementById('dt-playlist-finish').textContent = getFinishTime(playlistRemaining);

        const playlistProgress = Math.max(0, Math.min(100, playlistInfo.progress * 100));
        document.getElementById('dt-playlist-progress').style.width = `${playlistProgress}%`;

        // Update Playlist Details
        updateDetailsList('dt-playlist-details-list', playlistInfo.totalSeconds, playbackRate, 'playlist-active');
    } else {
        playlistSection.classList.add('hidden');
    }
  }

  // --- 4. INJECTION LOGIC ---

  async function injectUI(video, container) {
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) return;


    await loadSettings(); // Load settings before creating UI
    const ui = createUI();
    
    if (container.id === 'secondary') {
        container.prepend(ui);
    } else {
        container.parentNode.insertBefore(ui, container);
    }

    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => updateUI(video), 1000);
    updateUI(video);

    injected = true;
  }

  function isValidWatchPage() {
    try {
      const url = new URL(window.location.href);
      return url.pathname === "/watch" && url.searchParams.has("v");
    } catch {
      return false;
    }
  }

  // --- 5. OBSERVERS & INIT ---

  function getVideoId(url) {
      try {
          const u = new URL(url);
          return u.searchParams.get('v');
      } catch {
          return null;
      }
  }

  function init() {
    let lastVideoId = getVideoId(location.href);

    const observer = new MutationObserver((mutations) => {
        const currentVideoId = getVideoId(location.href);
        if (currentVideoId !== lastVideoId) {
            lastVideoId = currentVideoId;
            handleNavigation();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    handleNavigation();
  }

  async function handleNavigation() {
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) existing.remove();
    if (updateInterval) clearInterval(updateInterval);
    injected = false;
    playlistTargetIndex = null; // Reset target on nav

    if (!isValidWatchPage()) return;

    const video = await waitForElement('video');
    const container = await waitForElement('#secondary, ytd-watch-next-secondary-results-renderer');

    if (video && container) {
        injectUI(video, container);
    }
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
  }

  init();

})();
