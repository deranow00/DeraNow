import mongoose from 'mongoose';

const agreementVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    content: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currentVersion: { type: Number, default: 1 },
    versions: { type: [agreementVersionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Agreement', agreementSchema);
