(function () {
  let injected = false;
  let lastUrl = location.href;
  let updateInterval = null;

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
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  // --- 2. SCRAPERS ---

  function getChapterInfo(video) {
    // 1. Get Chapter Title
    const chapterTitleEl = document.querySelector('.ytp-chapter-title-content');
    let title = null;
    if (chapterTitleEl && chapterTitleEl.textContent) {
        title = chapterTitleEl.textContent;
    }

    const duration = video.duration;
    const currentTime = video.currentTime;
    if (isNaN(duration) || isNaN(currentTime)) return null;

    let endTime = null;

    // 2. Strategy A: Visual Markers (Preferred)
    let markers = Array.from(document.querySelectorAll('.ytp-chapter-marker'));
    
    if (markers.length > 0) {
        const chapterTimes = markers.map(marker => {
            let pct = parseFloat(marker.style.left);
            if (isNaN(pct)) pct = parseFloat(marker.style.paddingLeft); 
            return (pct / 100) * duration;
        }).sort((a, b) => a - b);

        for (const time of chapterTimes) {
            if (time > currentTime + 1) {
                endTime = time;
                break;
            }
        }
        if (endTime === null) endTime = duration; // Last chapter
    }

    // 3. Strategy B: Description Timestamps (Fallback)
    if (endTime === null) {
        // Look for description text
        const descriptionEl = document.querySelector('#description-inline-expander') || document.querySelector('#description');
        if (descriptionEl) {
            const text = descriptionEl.innerText;
            // Regex for timestamps: H:MM:SS or MM:SS or M:SS
            // We look for lines like "0:00 Intro"
            const regex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/g;
            let match;
            const timestamps = [];
            
            while ((match = regex.exec(text)) !== null) {
                const h = match[1] ? parseInt(match[1]) : 0;
                const m = parseInt(match[2]);
                const s = parseInt(match[3]);
                const seconds = h * 3600 + m * 60 + s;
                if (seconds < duration) {
                    timestamps.push(seconds);
                }
            }
            
            if (timestamps.length > 0) {
                timestamps.sort((a, b) => a - b);
                // Find next timestamp
                for (const time of timestamps) {
                    if (time > currentTime + 1) {
                        endTime = time;
                        break;
                    }
                }
                if (endTime === null) endTime = duration; // Last chapter
                
                // If we found timestamps but no title, try to guess title? 
                // Too complex for now, stick to "Current Chapter" if title missing.
            }
        }
    }

    // 4. Final Calculation
    if (endTime !== null) {
        return {
            title: title || "Current Chapter",
            remaining: endTime - currentTime,
            endTime: endTime
        };
    }

    return null;
  }

  function getPlaylistInfo(video) {
    const playlistPanel = document.querySelector('ytd-playlist-panel-renderer');
    if (!playlistPanel) return null;

    // Find current video index
    const currentVideoItem = playlistPanel.querySelector('ytd-playlist-panel-video-renderer[selected]');
    if (!currentVideoItem) return null;

    let totalRemaining = 0;
    let count = 0;
    let foundCurrent = false;
    
    // Iterate through all loaded items
    const items = playlistPanel.querySelectorAll('ytd-playlist-panel-video-renderer');
    for (const item of items) {
        if (item === currentVideoItem) {
            foundCurrent = true;
            // Add remaining time of current video
            const durationStr = item.querySelector('#text.ytd-thumbnail-overlay-time-status-renderer')?.textContent?.trim();
             // Note: Playlist items show total duration, not remaining. 
             // So for current video, we use the video element's remaining time.
             if (video && !isNaN(video.duration) && !isNaN(video.currentTime)) {
                 totalRemaining += (video.duration - video.currentTime);
             }
             continue;
        }
        
        if (foundCurrent) {
            const durationStr = item.querySelector('#text.ytd-thumbnail-overlay-time-status-renderer')?.textContent?.trim();
            if (durationStr) {
                totalRemaining += parseDuration(durationStr);
                count++;
            }
        }
    }

    return {
        videosRemaining: count,
        totalSeconds: totalRemaining
    };
  }

  // --- 3. UI CONSTRUCTION ---

  function createUI() {
    const container = document.createElement('div');
    container.id = 'yt-time-manager-container';
    container.innerHTML = `
      <div class="yt-tm-header">
        <span class="yt-tm-title">Time Manager</span>
        <span id="yt-tm-current-speed" class="yt-tm-current-speed">1.0x</span>
      </div>
      
      <div class="yt-tm-grid">
        <div class="yt-tm-cell header">Speed</div>
        <div class="yt-tm-cell header">Remaining</div>
        <div class="yt-tm-cell header">Finishes At</div>
        
        <!-- Rows will be injected here -->
        <div id="yt-tm-rows" class="yt-tm-row-group" style="display: contents;"></div>
      </div>

      <div id="yt-tm-playlist-section" class="yt-tm-section hidden">
        <div class="yt-tm-section-title">Playlist Remaining</div>
        <div class="yt-tm-info-row">
            <span class="yt-tm-label">Time (+<span id="yt-tm-playlist-count">0</span> videos)</span>
            <span id="yt-tm-playlist-time" class="yt-tm-value">--:--</span>
        </div>
        <div class="yt-tm-info-row">
             <span class="yt-tm-label">Finishes At</span>
             <span id="yt-tm-playlist-finish" class="yt-tm-value">--:--</span>
        </div>
      </div>

      <div id="yt-tm-chapter-section" class="yt-tm-section hidden">
        <div class="yt-tm-section-title">Chapter Remaining</div>
        <div class="yt-tm-info-row">
            <span id="yt-tm-chapter-title" class="yt-tm-label" style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Current Chapter</span>
            <span id="yt-tm-chapter-time" class="yt-tm-value">--:--</span>
        </div>
      </div>

      <div class="yt-tm-progress-container">
        <div id="yt-tm-progress-bar" class="yt-tm-progress-bar"></div>
      </div>
    `;
    return container;
  }

  function updateUI(video) {
    const container = document.getElementById('yt-time-manager-container');
    if (!container) return;

    const duration = video.duration;
    const currentTime = video.currentTime;
    const playbackRate = video.playbackRate;

    if (isNaN(duration) || duration <= 0) return;

    const remainingRaw = duration - currentTime;
    
    // Update Header Speed
    document.getElementById('yt-tm-current-speed').textContent = `${playbackRate}x`;

    // Update Progress Bar
    const progressPercent = (currentTime / duration) * 100;
    document.getElementById('yt-tm-progress-bar').style.width = `${progressPercent}%`;

    // Generate Rows for Speeds
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    // Ensure current speed is in the list if it's custom
    if (!speeds.includes(playbackRate)) {
        speeds.push(playbackRate);
        speeds.sort((a, b) => a - b);
    }

    const rowsContainer = document.getElementById('yt-tm-rows');
    rowsContainer.innerHTML = '';

    speeds.forEach(speed => {
        const adjustedRemaining = remainingRaw / speed;
        const finishTime = getFinishTime(adjustedRemaining);
        const isCurrent = speed === playbackRate;

        const row = document.createElement('div');
        row.className = `yt-tm-row ${isCurrent ? 'current-speed' : ''}`;
        row.innerHTML = `
            <div class="yt-tm-cell speed ${isCurrent ? 'highlight' : ''}">${speed}x</div>
            <div class="yt-tm-cell">${formatTimeShort(adjustedRemaining)}</div>
            <div class="yt-tm-cell">${finishTime}</div>
        `;
        rowsContainer.appendChild(row);
    });

    // Update Playlist Info
    const playlistInfo = getPlaylistInfo(video);
    const playlistSection = document.getElementById('yt-tm-playlist-section');
    
    if (playlistInfo && playlistInfo.videosRemaining > 0) {
        playlistSection.classList.remove('hidden');
        document.getElementById('yt-tm-playlist-count').textContent = playlistInfo.videosRemaining;
        
        const playlistRemainingAdjusted = playlistInfo.totalSeconds / playbackRate;
        document.getElementById('yt-tm-playlist-time').textContent = formatTimeShort(playlistRemainingAdjusted);
        document.getElementById('yt-tm-playlist-finish').textContent = getFinishTime(playlistRemainingAdjusted);
    } else {
        playlistSection.classList.add('hidden');
    }

    // Update Chapter Info
    const chapterInfo = getChapterInfo(video);
    const chapterSection = document.getElementById('yt-tm-chapter-section');

    if (chapterInfo && chapterInfo.remaining !== null && chapterInfo.remaining > 0) {
        chapterSection.classList.remove('hidden');
        document.getElementById('yt-tm-chapter-title').textContent = chapterInfo.title;
        
        const chapterRemainingAdjusted = chapterInfo.remaining / playbackRate;
        document.getElementById('yt-tm-chapter-time').textContent = formatTimeShort(chapterRemainingAdjusted);
    } else {
        chapterSection.classList.add('hidden');
    }
  }

  // --- 4. INJECTION LOGIC ---

  async function injectUI(video, container) {
    // Check for existing container and remove it if it looks broken (optional, but safer to just check existence)
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) {
        return; // Already injected
    }

    const ui = createUI();
    
    // Inject above the container (Secondary column)
    if (container.id === 'secondary') {
        container.prepend(ui);
    } else {
        container.parentNode.insertBefore(ui, container);
    }

    // Start update loop
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => updateUI(video), 1000);
    updateUI(video); // Initial update

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

  function init() {
    // Observer for page navigation (SPA)
    const observer = new MutationObserver((mutations) => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial check
    handleNavigation();
  }

  async function handleNavigation() {
    // Cleanup existing
    const existing = document.getElementById('yt-time-manager-container');
    if (existing) existing.remove();
    if (updateInterval) clearInterval(updateInterval);
    injected = false;

    if (!isValidWatchPage()) return;

    // Wait for elements
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

  // Start
  init();

})();
