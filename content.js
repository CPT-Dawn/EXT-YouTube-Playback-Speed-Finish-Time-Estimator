(function () {
  // State Management
  let injected = false;
  let updateInterval = null;
  let playlistTargetIndex = null; // Store user preference
  let is24HourMode = true; // Default to 24h
  let lastVideoId = null; // Track current video ID
  let navigationDebounceTimer = null; // Debounce navigation events
  let isInjecting = false; // Injection lock
  let currentInjectionId = 0; // Track injection attempts
  let pageObserver = null; // DOM observer for page changes
  const DEBUG = true; // Set to true for debugging



  let lastTimeState = { h: null, m: null, s: null, ampm: null }; // Track flip clock state
  let customTargetActive = { video: false, chapter: false, playlist: false }; // Track custom target interaction

  // Ad Detection & Card Transition State
  let isCurrentlyShowingAd = false;
  let adCheckInterval = null;
  let messageRotationInterval = null;
  let currentMessageIndex = 0;
  let isTransitioning = false; // Lock to prevent overlapping transitions
  let adDebounceTimer = null; // Debounce rapid state changes
  let consecutiveAdDetections = 0; // Counter for reliable detection
  
  // Card Visibility Settings
  let showVideoCard = true;
  let showChapterCard = true;
  let showPlaylistCard = true;
  
  // Theme Settings
  let useSolidBackground = false; // Default to glassmorphism theme
  
  const adMessages = [
    "Perfect time for a stretch! 🧘",
    "Ads keep the lights on 💡",
    "Your video will be right back 🎬",
    "Patience is a virtue... ⏳",
    "Grabbing some popcorn 🍿",
    "Almost there... hang tight! 🚀"
  ];



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

  function isAdPlaying() {
    try {
      // Method 1: Check for ad overlay
      const adOverlay = document.querySelector('.ytp-ad-player-overlay');
      if (adOverlay && adOverlay.offsetParent !== null) return true;
      
      // Method 2: Check video container class
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer?.classList.contains('ad-showing')) return true;
      if (playerContainer?.classList.contains('ad-interrupting')) return true;
      
      // Method 3: Check for ad module
      const adModule = document.querySelector('.ytp-ad-module');
      if (adModule && adModule.offsetParent !== null) return true;
      
      // Method 4: Check for skip button or ad text
      const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
      const adText = document.querySelector('.ytp-ad-text');
      if (skipButton || adText) return true;
      
      // Method 5: Check for video ad UI left controls
      const videoAdUi = document.querySelector('.ytp-ad-player-overlay-instream-info');
      if (videoAdUi) return true;
      
      return false;
    } catch (e) {
      debugLog('Error in isAdPlaying:', e);
      return false;
    }
  }


  // --- 1.5 SETTINGS ---

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'is24HourMode',
        'showVideoCard',
        'showChapterCard',
        'showPlaylistCard',
        'useSolidBackground'
      ]);
      
      if (result.is24HourMode !== undefined) {
        is24HourMode = result.is24HourMode;
      }
      
      // Load card visibility settings (default to true)
      showVideoCard = result.showVideoCard !== false;
      showChapterCard = result.showChapterCard !== false;
      showPlaylistCard = result.showPlaylistCard !== false;
      
      // Load theme setting (default to false - glassmorphism)
      useSolidBackground = result.useSolidBackground === true;
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function saveSettings() {
    try {
      chrome.storage.local.set({ 
        is24HourMode,
        showVideoCard,
        showChapterCard,
        showPlaylistCard,
        useSolidBackground
      });
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
        
        // Initialize Flip Clock
        initFlipClock(ui);
        
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
            
            // Expand container to accommodate settings panel
            if (!settingsPanelEl.classList.contains('hidden')) {
                container.classList.add('dt-settings-open');
            } else {
                container.classList.remove('dt-settings-open');
            }
        });

        // Close settings when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsPanelEl.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanelEl.classList.add('hidden');
                container.classList.remove('dt-settings-open');
            }
        });
    }

    if(toggle24h) {
        toggle24h.checked = is24HourMode; // Set initial state
        toggle24h.addEventListener('change', (e) => {
            is24HourMode = e.target.checked;
            saveSettings();
            const video = document.querySelector('video');
            if (video) updateUI(video);
        });
    }

    // Card visibility toggles
    const toggleVideoCard = container.querySelector('#dt-toggle-video-card');
    const toggleChapterCard = container.querySelector('#dt-toggle-chapter-card');
    const togglePlaylistCard = container.querySelector('#dt-toggle-playlist-card');

    if (toggleVideoCard) {
      toggleVideoCard.checked = showVideoCard;
      toggleVideoCard.addEventListener('change', (e) => {
        showVideoCard = e.target.checked;
        saveSettings();
        updateCardVisibility();
      });
    }

    if (toggleChapterCard) {
      toggleChapterCard.checked = showChapterCard;
      toggleChapterCard.addEventListener('change', (e) => {
        showChapterCard = e.target.checked;
        saveSettings();
        updateCardVisibility();
      });
    }

    if (togglePlaylistCard) {
      togglePlaylistCard.checked = showPlaylistCard;
      togglePlaylistCard.addEventListener('change', (e) => {
        showPlaylistCard = e.target.checked;
        saveSettings();
        updateCardVisibility();
      });
    }

    // Theme toggle
    const toggleSolidBg = container.querySelector('#dt-toggle-solid-bg');
    if (toggleSolidBg) {
      toggleSolidBg.checked = useSolidBackground;
      toggleSolidBg.addEventListener('change', (e) => {
        useSolidBackground = e.target.checked;
        saveSettings();
        applyTheme();
      });
    }

    // Custom Target Listeners
    attachCustomTargetListeners(container, 'video');
    attachCustomTargetListeners(container, 'chapter');
    attachCustomTargetListeners(container, 'playlist');
  }

  function attachCustomTargetListeners(container, type) {
    // Duration Inputs
    const durH = container.querySelector(`#dt-${type}-custom-duration-container input[data-unit="h"]`);
    const durM = container.querySelector(`#dt-${type}-custom-duration-container input[data-unit="m"]`);
    
    // Speed Input
    const speedInput = container.querySelector(`#dt-${type}-custom-speed`);
    
    // Finish Inputs
    const finH = container.querySelector(`#dt-${type}-custom-finish-container input[data-unit="h"]`);
    const finM = container.querySelector(`#dt-${type}-custom-finish-container input[data-unit="m"]`);
    const finAmpm = container.querySelector(`#dt-${type}-custom-finish-container .dt-ampm-select`);

    if (!durH || !speedInput || !finH) return;

    function getRemainingContent() {
        const video = document.querySelector('video');
        if (!video) return 0;
        
        if (type === 'video') {
            return video.duration - video.currentTime;
        } else if (type === 'chapter') {
            const chapterInfo = getChapterInfo(video);
            return chapterInfo ? chapterInfo.remaining : 0;
        } else if (type === 'playlist') {
            const playlistInfo = getPlaylistInfo(video, playlistTargetIndex);
            return playlistInfo ? playlistInfo.totalSeconds : 0;
        }
        return 0;
    }

    function updateSpeed(newSpeed) {
        const video = document.querySelector('video');
        if (video) {
            if (newSpeed < 0.25) newSpeed = 0.25;
            if (newSpeed > 16) newSpeed = 16;
            video.playbackRate = newSpeed;
            updateUI(video);
        }
    }

    // Helper to get total seconds from duration inputs
    function getDurationSeconds() {
        const h = parseInt(durH.value) || 0;
        const m = parseInt(durM.value) || 0;
        return h * 3600 + m * 60;
    }

    // Helper to get target date from finish inputs
    function getFinishDate() {
        const now = new Date();
        let h = parseInt(finH.value);
        const m = parseInt(finM.value) || 0;
        
        if (isNaN(h)) return null;

        if (!is24HourMode && finAmpm) {
            const ampm = finAmpm.value;
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
        }

        let targetDate = new Date(now);
        targetDate.setHours(h);
        targetDate.setMinutes(m);
        targetDate.setSeconds(0);

        if (targetDate < now) {
            targetDate.setDate(targetDate.getDate() + 1);
        }
        return targetDate;
    }

    // 1. Duration Inputs
    [durH, durM].forEach(input => {
        input.addEventListener('change', () => {
            customTargetActive[type] = true;
            const targetSeconds = getDurationSeconds();
            const contentRemaining = getRemainingContent();
            
            if (targetSeconds > 0 && contentRemaining > 0) {
                const requiredSpeed = contentRemaining / targetSeconds;
                updateSpeed(requiredSpeed);
                durH.blur(); durM.blur();
            }
        });
    });

    // 2. Speed Input
    speedInput.addEventListener('change', (e) => {
        customTargetActive[type] = true;
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            updateSpeed(val);
            speedInput.blur();
        }
    });

    // 3. Finish Inputs
    [finH, finM, finAmpm].forEach(input => {
        input.addEventListener('change', () => {
            customTargetActive[type] = true;
            const targetDate = getFinishDate();
            if (!targetDate) return;

            const now = new Date();
            const secondsUntilFinish = (targetDate - now) / 1000;
            const contentRemaining = getRemainingContent();

            if (secondsUntilFinish > 0 && contentRemaining > 0) {
                const requiredSpeed = contentRemaining / secondsUntilFinish;
                updateSpeed(requiredSpeed);
                finH.blur(); finM.blur();
            }
        });
    });
  }

  function updateCustomInputs(type, remainingSeconds, speed) {
      const container = document.getElementById('yt-time-manager-container');
      const durH = container.querySelector(`#dt-${type}-custom-duration-container input[data-unit="h"]`);
      const durM = container.querySelector(`#dt-${type}-custom-duration-container input[data-unit="m"]`);
      
      const speedInput = document.getElementById(`dt-${type}-custom-speed`);
      
      const finH = container.querySelector(`#dt-${type}-custom-finish-container input[data-unit="h"]`);
      const finM = container.querySelector(`#dt-${type}-custom-finish-container input[data-unit="m"]`);
      const finAmpm = container.querySelector(`#dt-${type}-custom-finish-container .dt-ampm-select`);

      if (!durH || !speedInput || !finH) return;

      // Update AM/PM visibility (Always update this, regardless of interaction)
      if (finAmpm) {
          if (is24HourMode) finAmpm.classList.add('hidden');
          else finAmpm.classList.remove('hidden');
      }

      // Only update values if user has interacted with this section
      if (!customTargetActive[type]) return;

      // Calculate Duration
      const targetDuration = remainingSeconds / speed;
      if (document.activeElement !== durH && document.activeElement !== durM) {
          const h = Math.floor(targetDuration / 3600);
          const m = Math.floor((targetDuration % 3600) / 60);
          durH.value = h.toString().padStart(2, '0');
          durM.value = m.toString().padStart(2, '0');
      }
      
      // Update Speed
      if (document.activeElement !== speedInput) {
          speedInput.value = speed.toFixed(2);
      }

      // Calculate Finish Time
      if (document.activeElement !== finH && document.activeElement !== finM && document.activeElement !== finAmpm) {
          const finishDate = new Date(Date.now() + targetDuration * 1000);
          let h = finishDate.getHours();
          const m = finishDate.getMinutes();
          let ampm = '';

          if (!is24HourMode) {
              ampm = h >= 12 ? 'PM' : 'AM';
              h = h % 12;
              h = h ? h : 12;
              if (finAmpm) finAmpm.value = ampm;
          }

          finH.value = h.toString().padStart(2, '0');
          finM.value = m.toString().padStart(2, '0');
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

    // Check if we need to rebuild the structure (speed list changed)
    const currentSpeeds = Array.from(list.querySelectorAll('.dt-speed-clickable'))
        .map(row => parseFloat(row.dataset.speed));
    const speedsChanged = currentSpeeds.length !== speeds.length || 
        !speeds.every((speed, i) => speed === currentSpeeds[i]);

    if (speedsChanged || list.children.length === 0) {
        // Rebuild HTML structure only when necessary
        let html = '';
        speeds.forEach(speed => {
            const adjustedRemaining = remainingSeconds / speed;
            const isActive = speed === currentSpeed;
            const activeClassStr = isActive ? `active ${activeClass}` : '';
            
            html += `
                <div class="dt-detail-row ${activeClassStr} dt-speed-clickable" data-speed="${speed}">
                    <span class="dt-time-remaining">${formatTimeShort(adjustedRemaining)}</span>
                    <span class="dt-speed-value">${speed}x</span>
                    <span class="dt-finish-time">${getFinishTime(adjustedRemaining)}</span>
                </div>
            `;
        });
        list.innerHTML = html;
        
        // Attach event listener only once
        if (!list.dataset.listenerAttached) {
            list.addEventListener('click', (e) => {
                const row = e.target.closest('.dt-speed-clickable');
                if (row) {
                    const newSpeed = parseFloat(row.dataset.speed);
                    const video = document.querySelector('video');
                    if (video && newSpeed) {
                        video.playbackRate = newSpeed;
                        updateUI(video);
                    }
                }
            });
            list.dataset.listenerAttached = 'true';
        }
    } else {
        // Just update text content of existing elements (no flickering!)
        const rows = list.querySelectorAll('.dt-speed-clickable');
        speeds.forEach((speed, index) => {
            const row = rows[index];
            if (!row) return;
            
            const adjustedRemaining = remainingSeconds / speed;
            const isActive = speed === currentSpeed;
            
            // Update active state
            if (isActive) {
                if (!row.classList.contains('active')) {
                    row.classList.add('active', activeClass);
                }
            } else {
                row.classList.remove('active', activeClass);
            }
            
            // Update text content only
            const timeRemaining = row.querySelector('.dt-time-remaining');
            const finishTime = row.querySelector('.dt-finish-time');
            
            if (timeRemaining) {
                const newTime = formatTimeShort(adjustedRemaining);
                if (timeRemaining.textContent !== newTime) {
                    timeRemaining.textContent = newTime;
                }
            }
            
            if (finishTime) {
                const newFinish = getFinishTime(adjustedRemaining);
                if (finishTime.textContent !== newFinish) {
                    finishTime.textContent = newFinish;
                }
            }
        });
    }
  }

  // --- 3.5 FLIP CLOCK LOGIC ---

  function initFlipClock(container) {
    const clockContainer = container.querySelector('#dt-flip-clock');
    if (!clockContainer) return;

    // Clear existing
    clockContainer.innerHTML = '';

    // Create units
    const units = ['hours', 'minutes', 'seconds'];
    
    units.forEach((unit, index) => {
        const unitEl = document.createElement('div');
        unitEl.className = 'dt-flip-unit';
        unitEl.id = `dt-unit-${unit}`;
        
        // Initial structure
        unitEl.innerHTML = `
            <div class="dt-flip-top"></div>
            <div class="dt-flip-bottom"></div>
            <div class="dt-flip-leaf-front"></div>
            <div class="dt-flip-leaf-back"></div>
        `;
        
        clockContainer.appendChild(unitEl);

        // Add separator if not last
        if (index < units.length - 1) {
            const sep = document.createElement('div');
            sep.className = 'dt-flip-separator';
            sep.textContent = ':';
            clockContainer.appendChild(sep);
        }
    });

    // AM/PM Unit
    const ampmEl = document.createElement('div');
    ampmEl.className = 'dt-flip-ampm';
    ampmEl.id = 'dt-unit-ampm';
    clockContainer.appendChild(ampmEl);
  }

  function updateFlipClock(date) {
    const hRaw = date.getHours();
    const mRaw = date.getMinutes();
    const sRaw = date.getSeconds();
    
    let h = hRaw;
    let ampm = '';

    if (!is24HourMode) {
        ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
    }

    const hStr = h.toString().padStart(2, '0');
    const mStr = mRaw.toString().padStart(2, '0');
    const sStr = sRaw.toString().padStart(2, '0');

    flip('hours', hStr);
    flip('minutes', mStr);
    flip('seconds', sStr);
    
    // Update AM/PM text directly (no flip needed usually, or simple fade)
    const ampmEl = document.getElementById('dt-unit-ampm');
    if (ampmEl && lastTimeState.ampm !== ampm) {
        ampmEl.textContent = ampm;
        lastTimeState.ampm = ampm;
    }
  }

  function flip(unit, newValue) {
    const el = document.getElementById(`dt-unit-${unit}`);
    if (!el) return;

    const top = el.querySelector('.dt-flip-top');
    const bottom = el.querySelector('.dt-flip-bottom');
    const front = el.querySelector('.dt-flip-leaf-front');
    const back = el.querySelector('.dt-flip-leaf-back');

    if (!top || !bottom || !front || !back) return;

    // Check if value changed
    const currentValue = top.getAttribute('data-value');
    if (currentValue === newValue) return;

    // If first run (currentValue is null), just set it without animation
    if (currentValue === null) {
        top.setAttribute('data-value', newValue);
        bottom.setAttribute('data-value', newValue);
        front.setAttribute('data-value', newValue);
        back.setAttribute('data-value', newValue);
        return;
    }

    // Setup animation state
    // Top: Current Value
    // Bottom: New Value (revealed at end)
    // Front: Current Value (flips down)
    // Back: New Value (flips down to become bottom)

    top.setAttribute('data-value', newValue); // Actually, top should be NEW value? No.
    // Standard Flip Logic:
    // Static Top: New Value
    // Static Bottom: Old Value -> New Value (at end)
    // Animating Front: Old Value
    // Animating Back: New Value

    // Let's refine:
    // 1. Static Top shows NEW value immediately (behind the front leaf)
    top.setAttribute('data-value', newValue);
    
    // 2. Static Bottom shows OLD value (until animation ends)
    bottom.setAttribute('data-value', currentValue);

    // 3. Front Leaf shows OLD value
    front.setAttribute('data-value', currentValue);

    // 4. Back Leaf shows NEW value
    back.setAttribute('data-value', newValue);

    // Remove animation classes to reset
    el.classList.remove('flipping');
    void el.offsetWidth; // Trigger reflow
    el.classList.add('flipping');

    // Cleanup after animation
    // We can use a timeout matching the CSS animation duration (600ms)
    setTimeout(() => {
        bottom.setAttribute('data-value', newValue);
        front.setAttribute('data-value', newValue); // FIX: Update front to new value so it matches when animation resets
        el.classList.remove('flipping');
    }, 600);
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
    // document.getElementById('dt-current-clock').textContent = new Date().toLocaleTimeString([], { hour12: !is24HourMode });
    updateFlipClock(new Date());

    // 2. Update Video Section
    const videoRemainingRaw = duration - currentTime;
    const videoRemaining = videoRemainingRaw / playbackRate;
    document.getElementById('dt-video-remaining').textContent = formatTimeShort(videoRemaining);
    document.getElementById('dt-video-finish').textContent = getFinishTime(videoRemaining);
    
    const videoProgress = (currentTime / duration) * 100;
    document.getElementById('dt-video-progress').style.width = `${videoProgress}%`;

    // Update Video Details
    updateDetailsList('dt-video-details-list', videoRemainingRaw, playbackRate, 'video-active');
    updateCustomInputs('video', videoRemainingRaw, playbackRate);

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
        updateCustomInputs('chapter', chapterInfo.remaining, playbackRate);
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
        updateCustomInputs('playlist', playlistInfo.totalSeconds, playbackRate);
    } else {
        playlistSection.classList.add('hidden');
    }
    
    // Check and apply compact mode if all cards are hidden
    updateCardVisibility();
  }

  // --- 3.7 AD DETECTION & CARD TRANSITIONS ---

  function startAdMonitoring() {
    if (adCheckInterval) return; // Already monitoring
    
    debugLog('Starting ad monitoring');
    
    adCheckInterval = setInterval(() => {
      try {
        const adPlaying = isAdPlaying();
        
        // Count consecutive detections for reliability
        if (adPlaying) {
          consecutiveAdDetections++;
        } else {
          consecutiveAdDetections = 0;
        }
        
        // Require 2 consecutive detections to confirm ad state (prevents false positives)
        const confirmedAdState = consecutiveAdDetections >= 2;
        const confirmedNormalState = !adPlaying && consecutiveAdDetections === 0;
        
        // Only transition if state actually changed AND it's confirmed
        if ((confirmedAdState && !isCurrentlyShowingAd) || (confirmedNormalState && isCurrentlyShowingAd)) {
          // Debounce rapid changes
          if (adDebounceTimer) {
            clearTimeout(adDebounceTimer);
          }
          
          adDebounceTimer = setTimeout(() => {
            const newState = confirmedAdState;
            if (newState !== isCurrentlyShowingAd && !isTransitioning) {
              debugLog('Ad state changed (confirmed):', newState ? 'ad playing' : 'ad ended');
              isCurrentlyShowingAd = newState;
              transitionUIState(newState ? 'ad' : 'normal');
            }
          }, 300); // 300ms debounce
        }
      } catch (error) {
        debugLog('Error in ad monitoring:', error);
      }
    }, 500);
  }

  function stopAdMonitoring() {
    if (adCheckInterval) {
      clearInterval(adCheckInterval);
      adCheckInterval = null;
    }
    if (messageRotationInterval) {
      clearInterval(messageRotationInterval);
      messageRotationInterval = null;
    }
    if (adDebounceTimer) {
      clearTimeout(adDebounceTimer);
      adDebounceTimer = null;
    }
    consecutiveAdDetections = 0;
  }

  function transitionUIState(newState) {
    // Prevent overlapping transitions
    if (isTransitioning) {
      debugLog('Transition already in progress, skipping');
      return;
    }
    
    const container = document.getElementById('yt-time-manager-container');
    if (!container) {
      debugLog('Container not found, skipping transition');
      return;
    }
    
    try {
      isTransitioning = true;
      debugLog('Starting transition to:', newState);
      
      // Pause normal updates during transition
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      
      if (newState === 'ad') {
        hideNormalCards(() => {
          if (isTransitioning) { // Double-check we haven't been cancelled
            showAdCard();
            isTransitioning = false;
          }
        });
      } else if (newState === 'normal') {
        hideAdCard(() => {
          if (isTransitioning) { // Double-check we haven't been cancelled
            showNormalCards();
            isTransitioning = false;
          }
        });
      } else {
        isTransitioning = false;
      }
    } catch (error) {
      debugLog('Error during transition:', error);
      isTransitioning = false;
      
      // Try to recover: restart updates
      const video = document.querySelector('video');
      if (video && !updateInterval) {
        updateInterval = setInterval(() => updateUI(video), 100);
      }
    }
  }

  function hideNormalCards(callback) {
    try {
      const videoSection = document.getElementById('dt-video-section');
      const chapterSection = document.getElementById('dt-chapter-section');
      const playlistSection = document.getElementById('dt-playlist-section');
      
      const sections = [videoSection, chapterSection, playlistSection].filter(s => s);
      
      if (sections.length === 0) {
        debugLog('No sections to hide');
        callback();
        return;
      }
      
      debugLog('Hiding', sections.length, 'sections');
      
      sections.forEach((section, index) => {
        section.classList.add('dt-hiding');
        section.style.animationDelay = `${index * 0.05}s`;
      });
      
      // Wait for animation
      setTimeout(() => {
        sections.forEach(section => {
          section.classList.remove('dt-hiding');
          section.style.display = 'none';
          section.style.animationDelay = '';
        });
        debugLog('Sections hidden');
        callback();
      }, 300 + (sections.length * 50));
    } catch (error) {
      debugLog('Error hiding normal cards:', error);
      callback(); // Always call callback to prevent hanging
    }
  }

  function hideAdCard(callback) {
    try {
      const adCard = document.querySelector('.dt-ad-card');
      if (!adCard) {
        debugLog('No ad card to hide');
        callback();
        return;
      }
      
      debugLog('Hiding ad card');
      
      // Stop message rotation
      if (messageRotationInterval) {
        clearInterval(messageRotationInterval);
        messageRotationInterval = null;
      }
      
      adCard.classList.add('dt-hiding');
      
      setTimeout(() => {
        if (adCard.parentNode) {
          adCard.remove();
        }
        debugLog('Ad card removed');
        callback();
      }, 300);
    } catch (error) {
      debugLog('Error hiding ad card:', error);
      callback();
    }
  }

  function showNormalCards() {
    try {
      const videoSection = document.getElementById('dt-video-section');
      const chapterSection = document.getElementById('dt-chapter-section');
      const playlistSection = document.getElementById('dt-playlist-section');
      
      const sections = [videoSection, chapterSection, playlistSection].filter(s => s);
      
      if (sections.length === 0) {
        debugLog('No sections to show');
        return;
      }
      
      debugLog('Showing', sections.length, 'sections');
      
      // Show and animate sections
      sections.forEach((section, index) => {
        section.style.display = '';
        section.classList.remove('dt-hiding');
        section.classList.add('dt-visible');
        section.style.animationDelay = `${index * 0.08}s`;
      });
      
      // Resume normal updates after transition
      setTimeout(() => {
        const video = document.querySelector('video');
        if (video) {
          if (updateInterval) {
            clearInterval(updateInterval);
          }
          updateInterval = setInterval(() => updateUI(video), 100);
          updateUI(video);
          debugLog('Updates resumed');
        }
        
        // Cleanup animation classes
        sections.forEach(section => {
          section.classList.remove('dt-visible');
          section.style.animationDelay = '';
        });
      }, 400 + (sections.length * 80));
    } catch (error) {
      debugLog('Error showing normal cards:', error);
      
      // Emergency recovery: just restart updates
      const video = document.querySelector('video');
      if (video && !updateInterval) {
        updateInterval = setInterval(() => updateUI(video), 100);
      }
    }
  }

  function showAdCard() {
    const container = document.getElementById('yt-time-manager-container');
    if (!container) return;
    
    const adCard = createAdCard();
    
    // Insert after header (first child is header)
    const header = container.firstElementChild;
    if (header) {
      header.after(adCard);
    } else {
      container.appendChild(adCard);
    }
    
    // Trigger animation
    setTimeout(() => adCard.classList.add('dt-visible'), 10);
    
    // Start message rotation
    messageRotationInterval = setInterval(rotateAdMessage, 3000);
  }

  function createAdCard() {
    const card = document.createElement('div');
    card.className = 'dt-section-card dt-ad-card';
    card.innerHTML = `
      <div class="dt-ad-content">
        <div class="dt-coffee-animation">
          <div class="dt-steam">
            <span class="dt-steam-line"></span>
            <span class="dt-steam-line"></span>
            <span class="dt-steam-line"></span>
          </div>
          <div class="dt-cup-body">
            <div class="dt-cup-handle"></div>
          </div>
        </div>
        <h3 class="dt-ad-title">Ad Break</h3>
        <p id="dt-ad-message" class="dt-ad-message">${adMessages[currentMessageIndex]}</p>
        <div class="dt-ad-hint">Your time tracking will resume shortly</div>
      </div>
    `;
    return card;
  }


  function rotateAdMessage() {
    currentMessageIndex = (currentMessageIndex + 1) % adMessages.length;
    const messageEl = document.getElementById('dt-ad-message');
    if (messageEl) {
      messageEl.style.opacity = '0';
      setTimeout(() => {
        messageEl.textContent = adMessages[currentMessageIndex];
        messageEl.style.opacity = '1';
      }, 300);
    }
  }

  // --- 3.8 CARD VISIBILITY MANAGEMENT ---

  function updateCardVisibility() {
    const videoSection = document.getElementById('dt-video-section');
    const chapterSection = document.getElementById('dt-chapter-section');
    const playlistSection = document.getElementById('dt-playlist-section');
    const container = document.getElementById('yt-time-manager-container');
    
    if (videoSection) {
      videoSection.style.display = showVideoCard ? '' : 'none';
    }
    
    if (chapterSection) {
      chapterSection.style.display = showChapterCard ? '' : 'none';
    }
    
    if (playlistSection) {
      playlistSection.style.display = showPlaylistCard ? '' : 'none';
    }
    
    // Check if all cards are hidden (either by user setting or by content availability)
    const videoHidden = !videoSection || videoSection.style.display === 'none' || videoSection.classList.contains('hidden');
    const chapterHidden = !chapterSection || chapterSection.style.display === 'none' || chapterSection.classList.contains('hidden');
    const playlistHidden = !playlistSection || playlistSection.style.display === 'none' || playlistSection.classList.contains('hidden');
    
    // Apply compact mode if all cards are hidden
    if (container) {
      if (videoHidden && chapterHidden && playlistHidden) {
        container.classList.add('dt-compact-mode');
      } else {
        container.classList.remove('dt-compact-mode');
      }
    }
  }

  function applyCardVisibility(section, shouldShow, userSetting) {
    // Only show if BOTH conditions are met:
    // 1. Content exists (shouldShow = true)
    // 2. User wants it shown (userSetting = true)
    if (section) {
      if (shouldShow && userSetting) {
        section.classList.remove('hidden');
        section.style.display = '';
      } else {
        section.classList.add('hidden');
        section.style.display = 'none';
      }
    }
  }

  function applyTheme() {
    const container = document.getElementById('yt-time-manager-container');
    if (container) {
      if (useSolidBackground) {
        container.classList.add('dt-solid-bg');
      } else {
        container.classList.remove('dt-solid-bg');
      }
    }
  }

  // --- 4. INJECTION LOGIC ---

  /**
   * Check if we're on a valid YouTube watch page
   */
  function isWatchPage() {
    try {
      // Must be on /watch path
      if (location.pathname !== '/watch') {
        return false;
      }
      
      // Must have a video ID parameter
      const urlParams = new URLSearchParams(location.search);
      const videoId = urlParams.get('v');
      
      // Validate video ID format (11 characters, alphanumeric + _ and -)
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return false;
      }
      
      // Not an embed page
      if (location.pathname.includes('/embed')) {
        return false;
      }
      
      return true;
    } catch (e) {
      debugLog('Error in isWatchPage:', e);
      return false;
    }
  }

  /**
   * Wait for YouTube's app to be fully ready
   */
  function waitForYouTubeReady(timeout = 10000) {
    return new Promise((resolve) => {
      debugLog('Waiting for YouTube to be ready...');
      
      const checkReady = () => {
        const ytdApp = document.querySelector('ytd-app');
        if (!ytdApp) return false;
        
        // Check if page is marked as watch page
        const isWatchPageReady = ytdApp.hasAttribute('is-watch-page') || 
                                  ytdApp.getAttribute('page') === 'watch';
        
        return isWatchPageReady;
      };
      
      if (checkReady()) {
        debugLog('YouTube already ready');
        return resolve(true);
      }
      
      let resolved = false;
      const startTime = Date.now();
      
      // Hybrid approach: observer + polling
      const observer = new MutationObserver(() => {
        if (resolved) return;
        
        if (checkReady()) {
          resolved = true;
          observer.disconnect();
          debugLog('YouTube ready detected via observer');
          resolve(true);
        }
      });
      
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp) {
        observer.observe(ytdApp, {
          attributes: true,
          attributeFilter: ['is-watch-page', 'page']
        });
      }
      
      // Polling as backup
      const pollInterval = setInterval(() => {
        if (resolved) {
          clearInterval(pollInterval);
          return;
        }
        
        if (checkReady()) {
          resolved = true;
          observer.disconnect();
          clearInterval(pollInterval);
          debugLog('YouTube ready detected via polling');
          resolve(true);
        }
        
        if (Date.now() - startTime > timeout) {
          resolved = true;
          observer.disconnect();
          clearInterval(pollInterval);
          debugLog('YouTube ready timeout, proceeding anyway');
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Wait for required DOM elements to be present and ready
   */
  function waitForRequiredElements(timeout = 15000) {
    return new Promise((resolve) => {
      debugLog('Waiting for required elements...');
      
      const checkElements = () => {
        // 1. Video element must exist and be ready
        const video = document.querySelector('video');
        if (!video || video.readyState < 1) {
          return null;
        }
        
        // 2. Secondary container (where we inject)
        const secondary = document.querySelector('#secondary');
        const watchFlexy = document.querySelector('ytd-watch-flexy');
        const container = secondary || watchFlexy;
        
        if (!container) {
          return null;
        }
        
        // 3. Primary content (ensures main page is loaded)
        const primary = document.querySelector('#primary, ytd-watch-metadata');
        if (!primary) {
          return null;
        }
        
        // All elements found and ready
        return { video, container };
      };
      
      const existing = checkElements();
      if (existing) {
        debugLog('All required elements found immediately');
        return resolve(existing);
      }
      
      let resolved = false;
      const startTime = Date.now();
      
      const observer = new MutationObserver(() => {
        if (resolved) return;
        
        const elements = checkElements();
        if (elements) {
          resolved = true;
          observer.disconnect();
          debugLog('All required elements found via observer');
          resolve(elements);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          debugLog('Element wait timeout');
          resolve(null);
        }
      }, timeout);
    });
  }

  /**
   * Perform the actual UI injection
   */
  async function performInjection(video, container) {
    debugLog('Performing injection...');
    
    // Final duplicate check
    if (document.getElementById('yt-time-manager-container')) {
      debugLog('UI already exists during performInjection, aborting');
      return false;
    }
    
    // Load settings and create UI
    await loadSettings();
    const ui = await loadUI();
    
    if (!ui) {
      debugLog('Failed to load UI');
      return false;
    }
    
    // Inject into correct position
    if (container.id === 'secondary') {
      container.prepend(ui);
    } else {
      // For watch-flexy or other containers
      const insertTarget = document.querySelector('#secondary') || container;
      if (insertTarget.id === 'secondary') {
        insertTarget.prepend(ui);
      } else {
        insertTarget.parentNode.insertBefore(ui, insertTarget);
      }
    }
    
    // Start updates
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(() => updateUI(video), 100);
    updateUI(video);
    
    // Start ad monitoring
    startAdMonitoring();
    
    // Apply card visibility settings
    updateCardVisibility();
    
    // Apply theme
    applyTheme();
    
    debugLog('UI injected successfully');
    return true;
  }

  /**
   * Main injection coordinator
   */
  async function injectUI(injectionId) {
    debugLog('=== injectUI called with ID:', injectionId, '===');
    
    // 1. Synchronous lock check
    if (isInjecting) {
      debugLog('Already injecting, skipping');
      return;
    }
    
    // 2. Early validation - must be on watch page
    if (!isWatchPage()) {
      debugLog('Not a watch page, skipping');
      return;
    }
    
    // 3. Get current video ID
    const currentVideoId = getCurrentVideoId();
    if (!currentVideoId) {
      debugLog('No video ID found, skipping');
      return;
    }
    
    // 4. Check if same video already injected
    if (injected && lastVideoId === currentVideoId) {
      debugLog('Same video already injected, skipping');
      return;
    }
    
    // 5. Acquire lock
    isInjecting = true;
    debugLog('Starting injection for video:', currentVideoId);
    
    try {
      // 6. Check injection ID before any async operations
      if (injectionId !== currentInjectionId) {
        debugLog('Stale injection ID (pre-async), aborting');
        return;
      }
      
      // 7. Cleanup previous instance (if any)
      cleanup(false);
      
      // 8. Wait for YouTube to be ready
      await waitForYouTubeReady();
      
      // 9. Check injection ID after first async
      if (injectionId !== currentInjectionId) {
        debugLog('Stale injection ID (post-YouTube-ready), aborting');
        return;
      }
      
      // 10. Wait for required elements
      const elements = await waitForRequiredElements();
      
      // 11. Check injection ID after second async
      if (injectionId !== currentInjectionId) {
        debugLog('Stale injection ID (post-elements), aborting');
        return;
      }
      
      // 12. Validate elements were found
      if (!elements || !elements.video || !elements.container) {
        debugLog('Required elements not found:', elements);
        return;
      }
      
      // 13. Final page validation
      if (!isWatchPage()) {
        debugLog('No longer on watch page, aborting');
        return;
      }
      
      // 14. Perform injection
      const success = await performInjection(elements.video, elements.container);
      
      if (success) {
        injected = true;
        lastVideoId = currentVideoId;
        debugLog('=== Injection completed successfully ===');
      } else {
        debugLog('=== Injection failed ===');
      }
      
    } catch (error) {
      debugLog('Injection error:', error);
    } finally {
      // 15. Always release lock
      isInjecting = false;
    }
  }

  /**
   * Enhanced cleanup with optional force mode
   */
  function cleanup(force = false) {
    debugLog('Cleanup called, force:', force);
    
    // Remove UI
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) {
      existing.remove();
      debugLog('UI removed');
    }
    
    // Clear interval
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    
    // Stop ad monitoring
    stopAdMonitoring();
    
    // Reset state
    injected = false;
    isCurrentlyShowingAd = false;
    isTransitioning = false;
    consecutiveAdDetections = 0;
    
    if (force) {
      // Force mode: reset everything including video tracking
      lastVideoId = null;
      playlistTargetIndex = null;
      debugLog('Force cleanup: all state reset');
    }
  }

  /**
   * Handle navigation events
   */
  function handleNavigation() {
    debugLog('Navigation event detected, URL:', location.href);
    
    // Clear any pending debounce
    if (navigationDebounceTimer) {
      clearTimeout(navigationDebounceTimer);
    }
    
    // If leaving watch page, cleanup immediately
    if (!isWatchPage()) {
      debugLog('Left watch page, cleaning up');
      cleanup(true);
      return;
    }

    // --- RELOAD LOGIC START ---
    // Check if this is the first time we are hitting a watch page in this tab session
    const SESSION_KEY = 'yt_time_manager_reloaded';
    if (!sessionStorage.getItem(SESSION_KEY)) {
        debugLog('First visit to watch page in this tab, forcing reload...');
        sessionStorage.setItem(SESSION_KEY, 'true');
        location.reload();
        return; // Stop further execution
    }
    // --- RELOAD LOGIC END ---
    
    // Debounce to avoid rapid-fire calls
    navigationDebounceTimer = setTimeout(() => {
      // Increment injection ID (invalidates any in-flight injections)
      currentInjectionId++;
      const thisInjectionId = currentInjectionId;
      
      debugLog('Debounced navigation, triggering injection ID:', thisInjectionId);
      injectUI(thisInjectionId);
    }, 500); // Increased from 300ms for better stability
  }

  /**
   * Observe page state changes
   */
  function observePageChanges() {
    const ytdApp = document.querySelector('ytd-app');
    if (!ytdApp) {
      debugLog('ytd-app not found for observation');
      return;
    }
    
    if (pageObserver) {
      pageObserver.disconnect();
    }
    
    pageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const page = ytdApp.getAttribute('page');
          debugLog('Page attribute changed to:', page);
          
          // If page changed away from watch, cleanup
          if (page && page !== 'watch' && injected) {
            debugLog('Page changed away from watch, cleaning up');
            cleanup(true);
          } else if (page === 'watch' || ytdApp.hasAttribute('is-watch-page')) {
             // If page changed TO watch, trigger navigation
             debugLog('Page changed to watch, triggering navigation');
             handleNavigation();
          }
        }
      }
    });
    
    pageObserver.observe(ytdApp, {
      attributes: true,
      attributeFilter: ['page', 'is-watch-page']
    });
    
    debugLog('Page observer started');
  }

  /**
   * Initialize the extension
   */
  function init() {
    debugLog('=== Initializing YouTube Time Manager ===');
    
    // 1. Load settings first
    loadSettings().then(() => {
      debugLog('Settings loaded');
    });
    
    // 2. Listen for YouTube's primary navigation event
    document.addEventListener('yt-navigate-finish', handleNavigation);
    debugLog('Registered yt-navigate-finish listener');
    
    // 3. Listen for page data updates (additional safety)
    document.addEventListener('yt-page-data-updated', handleNavigation);
    debugLog('Registered yt-page-data-updated listener');

    // 3.5 Listen for browser history changes (back/forward)
    window.addEventListener('popstate', handleNavigation);
    debugLog('Registered popstate listener');
    
    // 4. Start observing page changes
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observePageChanges);
    } else {
      observePageChanges();
    }
    
    // 5. Handle initial page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        debugLog('DOMContentLoaded: checking initial page');
        // Delay for SPA initialization
        setTimeout(handleNavigation, 500);
      });
    } else {
      debugLog('Document ready: checking initial page');
      // Small delay to let YouTube's SPA initialize
      setTimeout(handleNavigation, 500);
    }
    
    debugLog('=== Initialization complete ===');
  }

  // Start the extension
  init();

})();
