import React, { createContext, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser || storedUser === 'undefined' || storedUser === 'null') {
        return null;
      }
      return JSON.parse(storedUser);
    } catch (err) {
      console.warn('Invalid user in localStorage. Clearing stored session.', err);
      localStorage.removeItem('user');
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('refreshToken') || null);

  const isTokenExpired = (jwtToken) => {
    if (!jwtToken) return true;
    try {
      const base64 = jwtToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
      if (!base64) return true;
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      if (!payload?.exp) return false;
      return payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem('user', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('user');
    }
  };

  const login = async (email, password, role) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) return { error: data.error || 'Login failed' };

      const userData = {
        _id: data.user._id,
        email: data.user.email,
        role: data.user.role,
        name: data.user.name,
        ownerVerificationStatus: data.user.ownerVerificationStatus,
      };

      updateUser(userData);
      setToken(data.token);
      setRefreshToken(data.refreshToken || null);
      sessionStorage.setItem('languageChooserPrompt', '1');

      localStorage.setItem('token', data.token);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }

      return data;
    } catch (error) {
      return { error: 'Server error. Please try again later.' };
    }
  };

  const logout = () => {
    const currentRefreshToken = refreshToken || localStorage.getItem('refreshToken');
    if (currentRefreshToken) {
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      }).catch(() => {});
    }
    updateUser(null);
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('languageChooserPrompt');
  };

  const refreshSession = async () => {
    const storedRefreshToken = refreshToken || localStorage.getItem('refreshToken');
    if (!storedRefreshToken) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });
      const data = await res.json();
      if (!res.ok || !data?.token) return false;

      setToken(data.token);
      localStorage.setItem('token', data.token);

      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
        localStorage.setItem('refreshToken', data.refreshToken);
      }

      if (data.user) {
        updateUser({
          _id: data.user._id,
          email: data.user.email,
          role: data.user.role,
          name: data.user.name,
          ownerVerificationStatus: data.user.ownerVerificationStatus,
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  React.useEffect(() => {
    if (!token) return;
    if (!isTokenExpired(token)) return;
    refreshSession().then((ok) => {
      if (!ok) logout();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshSession, setUser: updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
