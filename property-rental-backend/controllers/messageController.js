import Message from '../models/Message.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import { isUserOnline, sendNotification } from '../socket.js';
import { canUsersChat } from '../utils/chatAccess.js';

const uploadImageBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'property-rental/messages',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });

export const getConversationSummaries = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const pinnedChats = Array.isArray(req.user.pinnedChats)
      ? req.user.pinnedChats.map((id) => id.toString())
      : [];

    const summaries = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: currentUserId }, { recipient: currentUserId }],
        },
      },
      {
        $addFields: {
          otherUserId: {
            $cond: [{ $eq: ['$sender', currentUserId] }, '$recipient', '$sender'],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$otherUserId',
          lastMessage: { $first: '$content' },
          lastMessageAt: { $first: '$createdAt' },
          lastSender: { $first: '$sender' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$recipient', currentUserId] }, { $eq: ['$read', false] }],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    const userIds = summaries.map((item) => item._id);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email').lean();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    res.json(
      summaries
        .map((item) => ({
          user: userMap.get(item._id.toString()) || null,
          lastMessage: item.lastMessage || '',
          lastMessageAt: item.lastMessageAt,
          lastSender: item.lastSender,
          unreadCount: item.unreadCount || 0,
          pinned: pinnedChats.includes(item._id.toString()),
        }))
        .filter((item) => Boolean(item.user))
    );
  } catch (error) {
    console.error('Error fetching conversation summaries:', error);
    res.status(500).json({ error: 'Failed to fetch conversation summaries' });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const allowed = await canUsersChat(req.user._id, recipientId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to access this conversation' });
    }

    const filter = {
      $or: [
        { sender: req.user._id, recipient: recipientId },
        { sender: recipientId, recipient: req.user._id },
      ],
    };
    const [messages, total] = await Promise.all([
      Message.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Message.countDocuments(filter),
    ]);

    res.json({
      items: messages.reverse(),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const sendMessage = async (req, res) => {
  const { recipientId } = req.body;
  const content = (req.body.content || '').trim();

  if (!recipientId) {
    return res.status(400).json({ error: 'Recipient is required' });
  }

  try {
    const files = req.files || [];
    if (!content && files.length === 0) {
      return res.status(400).json({ error: 'Message content or at least one attachment is required' });
    }

    const allowed = await canUsersChat(req.user._id, recipientId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to message this user' });
    }

    const attachments = [];
    if (files.length > 0) {
      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(500).json({ error: 'Cloudinary credentials are not configured on server' });
      }

      for (const file of files) {
        const uploaded = await uploadImageBufferToCloudinary(file.buffer);
        attachments.push({
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          mimeType: file.mimetype,
          fileName: file.originalname,
          size: file.size,
        });
      }
    }

    const recipientOnline = isUserOnline(recipientId);
    const message = new Message({
      sender: req.user._id,
      recipient: recipientId,
      content,
      attachments,
      delivered: recipientOnline,
      deliveredAt: recipientOnline ? new Date() : null,
    });

    await message.save();

    await sendNotification(
      recipientId,
      'message',
      `New message from ${req.user.name || 'User'}`,
      `/renter/message`
    );

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

export const markConversationRead = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const allowed = await canUsersChat(req.user._id, recipientId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to update this conversation' });
    }

    await Message.updateMany(
      { sender: recipientId, recipient: req.user._id, read: false },
      { $set: { delivered: true, deliveredAt: new Date(), read: true, readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

export const toggleMessageReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const emoji = String(req.body.emoji || '').trim();
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const selfId = req.user._id.toString();
    if (
      message.sender.toString() !== selfId &&
      message.recipient.toString() !== selfId
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const existingIndex = message.reactions.findIndex((reaction) => reaction.user.toString() === selfId);
    if (existingIndex >= 0) {
      if (message.reactions[existingIndex].emoji === emoji) {
        message.reactions.splice(existingIndex, 1);
      } else {
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();
    res.json(message);
  } catch (error) {
    console.error('Error toggling message reaction:', error);
    res.status(500).json({ error: 'Failed to update reaction' });
  }
};

export const togglePinnedConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { pinned } = req.body;

    const allowed = await canUsersChat(req.user._id, userId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to pin this conversation' });
    }

    const shouldPin = typeof pinned === 'boolean' ? pinned : true;
    const update = shouldPin
      ? { $addToSet: { pinnedChats: userId } }
      : { $pull: { pinnedChats: userId } };

    await User.findByIdAndUpdate(req.user._id, update);
    const refreshed = await User.findById(req.user._id).select('pinnedChats').lean();
    res.json({
      success: true,
      pinnedChats: (refreshed?.pinnedChats || []).map((id) => id.toString()),
    });
  } catch (error) {
    console.error('Error toggling pinned conversation:', error);
    res.status(500).json({ error: 'Failed to pin conversation' });
  }
};
