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
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
  }

  function updateUI() {
    const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];

    if (video) {
      const currentTime = video.currentTime;
      const duration = video.duration;
      const remainingTime = duration - currentTime;
      const finishTime = new Date(Date.now() + remainingTime * 1000);

      // Update current clock time at the top
      document.getElementById("currentTime").textContent = timeFormatter.format(new Date());

      // Update time remaining
      document.getElementById("remainingTime").textContent = formatTime(remainingTime);

      // Update finishing time based on current playback speed
      const currentPlaybackRate = video.playbackRate;
      const adjustedFinishTime = new Date(Date.now() + (remainingTime / currentPlaybackRate) * 1000);
      document.getElementById("finishTime").textContent = timeFormatter.format(adjustedFinishTime);

      // Update playback speeds and their corresponding finish times
      playbackSpeeds.forEach((speed) => {
        const speedFinishTime = timeFormatter.format(new Date(Date.now() + (remainingTime / speed) * 1000));
        const speedElement = document.querySelector(`#speed-${speed.toString().replace(".", "-") + "x-time"}`);

        if (speedElement) {
          speedElement.textContent = speedFinishTime;
        }
      });

      // Highlight the currently selected playback speed
      playbackSpeeds.forEach((speed) => {
        const speedOption = document.getElementById(`speed-${speed.toString().replace(".", "-") + "x"}`);
        if (speedOption) {
          speedOption.classList.toggle("selected-speed", speed === currentPlaybackRate);
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

  function initializeUI() {
    insertBlankBox();
    video = document.querySelector("video");
    setInterval(updateUI, 1000); // Update UI every second
  }

  function insertBlankBox() {
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
        })
        .catch((error) => console.error("Error loading HTML content:", error));

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles.css");
      document.head.appendChild(link);
    }
  }

  window.addEventListener("load", () => {
    const observer = new MutationObserver(() => {
      if (document.querySelector(".style-scope.yt-chip-cloud-renderer")) {
        initializeUI();
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
