import mongoose from 'mongoose';

const duplicateCaseSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['user', 'property', 'kyc_document'],
      required: true,
    },
    key: { type: String, required: true },
    reason: { type: String, default: '' },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    signals: { type: mongoose.Schema.Types.Mixed, default: {} },
    primary: { type: mongoose.Schema.Types.Mixed, default: {} },
    duplicates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    suggestedAction: { type: String, default: '' },
    status: {
      type: String,
      enum: ['new', 'reviewing', 'merged', 'ignored', 'false_positive'],
      default: 'new',
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    notes: { type: String, default: '' },
    resolutionSummary: { type: String, default: '' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

duplicateCaseSchema.index({ entityType: 1, key: 1 }, { unique: true });
duplicateCaseSchema.index({ status: 1, updatedAt: -1 });
duplicateCaseSchema.index({ assignee: 1, status: 1, updatedAt: -1 });

export default mongoose.model('DuplicateCase', duplicateCaseSchema);
