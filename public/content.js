(function() {
  // Function to create and insert the blank box with content from external files
  function insertBlankBox() {
      // Select the recommended section
      const recommendedSection = document.querySelector('#related');

      if (recommendedSection) {
          // Create the blank box
          const blankBox = document.createElement('div');
          blankBox.className = 'blank-box'; // Assign the CSS class

          // Insert the blank box above the recommended section
          recommendedSection.parentNode.insertBefore(blankBox, recommendedSection);

          // Load and insert HTML content into the blank box
          fetch(chrome.runtime.getURL('content.html'))
              .then(response => response.text())
              .then(html => {
                  blankBox.innerHTML = html;
              })
              .catch(error => console.error('Error loading HTML content:', error));

          // Create and add the CSS link element
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = chrome.runtime.getURL('styles.css');
          document.head.appendChild(link);
      }
  }

  // Wait for the page to load and then insert the blank box
  window.addEventListener('load', () => {
      // Check if the element exists on the page
      const observer = new MutationObserver(() => {
          if (document.querySelector('#related')) {
              insertBlankBox();
              observer.disconnect(); // Stop observing once the box is added
          }
      });

      // Observe changes to the body of the page
      observer.observe(document.body, { childList: true, subtree: true });
  });
})();
