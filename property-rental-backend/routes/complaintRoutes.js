import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  submitComplaint,
  getAllComplaints,
  getUserComplaints,
  resolveComplaint,
  getOwnerComplaints
} from "../controllers/complaintController.js";

const router = express.Router();

router.post("/", submitComplaint);
router.get("/", getAllComplaints);
router.get("/:email", getUserComplaints);
router.patch("/:id/resolve", resolveComplaint);
router.get("/owner", protect, getOwnerComplaints);

export default router;
