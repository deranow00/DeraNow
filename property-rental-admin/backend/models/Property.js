import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  price: { type: Number, required: true },
  bedrooms: { type: Number, required: true },
  bathrooms: { type: Number, required: true },
  description: { type: String },
  type: { type: String, enum: ['Apartment', 'House', 'Condo'], required: true },
  image: { type: String },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  rating: { type: Number, default: 0, min: 0, max: 5 }

}, {
  timestamps: true
});

export default mongoose.model('Property', propertySchema);
