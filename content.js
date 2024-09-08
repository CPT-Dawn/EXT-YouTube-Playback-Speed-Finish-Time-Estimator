(function () {
  function updateUI() {
    const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];
    const video = document.querySelector("video");

    if (video) {
      const currentTime = video.currentTime;
      const duration = video.duration;
      const remainingTime = duration - currentTime;
      const finishTime = new Date(Date.now() + remainingTime * 1000);

      // Update current clock time at the top
      document.getElementById("currentTime").textContent = new Date().toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      );

      // Update time remaining
      document.getElementById("remainingTime").textContent = new Date(
        remainingTime * 1000
      )
        .toISOString()
        .substr(11, 8);

      // Update finishing time
      document.getElementById("finishTime").textContent = finishTime.toLocaleTimeString();

      // Update playback speeds and their corresponding finish times
      playbackSpeeds.forEach((speed) => {
        const speedFinishTime = new Date(
          Date.now() + (remainingTime / speed) * 1000
        ).toLocaleTimeString();
        const speedElement = document.querySelector(
          `#speed-${speed.toString().replace(".", "-") + "x"} .speed-time`
        );

        if (speedElement) {
          speedElement.textContent = speedFinishTime;
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
    // Ensure the UI is initialized
    insertBlankBox();
    setInterval(updateUI, 1000); // Update UI every second
  }

  // Inject the HTML and CSS into the page
  function insertBlankBox() {
    const referenceElement = document.querySelector(".style-scope.yt-chip-cloud-renderer");

    if (referenceElement) {
      // Check if the blank box already exists to prevent duplicates
      if (!document.querySelector(".blank-box")) {
        const blankBox = document.createElement("div");
        blankBox.className = "blank-box";

        // Insert the blank box directly before the reference element
        referenceElement.parentNode.insertBefore(blankBox, referenceElement);

        fetch(chrome.runtime.getURL("content.html"))
          .then((response) => response.text())
          .then((html) => {
            blankBox.innerHTML = html;
          })
          .catch((error) => console.error("Error loading HTML content:", error));

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles.css");
        document.head.appendChild(link);
      }
    }
  }

  // Check if the page is ready and inject the UI
  window.addEventListener("load", () => {
    const observer = new MutationObserver(() => {
      if (document.querySelector(".style-scope.yt-chip-cloud-renderer")) {
        initializeUI();
        observer.disconnect(); // Disconnect observer if the blank box is injected
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
