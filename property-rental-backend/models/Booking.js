
import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true,
    default: function () {
      return this.fromDate;
    },
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  renter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },
  acceptedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'pending_verification', 'paid'],
    default: 'pending'
  },
  agreedMonthlyRent: {
    type: Number,
    min: 0,
    default: null,
  },
  cancelledAt: {
    type: Date,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  cancelledByRole: {
    type: String,
    enum: ['owner', 'renter', 'admin'],
  },
  cancellationReason: {
    type: String,
    default: '',
  },
  cancellationPenaltyPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  cancellationPenaltyAmount: {
    type: Number,
    min: 0,
    default: 0,
  },
  cancellationRefundAmount: {
    type: Number,
    min: 0,
    default: 0,
  },
  renewalStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none',
  },
  renewalRequestedAt: {
    type: Date,
  },
  renewalApprovedAt: {
    type: Date,
  },
  renewalMonths: {
    type: Number,
    default: 0,
  },
  renewalNote: {
    type: String,
    default: '',
  },
  bookingDetails: {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    occupants: { type: Number, min: 1 },
    employmentStatus: { type: String, trim: true },
    monthlyIncome: { type: Number, min: 0 },
    moveInReason: { type: String, trim: true },
    emergencyContactName: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
    noteToOwner: { type: String, trim: true },
  }
}, { timestamps: true });

bookingSchema.index({ property: 1, status: 1, fromDate: 1, toDate: 1 });
bookingSchema.index({ renter: 1, status: 1, createdAt: -1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
