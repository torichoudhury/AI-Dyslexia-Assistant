// This script runs in the context of web pages

// Default settings
const DEFAULT_SETTINGS = {
  theme: 'light',
  backgroundColor: '#f8f9fa',
  textColor: '#212529',
  fontFamily: 'OpenDyslexic',
  fontSize: 16,
  lineSpacing: 1.5,
  autoSimplify: false,
  showSimplifyButton: true
};

// Create a floating button for text selection
function createFloatingButton() {
  const button = document.createElement('button');
  button.id = 'readable-button';
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
      
      const button = document.getElementById('readable-button') || createFloatingButton();
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
  const button = document.getElementById('readable-button');
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
  span.className = 'readable-simplified-text';
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

// Reset page to default state
function resetPage() {
  // Remove all simplified text spans
  const simplifiedTexts = document.querySelectorAll('.readable-simplified-text');
  simplifiedTexts.forEach(span => {
    const text = document.createTextNode(span.getAttribute('title').replace('Original: ', ''));
    span.parentNode.replaceChild(text, span);
  });

  // Remove custom styles
  let styleEl = document.getElementById('readable-styles');
  if (styleEl) {
    styleEl.remove();
  }

  // Reset to default styles
  applyGlobalStyles(DEFAULT_SETTINGS);
}

// Apply global styles to the page
function applyGlobalStyles(settings = null) {
  chrome.storage.sync.get(['fontFamily', 'fontSize', 'lineSpacing', 'theme', 'backgroundColor', 'textColor'], (result) => {
    const styles = settings || result;
    
    // Create or update the style element
    let styleEl = document.getElementById('readable-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'readable-styles';
      document.head.appendChild(styleEl);
    }
    
    // Build CSS rules
    let cssRules = '';
    
    // Apply font settings if specified
    if (styles.fontFamily || styles.fontSize || styles.lineSpacing) {
      cssRules += `
        body, p, h1, h2, h3, h4, h5, h6, span, div, li, a, button, input, textarea, select, label {
          ${styles.fontFamily ? `font-family: ${styles.fontFamily} !important;` : ''}
          ${styles.fontSize ? `font-size: ${styles.fontSize}px !important;` : ''}
          ${styles.lineSpacing ? `line-height: ${styles.lineSpacing} !important;` : ''}
        }
      `;
    }
    
    // Apply dark mode if enabled
    if (styles.theme === 'dark') {
      cssRules += `
        html, body {
          background-color: ${styles.backgroundColor || '#121212'} !important;
          color: ${styles.textColor || '#e0e0e0'} !important;
        }
        p, h1, h2, h3, h4, h5, h6, span, div, li, a, button, input, textarea, select, label {
          color: ${styles.textColor || '#e0e0e0'} !important;
        }
        a {
          color: #4299e1 !important;
        }
      `;
    }
    
    // Update the style element content
    styleEl.textContent = cssRules;
  });
}

// Find the main content area of the page
function findMainContent() {
  // Common selectors for main content areas
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '#main-content',
    '#content',
    '.main-content',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#primary',
    '.primary'
  ];

  // Try to find the main content element
  for (const selector of mainSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  // Fallback: Find the element with the most text content
  const textBlocks = Array.from(document.querySelectorAll('div, section, article'))
    .filter(el => {
      // Filter out navigation, header, footer, and sidebar elements
      const excludeSelectors = ['nav', 'header', 'footer', 'sidebar', 'menu', 'banner'];
      const role = el.getAttribute('role')?.toLowerCase() || '';
      const className = el.className.toLowerCase();
      const id = el.id.toLowerCase();
      
      return !excludeSelectors.some(selector => 
        role.includes(selector) || 
        className.includes(selector) || 
        id.includes(selector)
      );
    })
    .map(el => ({
      element: el,
      textLength: el.textContent.trim().length
    }))
    .sort((a, b) => b.textLength - a.textLength);

  return textBlocks[0]?.element || document.body;
}

// Simplify all text on the page
async function simplifyComplexWordsOnPage() {
  const mainContent = findMainContent();
  
  // Get all text-containing elements within the main content
  const textElements = mainContent.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, th, figcaption, blockquote, pre, code, ' +
    'div:not(:has(*)), span:not(:has(*)), label, a'
  );
  
  let processedCount = 0;
  const totalElements = textElements.length;
  const simplifyButton = document.getElementById('readable-simplify-all');
  
  for (const element of textElements) {
    // Skip if already simplified, empty, or contains only whitespace/special characters
    if (
      element.classList.contains('readable-simplified-text') || 
      !element.textContent.trim() ||
      !/[a-zA-Z]{2,}/.test(element.textContent) // Skip if no word-like content
    ) {
      continue;
    }

    try {
      const response = await fetch('http://localhost:5000/simplify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: element.textContent }),
      });

      const data = await response.json();
      if (data.simplified_text) {
        const originalText = element.textContent;
        
        // Create wrapper span
        const span = document.createElement('span');
        span.className = 'readable-simplified-text';
        span.textContent = data.simplified_text;
        span.title = `Original: ${originalText}`;
        
        // Apply styles
        span.style.backgroundColor = '#e6f7ff';
        span.style.borderRadius = '2px';
        span.style.padding = '0 2px';
        
        // Apply current font settings
        chrome.storage.sync.get(['fontFamily', 'fontSize'], (result) => {
          if (result.fontFamily) span.style.fontFamily = result.fontFamily;
          if (result.fontSize) span.style.fontSize = `${result.fontSize}px`;
        });

        // Replace content
        element.textContent = '';
        element.appendChild(span);
        
        // Update progress
        processedCount++;
        if (simplifyButton) {
          simplifyButton.textContent = `Simplifying... (${Math.round((processedCount / totalElements) * 100)}%)`;
        }
      }
    } catch (error) {
      console.error('Error simplifying text:', error);
    }
    
    // Add a small delay between requests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Reset button text
  if (simplifyButton) {
    simplifyButton.textContent = 'Simplify All Text';
    simplifyButton.disabled = false;
  }
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
}

// Add a button to simplify all text on the page
function createSimplifyAllButton() {
  const button = document.createElement('button');
  button.id = 'readable-simplify-all';
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
    simplifyComplexWordsOnPage();
  });
  
  document.body.appendChild(button);
  return button;
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
    console.log('ReadAble: Received settings update', request.settings);
    applyGlobalStyles(request.settings);
  } else if (request.action === 'resetPage') {
    resetPage();
  }
});

// Sync settings with extension storage
chrome.storage.onChanged.addListener((changes) => {
  console.log('ReadAble: Storage changes detected', changes);
  
  // Update global styles when settings change
  if (changes.theme || changes.fontFamily || changes.fontSize || 
      changes.lineSpacing || changes.backgroundColor || changes.textColor) {
    applyGlobalStyles();
  }
  
  // Update page styling based on changed settings
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key === 'fontFamily' || key === 'fontSize') {
      // Update any simplified text elements with new styles
      const simplifiedElements = document.querySelectorAll('.readable-simplified-text');
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