let videoData = {};

function updateVideoData() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;

      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          func: () => {
            const video = document.querySelector('video');
            if (video) {
              return {
                currentTime: video.currentTime,
                duration: video.duration,
                playbackRate: video.playbackRate
              };
            }
            return null;
          }
        },
        (results) => {
          if (results && results[0].result) {
            videoData = results[0].result;
            chrome.runtime.sendMessage({ type: 'update', videoData });
          }
        }
      );
    }
  });
}

// Continuously update video data every second
setInterval(updateVideoData, 1000);