import mongoose from 'mongoose';

const bookingAuditLogSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, enum: ['owner', 'renter', 'admin'], required: true },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

bookingAuditLogSchema.index({ booking: 1, createdAt: -1 });
bookingAuditLogSchema.index({ actor: 1, createdAt: -1 });

export default mongoose.model('BookingAuditLog', bookingAuditLogSchema);
