import express from 'express';
import protect from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import {
  getConversationSummaries,
  getMessages,
  sendMessage,
  markConversationRead,
  toggleMessageReaction,
  togglePinnedConversation,
} from '../controllers/messageController.js';

const router = express.Router();

router.get('/conversations', protect, getConversationSummaries);
router.patch('/conversations/:userId/pin', protect, togglePinnedConversation);
router.patch('/:messageId/reaction', protect, toggleMessageReaction);
router.get('/:recipientId', protect, getMessages);
router.post('/', protect, upload.array('attachments', 4), sendMessage);
router.patch('/read/:recipientId', protect, markConversationRead);

export default router;
