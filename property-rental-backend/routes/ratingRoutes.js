import express from 'express';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import protect from '../middleware/authMiddleware.js';
import mongoose from 'mongoose';

const router = express.Router();

router.post('/:id/rate', protect, async (req, res) => {
  const { rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }

    const propertyId = new mongoose.Types.ObjectId(req.params.id);
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const booking = await Booking.findOne({
      renter: userId,
      property: propertyId,
      status: 'Approved',
    });

    if (!booking) {
      return res.status(403).json({ message: 'You can only rate properties you have booked' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    const existingRating = property.ratings?.find((r) => r.user.equals(userId));
    if (existingRating) {
      return res.status(400).json({ message: 'You have already rated this property' });
    }

    property.ratings.push({ user: userId, value: rating });
    property.reviews.push({ user: userId, rating, comment: '' });
    property.numRatings += 1;
    property.rating = (property.rating * (property.numRatings - 1) + rating) / property.numRatings;

    await property.save();

    return res.json({ message: 'Rating submitted successfully', rating: property.rating });
  } catch (err) {
    console.error('Rating error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
