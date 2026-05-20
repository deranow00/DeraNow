import { useMemo, useState } from 'react';
import API from '../api';
import './Notifications.css';

const templates = [
  {
    id: 'maintenance',
    label: 'Maintenance Notice',
    type: 'maintenance',
    message:
      'Scheduled maintenance will occur tonight from 11:00 PM to 12:30 AM. Some actions may be temporarily unavailable.',
  },
  {
    id: 'policy',
    label: 'Policy Update',
    type: 'policy',
    message:
      'We have updated our verification and booking policy. Please review the updated terms in your account dashboard.',
  },
  {
    id: 'announcement',
    label: 'General Announcement',
    type: 'announcement',
    message: 'We are releasing platform improvements this week. Thank you for using Property Rental.',
  },
];

const getRoleLabel = (role) => {
  if (!role) return 'All roles';
  if (role === 'owner') return 'Owners';
  if (role === 'renter') return 'Renters';
  return role;
};

const HISTORY_KEY = 'adminBroadcastHistory';

export default function Notifications() {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('announcement');
  const [role, setRole] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const trimmedMessage = message.trim();
  const charCount = trimmedMessage.length;
  const canSend = trimmedMessage.length >= 8 && confirmReady && !sending;
  const audienceLabel = useMemo(() => getRoleLabel(role), [role]);

  const send = async () => {
    if (!canSend) return;

    setSending(true);
    setError('');
    setResult('');
    try {
      const res = await API.post('/broadcast', { message: trimmedMessage, type, role: role || undefined });
      const recipients = Number(res?.data?.recipients || 0);
      setResult(`Broadcast sent to ${recipients} users.`);

      const nextItem = {
        id: `${Date.now()}`,
        type,
        role,
        message: trimmedMessage,
        recipients,
        sentAt: new Date().toISOString(),
      };
      const nextHistory = [nextItem, ...history].slice(0, 8);
      setHistory(nextHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

      setMessage('');
      setConfirmReady(false);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to send broadcast.');
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (templateId) => {
    const selected = templates.find((item) => item.id === templateId);
    if (!selected) return;
    setType(selected.type);
    setMessage(selected.message);
    setConfirmReady(false);
    setResult('');
    setError('');
  };

  const reuseHistoryItem = (item) => {
    setType(item.type || 'announcement');
    setRole(item.role || '');
    setMessage(item.message || '');
    setConfirmReady(false);
    setResult('');
    setError('');
  };

  const clearComposer = () => {
    setType('announcement');
    setRole('');
    setMessage('');
    setConfirmReady(false);
    setResult('');
    setError('');
  };

  return (
    <div className="notifications-page">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="page-subtitle">Send targeted broadcasts with preview and history tracking.</p>
        </div>
      </div>

      <div className="card notifications-card">
        <div className="notifications-grid">
          <section className="notifications-compose">
            <h3>Compose Broadcast</h3>
            <p>Select audience, prepare message, and send.</p>

            <div className="notifications-toolbar">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="announcement">Announcement</option>
                <option value="policy">Policy</option>
                <option value="maintenance">Maintenance</option>
              </select>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All roles</option>
                <option value="owner">Owners</option>
                <option value="renter">Renters</option>
              </select>
            </div>

            <div className="notifications-template-row">
              <span>Quick Templates:</span>
              {templates.map((item) => (
                <button key={item.id} type="button" className="btn secondary" onClick={() => applyTemplate(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              rows="6"
              className="notifications-message-input"
              placeholder="Write broadcast message..."
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setResult('');
                setError('');
              }}
            />
            <div className="notifications-meta-row">
              <small>{charCount} chars (min 8)</small>
              <small>Audience: {audienceLabel}</small>
            </div>

            <label className="notifications-confirm-row">
              <input
                type="checkbox"
                checked={confirmReady}
                onChange={(e) => setConfirmReady(e.target.checked)}
              />
              I confirm this message is ready to broadcast.
            </label>

            {error ? <div className="notifications-alert error">{error}</div> : null}
            {result ? <div className="notifications-alert success">{result}</div> : null}

            <div className="notifications-actions">
              <button type="button" className="btn secondary" onClick={clearComposer} disabled={sending}>
                Clear
              </button>
              <button type="button" className="btn" onClick={send} disabled={!canSend}>
                {sending ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </section>

          <aside className="notifications-preview">
            <h3>Preview</h3>
            <div className="preview-card">
              <div className="preview-pill">{type}</div>
              <p className="preview-audience">{audienceLabel}</p>
              <p className="preview-message">{trimmedMessage || 'Your message preview will appear here.'}</p>
            </div>
            <h4>Recent Broadcasts</h4>
            {history.length === 0 ? (
              <p className="preview-empty">No recent broadcasts.</p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-item">
                    <div>
                      <strong>{item.type}</strong>
                      <p>{getRoleLabel(item.role)} · {item.recipients || 0} recipients</p>
                      <small>{new Date(item.sentAt).toLocaleString()}</small>
                    </div>
                    <button type="button" className="btn secondary" onClick={() => reuseHistoryItem(item)}>
                      Reuse
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
