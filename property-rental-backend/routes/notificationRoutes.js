import express from 'express';
import protect from '../middleware/authMiddleware.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendNotification } from '../socket.js';

const router = express.Router();

// Get all notifications for logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const filter = { userId: req.user._id };

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);
    res.json({
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/push-token', protect, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = ['android', 'ios', 'web'].includes(req.body?.platform)
      ? req.body.platform
      : 'unknown';

    if (!token) {
      return res.status(400).json({ message: 'Push token is required' });
    }

    const user = await User.findById(req.user._id).select('+pushTokens');

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.pushTokens = (user.pushTokens || []).filter((item) => item.token !== token);
    user.pushTokens.push({ token, platform, lastSeenAt: new Date() });
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Save push token error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/push-token', protect, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.json({ success: true });

    await User.updateOne(
      { _id: req.user._id },
      { $pull: { pushTokens: { token } } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Remove push token error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (notification.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    notification.read = true;
    await notification.save();
    res.json({ message: 'Notification marked as read', notification });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Test route to send notifications to all users with pending bookings
router.get('/test-send', protect, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const Booking = (await import('../models/Booking.js')).default;
  const pendingBookings = await Booking.find({ paymentStatus: 'pending' }).populate('renter property');

  for (const booking of pendingBookings) {
    if (!booking.renter) continue;
    await sendNotification(
      booking.renter._id,
      'payment',
      `Test: Your rent for "${booking.property.title}" is due soon.`,
      `/bookings/${booking._id}`
    );
  }

  res.json({ success: true, sent: pendingBookings.length });
});

export default router;
