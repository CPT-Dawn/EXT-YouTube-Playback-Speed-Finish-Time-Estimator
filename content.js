(function () {
  let injected = false;
  let updateInterval = null;
  let playlistTargetIndex = null; // Store user preference
  let is24HourMode = true; // Default to 24h
  let lastVideoId = null; // Track current video ID
  let navigationDebounceTimer = null; // Debounce navigation events
  const DEBUG = false; // Set to true for debugging


  // --- 1. UTILITIES ---

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

  function getCurrentVideoId() {
    try {
      const urlParams = new URLSearchParams(location.search);
      return urlParams.get('v');
    } catch {
      return null;
    }
  }

  function debugLog(...args) {
    if (DEBUG) {
      console.log('[YT Time Manager]', ...args);
    }
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

  async function loadUI() {
    try {
        const response = await fetch(chrome.runtime.getURL('overlay.html'));
        const html = await response.text();
        const container = document.createElement('div');
        container.innerHTML = html;
        const ui = container.firstElementChild;
        
        // Apply initial settings
        const toggle24h = ui.querySelector('#dt-24h-toggle');
        if (toggle24h) toggle24h.checked = is24HourMode;
        
        attachListeners(ui);
        return ui;
    } catch (e) {
        console.error("Failed to load UI:", e);
        return null;
    }
  }

  function attachListeners(container) {
    const speedDown = container.querySelector('#dt-speed-down');
    const speedUp = container.querySelector('#dt-speed-up');
    const playlistInput = container.querySelector('#dt-playlist-target-input');

    if(speedDown) speedDown.addEventListener('click', () => changeSpeed(-0.25));
    if(speedUp) speedUp.addEventListener('click', () => changeSpeed(0.25));
    
    // Playlist Input Listener
    if(playlistInput) {
        playlistInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val > 0) {
                playlistTargetIndex = val;
                const video = document.querySelector('video');
                if (video) updateUI(video);
            }
        });
    }

    // Settings Listeners
    const settingsBtn = container.querySelector('#dt-settings-btn');
    const settingsPanelEl = container.querySelector('#dt-settings-panel');
    const toggle24h = container.querySelector('#dt-24h-toggle');

    if(settingsBtn && settingsPanelEl) {
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
    }

    if(toggle24h) {
        toggle24h.addEventListener('change', (e) => {
            is24HourMode = e.target.checked;
            saveSettings();
            const video = document.querySelector('video');
            if (video) updateUI(video);
        });
    }
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

  let isInjecting = false;
  let currentInjectionId = 0;

  function cleanup() {
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) existing.remove();
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    injected = false;
    playlistTargetIndex = null;
  }

  async function injectUI(injectionId) {
    debugLog('injectUI called with ID:', injectionId);
    
    // 1. Synchronous Lock Check
    if (isInjecting) {
      debugLog('Already injecting, skipping');
      return;
    }
    
    // 2. Validate we are on a watch page BEFORE starting
    if (!isValidWatchPage()) {
      debugLog('Not a valid watch page, skipping');
      return;
    }
    
    // 3. Check if this is the same video
    const currentVideoId = getCurrentVideoId();
    if (!currentVideoId) {
      debugLog('No video ID found, skipping');
      return;
    }
    
    if (injected && lastVideoId === currentVideoId) {
      debugLog('Same video, UI already injected, skipping');
      return;
    }
    
    isInjecting = true;
    debugLog('Starting injection for video:', currentVideoId);

    try {
      // 4. Concurrency Check: Before cleanup
      if (injectionId !== currentInjectionId) {
        debugLog('Stale injection ID, aborting');
        return;
      }

      // 5. Cleanup previous instance
      cleanup();

      // 6. Wait for necessary elements with longer timeout
      const video = await waitForElement('video', 15000);
      const container = await waitForElement('#secondary, ytd-watch-next-secondary-results-renderer', 15000);

      // 7. Concurrency Check: After async wait
      if (injectionId !== currentInjectionId) {
        debugLog('Stale injection ID after wait, aborting');
        return;
      }

      if (!video || !container) {
        debugLog('Required elements not found:', { video: !!video, container: !!container });
        return;
      }

      // 8. Final Safety Check: Ensure we don't double inject
      if (document.getElementById('yt-time-manager-container')) {
        debugLog('UI already exists, skipping');
        return;
      }

      // 9. Load settings and create UI
      await loadSettings();
      const ui = await loadUI();
      if (!ui) {
          debugLog('Failed to load UI');
          return;
      }
      
      if (container.id === 'secondary') {
        container.prepend(ui);
      } else {
        container.parentNode.insertBefore(ui, container);
      }

      // 10. Start updates
      updateInterval = setInterval(() => updateUI(video), 1000);
      updateUI(video);
      
      injected = true;
      lastVideoId = currentVideoId;
      debugLog('Injection successful for video:', currentVideoId);

    } catch (error) {
      debugLog('Injection error:', error);
    } finally {
      isInjecting = false;
    }
  }

  function isValidWatchPage() {
    try {
      return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
    } catch {
      return false;
    }
  }

  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        debugLog('Element found immediately:', selector);
        return resolve(existing);
      }

      debugLog('Waiting for element:', selector);
      let resolved = false;

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element && !resolved) {
          resolved = true;
          observer.disconnect();
          debugLog('Element found via observer:', selector);
          resolve(element);
        }
      });

      observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          debugLog('Element wait timeout:', selector);
          resolve(null);
        }
      }, timeout);
    });
  }

  // --- 5. OBSERVERS & INIT ---

  function handleNavigation() {
    debugLog('Navigation detected, URL:', location.href);
    
    // Debounce: Prevent rapid-fire calls
    if (navigationDebounceTimer) {
      clearTimeout(navigationDebounceTimer);
    }
    
    navigationDebounceTimer = setTimeout(() => {
      currentInjectionId++;
      const thisInjectionId = currentInjectionId;
      debugLog('Triggering injection with ID:', thisInjectionId);
      injectUI(thisInjectionId);
    }, 300); // 300ms debounce
  }

  function init() {
    debugLog('Initializing YouTube Time Manager');
    
    // 1. Primary: Listen for YouTube's custom navigation event
    document.addEventListener('yt-navigate-finish', handleNavigation);
    debugLog('Registered yt-navigate-finish listener');
    
    // 2. Backup: URL change detection for edge cases
    let lastUrl = location.href;
    const urlCheckInterval = setInterval(() => {
      if (location.href !== lastUrl) {
        debugLog('URL change detected via polling');
        lastUrl = location.href;
        if (isValidWatchPage() && !isInjecting) {
          handleNavigation();
        }
      }
    }, 2000); // Check every 2 seconds
    
    // 3. Initial Load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        debugLog('DOMContentLoaded fired');
        handleNavigation();
      });
    } else {
      debugLog('Document already ready');
      handleNavigation();
    }
  }

  init();

})();
