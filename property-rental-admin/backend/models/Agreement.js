import mongoose from 'mongoose';

const agreementVersionSchema = new mongoose.Schema(
  {
    version: { type: Number },
    content: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    ownerSignature: { type: String, default: '' },
    renterSignature: { type: String, default: '' },
    ownerSignedAt: { type: Date },
    renterSignedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending_owner', 'pending_renter', 'fully_signed'],
      default: 'pending_owner',
    },
  },
  { _id: false }
);

const agreementSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', unique: true, required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    currentVersion: { type: Number, default: 1 },
    versions: { type: [agreementVersionSchema], default: [] },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('Agreement', agreementSchema);
