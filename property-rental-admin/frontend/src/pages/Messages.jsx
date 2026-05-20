import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged } from '../utils';
import './Messages.css';

const getMessageText = (msg) => msg?.text || msg?.content || '-';
const getRefId = (ref) => {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref._id) return String(ref._id);
  return '';
};
const getRefLabel = (ref, fallback = 'Unknown user') => {
  if (!ref) return fallback;
  if (typeof ref === 'object') {
    if (ref.email) return ref.email;
    if (ref.name) return ref.name;
    if (ref._id) return `User (${String(ref._id).slice(-6)})`;
  }
  if (typeof ref === 'string') return `User (${ref.slice(-6)})`;
  return fallback;
};

export default function Messages() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [viewMode, setViewMode] = useState('conversations');
  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [selectedThreadKey, setSelectedThreadKey] = useState('');

  const load = async (nextPage = 1) => {
    const res = await API.get('/messages', { params: { page: nextPage, limit: 100 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((m) => {
      const sender = getRefLabel(m.sender, '').toLowerCase();
      const receiver = getRefLabel(m.receiver || m.recipient, '').toLowerCase();
      const text = getMessageText(m);
      const matchesQuery =
        !q ||
        sender.includes(q) ||
        receiver.includes(q) ||
        text.toLowerCase().includes(q);
      const isUnread = !(m.isRead || m.read);
      const matchesUnread = !onlyUnread || isUnread;
      return matchesQuery && matchesUnread;
    });
  }, [rows, query, onlyUnread]);

  const threads = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((m) => {
      const senderId = getRefId(m.sender) || 'unknown-sender';
      const receiverId = getRefId(m.receiver || m.recipient) || 'unknown-receiver';
      const key = [senderId, receiverId].sort().join('__');
      const senderLabel = getRefLabel(m.sender, 'Unknown sender');
      const receiverLabel = getRefLabel(m.receiver || m.recipient, 'Unknown receiver');

      if (!map.has(key)) {
        map.set(key, {
          key,
          participants: [senderLabel, receiverLabel],
          messages: [],
          lastAt: null,
          unreadCount: 0,
        });
      }

      const thread = map.get(key);
      thread.messages.push(m);
      if (!thread.lastAt || new Date(m.createdAt) > new Date(thread.lastAt)) {
        thread.lastAt = m.createdAt;
      }
      if (!(m.isRead || m.read)) thread.unreadCount += 1;
    });

    const list = [...map.values()].map((thread) => ({
      ...thread,
      messages: thread.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      lastMessage: getMessageText(
        thread.messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
      ),
    }));

    return list.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
  }, [filteredRows]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadKey('');
      return;
    }
    if (!selectedThreadKey || !threads.some((t) => t.key === selectedThreadKey)) {
      setSelectedThreadKey(threads[0].key);
    }
  }, [threads, selectedThreadKey]);

  const selectedThread = threads.find((t) => t.key === selectedThreadKey);

  return (
    <div className="messages-page">
      <div className="page-header">
        <div>
          <h1>Messages</h1>
          <p className="page-subtitle">Conversation-centric moderation with quick thread drilldown.</p>
        </div>
      </div>

      <div className="toolbar messages-toolbar">
        <input
          placeholder="Search by sender, receiver or message..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="messages-unread-toggle">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
          />
          <span>Unread only</span>
        </label>
        <div className="messages-view-switch">
          <button
            className={`btn secondary ${viewMode === 'conversations' ? 'active' : ''}`}
            onClick={() => setViewMode('conversations')}
          >
            Conversations
          </button>
          <button
            className={`btn secondary ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            Timeline
          </button>
        </div>
      </div>

      {viewMode === 'conversations' ? (
        <div className="messages-workspace">
          <aside className="messages-thread-list">
            {threads.map((thread) => (
              <button
                key={thread.key}
                className={`thread-item ${selectedThreadKey === thread.key ? 'active' : ''}`}
                onClick={() => setSelectedThreadKey(thread.key)}
              >
                <div className="thread-item-top">
                  <strong>{thread.participants.join(' ↔ ')}</strong>
                  {thread.unreadCount > 0 && <span className="thread-unread">{thread.unreadCount}</span>}
                </div>
                <p>{thread.lastMessage}</p>
                <small>{formatDate(thread.lastAt)}</small>
              </button>
            ))}
            {!threads.length && <p className="messages-empty">No matching conversations.</p>}
          </aside>

          <section className="messages-thread-panel">
            {selectedThread ? (
              <>
                <div className="thread-panel-header">
                  <h3>{selectedThread.participants.join(' ↔ ')}</h3>
                  <span>{selectedThread.messages.length} messages</span>
                </div>
                <div className="thread-messages">
                  {selectedThread.messages.map((m) => {
                    const senderLabel = getRefLabel(m.sender, 'Unknown sender');
                    return (
                      <div key={m._id} className="thread-message">
                        <div className="thread-message-top">
                          <strong>{senderLabel}</strong>
                          <small>{formatDate(m.createdAt)}</small>
                        </div>
                        <p>{getMessageText(m)}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="messages-empty">Select a conversation to view details.</p>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Receiver</th>
                  <th>Message</th>
                  <th>Read</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((m) => (
                  <tr key={m._id}>
                    <td>{getRefLabel(m.sender, '-')}</td>
                    <td>{getRefLabel(m.receiver || m.recipient, '-')}</td>
                    <td>{getMessageText(m)}</td>
                    <td>{m.isRead || m.read ? 'Yes' : 'No'}</td>
                    <td>{formatDate(m.createdAt)}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan="5">No messages found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPageChange={load} />
        </>
      )}
    </div>
  );
}
