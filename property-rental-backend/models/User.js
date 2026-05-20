import mongoose from 'mongoose';

const notificationPreferencesSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    types: {
      payment: { type: Boolean, default: true },
      newBooking: { type: Boolean, default: true },
      bookingAccepted: { type: Boolean, default: true },
      bookingRejected: { type: Boolean, default: true },
      newListing: { type: Boolean, default: true },
      listingApproval: { type: Boolean, default: true },
      ownerVerification: { type: Boolean, default: true },
      message: { type: Boolean, default: true },
      review: { type: Boolean, default: true },
      leaseRenewal: { type: Boolean, default: true },
      workflowReminder: { type: Boolean, default: true },
      payoutReminder: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const privacyPreferencesSchema = new mongoose.Schema(
  {
    showEmailToOwnerOrRenter: { type: Boolean, default: true },
    showPhoneToOwnerOrRenter: { type: Boolean, default: false },
    loginAlerts: { type: Boolean, default: true },
  },
  { _id: false }
);

const appPreferencesSchema = new mongoose.Schema(
  {
    language: { type: String, default: 'en' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    compactMode: { type: Boolean, default: false },
  },
  { _id: false }
);

const ownerVerificationDocumentSchema = new mongoose.Schema(
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
  citizenshipNumber: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  emailVerified: { type: Boolean, default: false },
  emailVerifiedAt: { type: Date },
  emailVerificationCodeHash: { type: String, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  emailVerificationAttemptCount: { type: Number, default: 0, select: false },
  emailVerificationLastSentAt: { type: Date, select: false },
  password: { type: String, required: true },
  role: { type: String, enum: ['owner', 'renter', 'admin'], default: 'renter' },
  ownerVerificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified',
  },
  ownerVerifiedAt: { type: Date },
  ownerVerificationDocuments: {
    type: [ownerVerificationDocumentSchema],
    default: [],
  },
  ownerVerificationRejectReason: { type: String, default: '' },
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
  notificationPreferences: {
    type: notificationPreferencesSchema,
    default: () => ({}),
  },
  privacyPreferences: {
    type: privacyPreferencesSchema,
    default: () => ({}),
  },
  appPreferences: {
    type: appPreferencesSchema,
    default: () => ({}),
  },
  pinnedChats: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  refreshTokenHash: { type: String, select: false },
  refreshTokenExpiresAt: { type: Date, select: false },
  resetPasswordTokenHash: { type: String, select: false },
  resetPasswordExpiresAt: { type: Date, select: false },
});

export default mongoose.model('User', userSchema);
