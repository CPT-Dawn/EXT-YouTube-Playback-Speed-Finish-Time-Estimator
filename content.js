(function () {
  let video;

  // Formatter to ensure a consistent 24-hour time format for displayed times
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Converts seconds into a "HH:MM:SS" format
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00:00"; // Handle invalid seconds
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
  }

  // Updates the UI with the current playback information (time, progress, speeds)
  function updateUI() {
    if (!video) return;

    const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2]; // Available playback speeds
    const currentTime = video.currentTime;
    const duration = video.duration;

    // Guard against invalid time values in the video element
    if (isNaN(currentTime) || isNaN(duration) || duration <= 0) {
      console.error("Invalid video time values");
      return;
    }

    // Calculate remaining time and the finish time based on the current playback rate
    const remainingTime = (duration - currentTime) / video.playbackRate;
    const finishTime = new Date(Date.now() + remainingTime * 1000);

    // Update displayed current time, remaining time, and finish time
    document.getElementById("currentTime").textContent = formatTime(currentTime);
    document.getElementById("remainingTime").textContent = formatTime(remainingTime);
    document.getElementById("finishTime").textContent = timeFormatter.format(finishTime);

    // Update each speed option's finish time based on the selected speed
    playbackSpeeds.forEach((speed) => {
      const speedFinishTime = new Date(Date.now() + (remainingTime * video.playbackRate / speed) * 1000);
      const speedElement = document.querySelector(`#speed-${speed.toString().replace(".", "-") + "x-time"}`);
      if (speedElement) {
        speedElement.textContent = formatTime((speedFinishTime.getTime() - Date.now()) / 1000);
      }
    });

    // Update the progress bar based on current video time
    const progressPercent = (currentTime / duration) * 100;
    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    // Highlight the currently selected playback speed in the UI
    playbackSpeeds.forEach((speed) => {
      const speedOption = document.getElementById(`speed-${speed.toString().replace(".", "-") + "x"}`);
      if (speedOption) {
        speedOption.classList.toggle("selected-speed", speed === video.playbackRate);
      }
    });
  }

  // Inserts the custom UI into the page and sets up event listeners
  function insertUI() {
    const referenceElement = document.querySelector(".style-scope.yt-chip-cloud-renderer");
    if (referenceElement && !document.querySelector(".blank-box")) {
      const blankBox = document.createElement("div");
      blankBox.className = "blank-box";
      referenceElement.parentNode.insertBefore(blankBox, referenceElement);

      // Load and inject the HTML for the UI
      fetch(chrome.runtime.getURL("content.html"))
        .then(response => response.text())
        .then(html => {
          blankBox.innerHTML = html;

          // Add blank toggle next to current time
          const currentTimeBox = document.getElementById("currentTimeBox");
          const blankToggle = document.createElement("div");
          blankToggle.id = "blankToggle";
          blankToggle.classList.add("blank-toggle"); // Styling placeholder
          currentTimeBox.appendChild(blankToggle);

          // Add dropdown menu that will be toggled
          const dropdownMenu = document.createElement("div");
          dropdownMenu.id = "dropdownMenu";
          dropdownMenu.classList.add("dropdown-menu"); // Styling placeholder for dropdown
          dropdownMenu.style.display = "none"; // Hidden initially
          dropdownMenu.innerHTML = "<p>Future Option</p>"; // Placeholder content for the dropdown
          blankToggle.appendChild(dropdownMenu);

          // Toggle dropdown visibility on click of blankToggle
          blankToggle.addEventListener('click', () => {
            console.log("Blank toggle clicked!"); // Debugging line
            const isVisible = dropdownMenu.style.display === "block";
            console.log("Dropdown visibility: ", isVisible ? "Visible" : "Hidden"); // Debugging line
            dropdownMenu.style.display = isVisible ? "none" : "block"; // Toggle visibility
          });

          // Set up click events for speed selection
          document.querySelectorAll('.speed-option').forEach(option => {
            option.addEventListener('click', () => {
              const speed = parseFloat(option.id.replace('speed-', '').replace('x', '').replace('-', '.'));
              if (!isNaN(speed) && video) {
                video.playbackRate = speed;
                updateUI(); // Update UI immediately when speed changes
              }
            });
          });

          // Initialize the video element and start UI updates
          video = document.querySelector("video");
          if (video) {
            setInterval(updateUI, 1000); // Continuously update the UI every second
          }
        })
        .catch(error => console.error("Error loading HTML content:", error));

      // Load and inject the CSS file for the UI styling
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles.css");
      document.head.appendChild(link);
    }
  }

  // Checks if the current page is a video watch page and inserts the UI if necessary
  function checkAndInjectUI() {
    if (window.location.pathname.includes("/watch")) {
      if (!document.querySelector(".blank-box")) {
        insertUI();
      }
    }
  }

  // Event listener for page load to trigger UI injection
  window.addEventListener("load", () => {
    checkAndInjectUI(); // Initial check on page load

    // Set up a MutationObserver to handle dynamic content changes on YouTube pages
    const observer = new MutationObserver(() => {
      if (window.location.pathname.includes("/watch")) {
        checkAndInjectUI();
      }
    });

    // Observe changes to the DOM for 30 seconds to detect dynamic page transitions
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000); // Stop observing after 30 seconds
  });
})();
