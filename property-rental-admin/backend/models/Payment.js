import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, default: 'Unknown' },
    pid: { type: String },
    transactionRef: { type: String },
    monthsCount: { type: Number, default: 1 },
    paymentPeriodStart: { type: Date },
    paymentPeriodEnd: { type: Date },
    adminRemark: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
      default: 'Pending',
    },
    payoutStatus: {
      type: String,
      enum: ['Unallocated', 'Allocated', 'Transferred'],
      default: 'Unallocated',
    },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    ownerAmount: { type: Number, default: 0, min: 0 },
    payoutAllocatedAt: { type: Date },
    payoutTransferredAt: { type: Date },
    payoutNote: { type: String },
  },
  { timestamps: true, strict: false }
);

paymentSchema.index({ booking: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ payoutStatus: 1, createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
