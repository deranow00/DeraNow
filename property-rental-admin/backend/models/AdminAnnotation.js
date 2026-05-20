import mongoose from 'mongoose';

const adminAnnotationSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['User', 'Property', 'Booking', 'Payment', 'Complaint', 'Agreement'],
      required: true,
    },
    entityId: { type: String, required: true },
    note: { type: String, default: '' },
    tags: { type: [String], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

adminAnnotationSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
adminAnnotationSchema.index({ tags: 1, updatedAt: -1 });

export default mongoose.model('AdminAnnotation', adminAnnotationSchema);
