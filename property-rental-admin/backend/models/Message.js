import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    text: { type: String, default: '' },
    content: { type: String, default: '' },
    isRead: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('Message', messageSchema);
