// content.js

function injectBox() {
  // Create and insert the HTML structure
  const customBoxHtml = `
    <div id="my-custom-box" style="
      position: absolute;
      top: 0;
      left: 0;
      width: 320px;
      background-color: #222;
      color: #fff;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      font-family: Arial, sans-serif;
    ">
      <div class="time" id="current-time" style="
        text-align: center;
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 15px;
      ">--:--</div>

      <div class="buttons" style="
        display: flex;
        justify-content: space-between;
        margin-bottom: 15px;
      ">
        <button class="btn btn-primary" style="
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          background-color: #fff;
          color: #222;
        ">Video</button>
        <button class="btn btn-secondary" style="
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          background-color: #444;
          color: #fff;
        ">Playlist</button>
      </div>

      <div class="progress-bar" style="
        background-color: #444;
        height: 5px;
        margin-bottom: 15px;
        border-radius: 5px;
        overflow: hidden;
      ">
        <div class="progress" id="video-progress" style="
          background-color: #ff0000;
          width: 0%;
          height: 100%;
        "></div>
      </div>

      <div class="time-info" style="
        display: flex;
        justify-content: space-between;
        margin-bottom: 15px;
      ">
        <div class="time-box" id="current-video-time" style="
          background-color: #444;
          padding: 10px;
          border-radius: 5px;
          flex: 1;
          margin: 0 5px;
          text-align: center;
          font-size: 12px;
        ">
          <div>Current Video Time:</div>
          <div id="current-time-video">--:--</div>
        </div>
        <div class="time-box" id="real-finish-time" style="
          background-color: #444;
          padding: 10px;
          border-radius: 5px;
          flex: 1;
          margin: 0 5px;
          text-align: center;
          font-size: 12px;
        ">
          <div>Finishing At:</div>
          <div id="finish-time">--:--</div>
        </div>
      </div>

      <div class="speed-selection" style="
        background-color: #444;
        padding: 10px;
        border-radius: 5px;
      ">
        <div>Speed Time Selection:</div>
        <div id="speed-options"></div>
      </div>
    </div>
  `;

  // Function to insert the custom box into the target location
  function insertCustomBox(targetElement) {
    const customBox = document.createElement('div');
    customBox.innerHTML = customBoxHtml;
    targetElement.parentElement.insertBefore(customBox, targetElement);
    updateTimes(); // Update times initially
  }

  // Function to calculate and update times
  function updateTimes() {
    const currentTimeEl = document.getElementById('current-time');
    const currentVideoTimeEl = document.getElementById('current-time-video');
    const finishTimeEl = document.getElementById('finish-time');
    const speedOptionsEl = document.getElementById('speed-options');
    const video = document.querySelector('video');

    if (!video) {
      return;
    }

    // Update current time
    const currentTime = new Date().toLocaleTimeString();
    currentTimeEl.textContent = currentTime;

    // Update current video time
    const currentVideoTime = video.currentTime;
    const formattedVideoTime = new Date(currentVideoTime * 1000).toISOString().substr(11, 8);
    currentVideoTimeEl.textContent = formattedVideoTime;

    // Calculate finishing time
    const duration = video.duration;
    const remainingTime = duration - currentVideoTime;
    const finishTime = new Date(Date.now() + remainingTime * 1000).toLocaleTimeString();
    finishTimeEl.textContent = finishTime;

    // Update video progress bar
    const progressPercentage = (currentVideoTime / duration) * 100;
    document.getElementById('video-progress').style.width = `${progressPercentage}%`;

    // Update times for different playback speeds
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    speedOptionsEl.innerHTML = ''; // Clear existing options

    speeds.forEach(speed => {
      const finishTimeAtSpeed = new Date(Date.now() + (remainingTime / speed) * 1000).toLocaleTimeString();
      const optionDiv = document.createElement('div');
      optionDiv.classList.add('speed-option');
      optionDiv.innerHTML = `
        ${speed}x: ${finishTimeAtSpeed}
      `;
      speedOptionsEl.appendChild(optionDiv);
    });
  }

  // Function to check for the presence of chat, playlist, and recommended sections
  function checkAndInjectBox() {
    const chat = document.querySelector('#chat');
    const playlist = document.querySelector('ytd-playlist-panel-renderer');
    const recommendedSection = document.querySelector('#related');

    if (chat) {
      insertCustomBox(chat);
    } else if (playlist) {
      insertCustomBox(playlist);
    } else if (recommendedSection) {
      insertCustomBox(recommendedSection);
    }
  }

  // Check for elements and inject the box
  const checkInterval = setInterval(() => {
    if (document.querySelector('#chat') || document.querySelector('ytd-playlist-panel-renderer') || document.querySelector('#related')) {
      clearInterval(checkInterval);
      checkAndInjectBox();
    }
  }, 1000); // Check every second

  // Update times periodically
  setInterval(updateTimes, 1000); // Update every second
}

// Run the function to inject the box
injectBox();
