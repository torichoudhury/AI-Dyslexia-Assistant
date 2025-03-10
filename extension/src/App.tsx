import React, { useState, useEffect } from 'react';
import { BookOpen, Volume2, Palette, Settings, RefreshCw, Moon, Sun, RotateCcw } from 'lucide-react';

function App() {
  const [text, setText] = useState('');
  const [simplifiedText, setSimplifiedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('simplify');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('OpenDyslexic');
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [theme, setTheme] = useState('light');
  const [backgroundColor, setBackgroundColor] = useState('#f8f9fa');
  const [textColor, setTextColor] = useState('#212529');
  const [autoSimplify, setAutoSimplify] = useState(false);
  const [autoReadAloud, setAutoReadAloud] = useState(false);
  const [showSimplifyButton, setShowSimplifyButton] = useState(true);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [speechVoice, setSpeechVoice] = useState('default');
  const [backendStatus, setBackendStatus] = useState('unknown');
  const [errorMessage, setErrorMessage] = useState('');

  // Default settings
  const DEFAULT_SETTINGS = {
    fontSize: 16,
    fontFamily: 'OpenDyslexic',
    lineSpacing: 1.5,
    theme: 'light',
    backgroundColor: '#f8f9fa',
    textColor: '#212529',
    autoSimplify: false,
    autoReadAloud: false,
    showSimplifyButton: true,
    speechRate: 0.9,
    speechVoice: 'default'
  };

  // Reset all settings to default
  const resetSettings = () => {
    setFontSize(DEFAULT_SETTINGS.fontSize);
    setFontFamily(DEFAULT_SETTINGS.fontFamily);
    setLineSpacing(DEFAULT_SETTINGS.lineSpacing);
    setTheme(DEFAULT_SETTINGS.theme);
    setBackgroundColor(DEFAULT_SETTINGS.backgroundColor);
    setTextColor(DEFAULT_SETTINGS.textColor);
    setAutoSimplify(DEFAULT_SETTINGS.autoSimplify);
    setAutoReadAloud(DEFAULT_SETTINGS.autoReadAloud);
    setShowSimplifyButton(DEFAULT_SETTINGS.showSimplifyButton);
    setSpeechRate(DEFAULT_SETTINGS.speechRate);
    setSpeechVoice(DEFAULT_SETTINGS.speechVoice);
    
    // Reset text and simplified text
    setText('');
    setSimplifiedText('');

    // Sync with Chrome storage
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set(DEFAULT_SETTINGS);
    }

    // Save to localStorage
    localStorage.setItem('dyslexiaAssistantSettings', JSON.stringify(DEFAULT_SETTINGS));
  };

  // Apply theme settings
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--line-spacing', `${lineSpacing}`);
    document.documentElement.style.setProperty('--background-color', backgroundColor);
    document.documentElement.style.setProperty('--text-color', textColor);
    document.documentElement.style.fontFamily = fontFamily;
  }, [fontSize, fontFamily, lineSpacing, backgroundColor, textColor]);

  // Load saved settings
  useEffect(() => {
    const savedSettings = localStorage.getItem('dyslexiaAssistantSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setFontSize(settings.fontSize || 16);
      setFontFamily(settings.fontFamily || 'OpenDyslexic');
      setLineSpacing(settings.lineSpacing || 1.5);
      setTheme(settings.theme || 'light');
      setBackgroundColor(settings.backgroundColor || '#f8f9fa');
      setTextColor(settings.textColor || '#212529');
      setAutoSimplify(settings.autoSimplify || false);
      setAutoReadAloud(settings.autoReadAloud || false);
      setShowSimplifyButton(settings.showSimplifyButton !== undefined ? settings.showSimplifyButton : true);
      setSpeechRate(settings.speechRate || 0.9);
      setSpeechVoice(settings.speechVoice || 'default');
    }
  }, []);

  // Check backend status
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const response = await fetch('http://localhost:5000/status', {
          method: 'GET',
        });
        
        if (response.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('error');
        }
      } catch (error) {
        setBackendStatus('offline');
      }
    };
    
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Save settings
  useEffect(() => {
    localStorage.setItem('dyslexiaAssistantSettings', JSON.stringify({
      fontSize,
      fontFamily,
      lineSpacing,
      theme,
      backgroundColor,
      textColor,
      autoSimplify,
      autoReadAloud,
      showSimplifyButton,
      speechRate,
      speechVoice
    }));

    // Sync with Chrome storage for content script
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({
        fontFamily,
        fontSize,
        lineSpacing,
        backgroundColor,
        textColor,
        showSimplifyButton,
        autoSimplify,
        theme
      });
    }
  }, [
    fontSize, 
    fontFamily, 
    lineSpacing, 
    theme, 
    backgroundColor, 
    textColor, 
    autoSimplify, 
    autoReadAloud, 
    showSimplifyButton,
    speechRate,
    speechVoice
  ]);

  // Toggle theme
  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      setBackgroundColor('#121212');
      setTextColor('#e0e0e0');
    } else {
      setTheme('light');
      setBackgroundColor('#f8f9fa');
      setTextColor('#212529');
    }
  };

  // Simplify text function
  const simplifyText = async () => {
    if (!text.trim()) return;
    
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('http://localhost:5000/simplify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      
      const data = await response.json();
      if (data.simplified_text) {
        setSimplifiedText(data.simplified_text);
        
        // Auto read aloud if enabled
        if (autoReadAloud) {
          setTimeout(() => {
            speakText(data.simplified_text);
          }, 500);
        }
      } else if (data.error) {
        console.error('Error:', data.error);
        setErrorMessage(`Error: ${data.error}`);
        setSimplifiedText('');
      }
    } catch (error) {
      console.error('Error:', error);
      setErrorMessage('Error connecting to the server. Please check if the backend is running.');
      setBackendStatus('offline');
      setSimplifiedText('');
    } finally {
      setIsLoading(false);
    }
  };

  // Text-to-speech function
  const speakText = (textToRead = null) => {
    const textToSpeak = textToRead || simplifiedText || text;
    if (!textToSpeak.trim()) return;
    
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = speechRate;
    
    // Set voice if available
    if (speechVoice !== 'default') {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(voice => {
        if (speechVoice === 'female') {
          return voice.name.includes('Female') || voice.name.includes('female');
        } else if (speechVoice === 'male') {
          return voice.name.includes('Male') || voice.name.includes('male');
        }
        return false;
      });
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    window.speechSynthesis.speak(utterance);
  };

  // Stop speech
  const stopSpeech = () => {
    window.speechSynthesis.cancel();
  };

  // Handle speech rate change
  const handleSpeechRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rate = parseFloat(e.target.value);
    setSpeechRate(rate);
  };

  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{ 
        backgroundColor: 'var(--background-color)', 
        color: 'var(--text-color)',
        fontSize: 'var(--font-size)',
        lineHeight: 'var(--line-spacing)'
      }}
    >
      {/* Header */}
      <header className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-6 w-6" />
          <h1 className="text-xl font-bold">ReadAble</h1>
        </div>
        <div className="flex items-center space-x-2">
          {backendStatus === 'offline' && (
            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">Backend offline</span>
          )}
          <button 
            onClick={resetSettings}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Reset all settings"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex border-b">
        <button
          className={`flex-1 py-3 px-4 flex items-center justify-center space-x-2 ${
            activeTab === 'simplify' ? 'border-b-2 border-blue-500 font-medium' : ''
          }`}
          onClick={() => setActiveTab('simplify')}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Simplify</span>
        </button>
        <button
          className={`flex-1 py-3 px-4 flex items-center justify-center space-x-2 ${
            activeTab === 'appearance' ? 'border-b-2 border-blue-500 font-medium' : ''
          }`}
          onClick={() => setActiveTab('appearance')}
        >
          <Palette className="h-4 w-4" />
          <span>Appearance</span>
        </button>
        <button
          className={`flex-1 py-3 px-4 flex items-center justify-center space-x-2 ${
            activeTab === 'settings' ? 'border-b-2 border-blue-500 font-medium' : ''
          }`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-auto">
        {activeTab === 'simplify' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="text" className="block mb-2 font-medium">
                Enter text to simplify:
              </label>
              <textarea
                id="text"
                className="w-full p-3 border rounded-lg"
                style={{ backgroundColor: theme === 'light' ? 'white' : '#2a2a2a', color: 'var(--text-color)' }}
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type text here..."
              ></textarea>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={simplifyText}
                disabled={isLoading || !text.trim() || backendStatus === 'offline'}
                className={`px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center space-x-2 ${
                  isLoading || !text.trim() || backendStatus === 'offline' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Simplify</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => speakText()}
                disabled={!text.trim() && !simplifiedText.trim()}
                className={`px-4 py-2 rounded-lg bg-green-600 text-white flex items-center space-x-2 ${
                  !text.trim() && !simplifiedText.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'
                }`}
              >
                <Volume2 className="h-4 w-4" />
                <span>Read Aloud</span>
              </button>
              
              <button
                onClick={stopSpeech}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center space-x-2"
              >
                <span>Stop</span>
              </button>
            </div>
            
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg">
                <p className="font-medium">{errorMessage}</p>
              </div>
            )}
            
            {simplifiedText && (
              <div className="mt-6">
                <h2 className="text-lg font-medium mb-2">Simplified Text:</h2>
                <div 
                  className="p-4 rounded-lg border"
                  style={{ backgroundColor: theme === 'light' ? 'white' : '#2a2a2a' }}
                >
                  {simplifiedText}
                </div>
              </div>
            )}
            
            {backendStatus === 'offline' && (
              <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg">
                <p className="font-medium">Backend server is not running</p>
                <p className="text-sm mt-1">
                  Please make sure the Python backend server is running on port 5000.
                  Run the following command in a terminal:
                </p>
                <pre className="mt-2 p-2 bg-red-50 rounded text-sm overflow-x-auto">
                  python app.py
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-4">Text Appearance</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="font-family" className="block mb-2">
                    Font Family
                  </label>
                  <select
                    id="font-family"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                    style={{ backgroundColor: theme === 'light' ? 'white' : '#2a2a2a', color: 'var(--text-color)' }}
                  >
                    <option value="OpenDyslexic">OpenDyslexic</option>
                    <option value="Arial">Arial</option>
                    <option value="Comic Sans MS">Comic Sans MS</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Tahoma">Tahoma</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="font-size" className="block mb-2">
                    Font Size: {fontSize}px
                  </label>
                  <input
                    id="font-size"
                    type="range"
                    min="12"
                    max="24"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label htmlFor="line-spacing" className="block mb-2">
                    Line Spacing: {lineSpacing}
                  </label>
                  <input
                    id="line-spacing"
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={lineSpacing}
                    onChange={(e) => setLineSpacing(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="text-lg font-medium mb-4">Colors</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="background-color" className="block mb-2">
                    Background Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="background-color"
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="p-1 border rounded"
                    />
                    <span>{backgroundColor}</span>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="text-color" className="block mb-2">
                    Text Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="text-color"
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="p-1 border rounded"
                    />
                    <span>{textColor}</span>
                  </div>
                </div>
                
                <div className="pt-4">
                  <button
                    onClick={toggleTheme}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-2"
                  >
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    <span>Toggle {theme === 'light' ? 'Dark' : 'Light'} Mode</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 rounded-lg border mt-6">
              <h3 className="font-medium mb-2">Preview</h3>
              <p>
                This is a preview of how your text will appear with the current settings.
                ReadAble helps make reading easier by simplifying text and
                providing customizable display options.
              </p>
            </div>
            
            <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg">
              <p className="font-medium">Webpage Appearance</p>
              <p className="text-sm mt-1">
                These appearance settings will be applied to all webpages you visit.
                Font family, size, line spacing, and theme will affect the entire page.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-4">General Settings</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Auto-simplify selected text</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={autoSimplify}
                      onChange={(e) => setAutoSimplify(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <span>Read aloud automatically after simplifying</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={autoReadAloud}
                      onChange={(e) => setAutoReadAloud(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <span>Show simplify button on web pages</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={showSimplifyButton}
                      onChange={(e) => setShowSimplifyButton(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="text-lg font-medium mb-4">Text-to-Speech Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="speech-rate" className="block mb-2">
                    Speech Rate: {speechRate}
                  </label>
                  <input
                    id="speech-rate"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speechRate}
                    onChange={handleSpeechRateChange}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label htmlFor="speech-voice" className="block mb-2">
                    Voice
                  </label>
                  <select
                    id="speech-voice"
                    value={speechVoice}
                    onChange={(e) => setSpeechVoice(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                    style={{ backgroundColor: theme === 'light' ? 'white' : '#2a2a2a', color: 'var(--text-color)' }}
                  >
                    <option value="default">Default</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="text-lg font-medium mb-4">About</h2>
              <p>
                ReadAble v0.1.0
              </p>
              <p className="mt-2">
                This extension uses AI to simplify text and make reading easier for people with dyslexia.
                It includes text-to-speech functionality and customizable display options.
              </p>
              <p className="mt-2">
                <strong>How to use on webpages:</strong>
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Select text to simplify it (auto-simplify or button)</li>
                <li>Use the "Simplify All Text" button to process the entire page</li>
                <li>Right-click and select "Simplify selected text" from the context menu</li>
                <li>Hover over simplified text to see the original version</li>
                <li>Right-click and select "Toggle dark mode" to quickly change the theme</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 text-center text-sm border-t">
        ReadAble &copy; 2025
      </footer>
    </div>
  );
}

export default App;