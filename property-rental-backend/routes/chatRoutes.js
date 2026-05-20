// routes/chatRoutes.js
import express from 'express';
import protect from '../middleware/authMiddleware.js';
import { getAllowedChatUsers } from '../controllers/chatController.js';

const router = express.Router();

router.get('/allowed-users', protect, getAllowedChatUsers);

export default router;
