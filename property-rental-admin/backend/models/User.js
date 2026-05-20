import mongoose from 'mongoose';

const kycDocumentSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    publicId: { type: String },
    docType: { type: String, default: 'Government ID' },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    rejectReason: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  citizenshipNumber: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['owner', 'renter', 'admin'], default: 'renter' },
  isActive: { type: Boolean, default: true },
  ownerVerificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified',
  },
  ownerVerifiedAt: { type: Date },
  kycStatus: {
    type: String,
    enum: ['unsubmitted', 'pending', 'verified', 'rejected'],
    default: 'unsubmitted',
  },
  kycVerifiedAt: { type: Date },
  kycRejectReason: { type: String, default: '' },
  kycDocuments: {
    type: [kycDocumentSchema],
    default: [],
  },
}, { timestamps: true, strict: false });

export default mongoose.model('User', userSchema);
