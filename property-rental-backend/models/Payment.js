import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  pid: { type: String, sparse: true, unique: true },
  transactionRef: { type: String },
  idempotencyKey: { type: String, index: true, sparse: true },
  billingPeriodKey: { type: String, index: true },
  monthsCount: { type: Number, default: 1 },
  paymentPeriodStart: { type: Date },
  paymentPeriodEnd: { type: Date },
  adminRemark: { type: String },
  status: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Pending' },
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
  paymentMethod: { type: String, enum: ['Khalti', 'eSewa', 'QR'], required: true },
}, { timestamps: true });

paymentSchema.index({ booking: 1, createdAt: -1 });
paymentSchema.index(
  { booking: 1, billingPeriodKey: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      billingPeriodKey: { $exists: true, $type: 'string' },
      status: { $in: ['Pending', 'Paid'] },
    },
  }
);

export default mongoose.model('Payment', paymentSchema);
