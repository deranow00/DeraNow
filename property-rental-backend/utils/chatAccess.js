import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import PropertyVisit from '../models/PropertyVisit.js';

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
};

export const canUsersChat = async (userAId, userBId) => {
  const aId = toObjectId(userAId);
  const bId = toObjectId(userBId);
  if (!aId || !bId || aId.equals(bId)) return false;

  const [aOwnedProperties, bOwnedProperties] = await Promise.all([
    Property.find({ ownerId: aId }).select('_id').lean(),
    Property.find({ ownerId: bId }).select('_id').lean(),
  ]);

  const aPropertyIds = aOwnedProperties.map((p) => p._id);
  const bPropertyIds = bOwnedProperties.map((p) => p._id);

  const visitStatuses = { $ne: 'cancelled' };

  const [aAsRenter, bAsRenter, aVisitWithB, bVisitWithA] = await Promise.all([
    bPropertyIds.length
      ? Booking.exists({
          renter: aId,
          property: { $in: bPropertyIds },
          status: 'Approved',
        })
      : null,
    aPropertyIds.length
      ? Booking.exists({
          renter: bId,
          property: { $in: aPropertyIds },
          status: 'Approved',
        })
      : null,
    bPropertyIds.length
      ? PropertyVisit.exists({
          renter: aId,
          property: { $in: bPropertyIds },
          status: visitStatuses,
        })
      : null,
    aPropertyIds.length
      ? PropertyVisit.exists({
          renter: bId,
          property: { $in: aPropertyIds },
          status: visitStatuses,
        })
      : null,
  ]);

  return Boolean(aAsRenter || bAsRenter || aVisitWithB || bVisitWithA);
};
