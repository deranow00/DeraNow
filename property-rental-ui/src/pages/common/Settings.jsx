import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';
import './Settings.css';

const DEFAULT_TYPES = {
  payment: true,
  newBooking: true,
  bookingAccepted: true,
  bookingRejected: true,
  newListing: true,
  listingApproval: true,
  ownerVerification: true,
  message: true,
  review: true,
};

const DEFAULT_PRIVACY = {
  showEmailToOwnerOrRenter: true,
  showPhoneToOwnerOrRenter: false,
  loginAlerts: true,
};

const DEFAULT_APP = {
  language: 'en',
  theme: 'system',
  compactMode: false,
};

export default function Settings() {
  const { token, user, setUser } = useContext(AuthContext);
  const { t, openLanguageChooser } = useLanguage();
  const [prefs, setPrefs] = useState({ inApp: true, email: false, types: DEFAULT_TYPES });
  const [privacyPrefs, setPrivacyPrefs] = useState(DEFAULT_PRIVACY);
  const [appPrefs, setAppPrefs] = useState(DEFAULT_APP);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchPrefs = async () => {
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPrefs({
          inApp: data.notificationPreferences?.inApp ?? true,
          email: data.notificationPreferences?.email ?? false,
          types: { ...DEFAULT_TYPES, ...(data.notificationPreferences?.types || {}) },
        });
        setPrivacyPrefs({
          ...DEFAULT_PRIVACY,
          ...(data.privacyPreferences || {}),
        });
        setAppPrefs({
          ...DEFAULT_APP,
          ...(data.appPreferences || {}),
        });
      }
    };
    fetchPrefs();
  }, [token]);

  const toggleType = (key) => {
    setPrefs((prev) => ({
      ...prev,
      types: { ...prev.types, [key]: !prev.types[key] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const res = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        notificationPreferences: prefs,
        privacyPreferences: privacyPrefs,
        appPreferences: appPrefs,
      }),
    });

    if (res.ok) {
      setMessage(t('settings.updated'));
      setUser({
        ...(user || {}),
        notificationPreferences: prefs,
        privacyPreferences: privacyPrefs,
        appPreferences: appPrefs,
      });
    } else {
      setMessage(t('settings.failed'));
    }
    setSaving(false);
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2>{t('settings.title')}</h2>
        <p>{t('settings.subtitle')}</p>

        <div className="settings-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.inApp}
              onChange={() => setPrefs((prev) => ({ ...prev, inApp: !prev.inApp }))}
            />
            <span>{t('settings.inAppNotifications')}</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.email}
              onChange={() => setPrefs((prev) => ({ ...prev, email: !prev.email }))}
            />
            <span>{t('settings.emailNotificationsSoon')}</span>
          </label>
        </div>

        <h3>{t('settings.types')}</h3>
        <div className="settings-grid">
          {Object.keys(prefs.types).map((key) => (
            <label key={key} className="checkbox">
              <input type="checkbox" checked={prefs.types[key]} onChange={() => toggleType(key)} />
              <span>{key}</span>
            </label>
          ))}
        </div>

        <h3>{t('settings.privacySecurity')}</h3>
        <div className="settings-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={privacyPrefs.showEmailToOwnerOrRenter}
              onChange={() =>
                setPrivacyPrefs((prev) => ({
                  ...prev,
                  showEmailToOwnerOrRenter: !prev.showEmailToOwnerOrRenter,
                }))
              }
            />
            <span>{t('settings.showEmail')}</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={privacyPrefs.showPhoneToOwnerOrRenter}
              onChange={() =>
                setPrivacyPrefs((prev) => ({
                  ...prev,
                  showPhoneToOwnerOrRenter: !prev.showPhoneToOwnerOrRenter,
                }))
              }
            />
            <span>{t('settings.showPhone')}</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={privacyPrefs.loginAlerts}
              onChange={() =>
                setPrivacyPrefs((prev) => ({ ...prev, loginAlerts: !prev.loginAlerts }))
              }
            />
            <span>{t('settings.loginAlerts')}</span>
          </label>
        </div>

        <h3>{t('settings.appPreferences')}</h3>
        <div className="settings-group">
          <label className="settings-field">
            <span>{t('settings.language')}</span>
            <select
              value={appPrefs.language}
              onChange={(e) => setAppPrefs((prev) => ({ ...prev, language: e.target.value }))}
            >
              <option value="en">{t('common.english')}</option>
              <option value="ne">{t('common.nepali')}</option>
            </select>
          </label>
          <label className="settings-field">
            <span>{t('settings.theme')}</span>
            <select
              value={appPrefs.theme}
              onChange={(e) => setAppPrefs((prev) => ({ ...prev, theme: e.target.value }))}
            >
              <option value="system">{t('common.system')}</option>
              <option value="light">{t('common.light')}</option>
              <option value="dark">{t('common.dark')}</option>
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={appPrefs.compactMode}
              onChange={() =>
                setAppPrefs((prev) => ({ ...prev, compactMode: !prev.compactMode }))
              }
            />
            <span>{t('settings.compactMode')}</span>
          </label>
          <button type="button" className="settings-language-trigger" onClick={openLanguageChooser}>
            {t('language.chooserTitle')}
          </button>
        </div>

        {message && <p className="settings-message">{message}</p>}

        <button onClick={handleSave} disabled={saving}>
          {saving ? t('settings.saving') : t('settings.savePreferences')}
        </button>
      </div>
    </div>
  );
}
