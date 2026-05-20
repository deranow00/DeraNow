import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Notification from './models/Notification.js';
import User from './models/User.js';
import Message from './models/Message.js';
import { canUsersChat } from './utils/chatAccess.js';

let io;
const onlineUsers = new Map();
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

const createCorsOriginChecker = () => {
  const configured = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '';
  const allowedOrigins = (configured || DEFAULT_FRONTEND_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, ''));

  const allowAllOrigins = !configured || allowedOrigins.includes('*');

  return (origin, callback) => {
    if (!origin || allowAllOrigins) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  };
};

const addOnlineUserSocket = (userId, socketId) => {
  const key = userId.toString();
  const socketSet = onlineUsers.get(key) || new Set();
  socketSet.add(socketId);
  onlineUsers.set(key, socketSet);
};

const removeOnlineUserSocket = (userId, socketId) => {
  if (!userId) return;
  const key = userId.toString();
  const socketSet = onlineUsers.get(key);
  if (!socketSet) return;
  socketSet.delete(socketId);
  if (!socketSet.size) {
    onlineUsers.delete(key);
  }
};

export const setupSocket = (server) => {
  const corsOriginChecker = createCorsOriginChecker();
  io = new Server(server, {
    cors: {
      origin: corsOriginChecker,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const rawToken = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization || '';
    const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
    if (!token) return next(new Error('Authentication error'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) return next(new Error('Authentication error'));
      socket.data.userId = decoded.id.toString();
      socket.data.role = decoded.role;
      return next();
    } catch {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);
    const currentUserId = socket.data.userId;
    addOnlineUserSocket(currentUserId, socket.id);

    socket.on('addUser', (userId) => {
      if (!userId || userId.toString() !== currentUserId) return;
      addOnlineUserSocket(currentUserId, socket.id);
      console.log('👤 User online:', currentUserId);
    });

    socket.on('sendMessage', async ({ receiver, text, messageId, message }) => {
      const receiverId = receiver?.toString();
      if (!receiverId) return;

      const allowed = await canUsersChat(currentUserId, receiverId);
      if (!allowed) return;

      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets?.size) {
        let deliveredMessage = null;
        if (messageId) {
          deliveredMessage = await Message.findByIdAndUpdate(
            messageId,
            { $set: { delivered: true, deliveredAt: new Date() } },
            { new: true }
          );
        }

        const messagePayload = deliveredMessage || message || {
          sender: currentUserId,
          content: text || '',
          delivered: true,
          deliveredAt: new Date(),
        };

        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('receiveMessage', { message: messagePayload, sender: currentUserId, text });
        });

        const senderSockets = onlineUsers.get(currentUserId);
        if (senderSockets?.size && messageId) {
          senderSockets.forEach((socketId) => {
            io.to(socketId).emit('messageStatus', {
              messageId,
              delivered: true,
              deliveredAt: messagePayload.deliveredAt || new Date(),
            });
          });
        }
      }
    });

    socket.on('typing', ({ to }) => {
      const receiverId = to?.toString();
      if (!receiverId) return;

      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets?.size) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('typing', { from: currentUserId });
        });
      }
    });

    socket.on('stopTyping', ({ to }) => {
      const receiverId = to?.toString();
      if (!receiverId) return;

      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets?.size) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('stopTyping', { from: currentUserId });
        });
      }
    });

    socket.on('messageRead', async ({ to }) => {
      const receiverId = to?.toString();
      if (!receiverId) return;

      const allowed = await canUsersChat(currentUserId, receiverId);
      if (!allowed) return;

      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets?.size) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('messageRead', { from: currentUserId });
        });
      }
    });

    socket.on('disconnect', () => {
      removeOnlineUserSocket(currentUserId, socket.id);
      console.log('❌ User disconnected:', currentUserId);
    });
  });
};

export const sendNotification = async (userId, type, message, link = '') => {
  if (!io) {
    // Keep business flows working even if socket server isn't available.
    console.warn('Socket.io not initialized; storing notification only');
  }

  try {
    const user = await User.findById(userId).select('notificationPreferences');
    const prefs = user?.notificationPreferences;
    const inAppEnabled = prefs?.inApp !== false;
    const typeEnabled = prefs?.types?.[type] !== false;

    if (!inAppEnabled || !typeEnabled) {
      return;
    }

    const notification = await Notification.create({
      userId,
      type,
      message,
      link,
    });

    const socketIds = onlineUsers.get(userId?.toString());
    if (io && socketIds?.size) {
      socketIds.forEach((socketId) => {
        io.to(socketId).emit('newNotification', {
          _id: notification._id,
          type: notification.type,
          message: notification.message,
          link: notification.link,
          read: notification.read,
          createdAt: notification.createdAt,
        });
      });
      console.log(`📢 Notification sent in real-time to ${userId} (${type})`);
    } else {
      console.log(`🕒 User ${userId} offline, notification saved (${type})`);
    }
  } catch (err) {
    console.error('❌ Error sending notification:', err.message);
  }
};

export const broadcastNotification = async (userIds, type, message, link = '') => {
  for (const id of userIds) {
    await sendNotification(id, type, message, link);
  }
};

export const isUserOnline = (userId) => {
  if (!userId) return false;
  const sockets = onlineUsers.get(userId.toString());
  return Boolean(sockets?.size);
};
