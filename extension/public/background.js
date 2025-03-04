// Set up context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'simplifyText',
    title: 'Simplify selected text',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'simplifyAllText',
    title: 'Simplify all text on page',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'toggleDarkMode',
    title: 'Toggle dark mode',
    contexts: ['page']
  });
  
  // Initialize default settings
  chrome.storage.sync.get(['theme', 'backgroundColor', 'textColor', 'fontFamily', 'fontSize', 'lineSpacing'], (result) => {
    // Only set defaults if they don't exist
    const defaults = {};
    if (!result.theme) defaults.theme = 'light';
    if (!result.backgroundColor) defaults.backgroundColor = '#f8f9fa';
    if (!result.textColor) defaults.textColor = '#212529';
    if (!result.fontFamily) defaults.fontFamily = 'OpenDyslexic';
    if (!result.fontSize) defaults.fontSize = 16;
    if (!result.lineSpacing) defaults.lineSpacing = 1.5;
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults);
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'simplifyText') {
    chrome.tabs.sendMessage(tab.id, { action: 'simplifySelectedText' });
  } else if (info.menuItemId === 'simplifyAllText') {
    chrome.tabs.sendMessage(tab.id, { action: 'simplifyAllText' });
  } else if (info.menuItemId === 'toggleDarkMode') {
    // Get current theme
    chrome.storage.sync.get(['theme', 'backgroundColor', 'textColor'], (result) => {
      const newTheme = result.theme === 'dark' ? 'light' : 'dark';
      const newBackgroundColor = newTheme === 'dark' ? '#121212' : '#f8f9fa';
      const newTextColor = newTheme === 'dark' ? '#e0e0e0' : '#212529';
      
      // Update theme
      chrome.storage.sync.set({
        theme: newTheme,
        backgroundColor: newBackgroundColor,
        textColor: newTextColor
      });
      
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { 
        action: 'updateSettings',
        settings: { 
          theme: newTheme,
          backgroundColor: newBackgroundColor,
          textColor: newTextColor
        }
      });
    });
  }
});

// Store user settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // Sync settings between popup and content script
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (['fontFamily', 'fontSize', 'lineSpacing', 'backgroundColor', 'textColor', 'autoSimplify', 'showSimplifyButton', 'theme'].includes(key)) {
        // Update any active tabs with the new settings
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'updateSettings',
              settings: { [key]: newValue }
            }).catch(() => {
              // Ignore errors for tabs where content script isn't loaded
            });
          });
        });
      }
    }
  }
});