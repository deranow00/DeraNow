import mongoose from 'mongoose';

const duplicateMergeOperationSchema = new mongoose.Schema(
  {
    sourceUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: ['completed', 'rolled_back', 'expired'],
      default: 'completed',
      index: true,
    },
    rollbackExpiresAt: { type: Date, required: true, index: true },
    rolledBackAt: { type: Date },
    rolledBackBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    sourceSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    targetSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    movedRefs: {
      type: [
        {
          label: { type: String, required: true },
          model: { type: String, required: true },
          field: { type: String, required: true },
          ids: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        },
      ],
      default: [],
    },
    movedDocPublicIds: { type: [String], default: [] },
    movedDocImageUrls: { type: [String], default: [] },
  },
  { timestamps: true }
);

duplicateMergeOperationSchema.index({ createdAt: -1 });

export default mongoose.model('DuplicateMergeOperation', duplicateMergeOperationSchema);
