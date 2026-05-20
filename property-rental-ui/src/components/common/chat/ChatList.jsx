import React, { useMemo, useState } from 'react';
import {
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
} from 'react-icons/hi2';
import './ChatList.css';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString();
};

const getInitials = (value = '') =>
  String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

export default function ChatList({
  users,
  onSelectUser,
  selectedUser,
  conversationMap = {},
  onTogglePin,
}) {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const label = (user.name || user.email || '').toLowerCase();
      const meta = conversationMap[user._id] || {};
      const matchesQuery = label.includes(normalizedQuery);
      if (!matchesQuery) return false;
      if (filterMode === 'pinned') return Boolean(meta.pinned);
      if (filterMode === 'unread') return Number(meta.unreadCount || 0) > 0;
      return true;
    });
  }, [users, normalizedQuery, conversationMap, filterMode]);

  const handlePinClick = (event, user) => {
    event.stopPropagation();
    if (!onTogglePin) return;
    onTogglePin(user);
  };

  const pinnedCount = users.filter((user) => conversationMap[user._id]?.pinned).length;
  const unreadCount = users.reduce(
    (count, user) => count + Number(conversationMap[user._id]?.unreadCount || 0),
    0,
  );

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-toolbar">
          <div className="chat-sidebar-title-wrap">
            <div className="chat-sidebar-avatar" aria-hidden="true">M</div>
            <div>
              <span className="chat-sidebar-kicker">Native Chat</span>
              <h1>Chats</h1>
            </div>
          </div>
          <button type="button" className="chat-sidebar-action" title="Compose">
            <HiOutlinePencilSquare />
          </button>
        </div>
        <p>Recent conversations, styled like a modern messenger inbox.</p>
      </div>

      <div className="chat-search-box">
        <span className="chat-search-icon" aria-hidden="true">
          <HiOutlineMagnifyingGlass />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages"
        />
      </div>

      <div className="chat-filter-row" role="tablist" aria-label="Chat filters">
        <button
          type="button"
          className={`chat-filter-pill ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`chat-filter-pill ${filterMode === 'unread' ? 'active' : ''}`}
          onClick={() => setFilterMode('unread')}
        >
          Unread
          {unreadCount > 0 ? <span>{unreadCount}</span> : null}
        </button>
        <button
          type="button"
          className={`chat-filter-pill ${filterMode === 'pinned' ? 'active' : ''}`}
          onClick={() => setFilterMode('pinned')}
        >
          Pinned
          {pinnedCount > 0 ? <span>{pinnedCount}</span> : null}
        </button>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="chat-empty-state">No conversations found</p>
      ) : (
        filteredUsers.map((u) => {
          const meta = conversationMap[u._id] || {};
          const preview = meta.lastMessage || 'Start a new conversation';
          const unreadCount = Number(meta.unreadCount || 0);
          const isPinned = Boolean(meta.pinned);

          return (
            <div
              key={u._id || u.email}
              className={`chat-thread-item ${selectedUser?._id === u._id ? 'active' : ''}`}
              onClick={() => onSelectUser(u)}
            >
              <div className="chat-thread-avatar-wrap">
                <div className="chat-thread-avatar" aria-hidden="true">
                  {getInitials(u.name || u.email)}
                </div>
                <span className={`chat-thread-presence ${unreadCount > 0 ? 'active' : ''}`} />
              </div>
              <div className="chat-thread-content">
                <div className="chat-thread-top">
                  <span className="chat-thread-name">{u.name || u.email}</span>
                  <span className="chat-thread-time">{formatTime(meta.lastMessageAt)}</span>
                </div>
                <div className="chat-thread-bottom">
                  <p className="chat-thread-preview">{preview}</p>
                  <div className="chat-thread-actions">
                    {isPinned ? <span className="chat-thread-pin-badge">Pinned</span> : null}
                    {unreadCount > 0 ? <span className="chat-thread-unread">{unreadCount}</span> : null}
                    <button
                      type="button"
                      className={`chat-thread-pin ${isPinned ? 'pinned' : ''}`}
                      onClick={(event) => handlePinClick(event, u)}
                      title={isPinned ? 'Unpin chat' : 'Pin chat'}
                    >
                      📌
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
