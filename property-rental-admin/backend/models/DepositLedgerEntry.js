import mongoose from 'mongoose';

const depositLedgerEntrySchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['deposit_received', 'deduction', 'refund_requested', 'refund_paid', 'adjustment'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'recorded', 'paid'],
      default: 'recorded',
    },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByRole: { type: String, enum: ['owner', 'renter', 'admin'], required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedByRole: { type: String, enum: ['owner', 'renter', 'admin'] },
    approvedAt: { type: Date },
  },
  { timestamps: true, strict: false }
);

depositLedgerEntrySchema.index({ booking: 1, createdAt: -1 });
depositLedgerEntrySchema.index({ booking: 1, type: 1, status: 1 });

export default mongoose.model('DepositLedgerEntry', depositLedgerEntrySchema);
