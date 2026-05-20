import { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import ChatList from '../../components/common/chat/ChatList';
import ChatWindow from '../../components/common/chat/ChatWindow';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Message.css';

export default function Message() {
  const { token } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [conversationMap, setConversationMap] = useState({});
  const [showThreadList, setShowThreadList] = useState(true);

  const sortUsersByInbox = (rawUsers, nextConversationMap) => {
    return [...rawUsers].sort((a, b) => {
      const aPinned = nextConversationMap[a._id]?.pinned ? 1 : 0;
      const bPinned = nextConversationMap[b._id]?.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aTime = nextConversationMap[a._id]?.lastMessageAt
        ? new Date(nextConversationMap[a._id].lastMessageAt).getTime()
        : 0;
      const bTime = nextConversationMap[b._id]?.lastMessageAt
        ? new Date(nextConversationMap[b._id].lastMessageAt).getTime()
        : 0;
      if (aTime !== bTime) return bTime - aTime;
      return (a.name || a.email || '').localeCompare(b.name || b.email || '');
    });
  };

  useEffect(() => {
    const fetchInbox = async () => {
      try {
        if (!token) return;

        const [usersRes, conversationsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/chat/allowed-users`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
        const rawConversations = Array.isArray(conversationsRes.data) ? conversationsRes.data : [];
        const nextConversationMap = rawConversations.reduce((acc, item) => {
          if (!item?.user?._id) return acc;
          acc[item.user._id] = item;
          return acc;
        }, {});

        const sortedUsers = sortUsersByInbox(rawUsers, nextConversationMap);

        setConversationMap(nextConversationMap);
        setUsers(sortedUsers);
        setSelectedUser((prev) => {
          if (!sortedUsers.length) return null;
          if (prev && sortedUsers.some((user) => user._id === prev._id)) return prev;
          return sortedUsers[0];
        });
      } catch (error) {
        console.error('Error fetching chat inbox:', error.message);
      }
    };

    fetchInbox();
    const interval = setInterval(fetchInbox, 15000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!selectedUser) {
      setShowThreadList(true);
    }
  }, [selectedUser]);

  const handleTogglePin = async (chatUser) => {
    if (!token || !chatUser?._id) return;
    const currentPinned = Boolean(conversationMap[chatUser._id]?.pinned);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/messages/conversations/${chatUser._id}/pin`,
        { pinned: !currentPinned },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nextConversationMap = {
        ...conversationMap,
        [chatUser._id]: {
          ...(conversationMap[chatUser._id] || {}),
          pinned: !currentPinned,
        },
      };
      setConversationMap(nextConversationMap);
      setUsers((prev) => sortUsersByInbox(prev, nextConversationMap));
    } catch (error) {
      console.error('Error toggling pin:', error.message);
    }
  };

  return (
    <div className={`message-page ${selectedUser && !showThreadList ? 'show-chat' : 'show-list'}`}>
      <ChatList
        users={users}
        onSelectUser={(user) => {
          setSelectedUser(user);
          setShowThreadList(false);
        }}
        selectedUser={selectedUser}
        conversationMap={conversationMap}
        onTogglePin={handleTogglePin}
      />
      {selectedUser && (
        <ChatWindow
          selectedUser={selectedUser}
          onBack={() => setShowThreadList(true)}
        />
      )}
    </div>
  );
}
