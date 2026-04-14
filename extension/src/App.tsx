import { useEffect, useRef, useState } from 'react';
import { BookOpen, KeyRound, LogIn, LogOut, Moon, Palette, RefreshCw, RotateCcw, Settings, ShieldCheck, Sun, UserPlus, Volume2 } from 'lucide-react';

declare const chrome:
  | {
      storage?: {
        sync?: {
          set: (items: Record<string, unknown>) => void;
        };
      };
    }
  | undefined;

type TabName = 'simplify' | 'history' | 'glossary' | 'appearance' | 'settings';

interface UserPreferences {
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  theme: 'light' | 'dark';
  backgroundColor: string;
  textColor: string;
  autoSimplify: boolean;
  autoReadAloud: boolean;
  showSimplifyButton: boolean;
  speechRate: number;
  speechVoice: string;
}

interface HistoryItem {
  id: string;
  original_text: string;
  simplified_text: string;
  source_url: string;
  request_source: string;
  created_at?: string;
}

interface GlossaryItem {
  id: string;
  term: string;
  simplified_definition: string;
  source_text: string;
  created_at?: string;
  updated_at?: string;
}

interface AppUser {
  id: string;
  user_id: string;
  display_name: string;
  auth_required?: boolean;
  created_at?: string;
  updated_at?: string;
}

const API_BASE_URL = 'http://localhost:5000';

