document.addEventListener('DOMContentLoaded', () => {
  const timeElement = document.getElementById('time');
  const remainingTimeElement = document.getElementById('remainingTime');
  const finishTimeElement = document.getElementById('finishTime');
  const playbackSpeedElement = document.getElementById('playbackSpeed');
  const differentSpeedsElement = document.getElementById('differentSpeeds');

  const playbackSpeeds = [0.5, 1, 1.5, 2]; // Different playback speeds to calculate finish times

  function updateTime() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => {
            const video = document.querySelector('video');
            if (video) {
              return {
                currentTime: video.currentTime,
                duration: video.duration,
                playbackRate: video.playbackRate,
              };
            }
            return null;
          },
        },
        (results) => {
          if (results && results[0].result !== null) {
            const { currentTime, duration, playbackRate } = results[0].result;
            const formattedCurrentTime = new Date(currentTime * 1000).toISOString().substr(11, 8);
            const remainingTime = duration - currentTime;
            const formattedRemainingTime = new Date(remainingTime * 1000).toISOString().substr(11, 8);

            // Calculate the finish time in real life
            const finishTime = new Date(Date.now() + remainingTime * 1000);
            const formattedFinishTime = finishTime.toLocaleTimeString();

            // Calculate finish times at different playback speeds
            let speedsText = '';
            playbackSpeeds.forEach(speed => {
              const adjustedDuration = duration / speed;
              const adjustedRemainingTime = adjustedDuration - currentTime / speed;
              const adjustedFinishTime = new Date(Date.now() + adjustedRemainingTime * 1000);
              speedsText += `At ${speed}x: ${adjustedFinishTime.toLocaleTimeString()}<br>`;
            });

            timeElement.textContent = `Current Video Time: ${formattedCurrentTime}`;
            remainingTimeElement.textContent = `Time Remaining: ${formattedRemainingTime}`;
            finishTimeElement.textContent = `Video Will Finish At: ${formattedFinishTime}`;
            playbackSpeedElement.textContent = `Current Playback Speed: ${playbackRate}x`;
            differentSpeedsElement.innerHTML = `Finish Times at Different Speeds:<br>${speedsText}`;
          } else {
            timeElement.textContent = 'No video found!';
            remainingTimeElement.textContent = '';
            finishTimeElement.textContent = '';
            playbackSpeedElement.textContent = '';
            differentSpeedsElement.innerHTML = '';
          }
        }
      );
    });
  }

  // Update time every second
  setInterval(updateTime, 1000);
  
  // Initial call to display time as soon as the popup opens
  updateTime();
});
