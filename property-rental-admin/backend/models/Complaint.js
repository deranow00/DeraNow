import mongoose from "mongoose";

const complaintSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  complaint: { type: String, required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "resolved"], default: "pending" },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

export default mongoose.model("Complaint", complaintSchema);
