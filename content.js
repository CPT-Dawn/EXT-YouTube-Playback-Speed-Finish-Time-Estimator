(function() {
    const video = document.querySelector('video');
    if (video) {
      const currentTime = video.currentTime;
      const formattedTime = new Date(currentTime * 1000).toISOString().substr(11, 8);
      alert(`Current Video Time: ${formattedTime}`);
    } else {
      alert('No video found!');
    }
  })();
  