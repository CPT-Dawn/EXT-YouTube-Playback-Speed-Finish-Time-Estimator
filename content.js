// Function to inject the UI above the recommended video section
function injectUI() {
  const recommendedSection = document.querySelector('#related');  // The recommended videos section

  if (recommendedSection) {
    // Check if the UI already exists
    if (document.getElementById('custom-yt-video-info')) return;

    const container = document.createElement('div');
    container.id = 'custom-yt-video-info';
    container.innerHTML = `
      <div class="popup-container">
        <div id="time" class="time-display">--:--</div>
        <div class="progress-bar-container">
          <div class="progress-bar"></div>
        </div>
        <div class="time-info">
          <div class="card">
            <p>Time Remaining:</p>
            <p id="remainingTime">--:--:--</p>
          </div>
          <div class="card">
            <p>Finishing At:</p>
            <p id="finishTime">--:--</p>
          </div>
        </div>
        <div class="speed-time-container">
          <div class="speed-item" id="speed-1x">
            <p>1x:</p>
            <p class="speed-time">--:--</p>
          </div>
          <div class="speed-item" id="speed-1-25x">
            <p>1.25x:</p>
            <p class="speed-time">--:--</p>
          </div>
          <div class="speed-item" id="speed-1-5x">
            <p>1.5x:</p>
            <p class="speed-time">--:--</p>
          </div>
          <div class="speed-item" id="speed-1-75x">
            <p>1.75x:</p>
            <p class="speed-time">--:--</p>
          </div>
          <div class="speed-item" id="speed-2x">
            <p>2x:</p>
            <p class="speed-time">--:--</p>
          </div>
        </div>
      </div>
    `;

    recommendedSection.parentElement.insertBefore(container, recommendedSection);
    updateClock();
    updatePopup();  // Initialize the popup with real-time data
  }
}

// Function to update time in real-time
function updateClock() {
  const timeElement = document.getElementById('time');
  if (timeElement) {
    const now = new Date();
    timeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// Real-time data update function
function updatePopup() {
  const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];

  // Get video data
  const video = document.querySelector('video');
  if (video) {
    const currentTime = video.currentTime;
    const duration = video.duration;
    const remainingTime = duration - currentTime;
    const finishTime = new Date(Date.now() + remainingTime * 1000);

    // Update time remaining
    document.getElementById('remainingTime').textContent = new Date(remainingTime * 1000).toISOString().substr(11, 8);
    document.getElementById('finishTime').textContent = finishTime.toLocaleTimeString();

    // Update playback speeds
    playbackSpeeds.forEach((speed) => {
      const speedFinishTime = new Date(Date.now() + (remainingTime / speed) * 1000).toLocaleTimeString();
      const speedElement = document.querySelector(`#speed-${speed.toString().replace('.', '-')}x .speed-time`);
      if (speedElement) {
        speedElement.textContent = speedFinishTime;
      }
    });

    // Update progress bar
    const progressPercent = (currentTime / duration) * 100;
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }
  }
}

// Check if the page is ready and inject the UI
function initializeExtension() {
  // Ensure the UI is injected when the DOM is fully loaded
  injectUI();

  // Periodically update the UI every second
  setInterval(() => {
    updateClock();
    updatePopup();
  }, 1000);
}

// Run the injectUI function on page load
document.addEventListener('DOMContentLoaded', initializeExtension);

// Observe DOM changes and reinject UI if needed
const observer = new MutationObserver(initializeExtension);
observer.observe(document.body, { childList: true, subtree: true });