const DEFAULT_SETTINGS: UserPreferences = {
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

const SETTINGS_STORAGE_KEY = 'dyslexiaAssistantSettings';
const USER_ID_STORAGE_KEY = 'readableUserId';
const AUTH_TOKENS_STORAGE_KEY = 'readableAuthTokens';
const ACTIVE_AUTH_TOKEN_STORAGE_KEY = 'authToken';

function getStoredUserId(): string {
  return localStorage.getItem(USER_ID_STORAGE_KEY) || '';
}

function App() {
  const [userId, setUserId] = useState('');
  const [text, setText] = useState('');
  const [simplifiedText, setSimplifiedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('simplify');

  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);
  const [fontFamily, setFontFamily] = useState(DEFAULT_SETTINGS.fontFamily);
  const [lineSpacing, setLineSpacing] = useState(DEFAULT_SETTINGS.lineSpacing);
  const [theme, setTheme] = useState<UserPreferences['theme']>(DEFAULT_SETTINGS.theme);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_SETTINGS.backgroundColor);
  const [textColor, setTextColor] = useState(DEFAULT_SETTINGS.textColor);
  const [autoSimplify, setAutoSimplify] = useState(DEFAULT_SETTINGS.autoSimplify);
  const [autoReadAloud, setAutoReadAloud] = useState(DEFAULT_SETTINGS.autoReadAloud);
  const [showSimplifyButton, setShowSimplifyButton] = useState(DEFAULT_SETTINGS.showSimplifyButton);
  const [speechRate, setSpeechRate] = useState(DEFAULT_SETTINGS.speechRate);
  const [speechVoice, setSpeechVoice] = useState(DEFAULT_SETTINGS.speechVoice);

  const [backendStatus, setBackendStatus] = useState<'unknown' | 'online' | 'offline' | 'error'>('unknown');
  const [mongoStatus, setMongoStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [mongoError, setMongoError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [glossaryItems, setGlossaryItems] = useState<GlossaryItem[]>([]);
  const [isGlossaryLoading, setIsGlossaryLoading] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState('');
  const [glossaryTerm, setGlossaryTerm] = useState('');
  const [glossaryDefinition, setGlossaryDefinition] = useState('');
  const [glossaryMessage, setGlossaryMessage] = useState('');

  const [users, setUsers] = useState<AppUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPasswordConfirm, setNewUserPasswordConfirm] = useState('');
  const [usersMessage, setUsersMessage] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [authTokens, setAuthTokens] = useState<Record<string, string>>({});
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [isSettingsHydrated, setIsSettingsHydrated] = useState(false);
  const [isRemoteReady, setIsRemoteReady] = useState(false);
  const preferencesSyncTimer = useRef<number | undefined>(undefined);
  const activeUser = users.find((item) => item.user_id === userId);
  const activeAuthToken = userId ? authTokens[userId] || '' : '';
  const isProfileLocked = Boolean(activeUser?.auth_required && !activeAuthToken);
  const canUseProfileData = Boolean(activeUser && !isProfileLocked);

  const applyPreferences = (preferences: Partial<UserPreferences>) => {
    if (typeof preferences.fontSize === 'number') setFontSize(preferences.fontSize);
    if (typeof preferences.fontFamily === 'string') setFontFamily(preferences.fontFamily);
    if (typeof preferences.lineSpacing === 'number') setLineSpacing(preferences.lineSpacing);
    if (preferences.theme === 'light' || preferences.theme === 'dark') setTheme(preferences.theme);
    if (typeof preferences.backgroundColor === 'string') setBackgroundColor(preferences.backgroundColor);
    if (typeof preferences.textColor === 'string') setTextColor(preferences.textColor);
    if (typeof preferences.autoSimplify === 'boolean') setAutoSimplify(preferences.autoSimplify);
    if (typeof preferences.autoReadAloud === 'boolean') setAutoReadAloud(preferences.autoReadAloud);
    if (typeof preferences.showSimplifyButton === 'boolean') setShowSimplifyButton(preferences.showSimplifyButton);
    if (typeof preferences.speechRate === 'number') setSpeechRate(preferences.speechRate);
    if (typeof preferences.speechVoice === 'string') setSpeechVoice(preferences.speechVoice);
  };

  const formatDate = (raw?: string): string => {
    if (!raw) {
      return 'No timestamp';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }

    return parsed.toLocaleString();
  };

  const setActiveUser = (nextUserId: string) => {
    setUserId(nextUserId);
    localStorage.setItem(USER_ID_STORAGE_KEY, nextUserId);
    const nextAuthToken = authTokens[nextUserId] || '';

    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({
        userId: nextUserId,
        [ACTIVE_AUTH_TOKEN_STORAGE_KEY]: nextAuthToken
      });
    }
  };

  const clearTokenForUser = (targetUserId: string) => {
    setAuthTokens((currentTokens) => {
      if (!currentTokens[targetUserId]) {
        return currentTokens;
      }

      const nextTokens = { ...currentTokens };
      delete nextTokens[targetUserId];
      return nextTokens;
    });
  };

  const clearTokenForUserIfMatching = (targetUserId: string, tokenUsed: string) => {
    if (!tokenUsed) {
      return;
    }

    setAuthTokens((currentTokens) => {
      if (currentTokens[targetUserId] !== tokenUsed) {
        return currentTokens;
      }

      const nextTokens = { ...currentTokens };
      delete nextTokens[targetUserId];
      return nextTokens;
    });
  };

  const getAuthHeaders = (targetUserId: string): Record<string, string> => {
    const token = authTokens[targetUserId];
    if (!token) {
      return {};
    }

    return {
      'X-User-Token': token
    };
  };

  const unlockActiveProfile = async () => {
    if (!activeUser) {
      setUsersMessage('Select a profile first.');
      return;
    }

    if (!profilePassword.trim()) {
      setUsersMessage('Enter the profile password to unlock this profile.');
      return;
    }

    setIsAuthLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: activeUser.user_id,
          password: profilePassword.trim()
        })
      });

      const data = await response.json();
      if (!response.ok || typeof data.auth_token !== 'string') {
        const authError = typeof data.error === 'string' ? data.error : 'Could not unlock profile.';
        setUsersMessage(authError);
        return;
      }

      const authToken = data.auth_token as string;
      const nextTokens = {
        ...authTokens,
        [activeUser.user_id]: authToken
      };
      setAuthTokens(nextTokens);
      localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify(nextTokens));

      if (chrome?.storage?.sync) {
        chrome.storage.sync.set({
          userId: activeUser.user_id,
          authTokens: nextTokens,
          [ACTIVE_AUTH_TOKEN_STORAGE_KEY]: authToken
        });
      }

      setProfilePassword('');
      setUsersMessage('Profile unlocked.');
      void fetchHistory(activeUser.user_id, authToken);
      void fetchGlossary(activeUser.user_id, glossarySearch, authToken);
    } catch (error) {
      console.error('Profile unlock failed:', error);
      setUsersMessage('Could not connect to backend while unlocking profile.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const lockActiveProfile = async () => {
    if (!activeUser) {
      return;
    }

    try {
      const token = authTokens[activeUser.user_id];
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Token': token
          },
          body: JSON.stringify({ user_id: activeUser.user_id })
        });
      }
    } catch (error) {
      console.error('Profile lock failed:', error);
    } finally {
      clearTokenForUser(activeUser.user_id);
      setHistoryItems([]);
      setGlossaryItems([]);
      setUsersMessage('Profile locked.');
    }
  };

  const fetchUsers = async (): Promise<AppUser[]> => {
    if (backendStatus !== 'online') {
      return [];
    }

    setIsUsersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users`);
      const data = await response.json();
      if (response.ok && Array.isArray(data.users)) {
        const fetchedUsers = data.users as AppUser[];
        setUsers(fetchedUsers);
        return fetchedUsers;
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsUsersLoading(false);
    }

    return [];
  };

  const createUserProfile = async () => {
    if (backendStatus !== 'online') {
      setUsersMessage('Backend must be online to create a user profile.');
      return;
    }

    const trimmedName = newUserName.trim();
    const trimmedPassword = newUserPassword.trim();
    const trimmedConfirm = newUserPasswordConfirm.trim();

    if (!trimmedName) {
      setUsersMessage('Display name is required.');
      return;
    }

    if (!trimmedPassword) {
      setUsersMessage('Password is required for every new profile.');
      return;
    }

    if (trimmedPassword.length < 8) {
      setUsersMessage('Password must be at least 8 characters long.');
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setUsersMessage('Password and confirmation do not match.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: trimmedName,
          password: trimmedPassword
        })
      });

      const data = await response.json();
      if (!response.ok || !data.user?.user_id) {
        const createError = typeof data.error === 'string' ? data.error : 'Could not create a new secure profile.';
        setUsersMessage(createError);
        return;
      }

      const createdUser = data.user as AppUser;
      setUsersMessage(`Created user profile: ${createdUser.display_name}`);
      setNewUserName('');
      setNewUserPassword('');
      setNewUserPasswordConfirm('');

      if (typeof data.auth_token === 'string') {
        const authToken = data.auth_token as string;
        const nextTokens = {
          ...authTokens,
          [createdUser.user_id]: authToken
        };
        setAuthTokens(nextTokens);
        localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify(nextTokens));

        if (chrome?.storage?.sync) {
          chrome.storage.sync.set({
            userId: createdUser.user_id,
            authTokens: nextTokens,
            [ACTIVE_AUTH_TOKEN_STORAGE_KEY]: authToken
          });
        }
      }

      await fetchUsers();
      setActiveUser(createdUser.user_id);
      setSimplifiedText('');
      setHistoryItems([]);
      setGlossaryItems([]);
    } catch (error) {
      console.error('Failed to create user profile:', error);
      setUsersMessage('Could not connect to backend while creating user profile.');
    }
  };

  const fetchHistory = async (requestedUserId: string, authTokenOverride?: string) => {
    if (!requestedUserId || backendStatus !== 'online') {
      return;
    }

    setIsHistoryLoading(true);
    try {
      const tokenUsed = authTokenOverride ?? authTokens[requestedUserId] ?? '';
      const response = await fetch(`${API_BASE_URL}/history/${encodeURIComponent(requestedUserId)}?limit=50`, {
        headers: tokenUsed ? { 'X-User-Token': tokenUsed } : {}
      });
      const data = await response.json();
      if (response.status === 404) {
        setHistoryItems([]);
        setUsersMessage(typeof data.error === 'string' ? data.error : 'Profile not found.');
        return;
      }

      if (response.status === 401) {
        clearTokenForUserIfMatching(requestedUserId, tokenUsed);
        setHistoryItems([]);
        setUsersMessage(typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.');
        return;
      }

      if (response.ok && Array.isArray(data.history)) {
        setHistoryItems(data.history as HistoryItem[]);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const fetchGlossary = async (requestedUserId: string, query = '', authTokenOverride?: string) => {
    if (!requestedUserId || backendStatus !== 'online') {
      return;
    }

    setIsGlossaryLoading(true);
    try {
      const tokenUsed = authTokenOverride ?? authTokens[requestedUserId] ?? '';
      const endpoint = `${API_BASE_URL}/glossary/${encodeURIComponent(requestedUserId)}?q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        headers: tokenUsed ? { 'X-User-Token': tokenUsed } : {}
      });
      const data = await response.json();
      if (response.status === 404) {
        setGlossaryItems([]);
        setGlossaryMessage(typeof data.error === 'string' ? data.error : 'Profile not found.');
        return;
      }

      if (response.status === 401) {
        clearTokenForUserIfMatching(requestedUserId, tokenUsed);
        setGlossaryItems([]);
        setGlossaryMessage(typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.');
        return;
      }

      if (response.ok && Array.isArray(data.glossary)) {
        setGlossaryItems(data.glossary as GlossaryItem[]);
      }
    } catch (error) {
      console.error('Failed to load glossary:', error);
    } finally {
      setIsGlossaryLoading(false);
    }
  };

  const syncPreferencesToBackend = async (requestedUserId: string, preferences: UserPreferences) => {
    if (!requestedUserId || backendStatus !== 'online') {
      return;
    }

    await fetch(`${API_BASE_URL}/preferences/${encodeURIComponent(requestedUserId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(requestedUserId)
      },
      body: JSON.stringify({ preferences })
    });
  };

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      if (!response.ok) {
        setBackendStatus('error');
        return;
      }

      const data = await response.json();
      setBackendStatus('online');
      if (data?.mongo?.status === 'online') {
        setMongoStatus('online');
      } else {
        setMongoStatus('offline');
      }
      setMongoError(typeof data?.mongo?.error === 'string' ? data.mongo.error : '');
    } catch (error) {
      console.error('Status check failed:', error);
      setBackendStatus('offline');
      setMongoStatus('unknown');
    }
  };

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

  const resetSettings = () => {
    applyPreferences(DEFAULT_SETTINGS);
    setText('');
    setSimplifiedText('');
    setGlossaryMessage('Settings reset to defaults.');
  };

  const simplifyText = async () => {
    if (!text.trim()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const tokenUsed = authTokens[userId] ?? '';
      const response = await fetch(`${API_BASE_URL}/simplify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenUsed ? { 'X-User-Token': tokenUsed } : {})
        },
        body: JSON.stringify({
          text,
          user_id: userId,
          source_url: 'extension-popup',
          request_source: 'popup'
        })
      });

      const data = await response.json();
      if (response.status === 401) {
        clearTokenForUserIfMatching(userId, tokenUsed);
        const authError = typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.';
        setUsersMessage(authError);
        setErrorMessage(authError);
        setSimplifiedText('');
        return;
      }

      if (response.ok && typeof data.simplified_text === 'string') {
        setSimplifiedText(data.simplified_text);
        void fetchHistory(userId);

        if (autoReadAloud) {
          setTimeout(() => {
            speakText(data.simplified_text as string);
          }, 300);
        }
      } else {
        const errorText = typeof data.error === 'string' ? data.error : 'Unable to simplify the text.';
        setErrorMessage(errorText);
        setSimplifiedText('');
      }
    } catch (error) {
      console.error('Simplify request failed:', error);
      setErrorMessage('Error connecting to backend. Please make sure backend and MongoDB are running.');
      setBackendStatus('offline');
      setSimplifiedText('');
    } finally {
      setIsLoading(false);
    }
  };

  const speakText = (textToRead?: string) => {
    const textToSpeak = textToRead || simplifiedText || text;
    if (!textToSpeak.trim()) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = speechRate;

    if (speechVoice !== 'default') {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find((voice) => {
        const voiceName = voice.name.toLowerCase();
        if (speechVoice === 'female') {
          return voiceName.includes('female');
        }
        if (speechVoice === 'male') {
          return voiceName.includes('male');
        }
        return false;
      });

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
  };

  const useCurrentSimplificationForGlossary = () => {
    if (!text.trim() || !simplifiedText.trim()) {
      return;
    }

    const termSeed = text.trim().slice(0, 80);
    setGlossaryTerm(termSeed);
    setGlossaryDefinition(simplifiedText.trim());
    setActiveTab('glossary');
    setGlossaryMessage('Draft created from current simplify result. You can edit before saving.');
  };

  const saveGlossaryEntry = async () => {
    if (!userId || !glossaryTerm.trim() || !glossaryDefinition.trim()) {
      setGlossaryMessage('Term and simplified definition are required.');
      return;
    }

    try {
      const tokenUsed = authTokens[userId] ?? '';
      const response = await fetch(`${API_BASE_URL}/glossary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenUsed ? { 'X-User-Token': tokenUsed } : {})
        },
        body: JSON.stringify({
          user_id: userId,
          term: glossaryTerm.trim(),
          simplified_definition: glossaryDefinition.trim(),
          source_text: text.trim()
        })
      });

      const data = await response.json();
      if (response.status === 401) {
        clearTokenForUserIfMatching(userId, tokenUsed);
        setGlossaryMessage(typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.');
        return;
      }

      if (!response.ok) {
        setGlossaryMessage(typeof data.error === 'string' ? data.error : 'Could not save glossary entry.');
        return;
      }

      setGlossaryMessage('Glossary entry saved.');
      setGlossaryTerm('');
      setGlossaryDefinition('');
      void fetchGlossary(userId, glossarySearch);
    } catch (error) {
      console.error('Saving glossary failed:', error);
      setGlossaryMessage('Could not connect to backend while saving glossary entry.');
    }
  };

  const removeGlossaryEntry = async (itemId: string) => {
    try {
      const tokenUsed = authTokens[userId] ?? '';
      const endpoint = `${API_BASE_URL}/glossary/${encodeURIComponent(itemId)}?user_id=${encodeURIComponent(userId)}`;
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          ...(tokenUsed ? { 'X-User-Token': tokenUsed } : {})
        }
      });

      if (response.status === 401) {
        const data = await response.json();
        clearTokenForUserIfMatching(userId, tokenUsed);
        setGlossaryMessage(typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.');
        return;
      }

      if (response.ok) {
        void fetchGlossary(userId, glossarySearch);
        setGlossaryMessage('Glossary entry deleted.');
      }
    } catch (error) {
      console.error('Delete glossary failed:', error);
      setGlossaryMessage('Could not delete glossary entry.');
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--line-spacing', `${lineSpacing}`);
    document.documentElement.style.setProperty('--background-color', backgroundColor);
    document.documentElement.style.setProperty('--text-color', textColor);
    document.documentElement.style.fontFamily = fontFamily;
  }, [fontSize, fontFamily, lineSpacing, backgroundColor, textColor]);

  useEffect(() => {
    const localUserId = getStoredUserId();
    if (localUserId) {
      setActiveUser(localUserId);
    }

    const savedSettingsRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettingsRaw) {
      try {
        const parsed = JSON.parse(savedSettingsRaw) as Partial<UserPreferences>;
        applyPreferences(parsed);
      } catch (error) {
        console.error('Failed to parse local settings:', error);
      }
    }

    const savedTokensRaw = localStorage.getItem(AUTH_TOKENS_STORAGE_KEY);
    if (savedTokensRaw) {
      try {
        const parsedTokens = JSON.parse(savedTokensRaw) as Record<string, string>;
        if (parsedTokens && typeof parsedTokens === 'object') {
          setAuthTokens(parsedTokens);
        }
      } catch (error) {
        console.error('Failed to parse auth tokens:', error);
      }
    }

    setIsSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isSettingsHydrated) {
      return;
    }

    localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify(authTokens));

    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({
        authTokens,
        [ACTIVE_AUTH_TOKEN_STORAGE_KEY]: userId ? authTokens[userId] || '' : ''
      });
    }
  }, [isSettingsHydrated, authTokens, userId]);

  useEffect(() => {
    void checkBackendStatus();
    const interval = window.setInterval(() => {
      void checkBackendStatus();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (backendStatus !== 'online') {
      return;
    }

    void fetchUsers();
  }, [backendStatus]);

  useEffect(() => {
    if (users.length === 0) {
      return;
    }

    const hasSelectedUser = users.some((item) => item.user_id === userId);
    if (!hasSelectedUser) {
      setActiveUser(users[0].user_id);
    }
  }, [users, userId]);

  useEffect(() => {
    if (!isSettingsHydrated) {
      return;
    }

    const preferencesToPersist: UserPreferences = {
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
    };

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferencesToPersist));

    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({
        ...preferencesToPersist,
        userId
      });
    }
  }, [
    isSettingsHydrated,
    userId,
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

  useEffect(() => {
    if (!userId || backendStatus !== 'online') {
      return;
    }

    let isCancelled = false;
    setIsRemoteReady(false);

    const bootstrapRemote = async () => {
      try {
        const tokenUsed = authTokens[userId] ?? '';
        const response = await fetch(`${API_BASE_URL}/preferences/${encodeURIComponent(userId)}`, {
          headers: tokenUsed ? { 'X-User-Token': tokenUsed } : {}
        });
        const data = await response.json();
        if (!isCancelled && response.status === 404) {
          setUsersMessage('Selected profile was not found. Pick another profile or create a new one.');
          return;
        }

        if (!isCancelled && response.status === 401) {
          clearTokenForUserIfMatching(userId, tokenUsed);
          setUsersMessage(typeof data.error === 'string' ? data.error : 'This profile is locked. Unlock it in settings.');
          return;
        }

        if (!isCancelled && response.ok && data.preferences) {
          applyPreferences(data.preferences as Partial<UserPreferences>);
        }
      } catch (error) {
        console.error('Failed loading remote preferences:', error);
      } finally {
        if (!isCancelled) {
          setIsRemoteReady(true);
          void fetchHistory(userId);
          void fetchGlossary(userId, '');
        }
      }
    };

    void bootstrapRemote();

    return () => {
      isCancelled = true;
    };
  }, [userId, backendStatus, activeAuthToken]);

  useEffect(() => {
    if (!isSettingsHydrated || !isRemoteReady || !userId || backendStatus !== 'online') {
      return;
    }

    if (activeUser?.auth_required && !activeAuthToken) {
      return;
    }

    if (preferencesSyncTimer.current) {
      window.clearTimeout(preferencesSyncTimer.current);
    }

    preferencesSyncTimer.current = window.setTimeout(() => {
      void syncPreferencesToBackend(userId, {
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
      });
    }, 500);

    return () => {
      if (preferencesSyncTimer.current) {
        window.clearTimeout(preferencesSyncTimer.current);
      }
    };
  }, [
    isSettingsHydrated,
    isRemoteReady,
    userId,
    backendStatus,
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
    speechVoice,
    activeUser?.auth_required,
    activeAuthToken
  ]);

  useEffect(() => {
    if (activeTab !== 'glossary' || !userId || backendStatus !== 'online') {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetchGlossary(userId, glossarySearch);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeTab, glossarySearch, userId, backendStatus]);

  const inputCardStyle = {
    backgroundColor: theme === 'light' ? 'white' : '#2a2a2a',
    color: 'var(--text-color)'
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
      <header className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <BookOpen className="h-6 w-6" />
          <h1 className="text-xl font-bold">ReadAble</h1>
        </div>
        <div className="flex items-center space-x-2">
          {backendStatus !== 'online' && (
            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">Backend offline</span>
          )}
          {backendStatus === 'online' && mongoStatus !== 'online' && (
            <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">Mongo offline</span>
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
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <nav className="grid grid-cols-5 border-b text-sm">
        <button className={`py-3 px-2 ${activeTab === 'simplify' ? 'border-b-2 border-blue-500 font-medium' : ''}`} onClick={() => setActiveTab('simplify')}>
          Simplify
        </button>
        <button className={`py-3 px-2 ${activeTab === 'history' ? 'border-b-2 border-blue-500 font-medium' : ''}`} onClick={() => setActiveTab('history')}>
          History
        </button>
        <button className={`py-3 px-2 ${activeTab === 'glossary' ? 'border-b-2 border-blue-500 font-medium' : ''}`} onClick={() => setActiveTab('glossary')}>
          Glossary
        </button>
        <button className={`py-3 px-2 ${activeTab === 'appearance' ? 'border-b-2 border-blue-500 font-medium' : ''}`} onClick={() => setActiveTab('appearance')}>
          <span className="inline-flex items-center gap-1"><Palette className="h-4 w-4" />Look</span>
        </button>
        <button className={`py-3 px-2 ${activeTab === 'settings' ? 'border-b-2 border-blue-500 font-medium' : ''}`} onClick={() => setActiveTab('settings')}>
          <span className="inline-flex items-center gap-1"><Settings className="h-4 w-4" />More</span>
        </button>
      </nav>

      <main className="flex-1 p-4 overflow-auto space-y-4">
        {activeTab === 'simplify' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="text" className="block mb-2 font-medium">Enter text to simplify:</label>
              <textarea
                id="text"
                className="w-full p-3 border rounded-lg"
                style={inputCardStyle}
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste or type text here..."
              ></textarea>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={simplifyText}
                disabled={isLoading || !text.trim() || backendStatus !== 'online' || !canUseProfileData}
                className={`px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 ${
                  isLoading || !text.trim() || backendStatus !== 'online' || !canUseProfileData ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                }`}
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span>{isLoading ? 'Processing...' : 'Simplify'}</span>
              </button>

              <button
                onClick={() => speakText()}
                disabled={!text.trim() && !simplifiedText.trim()}
                className={`px-4 py-2 rounded-lg bg-green-600 text-white flex items-center gap-2 ${
                  !text.trim() && !simplifiedText.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'
                }`}
              >
                <Volume2 className="h-4 w-4" />
                <span>Read Aloud</span>
              </button>

              <button onClick={stopSpeech} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">
                Stop
              </button>

              <button
                onClick={useCurrentSimplificationForGlossary}
                disabled={!text.trim() || !simplifiedText.trim() || !canUseProfileData}
                className={`px-4 py-2 rounded-lg bg-indigo-600 text-white ${
                  !text.trim() || !simplifiedText.trim() || !canUseProfileData ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                }`}
              >
                Send to Glossary Draft
              </button>
            </div>

            {!activeUser && (
              <div className="p-3 bg-amber-100 text-amber-900 rounded-lg">
                <p className="font-medium">Select a profile first.</p>
                <p className="text-sm mt-1">Go to the More tab to sign in or create a secure profile.</p>
              </div>
            )}

            {isProfileLocked && (
              <div className="p-3 bg-amber-100 text-amber-900 rounded-lg">
                <p className="font-medium">This profile is locked.</p>
                <p className="text-sm mt-1">Go to the More tab and unlock the profile to simplify text and sync profile data.</p>
              </div>
            )}

            {errorMessage && <div className="p-3 bg-red-100 text-red-800 rounded-lg">{errorMessage}</div>}

            {simplifiedText && (
              <div className="mt-6">
                <h2 className="text-lg font-medium mb-2">Simplified Text:</h2>
                <div className="p-4 rounded-lg border whitespace-pre-wrap" style={inputCardStyle}>{simplifiedText}</div>
              </div>
            )}

            {backendStatus !== 'online' && (
              <div className="p-3 bg-red-100 text-red-800 rounded-lg">
                <p className="font-medium">Backend server is offline</p>
                <p className="text-sm mt-1">Run backend with python app.py and ensure MongoDB is available on your configured URI.</p>
              </div>
            )}

            {backendStatus === 'online' && mongoStatus !== 'online' && (
              <div className="p-3 bg-amber-100 text-amber-800 rounded-lg">
                <p className="font-medium">MongoDB is not connected.</p>
                <p className="text-sm mt-1">History, glossary, and cloud preferences need MongoDB. {mongoError}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Simplification History</h2>
              <button
                onClick={() => void fetchHistory(userId)}
                className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                disabled={isHistoryLoading || backendStatus !== 'online' || !canUseProfileData}
              >
                Refresh
              </button>
            </div>

            {isHistoryLoading && <p>Loading history...</p>}

            {!isHistoryLoading && historyItems.length === 0 && (
              <div className="p-3 rounded border">No history found yet. Simplify something to populate this list.</div>
            )}

            <div className="space-y-3">
              {historyItems.map((entry) => (
                <article key={entry.id} className="p-3 rounded border space-y-2" style={inputCardStyle}>
                  <div className="flex items-center justify-between text-xs opacity-80">
                    <span>{formatDate(entry.created_at)}</span>
                    <span>{entry.request_source || 'unknown source'}</span>
                  </div>
                  {entry.source_url && <p className="text-xs break-all">Source: {entry.source_url}</p>}
                  <div>
                    <p className="text-sm font-semibold">Original</p>
                    <p className="text-sm whitespace-pre-wrap">{entry.original_text}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Simplified</p>
                    <p className="text-sm whitespace-pre-wrap">{entry.simplified_text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'glossary' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Glossary</h2>

            <input
              type="text"
              className="w-full p-2 border rounded-lg"
              style={inputCardStyle}
              value={glossarySearch}
              onChange={(event) => setGlossarySearch(event.target.value)}
              placeholder="Search glossary terms..."
            />

            <div className="p-3 rounded-lg border space-y-3" style={inputCardStyle}>
              <p className="font-medium">Add or update term</p>
              <input
                type="text"
                className="w-full p-2 border rounded-lg"
                value={glossaryTerm}
                onChange={(event) => setGlossaryTerm(event.target.value)}
                placeholder="Term"
              />
              <textarea
                className="w-full p-2 border rounded-lg"
                rows={3}
                value={glossaryDefinition}
                onChange={(event) => setGlossaryDefinition(event.target.value)}
                placeholder="Simplified definition"
              ></textarea>
              <button
                onClick={saveGlossaryEntry}
                disabled={!canUseProfileData}
                className={`px-4 py-2 rounded text-white ${!canUseProfileData ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                Save Glossary Entry
              </button>
              {glossaryMessage && <p className="text-sm text-blue-700">{glossaryMessage}</p>}
            </div>

            {isGlossaryLoading && <p>Loading glossary...</p>}

            {!isGlossaryLoading && glossaryItems.length === 0 && (
              <div className="p-3 rounded border">No glossary items yet. Save one from simplify or add manually.</div>
            )}

            <div className="space-y-3">
              {glossaryItems.map((item) => (
                <article key={item.id} className="p-3 rounded border" style={inputCardStyle}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{item.term}</h3>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{item.simplified_definition}</p>
                      {item.source_text && <p className="text-xs mt-2 opacity-80">Source text: {item.source_text}</p>}
                      <p className="text-xs mt-1 opacity-70">Updated: {formatDate(item.updated_at || item.created_at)}</p>
                    </div>
                    <button
                      onClick={() => void removeGlossaryEntry(item.id)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete glossary term"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-4">Text Appearance</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="font-family" className="block mb-2">Font Family</label>
                  <select
                    id="font-family"
                    value={fontFamily}
                    onChange={(event) => setFontFamily(event.target.value)}
                    className="w-full p-2 border rounded-lg"
                    style={inputCardStyle}
                  >
                    <option value="OpenDyslexic">OpenDyslexic</option>
                    <option value="Arial">Arial</option>
                    <option value="Comic Sans MS">Comic Sans MS</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Tahoma">Tahoma</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="font-size" className="block mb-2">Font Size: {fontSize}px</label>
                  <input
                    id="font-size"
                    type="range"
                    min="12"
                    max="24"
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="line-spacing" className="block mb-2">Line Spacing: {lineSpacing}</label>
                  <input
                    id="line-spacing"
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={lineSpacing}
                    onChange={(event) => setLineSpacing(Number(event.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium mb-4">Colors</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="background-color" className="block mb-2">Background Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="background-color"
                      type="color"
                      value={backgroundColor}
                      onChange={(event) => setBackgroundColor(event.target.value)}
                      className="p-1 border rounded"
                    />
                    <span>{backgroundColor}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="text-color" className="block mb-2">Text Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="text-color"
                      type="color"
                      value={textColor}
                      onChange={(event) => setTextColor(event.target.value)}
                      className="p-1 border rounded"
                    />
                    <span>{textColor}</span>
                  </div>
                </div>

                <button
                  onClick={toggleTheme}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2"
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  <span>Toggle {theme === 'light' ? 'Dark' : 'Light'} Mode</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-300/70 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2 text-slate-800">
                  <ShieldCheck className="h-5 w-5" />
                  Sign In
                </h2>
                <button
                  onClick={() => void fetchUsers()}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800"
                  disabled={backendStatus !== 'online' || isUsersLoading}
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                <label htmlFor="active-user" className="block text-sm font-medium">Select Profile</label>
                <select
                  id="active-user"
                  value={userId}
                  onChange={(event) => {
                    const nextUserId = event.target.value;
                    if (!nextUserId || nextUserId === userId) {
                      return;
                    }

                    setActiveUser(nextUserId);
                    setUsersMessage('');
                    setProfilePassword('');
                    setHistoryItems([]);
                    setGlossaryItems([]);
                    setSimplifiedText('');
                  }}
                  className="w-full p-2 border rounded-lg"
                  style={inputCardStyle}
                  disabled={backendStatus !== 'online' || isUsersLoading}
                >
                  <option value="">Select a profile</option>
                  {users.map((item) => (
                    <option key={item.user_id} value={item.user_id}>
                      {item.display_name} ({item.user_id}){item.auth_required ? ' [password protected]' : ''}
                    </option>
                  ))}
                </select>

                {!activeUser && (
                  <p className="text-sm text-slate-600">
                    No active profile selected. Create a secure profile below, then sign in.
                  </p>
                )}

                {activeUser && (
                  <div className="mt-3 rounded-xl border border-slate-300 p-3 space-y-3" style={inputCardStyle}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{activeUser.display_name}</p>
                        <p className="text-xs opacity-75">{activeUser.user_id}</p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          isProfileLocked
                            ? 'bg-amber-100 text-amber-900'
                            : activeUser.auth_required
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isProfileLocked
                          ? 'Locked'
                          : activeUser.auth_required
                            ? 'Signed in'
                            : 'Open profile'}
                      </span>
                    </div>

                    {activeUser.auth_required && isProfileLocked && (
                      <div className="space-y-2">
                        <label htmlFor="profile-password" className="text-sm font-medium inline-flex items-center gap-2">
                          <KeyRound className="h-4 w-4" />
                          Password
                        </label>
                        <input
                          id="profile-password"
                          type="password"
                          className="w-full p-2 border rounded-lg"
                          value={profilePassword}
                          onChange={(event) => setProfilePassword(event.target.value)}
                          placeholder="Enter your password"
                        />
                        <button
                          onClick={() => void unlockActiveProfile()}
                          className="w-full px-3 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 inline-flex items-center justify-center gap-2"
                          disabled={isAuthLoading}
                        >
                          <LogIn className="h-4 w-4" />
                          {isAuthLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                      </div>
                    )}

                    {activeUser.auth_required && !isProfileLocked && (
                      <button
                        onClick={() => void lockActiveProfile()}
                        className="w-full px-3 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-800 inline-flex items-center justify-center gap-2"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    )}

                    {!activeUser.auth_required && (
                      <p className="text-sm text-slate-700">
                        This is a legacy profile without password protection. Create a secure profile below for full sign-in protection.
                      </p>
                    )}
                  </div>
                )}

                {usersMessage && <p className="text-sm text-blue-700">{usersMessage}</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-4 shadow-sm">
              <h2 className="text-lg font-semibold inline-flex items-center gap-2 text-blue-900 mb-4">
                <UserPlus className="h-5 w-5" />
                Create Secure Profile
              </h2>

              <div className="space-y-3">
                <input
                  id="new-user-name"
                  type="text"
                  className="w-full p-2 border rounded-lg"
                  style={inputCardStyle}
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                  placeholder="Display name"
                />

                <input
                  id="new-user-password"
                  type="password"
                  className="w-full p-2 border rounded-lg"
                  style={inputCardStyle}
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  placeholder="Create password (minimum 8 characters)"
                />

                <input
                  id="new-user-password-confirm"
                  type="password"
                  className="w-full p-2 border rounded-lg"
                  style={inputCardStyle}
                  value={newUserPasswordConfirm}
                  onChange={(event) => setNewUserPasswordConfirm(event.target.value)}
                  placeholder="Confirm password"
                />

                <button
                  onClick={() => void createUserProfile()}
                  className="w-full px-3 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 inline-flex items-center justify-center gap-2"
                  disabled={backendStatus !== 'online' || isUsersLoading}
                >
                  <UserPlus className="h-4 w-4" />
                  Create Profile
                </button>

                <p className="text-xs text-blue-900/80">
                  Password creation is required for all new profiles.
                </p>
              </div>
            </section>

            <div>
              <h2 className="text-lg font-medium mb-4">General Settings</h2>
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3">
                  <span>Auto-simplify selected text</span>
                  <input type="checkbox" checked={autoSimplify} onChange={(event) => setAutoSimplify(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span>Read aloud after simplify</span>
                  <input type="checkbox" checked={autoReadAloud} onChange={(event) => setAutoReadAloud(event.target.checked)} />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span>Show simplify button on pages</span>
                  <input type="checkbox" checked={showSimplifyButton} onChange={(event) => setShowSimplifyButton(event.target.checked)} />
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium mb-4">Text to Speech</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="speech-rate" className="block mb-2">Speech Rate: {speechRate}</label>
                  <input
                    id="speech-rate"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speechRate}
                    onChange={(event) => setSpeechRate(Number(event.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="speech-voice" className="block mb-2">Voice</label>
                  <select
                    id="speech-voice"
                    value={speechVoice}
                    onChange={(event) => setSpeechVoice(event.target.value)}
                    className="w-full p-2 border rounded-lg"
                    style={inputCardStyle}
                  >
                    <option value="default">Default</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium mb-2">About</h2>
              <p>ReadAble v0.2.0</p>
              <p className="mt-2">MongoDB is now used for simplification history, user preferences, and personal glossary.</p>
              <p className="mt-2 text-sm opacity-80">Current User ID: {userId || 'none selected'}</p>
              <p className="mt-1 text-sm opacity-80">Current User Name: {activeUser?.display_name || 'none selected'}</p>
            </div>
          </div>
        )}
      </main>

      <footer className="p-3 text-center text-sm border-t">ReadAble &copy; 2026</footer>
    </div>
  );
}

export default App;