// content.js

function injectBox() {
  // Wait until the YouTube page has fully loaded
  const checkInterval = setInterval(() => {
    const recommendedSection = document.querySelector('#related');
    const chat = document.querySelector('#chat');
    const playlist = document.querySelector('#playlist');

    if (recommendedSection) {
      clearInterval(checkInterval);

      // Create the custom box
      const customBox = document.createElement('div');
      customBox.id = 'my-custom-box';
      customBox.textContent = 'Hello! This is a custom box.';
      customBox.style.backgroundColor = '#ff0000'; // Adjust background color as needed
      customBox.style.color = '#ffffff'; // Adjust text color as needed
      customBox.style.padding = '10px';
      customBox.style.margin = '10px 0';
      customBox.style.borderRadius = '5px';
      customBox.style.fontSize = '16px';
      customBox.style.fontFamily = 'Arial, sans-serif';
      customBox.style.position = 'relative';
      customBox.style.zIndex = '1000'; // Ensure it's above other elements

      // Insert the custom box above the recommended section
      recommendedSection.parentElement.insertBefore(customBox, recommendedSection);
    }

    if (chat) {
      // Optional: Modify or use the chat element if needed
    }

    if (playlist) {
      // Optional: Modify or use the playlist element if needed
    }
  }, 1000); // Check every second
}

// Run the function to inject the box
injectBox();
