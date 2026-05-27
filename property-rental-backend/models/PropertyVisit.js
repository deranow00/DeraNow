import mongoose from 'mongoose';

const propertyVisitSchema = new mongoose.Schema(
  {
    visitPass: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitPass', required: true },
    promoCode: { type: String, trim: true, uppercase: true, required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visitDate: { type: Date, required: true },
    note: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

propertyVisitSchema.index({ renter: 1, visitDate: -1 });
propertyVisitSchema.index({ property: 1, visitDate: 1 });
propertyVisitSchema.index({ visitPass: 1, property: 1, visitDate: 1 });

export default mongoose.model('PropertyVisit', propertyVisitSchema);
