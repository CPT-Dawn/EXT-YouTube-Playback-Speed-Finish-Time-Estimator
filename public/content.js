(function() {
  function insertBlankBox() {
    const recommendedSection = document.querySelector('#related');

    if (recommendedSection) {
      const blankBox = document.createElement('div');
      blankBox.className = 'blank-box';

      recommendedSection.parentNode.insertBefore(blankBox, recommendedSection);

      fetch(chrome.runtime.getURL('content.html'))
        .then(response => response.text())
        .then(html => {
          blankBox.innerHTML = html;
        })
        .catch(error => console.error('Error loading HTML content:', error));

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('styles.css');
      document.head.appendChild(link);
    }
  }

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
  
  function injectUI() {
    // Ensure the UI is injected
    insertBlankBox();
  }
  
  // Check if the page is ready and inject the UI
  window.addEventListener('load', () => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#related')) {
        injectUI();
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Periodically update the UI every second
  setInterval(() => {
    updatePopup();
  }, 1000);
})();
