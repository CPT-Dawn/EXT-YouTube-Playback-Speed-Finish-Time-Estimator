(function () {
  let video;

  // Create a date formatter for consistent 24-hour time display
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00:00"; // Handle invalid seconds
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
  }

  function updateUI() {
    const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];

    if (video) {
      const currentTime = video.currentTime;
      const duration = video.duration;

      if (isNaN(currentTime) || isNaN(duration) || duration <= 0) {
        console.error("Invalid video time values");
        return;
      }

      const remainingTime = (duration - currentTime) / video.playbackRate;
      const finishTime = new Date(Date.now() + remainingTime * 1000);

      // Update current time display
      document.getElementById("currentTime").textContent = timeFormatter.format(new Date());

      // Update remaining time
      document.getElementById("remainingTime").textContent = formatTime(remainingTime);

      // Update finishing time
      document.getElementById("finishTime").textContent = timeFormatter.format(finishTime);

      // Update playback speeds and their corresponding finish times
      playbackSpeeds.forEach((speed) => {
        const speedFinishTime = new Date(Date.now() + (remainingTime * video.playbackRate / speed) * 1000);
        const speedElement = document.querySelector(`#speed-${speed.toString().replace(".", "-") + "x-time"}`);

        if (speedElement) {
          speedElement.textContent = formatTime((speedFinishTime.getTime() - Date.now()) / 1000);
        }
      });

      // Highlight the currently selected playback speed
      playbackSpeeds.forEach((speed) => {
        const speedOption = document.getElementById(`speed-${speed.toString().replace(".", "-") + "x"}`);
        if (speedOption) {
          speedOption.classList.toggle("selected-speed", speed === video.playbackRate);
        }
      });

      // Update progress bar
      const progressPercent = (currentTime / duration) * 100;
      const progressBar = document.getElementById("progressBar");

      if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
      }
    }
  }

  function insertUI() {
    const referenceElement = document.querySelector(".style-scope.yt-chip-cloud-renderer");

    if (referenceElement && !document.querySelector(".blank-box")) {
      const blankBox = document.createElement("div");
      blankBox.className = "blank-box";

      referenceElement.parentNode.insertBefore(blankBox, referenceElement);

      fetch(chrome.runtime.getURL("content.html"))
        .then((response) => response.text())
        .then((html) => {
          blankBox.innerHTML = html;

          // Add click event listeners to speed options
          document.querySelectorAll('.speed-option').forEach(option => {
            option.addEventListener('click', () => {
              const speed = parseFloat(option.id.replace('speed-', '').replace('x', '').replace('-', '.'));
              if (!isNaN(speed) && video) {
                video.playbackRate = speed;
                updateUI(); // Immediately update UI when speed changes
              }
            });
          });

          // Set up video element
          video = document.querySelector("video");
          if (video) {
            setInterval(updateUI, 1000); // Update UI every second
          }
        })
        .catch((error) => console.error("Error loading HTML content:", error));

      // Add stylesheet
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles.css");
      document.head.appendChild(link);
    }
  }

  function checkAndInjectUI() {
    // Ensure we're on a video watch page
    const isVideoPage = window.location.pathname.includes("/watch");
    if (isVideoPage) {
      const videoElement = document.querySelector("video");
      if (videoElement && !document.querySelector(".blank-box")) {
        video = videoElement;
        insertUI();
      }
    }
  }

  window.addEventListener("load", () => {
    checkAndInjectUI();
    
    // Polling mechanism to retry injection if necessary
    const intervalId = setInterval(() => {
      if (window.location.pathname.includes("/watch")) {
        checkAndInjectUI();
      }
    }, 1000); // Check every second

    // Stop polling after a reasonable time (e.g., 30 seconds)
    setTimeout(() => clearInterval(intervalId), 30000);
  });
})();
