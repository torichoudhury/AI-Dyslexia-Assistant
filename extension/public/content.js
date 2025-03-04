// This script runs in the context of web pages

// Create a floating button for text selection
function createFloatingButton() {
  const button = document.createElement('button');
  button.id = 'dyslexia-assistant-button';
  button.textContent = 'Simplify';
  button.style.position = 'absolute';
  button.style.display = 'none';
  button.style.zIndex = '10000';
  button.style.padding = '5px 10px';
  button.style.borderRadius = '4px';
  button.style.backgroundColor = '#4299e1';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.fontSize = '14px';
  button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  
  button.addEventListener('click', simplifySelectedText);
  
  document.body.appendChild(button);
  return button;
}

// Show the button near text selection
function showButtonNearSelection() {
  const selection = window.getSelection();
  if (!selection.toString().trim()) {
    hideButton();
    return;
  }
  
  // Check if auto-simplify is enabled
  chrome.storage.sync.get(['autoSimplify'], (result) => {
    if (result.autoSimplify) {
      // Auto-simplify the selected text
      simplifySelectedText();
      return;
    }
    
    // Check if the button should be shown
    chrome.storage.sync.get(['showSimplifyButton'], (result) => {
      if (result.showSimplifyButton === false) {
        return;
      }
      
      const button = document.getElementById('dyslexia-assistant-button') || createFloatingButton();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      button.style.top = `${window.scrollY + rect.bottom + 10}px`;
      button.style.left = `${window.scrollX + rect.left}px`;
      button.style.display = 'block';
    });
  });
}

// Hide the floating button
function hideButton() {
  const button = document.getElementById('dyslexia-assistant-button');
  if (button) {
    button.style.display = 'none';
  }
}

// Simplify the selected text
async function simplifySelectedText() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (!text) return;
  
  try {
    // Send text to backend for simplification
    const response = await fetch('http://localhost:5000/simplify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    
    const data = await response.json();
    
    if (data.simplified_text) {
      // Replace the selected text with simplified text
      replaceSelectedText(data.simplified_text, selection);
    } else if (data.error) {
      console.error('Error simplifying text:', data.error);
      alert(`Error simplifying text: ${data.error}`);
    }
  } catch (error) {
    console.error('Error simplifying text:', error);
    alert('Error connecting to the simplification service. Please make sure the backend is running.');
  }
}

// Replace the selected text with simplified text
function replaceSelectedText(simplifiedText, selection) {
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  
  // Create a span element to hold the simplified text
  const span = document.createElement('span');
  span.className = 'dyslexia-simplified-text';
  span.textContent = simplifiedText;
  
  // Apply user's font preferences
  chrome.storage.sync.get(['fontFamily', 'fontSize', 'backgroundColor', 'textColor'], (result) => {
    if (result.fontFamily) span.style.fontFamily = result.fontFamily;
    if (result.fontSize) span.style.fontSize = `${result.fontSize}px`;
    
    // Add a subtle highlight to indicate simplified text
    span.style.backgroundColor = '#e6f7ff';
    span.style.borderRadius = '2px';
    span.style.padding = '0 2px';
    
    // Add tooltip to show original text
    span.title = `Original: ${selection.toString().trim()}`;
    
    // Replace the selected text with the simplified text
    range.deleteContents();
    range.insertNode(span);
    
    // Clear the selection
    selection.removeAllRanges();
  });
}

// Simplify complex words on the page
function simplifyComplexWordsOnPage() {
  // Get all text nodes in the document
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script and style elements
        if (node.parentNode.tagName === 'SCRIPT' || 
            node.parentNode.tagName === 'STYLE' || 
            node.parentNode.tagName === 'NOSCRIPT' ||
            node.parentNode.className === 'dyslexia-simplified-text') {
          return NodeFilter.FILTER_REJECT;
        }
        // Accept non-empty text nodes
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  // Process text nodes in batches to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < textNodes.length; i += batchSize) {
    const batch = textNodes.slice(i, i + batchSize);
    processBatchOfTextNodes(batch);
  }
}

// Process a batch of text nodes
async function processBatchOfTextNodes(textNodes) {
  // Prepare text for each node
  const nodeTexts = textNodes.map(node => node.textContent);
  
  try {
    // Send batch of texts to backend for simplification
    const response = await fetch('http://localhost:5000/simplify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: nodeTexts.join('\n\n---\n\n') }),
    });
    
    const data = await response.json();
    
    if (data.simplified_text) {
      // Split the simplified text back into separate parts
      const simplifiedTexts = data.simplified_text.split('\n\n---\n\n');
      
      // Replace each text node with its simplified version
      textNodes.forEach((node, index) => {
        if (index < simplifiedTexts.length) {
          replaceTextNodeWithSimplified(node, simplifiedTexts[index], nodeTexts[index]);
        }
      });
    } else if (data.error) {
      console.error('Error simplifying text batch:', data.error);
    }
  } catch (error) {
    console.error('Error simplifying text batch:', error);
  }
}

