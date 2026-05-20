import React, { useContext, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { AuthContext } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import { API_BASE_URL } from './config/api';

const isEditableElement = (element) => {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.isContentEditable
  );
};

function AppPreferenceSync() {
  const { token, user, setUser } = useContext(AuthContext);

  useEffect(() => {
    const applyPrefs = (theme = 'system', compactMode = false) => {
      const root = document.documentElement;
      const resolvedTheme =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;

      root.setAttribute('data-theme', resolvedTheme);
      root.setAttribute('data-compact', compactMode ? 'true' : 'false');
    };

    applyPrefs(user?.appPreferences?.theme || 'system', Boolean(user?.appPreferences?.compactMode));
  }, [user?.appPreferences?.theme, user?.appPreferences?.compactMode]);

  useEffect(() => {
    if (!token) return;

    const syncPrefs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return;
        setUser({
          ...(user || {}),
          ...data,
          appPreferences: data.appPreferences || user?.appPreferences,
          privacyPreferences: data.privacyPreferences || user?.privacyPreferences,
          notificationPreferences: data.notificationPreferences || user?.notificationPreferences,
        });
      } catch {
        // ignore preference sync errors
      }
    };

    syncPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}

function AppViewportSync() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let baselineHeight = viewport
      ? viewport.height + viewport.offsetTop
      : window.innerHeight;

    const syncViewport = () => {
      const currentHeight = viewport
        ? viewport.height + viewport.offsetTop
        : window.innerHeight;
      const activeElement = document.activeElement;
      const focusedEditable = isEditableElement(activeElement);
      const keyboardOffset = Math.max(0, baselineHeight - currentHeight);
      const keyboardOpen = focusedEditable && keyboardOffset > 80;

      if (!keyboardOpen) {
        baselineHeight = Math.max(baselineHeight, currentHeight);
      }

      root.style.setProperty('--app-height', `${Math.round(currentHeight)}px`);
      root.style.setProperty(
        '--keyboard-offset',
        `${keyboardOpen ? Math.round(keyboardOffset) : 0}px`,
      );
      root.setAttribute('data-keyboard-open', keyboardOpen ? 'true' : 'false');
    };

    const resetBaseline = () => {
      const currentHeight = viewport
        ? viewport.height + viewport.offsetTop
        : window.innerHeight;
      baselineHeight = Math.max(baselineHeight, currentHeight);
      syncViewport();
    };

    const handleFocusOut = () => {
      window.setTimeout(resetBaseline, 120);
    };

    syncViewport();

    window.addEventListener('resize', resetBaseline);
    window.addEventListener('orientationchange', resetBaseline);
    window.addEventListener('focusin', syncViewport);
    window.addEventListener('focusout', handleFocusOut);
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);

    return () => {
      window.removeEventListener('resize', resetBaseline);
      window.removeEventListener('orientationchange', resetBaseline);
      window.removeEventListener('focusin', syncViewport);
      window.removeEventListener('focusout', handleFocusOut);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--keyboard-offset');
      root.removeAttribute('data-keyboard-open');
    };
  }, []);

  return null;
}

function AppShell() {
  return (
    <SocketProvider>
      <NotificationProvider>
        <LanguageProvider>
          <AppPreferenceSync />
          <AppViewportSync />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LanguageProvider>
      </NotificationProvider>
    </SocketProvider>
  );
}

const App = () => {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
};

export default App;
