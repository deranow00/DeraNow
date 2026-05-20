import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContext';
import { API_BASE_URL } from '../config/api';
import { translations } from '../i18n/translations';
import LanguageChooserModal from '../components/common/language/LanguageChooserModal';

const LANGUAGE_STORAGE_KEY = 'app-language';
const LANGUAGE_CHOOSER_PROMPT_KEY = 'languageChooserPrompt';

export const LanguageContext = createContext();

const getValueByPath = (source, path) => {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
};

const interpolate = (template, params = {}) => {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
};

export function LanguageProvider({ children }) {
  const { token, user, setUser } = useContext(AuthContext);
  const [language, setLanguageState] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'ne' ? 'ne' : 'en';
  });
  const [chooserOpen, setChooserOpen] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState('');

  useEffect(() => {
    const nextLanguage = user?.appPreferences?.language;
    if (nextLanguage === 'en' || nextLanguage === 'ne') {
      setLanguageState(nextLanguage);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    }
  }, [user?.appPreferences?.language]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language === 'ne' ? 'ne' : 'en');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!user?._id) {
      setChooserOpen(false);
      return;
    }

    const sessionPromptRequested = sessionStorage.getItem(LANGUAGE_CHOOSER_PROMPT_KEY) === '1';
    const seenForUserKey = `languageChooserSeen:${user._id}`;
    const seenForUser = sessionStorage.getItem(seenForUserKey) === '1';
    const hasSavedPreference = ['en', 'ne'].includes(user?.appPreferences?.language);

    if ((sessionPromptRequested || !hasSavedPreference) && !seenForUser) {
      setChooserOpen(true);
      setLanguageError('');
    }
  }, [user?._id, user?.appPreferences?.language]);

  const t = useCallback(
    (key, params = {}, fallback = '') => {
      const localeSource = translations[language] || translations.en;
      const englishSource = translations.en;
      const localized = getValueByPath(localeSource, key);
      const english = getValueByPath(englishSource, key);
      const value = localized ?? english ?? fallback ?? key;
      return typeof value === 'string' ? interpolate(value, params) : value;
    },
    [language],
  );

  const saveLanguage = useCallback(
    async (nextLanguage, options = {}) => {
      const normalized = nextLanguage === 'ne' ? 'ne' : 'en';
      const { closeChooser = true } = options;

      setSavingLanguage(true);
      setLanguageError('');
      setLanguageState(normalized);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);

      if (user) {
        setUser({
          ...user,
          appPreferences: {
            ...(user.appPreferences || {}),
            language: normalized,
          },
        });
      }

      try {
        if (token) {
          const res = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              appPreferences: {
                ...(user?.appPreferences || {}),
                language: normalized,
              },
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || 'Failed to update preferences');
          }
        }

        if (user?._id) {
          sessionStorage.setItem(`languageChooserSeen:${user._id}`, '1');
        }
        sessionStorage.removeItem(LANGUAGE_CHOOSER_PROMPT_KEY);

        if (closeChooser) {
          setChooserOpen(false);
        }

        return { ok: true };
      } catch (error) {
        setLanguageError(t('language.updateError'));
        return { ok: false, error };
      } finally {
        setSavingLanguage(false);
      }
    },
    [token, user, setUser, t],
  );

  const openLanguageChooser = useCallback(() => {
    setLanguageError('');
    setChooserOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage: saveLanguage,
      t,
      chooserOpen,
      openLanguageChooser,
    }),
    [language, saveLanguage, t, chooserOpen, openLanguageChooser],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <LanguageChooserModal
        open={chooserOpen}
        activeLanguage={language}
        saving={savingLanguage}
        error={languageError}
        t={t}
        onSelect={saveLanguage}
      />
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
