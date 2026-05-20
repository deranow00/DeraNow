import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'payment',
        'newBooking',
        'bookingAccepted',
        'bookingRejected',
        'newListing',
        'listingApproval',
        'ownerVerification',
        'message',
        'review',
        'leaseRenewal',
        'workflowReminder',
        'payoutReminder',
      ],
      required: true,
    },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    link: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
