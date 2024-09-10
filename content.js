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
    if (!video) return;

    const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];
    const currentTime = video.currentTime;
    const duration = video.duration;

    if (isNaN(currentTime) || isNaN(duration) || duration <= 0) {
      console.error("Invalid video time values");
      return;
    }

    const remainingTime = (duration - currentTime) / video.playbackRate;
    const finishTime = new Date(Date.now() + remainingTime * 1000);

    // Update UI elements
    document.getElementById("currentTime").textContent = timeFormatter.format(new Date());
    document.getElementById("remainingTime").textContent = formatTime(remainingTime);
    document.getElementById("finishTime").textContent = timeFormatter.format(finishTime);

    playbackSpeeds.forEach((speed) => {
      const speedFinishTime = new Date(Date.now() + (remainingTime * video.playbackRate / speed) * 1000);
      const speedElement = document.querySelector(`#speed-${speed.toString().replace(".", "-") + "x-time"}`);
      if (speedElement) {
        speedElement.textContent = formatTime((speedFinishTime.getTime() - Date.now()) / 1000);
      }
    });

    // Update progress bar
    const progressPercent = (currentTime / duration) * 100;
    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    // Highlight the currently selected playback speed
    playbackSpeeds.forEach((speed) => {
      const speedOption = document.getElementById(`speed-${speed.toString().replace(".", "-") + "x"}`);
      if (speedOption) {
        speedOption.classList.toggle("selected-speed", speed === video.playbackRate);
      }
    });
  }

  function insertUI() {
    const referenceElement = document.querySelector(".style-scope.yt-chip-cloud-renderer");
    if (referenceElement && !document.querySelector(".blank-box")) {
      const blankBox = document.createElement("div");
      blankBox.className = "blank-box";
      referenceElement.parentNode.insertBefore(blankBox, referenceElement);

      fetch(chrome.runtime.getURL("content.html"))
        .then(response => response.text())
        .then(html => {
          blankBox.innerHTML = html;

          document.querySelectorAll('.speed-option').forEach(option => {
            option.addEventListener('click', () => {
              const speed = parseFloat(option.id.replace('speed-', '').replace('x', '').replace('-', '.'));
              if (!isNaN(speed) && video) {
                video.playbackRate = speed;
                updateUI(); // Update UI immediately when speed changes
              }
            });
          });

          // Initialize video and set up UI updates
          video = document.querySelector("video");
          if (video) {
            setInterval(updateUI, 1000); // Update UI every second
          }
        })
        .catch(error => console.error("Error loading HTML content:", error));

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles.css");
      document.head.appendChild(link);
    }
  }

  function checkAndInjectUI() {
    if (window.location.pathname.includes("/watch")) {
      if (!document.querySelector(".blank-box")) {
        insertUI();
      }
    }
  }

  window.addEventListener("load", () => {
    // Check if it's a video watch page and inject UI
    checkAndInjectUI();

    // Set up a MutationObserver to handle dynamic content changes
    const observer = new MutationObserver(() => {
      if (window.location.pathname.includes("/watch")) {
        checkAndInjectUI();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Stop observing after 30 seconds
    setTimeout(() => observer.disconnect(), 30000);
  });
})();
