// content.js

// Increase the size of the body content
document.body.style.fontSize = '20px'; // Adjust the size as needed

// Print "Hello" to the console
console.log('Hello');

// Optionally, add a "Hello" message to the page itself
const helloElement = document.createElement('div');
helloElement.textContent = 'Hello';
helloElement.style.position = 'fixed';
helloElement.style.top = '10px';
helloElement.style.left = '10px';
helloElement.style.backgroundColor = 'white';
helloElement.style.padding = '5px';
helloElement.style.border = '1px solid black';
document.body.appendChild(helloElement);
