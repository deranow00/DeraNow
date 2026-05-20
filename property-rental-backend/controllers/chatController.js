import Booking from '../models/Booking.js';
import Property from '../models/Property.js';

export const getAllowedChatUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    let bookings;
    if (req.user.role === 'renter') {
      // Renter: fetch approved bookings made by this renter
      bookings = await Booking.find({ renter: currentUserId, status: 'Approved' })
        .populate({
          path: 'property',
          select: 'ownerId',
          populate: { path: 'ownerId', model: 'User', select: '_id name email' }
        });
    } else if (req.user.role === 'owner') {
      // Owner: fetch approved bookings only for properties owned by this owner
      const ownerProperties = await Property.find({ ownerId: currentUserId }).select('_id').lean();
      const ownerPropertyIds = ownerProperties.map((property) => property._id);

      bookings = ownerPropertyIds.length
        ? await Booking.find({ status: 'Approved', property: { $in: ownerPropertyIds } })
            .populate('renter', 'name email')
            .lean()
        : [];
    } else {
      return res.status(403).json({ error: 'Role not allowed for chat' });
    }

    const usersMap = new Map();
    bookings.forEach((booking) => {
      let otherUser;
      if (req.user.role === 'renter') {
        otherUser = booking.property?.ownerId;
      } else {
        otherUser = booking.renter;
      }

      if (otherUser && !usersMap.has(otherUser._id.toString())) {
        usersMap.set(otherUser._id.toString(), otherUser);
      }
    });

    res.json(Array.from(usersMap.values()));
  } catch (err) {
    console.error('Error fetching allowed chat users:', err);
    res.status(500).json({ error: 'Failed to fetch allowed chat users' });
  }
};
