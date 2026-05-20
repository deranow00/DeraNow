import mongoose from 'mongoose';

const leaseAmendmentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByRole: { type: String, enum: ['owner', 'renter', 'admin'], required: true },
    proposedFromDate: { type: Date },
    proposedToDate: { type: Date },
    proposedMonthlyRent: { type: Number, min: 0 },
    reason: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    decisionNote: { type: String, default: '' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedByRole: { type: String, enum: ['owner', 'renter', 'admin'] },
    decidedAt: { type: Date },
    appliedAt: { type: Date },
  },
  { timestamps: true, strict: false }
);

leaseAmendmentSchema.index({ booking: 1, createdAt: -1 });
leaseAmendmentSchema.index({ booking: 1, status: 1 });

export default mongoose.model('LeaseAmendment', leaseAmendmentSchema);
