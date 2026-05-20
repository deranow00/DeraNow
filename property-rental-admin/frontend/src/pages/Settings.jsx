import { useEffect, useMemo, useRef, useState } from 'react';
import API from '../api';
import './Settings.css';

const defaults = {
  platformFeePercent: '0',
  bookingExpiryHours: '24',
  maxListingsPerOwner: '100',
  allowInstantBooking: 'true',
};

export default function Settings() {
  const [settings, setSettings] = useState(defaults);
  const [initialSettings, setInitialSettings] = useState(defaults);
  const [settingsMeta, setSettingsMeta] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const importInputRef = useRef(null);

  const loadSettings = async () => {
    const res = await API.get('/settings');
    const next = { ...defaults };
    const meta = {};
    res.data.forEach((item) => {
      next[item.key] = String(item.value);
      meta[item.key] = {
        updatedAt: item.updatedAt,
        createdAt: item.createdAt,
      };
    });
    setSettings(next);
    setInitialSettings(next);
    setSettingsMeta(meta);
  };

  useEffect(() => {
    let mounted = true;
    loadSettings()
      .then(() => {
        if (!mounted) return;
      })
      .catch(() => {
        if (mounted) setError('Failed to load settings.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const numericValidationErrors = [];
  const fee = Number(settings.platformFeePercent);
  const expiry = Number(settings.bookingExpiryHours);
  const maxListings = Number(settings.maxListingsPerOwner);

  if (Number.isNaN(fee) || fee < 0 || fee > 100) {
    numericValidationErrors.push('Platform fee must be between 0 and 100.');
  }
  if (Number.isNaN(expiry) || expiry < 1 || expiry > 720) {
    numericValidationErrors.push('Booking expiry must be between 1 and 720 hours.');
  }
  if (Number.isNaN(maxListings) || maxListings < 1 || maxListings > 5000) {
    numericValidationErrors.push('Max listings per owner must be between 1 and 5000.');
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initialSettings);
  const isValid = numericValidationErrors.length === 0;
  const changedEntries = useMemo(
    () =>
      Object.keys(settings)
        .filter((key) => settings[key] !== initialSettings[key])
        .map((key) => ({ key, from: initialSettings[key], to: settings[key] })),
    [settings, initialSettings]
  );

  const onFieldChange = (key, value) => {
    setError('');
    setMessage('');
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetChanges = () => {
    setSettings(initialSettings);
    setError('');
    setMessage('');
  };

  const applyPreset = (presetName) => {
    setError('');
    setMessage('');
    if (presetName === 'balanced') {
      setSettings((prev) => ({
        ...prev,
        platformFeePercent: '8',
        bookingExpiryHours: '24',
        maxListingsPerOwner: '200',
        allowInstantBooking: 'true',
      }));
      return;
    }
    if (presetName === 'strict') {
      setSettings((prev) => ({
        ...prev,
        platformFeePercent: '10',
        bookingExpiryHours: '12',
        maxListingsPerOwner: '80',
        allowInstantBooking: 'false',
      }));
      return;
    }
    if (presetName === 'growth') {
      setSettings((prev) => ({
        ...prev,
        platformFeePercent: '5',
        bookingExpiryHours: '48',
        maxListingsPerOwner: '500',
        allowInstantBooking: 'true',
      }));
    }
  };

  const exportAsJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      scope: 'admin_system_settings',
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openImportPicker = () => {
    if (importInputRef.current) importInputRef.current.click();
  };

  const importFromJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed?.settings || parsed;
      if (!imported || typeof imported !== 'object') {
        setError('Invalid settings JSON format.');
        return;
      }
      const merged = { ...settings };
      Object.keys(defaults).forEach((key) => {
        if (imported[key] !== undefined && imported[key] !== null) {
          merged[key] = String(imported[key]);
        }
      });
      setSettings(merged);
      setMessage('Settings imported to editor. Review and click Save Settings.');
    } catch {
      setError('Failed to import JSON file.');
    } finally {
      event.target.value = '';
    }
  };

  const reloadFromServer = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await loadSettings();
      setMessage('Settings reloaded from server.');
    } catch {
      setError('Failed to reload settings.');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setError('');
    setMessage('');
    if (!isValid) {
      setError('Please fix validation errors before saving.');
      return;
    }

    setSaving(true);
    const updates = Object.entries(settings).map(([key, value]) => ({ key, value }));
    try {
      await API.put('/settings', { updates });
      await loadSettings();
      setMessage('Settings saved successfully.');
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="settings-loading">Loading settings...</p>;
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>System Settings</h1>
          <p className="page-subtitle">Control booking rules, pricing policy, and inventory limits.</p>
        </div>
        <div className="settings-header-badges">
          <span className={`settings-badge ${isDirty ? 'dirty' : 'clean'}`}>
            {isDirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>
      </div>

      <div className="card settings-card">
        <div className="settings-toolbelt">
          <div className="settings-preset-group">
            <span>Quick Presets</span>
            <button type="button" className="btn secondary" onClick={() => applyPreset('balanced')}>Balanced</button>
            <button type="button" className="btn secondary" onClick={() => applyPreset('strict')}>Strict</button>
            <button type="button" className="btn secondary" onClick={() => applyPreset('growth')}>Growth</button>
          </div>
          <div className="settings-file-actions">
            <button type="button" className="btn secondary" onClick={exportAsJson}>Export JSON</button>
            <button type="button" className="btn secondary" onClick={openImportPicker}>Import JSON</button>
            <button type="button" className="btn secondary" onClick={reloadFromServer}>Reload</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={importFromJson}
              className="settings-hidden-input"
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Pricing Rules</h3>
          <p>Configure how platform commission is applied on payments.</p>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Platform Fee (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={settings.platformFeePercent}
                onChange={(e) => onFieldChange('platformFeePercent', e.target.value)}
              />
              <small>Recommended range: 2% to 12%</small>
            </label>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-section">
          <h3>Booking Rules</h3>
          <p>Set booking timeout and whether instant booking is enabled.</p>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Booking Expiry (hours)</span>
              <input
                type="number"
                min="1"
                max="720"
                step="1"
                value={settings.bookingExpiryHours}
                onChange={(e) => onFieldChange('bookingExpiryHours', e.target.value)}
              />
              <small>Pending bookings auto-expire after this duration.</small>
            </label>

            <label className="settings-field">
              <span>Allow Instant Booking</span>
              <select
                value={settings.allowInstantBooking}
                onChange={(e) => onFieldChange('allowInstantBooking', e.target.value)}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
              <small>If disabled, owner acceptance is required.</small>
            </label>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-section">
          <h3>Inventory Limits</h3>
          <p>Define listing caps to control spam and account abuse.</p>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Max Listings per Owner</span>
              <input
                type="number"
                min="1"
                max="5000"
                step="1"
                value={settings.maxListingsPerOwner}
                onChange={(e) => onFieldChange('maxListingsPerOwner', e.target.value)}
              />
              <small>Set a practical cap based on your moderation capacity.</small>
            </label>
          </div>
        </div>

        {numericValidationErrors.length > 0 ? (
          <div className="settings-alert error">
            {numericValidationErrors.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        ) : null}

        {error ? <div className="settings-alert error">{error}</div> : null}
        {message ? <div className="settings-alert success">{message}</div> : null}

        {changedEntries.length > 0 ? (
          <div className="settings-change-summary">
            <h4>Pending Change Summary</h4>
            <div className="settings-change-list">
              {changedEntries.map((entry) => (
                <div key={entry.key} className="settings-change-item">
                  <span>{entry.key}</span>
                  <code>{entry.from || '-'}</code>
                  <span>→</span>
                  <code>{entry.to || '-'}</code>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="settings-meta-row">
          {Object.keys(defaults).map((key) => (
            <div key={key} className="settings-meta-item">
              <span>{key}</span>
              <small>
                Last update:{' '}
                {settingsMeta[key]?.updatedAt
                  ? new Date(settingsMeta[key].updatedAt).toLocaleString()
                  : 'not set'}
              </small>
            </div>
          ))}
        </div>

        <div className="settings-actions">
          <button className="btn secondary" type="button" onClick={resetChanges} disabled={!isDirty || saving}>
            Reset Changes
          </button>
          <button className="btn" type="button" onClick={save} disabled={!isDirty || !isValid || saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
