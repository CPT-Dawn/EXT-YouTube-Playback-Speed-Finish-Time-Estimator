document.addEventListener('DOMContentLoaded', () => {
  const timeElement = document.getElementById('time');
  const remainingTimeElement = document.getElementById('remainingTime');
  const finishTimeElement = document.getElementById('finishTime');
  const progressBar = document.querySelector('.progress-bar');

  const playbackSpeeds = [1, 1.25, 1.5, 1.75, 2];

  function updateClock() {
    const now = new Date();
    timeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function updatePopup(videoData) {
    if (videoData && !isNaN(videoData.currentTime) && !isNaN(videoData.duration)) {
      const remainingTime = videoData.duration - videoData.currentTime;
      const formattedRemainingTime = new Date(remainingTime * 1000).toISOString().substr(11, 8);
      const finishTime = new Date(Date.now() + remainingTime * 1000).toLocaleTimeString();

      remainingTimeElement.textContent = formattedRemainingTime;
      finishTimeElement.textContent = finishTime;

      playbackSpeeds.forEach((speed) => {
        const adjustedDuration = videoData.duration / speed;
        const adjustedRemainingTime = adjustedDuration - videoData.currentTime / speed;
        const adjustedFinishTime = new Date(Date.now() + adjustedRemainingTime * 1000);
        const finishElem = document.querySelector(`#speed-${speed.toString().replace('.', '-') + 'x'} .speed-time`);
        if (finishElem) {
          finishElem.textContent = adjustedFinishTime.toLocaleTimeString();
        }
      });

      // Update the progress bar width
      const progressPercent = (videoData.currentTime / videoData.duration) * 100;
      progressBar.style.width = `${progressPercent}%`;
    } else {
      remainingTimeElement.textContent = '--:--:--';
      finishTimeElement.textContent = '--:--';
    }
  }

  // Update the real-time clock every second
  setInterval(updateClock, 1000);

  // Listen for updates from the background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'update' && message.videoData) {
      updatePopup(message.videoData);
    }
  });
});
