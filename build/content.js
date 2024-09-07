(function() {
  // Function to create and insert the blank box
  function insertBlankBox() {
      // Select the recommended section
      const recommendedSection = document.querySelector('#related');

      if (recommendedSection) {
          // Create the blank box
          const blankBox = document.createElement('div');
          blankBox.style.height = '50px'; // Set the height of the blank box
          blankBox.style.backgroundColor = '#f0f0f0'; // Set the background color of the blank box
          blankBox.style.margin = '10px 0'; // Add some margin around the blank box

          // Insert the blank box above the recommended section
          recommendedSection.parentNode.insertBefore(blankBox, recommendedSection);
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
