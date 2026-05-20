import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    attachments: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        mimeType: { type: String },
        fileName: { type: String },
        size: { type: Number },
      },
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        emoji: { type: String, required: true },
      },
    ],
    delivered: { type: Boolean, default: false },
    deliveredAt: { type: Date },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

const Message = mongoose.model('Message', messageSchema);

export default Message;
