import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import {
  HiOutlineChevronLeft,
  HiOutlineInformationCircle,
  HiOutlinePaperAirplane,
  HiOutlinePhone,
  HiOutlinePhoto,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
import { AuthContext } from '../../../context/AuthContext';
import { API_BASE_URL } from '../../../config/api';
import { useSocket } from '../../../context/SocketContext';
import './ChatWindow.css';

const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '🙏'];
const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const toMessageObject = (payloadMessage = {}) => ({
  _id: payloadMessage._id,
  sender: payloadMessage.sender,
  recipient: payloadMessage.recipient,
  content: payloadMessage.content || '',
  attachments: Array.isArray(payloadMessage.attachments) ? payloadMessage.attachments : [],
  reactions: Array.isArray(payloadMessage.reactions) ? payloadMessage.reactions : [],
  delivered: Boolean(payloadMessage.delivered),
  deliveredAt: payloadMessage.deliveredAt || null,
  read: Boolean(payloadMessage.read),
  readAt: payloadMessage.readAt || null,
  createdAt: payloadMessage.createdAt || new Date().toISOString(),
});

const getInitials = (value = '') =>
  String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

export default function ChatWindow({ selectedUser, onBack }) {
  const { user, token } = useContext(AuthContext);
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const typingTimeout = useRef(null);
  const bottomRef = useRef(null);

  const fetchMessages = async () => {
    if (!selectedUser || !token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/messages/${selectedUser._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rawItems = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.items)
          ? res.data.items
          : [];
      const normalized = rawItems.map(toMessageObject);
      setMessages(normalized);

      await axios.patch(
        `${API_BASE_URL}/api/messages/read/${selectedUser._id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      socket?.current?.emit('messageRead', { to: selectedUser._id });
    } catch (error) {
      console.error('Failed to fetch messages:', error.message);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [selectedUser, token]);

  useEffect(() => {
    const currentSocket = socket?.current;
    if (!currentSocket) return;

    const handleReceive = (payload) => {
      const incoming = payload?.message ? toMessageObject(payload.message) : null;
      const senderId = incoming?.sender || payload?.sender;
      if (senderId === selectedUser?._id) {
        setMessages((prev) => {
          if (incoming?._id && prev.some((msg) => msg._id === incoming._id)) return prev;
          if (incoming) return [...prev, incoming];
          return [...prev, toMessageObject({ sender: payload.sender, content: payload.text })];
        });
      }
    };

    const handleTyping = ({ from }) => {
      if (from === selectedUser?._id) setIsTyping(true);
    };

    const handleStopTyping = ({ from }) => {
      if (from === selectedUser?._id) setIsTyping(false);
    };

    const handleRead = ({ from }) => {
      if (from === selectedUser?._id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender === user._id ? { ...m, delivered: true, read: true, readAt: new Date() } : m
          )
        );
      }
    };

    const handleMessageStatus = ({ messageId, delivered, deliveredAt }) => {
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((message) =>
          message._id === messageId
            ? { ...message, delivered: Boolean(delivered), deliveredAt: deliveredAt || message.deliveredAt }
            : message
        )
      );
    };

    currentSocket.on('receiveMessage', handleReceive);
    currentSocket.on('typing', handleTyping);
    currentSocket.on('stopTyping', handleStopTyping);
    currentSocket.on('messageRead', handleRead);
    currentSocket.on('messageStatus', handleMessageStatus);

    return () => {
      currentSocket.off('receiveMessage', handleReceive);
      currentSocket.off('typing', handleTyping);
      currentSocket.off('stopTyping', handleStopTyping);
      currentSocket.off('messageRead', handleRead);
      currentSocket.off('messageStatus', handleMessageStatus);
    };
  }, [socket, selectedUser, user]);

  const handleSend = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || !token) return;
    try {
      const formData = new FormData();
      formData.append('recipientId', selectedUser._id);
      formData.append('content', newMessage.trim());
      selectedFiles.forEach((file) => formData.append('attachments', file));

      const res = await axios.post(`${API_BASE_URL}/api/messages`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sentMessage = toMessageObject(res.data);
      setMessages((prev) => [...prev, sentMessage]);
      socket?.current?.emit('sendMessage', {
        receiver: selectedUser._id,
        text: sentMessage.content,
        messageId: sentMessage._id,
        message: sentMessage,
      });
      setNewMessage('');
      setSelectedFiles([]);
      socket?.current?.emit('stopTyping', { to: selectedUser._id });
    } catch (error) {
      console.error('Failed to send message:', error.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTypingChange = (value) => {
    setNewMessage(value);
    if (socket?.current && selectedUser) {
      socket.current.emit('typing', { to: selectedUser._id });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.current.emit('stopTyping', { to: selectedUser._id });
      }, 800);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const selectedUserLabel = selectedUser?.name || selectedUser?.email || 'User';
  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setSelectedFiles(nextFiles);
  };

  const reactToMessage = async (messageId, emoji) => {
    if (!messageId || !emoji || !token) return;
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/messages/${messageId}/reaction`,
        { emoji },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = toMessageObject(res.data);
      setMessages((prev) => prev.map((msg) => (msg._id === updated._id ? updated : msg)));
      setOpenReactionFor(null);
    } catch (error) {
      console.error('Failed to react to message:', error.message);
    }
  };

  const getReactionCounts = (reactions = []) => {
    return reactions.reduce((acc, reaction) => {
      const emoji = reaction.emoji;
      acc[emoji] = (acc[emoji] || 0) + 1;
      return acc;
    }, {});
  };

  const getTickState = (message) => {
    if (message.read) return { text: '✓✓', className: 'read' };
    if (message.delivered) return { text: '✓✓', className: 'delivered' };
    return { text: '✓', className: 'sent' };
  };

  const canSend = Boolean(newMessage.trim() || selectedFiles.length > 0);
  const headerStatus = isTyping ? 'Typing…' : 'Active conversation';

  return (
    <div className="chat-window">
      <div className="chat-header">
        {onBack ? (
          <button type="button" className="chat-back-btn" onClick={onBack}>
            <HiOutlineChevronLeft />
          </button>
        ) : null}
        <div className="chat-header-main">
          <div className="chat-header-avatar" aria-hidden="true">
            {getInitials(selectedUserLabel)}
          </div>
          <div className="chat-header-copy">
            <h4>{selectedUserLabel}</h4>
            <span className="chat-typing-indicator">{headerStatus}</span>
          </div>
        </div>
        <div className="chat-header-actions">
          <button type="button" className="chat-header-action" title="Voice call">
            <HiOutlinePhone />
          </button>
          <button type="button" className="chat-header-action" title="Video call">
            <HiOutlineVideoCamera />
          </button>
          <button type="button" className="chat-header-action" title="Conversation info">
            <HiOutlineInformationCircle />
          </button>
        </div>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? <div className="chat-empty">No messages yet. Start the conversation.</div> : null}
        {messages.map((msg, idx) => {
          const isSent = msg.sender === user._id;
          const reactionEntries = Object.entries(getReactionCounts(msg.reactions));
          const tick = isSent ? getTickState(msg) : null;
          const messageId = msg._id || `fallback-${idx}`;
          const isReactionOpen = openReactionFor === messageId;

          return (
            <div key={messageId} className={`chat-message-row ${isSent ? 'sent' : 'received'}`}>
              <div className={`chat-message ${isSent ? 'sent' : 'received'}`}>
                {msg.content ? <p className="chat-message-content">{msg.content}</p> : null}
                {Array.isArray(msg.attachments) && msg.attachments.length > 0 ? (
                  <div className="chat-attachments">
                    {msg.attachments.map((attachment, attachmentIndex) => (
                      <a
                        key={attachment.publicId || attachment.url || attachmentIndex}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-attachment-link"
                      >
                        <img src={attachment.url} alt={attachment.fileName || 'Attachment'} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="chat-message-meta">
                <span className="chat-time">{formatTime(msg.createdAt)}</span>
                <div className="chat-reactions">
                  {reactionEntries.map(([emoji, count]) => (
                    <button
                      key={`${msg._id}-${emoji}`}
                      type="button"
                      className="chat-reaction-pill"
                      onClick={() => reactToMessage(msg._id, emoji)}
                    >
                      {emoji} {count}
                    </button>
                  ))}
                </div>
                {isSent ? (
                  <span className={`chat-tick ${tick.className}`}>{tick.text}</span>
                ) : null}
                <button
                  type="button"
                  className={`chat-reaction-toggle ${isReactionOpen ? 'active' : ''}`}
                  onClick={() => setOpenReactionFor(isReactionOpen ? null : messageId)}
                  title="React"
                >
                  🙂
                </button>
              </div>
              {isReactionOpen ? (
                <div className="chat-reaction-options">
                  {REACTION_OPTIONS.map((emoji) => (
                    <button
                      key={`${messageId}-${emoji}`}
                      type="button"
                      className="chat-reaction-btn"
                      onClick={() => reactToMessage(msg._id, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {selectedFiles.length > 0 ? (
        <div className="chat-selected-files">
          <span>{selectedFiles.length} attachment(s) selected</span>
          <div className="chat-selected-file-list">
            {selectedFiles.map((file) => (
              <span key={`${file.name}-${file.size}`} className="chat-selected-file-chip">
                {file.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="chat-input">
        <label className="chat-attach-btn" htmlFor="chat-attachment-input" title="Add photo">
          <HiOutlinePhoto />
        </label>
        <input
          id="chat-attachment-input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="chat-attachment-input"
        />
        <div className="chat-input-shell">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => handleTypingChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Aa"
          />
        </div>
        <button onClick={handleSend} disabled={!canSend} className="chat-send-btn" title="Send message">
          <HiOutlinePaperAirplane />
        </button>
      </div>
    </div>
  );
}
