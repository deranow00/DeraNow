import mongoose from 'mongoose';

const visitPassSchema = new mongoose.Schema(
  {
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    promoCode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
    },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['QR'], default: 'QR' },
    transactionRef: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'consumed', 'rejected'],
      default: 'pending_payment',
    },
    requestedForProperty: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    requestedVisitDate: { type: Date },
    paidNotifiedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    consumedAt: { type: Date },
    consumedByVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyVisit' },
    rejectedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminRemark: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

visitPassSchema.index({ renter: 1, status: 1, createdAt: -1 });
visitPassSchema.index({ createdAt: -1 });

export default mongoose.model('VisitPass', visitPassSchema);