// Replace a text node with simplified text
function replaceTextNodeWithSimplified(textNode, simplifiedText, originalText) {
  // Skip if the text is already simplified or hasn't changed
  if (simplifiedText === originalText || 
      textNode.parentNode.className === 'dyslexia-simplified-text') {
    return;
  }
  
  // Create a span element to hold the simplified text
  const span = document.createElement('span');
  span.className = 'dyslexia-simplified-text';
  span.textContent = simplifiedText;
  
  // Apply user's font preferences
  chrome.storage.sync.get(['fontFamily', 'fontSize'], (result) => {
    if (result.fontFamily) span.style.fontFamily = result.fontFamily;
    if (result.fontSize) span.style.fontSize = `${result.fontSize}px`;
    
    // Add a subtle highlight to indicate simplified text
    span.style.backgroundColor = '#e6f7ff';
    span.style.borderRadius = '2px';
    span.style.padding = '0 2px';
    
    // Add tooltip to show original text
    span.title = `Original: ${originalText}`;
    
    // Replace the text node with the span
    textNode.parentNode.replaceChild(span, textNode);
  });
}

// Add a button to simplify all text on the page
function createSimplifyAllButton() {
  const button = document.createElement('button');
  button.id = 'dyslexia-assistant-simplify-all';
  button.textContent = 'Simplify All Text';
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.zIndex = '10000';
  button.style.padding = '8px 16px';
  button.style.borderRadius = '4px';
  button.style.backgroundColor = '#4299e1';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.fontSize = '14px';
  button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  
  button.addEventListener('click', () => {
    button.textContent = 'Simplifying...';
    button.disabled = true;
    
    // Simplify all complex words on the page
    simplifyComplexWordsOnPage();
    
    setTimeout(() => {
      button.textContent = 'Simplify All Text';
      button.disabled = false;
    }, 5000);
  });
  
  document.body.appendChild(button);
  return button;
}

// Apply global styles to the page
function applyGlobalStyles() {
  chrome.storage.sync.get(['fontFamily', 'fontSize', 'lineSpacing', 'theme', 'backgroundColor', 'textColor'], (result) => {
    // Create or update the style element
    let styleEl = document.getElementById('dyslexia-assistant-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dyslexia-assistant-styles';
      document.head.appendChild(styleEl);
    }
    
    // Build CSS rules
    let cssRules = '';
    
    // Apply font settings if specified
    if (result.fontFamily || result.fontSize || result.lineSpacing) {
      cssRules += `
        body, p, h1, h2, h3, h4, h5, h6, span, div, li, a, button, input, textarea, select, label {
          ${result.fontFamily ? `font-family: ${result.fontFamily} !important;` : ''}
          ${result.fontSize ? `font-size: ${result.fontSize}px !important;` : ''}
          ${result.lineSpacing ? `line-height: ${result.lineSpacing} !important;` : ''}
        }
      `;
    }
    
    // Apply dark mode if enabled
    if (result.theme === 'dark') {
      cssRules += `
        html, body {
          background-color: ${result.backgroundColor || '#121212'} !important;
          color: ${result.textColor || '#e0e0e0'} !important;
        }
        p, h1, h2, h3, h4, h5, h6, span, div, li, a, button, input, textarea, select, label {
          color: ${result.textColor || '#e0e0e0'} !important;
        }
        a {
          color: #4299e1 !important;
        }
      `;
    }
    
    // Update the style element content
    styleEl.textContent = cssRules;
    
    // Log to console for debugging
    console.log('Dyslexia Assistant: Applied global styles', {
      fontFamily: result.fontFamily,
      fontSize: result.fontSize,
      lineSpacing: result.lineSpacing,
      theme: result.theme,
      backgroundColor: result.backgroundColor,
      textColor: result.textColor
    });
  });
}

// Initialize the extension
function initializeExtension() {
  // Create the simplify all button
  createSimplifyAllButton();
  
  // Apply global styles
  applyGlobalStyles();
  
  // Listen for text selection
  document.addEventListener('mouseup', showButtonNearSelection);
  document.addEventListener('keyup', showButtonNearSelection);
  
  // Log initialization
  console.log('Dyslexia Assistant: Content script initialized');
}

// Wait for the page to fully load
window.addEventListener('load', initializeExtension);

// Context menu integration
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'simplifySelectedText') {
    simplifySelectedText();
  } else if (request.action === 'simplifyAllText') {
    simplifyComplexWordsOnPage();
  } else if (request.action === 'updateSettings') {
    console.log('Dyslexia Assistant: Received settings update', request.settings);
    
    // Update global styles
    applyGlobalStyles();
    
    // Update any active tooltips with new styles
    const simplifiedElements = document.querySelectorAll('.dyslexia-simplified-text');
    if (simplifiedElements.length > 0 && request.settings) {
      simplifiedElements.forEach(element => {
        if (request.settings.fontFamily) element.style.fontFamily = request.settings.fontFamily;
        if (request.settings.fontSize) element.style.fontSize = `${request.settings.fontSize}px`;
      });
    }
  }
});

// Sync settings with extension storage
chrome.storage.onChanged.addListener((changes) => {
  console.log('Dyslexia Assistant: Storage changes detected', changes);
  
  // Update global styles when settings change
  if (changes.theme || changes.fontFamily || changes.fontSize || 
      changes.lineSpacing || changes.backgroundColor || changes.textColor) {
    applyGlobalStyles();
  }
  
  // Update page styling based on changed settings
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key === 'fontFamily' || key === 'fontSize') {
      // Update any simplified text elements with new styles
      const simplifiedElements = document.querySelectorAll('.dyslexia-simplified-text');
      if (simplifiedElements.length > 0) {
        simplifiedElements.forEach(element => {
          if (key === 'fontFamily') element.style.fontFamily = newValue;
          if (key === 'fontSize') element.style.fontSize = `${newValue}px`;
        });
      }
    } else if (key === 'showSimplifyButton' && newValue === false) {
      // Hide the simplify button if the setting is turned off
      hideButton();
    }
  }
});