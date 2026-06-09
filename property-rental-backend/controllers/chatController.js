import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import PropertyVisit from '../models/PropertyVisit.js';

export const getAllowedChatUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const usersMap = new Map();

    if (req.user.role === 'renter') {
      const [bookings, visits] = await Promise.all([
        Booking.find({ renter: currentUserId, status: 'Approved' })
        .populate({
          path: 'property',
          select: 'ownerId',
          populate: { path: 'ownerId', model: 'User', select: '_id name email' }
          }),
        PropertyVisit.find({ renter: currentUserId, status: { $ne: 'cancelled' } })
          .populate('owner', '_id name email')
          .populate({
            path: 'property',
            select: 'ownerId',
            populate: { path: 'ownerId', model: 'User', select: '_id name email' },
          })
          .lean(),
      ]);

      bookings.forEach((booking) => {
        const owner = booking.property?.ownerId;
        if (owner?._id && !usersMap.has(owner._id.toString())) {
          usersMap.set(owner._id.toString(), owner);
        }
      });

      visits.forEach((visit) => {
        const owner = visit.owner || visit.property?.ownerId;
        if (owner?._id && !usersMap.has(owner._id.toString())) {
          usersMap.set(owner._id.toString(), owner);
        }
      });
    } else if (req.user.role === 'owner') {
      const ownerProperties = await Property.find({ ownerId: currentUserId }).select('_id').lean();
      const ownerPropertyIds = ownerProperties.map((property) => property._id);

      const [bookings, visits] = ownerPropertyIds.length
        ? await Promise.all([
            Booking.find({ status: 'Approved', property: { $in: ownerPropertyIds } })
            .populate('renter', 'name email')
              .lean(),
            PropertyVisit.find({
              property: { $in: ownerPropertyIds },
              status: { $ne: 'cancelled' },
            })
              .populate('renter', 'name email')
              .lean(),
          ])
        : [[], []];

      bookings.forEach((booking) => {
        const renter = booking.renter;
        if (renter?._id && !usersMap.has(renter._id.toString())) {
          usersMap.set(renter._id.toString(), renter);
        }
      });

      visits.forEach((visit) => {
        const renter = visit.renter;
        if (renter?._id && !usersMap.has(renter._id.toString())) {
          usersMap.set(renter._id.toString(), renter);
        }
      });
    } else {
      return res.status(403).json({ error: 'Role not allowed for chat' });
    }

    res.json(Array.from(usersMap.values()));
  } catch (err) {
    console.error('Error fetching allowed chat users:', err);
    res.status(500).json({ error: 'Failed to fetch allowed chat users' });
  }
};
