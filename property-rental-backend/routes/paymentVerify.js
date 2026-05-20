// routes/paymentVerify.js
import express from "express";
import axios from "axios";
import qs from "qs";
import Payment from "../models/Payment.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// POST /api/payments/verify
router.post("/verify", protect, async (req, res) => {
  const { pid, refId, amount } = req.body;

  if (!pid || !refId || !amount) {
    return res.status(400).json({ error: "pid, refId, and amount are required" });
  }

  try {
    const merchantCode = "EPAYTEST"; // Sandbox Merchant Code
    const postData = qs.stringify({
      amt: amount,
      pid,
      scd: merchantCode,
      rid: refId,
    });

    const response = await axios.post(
      "https://esewa.com.np/epay/transrec",
      postData,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // eSewa returns XML string; success contains <response_code>Success</response_code>
    if (response.data.includes("<response_code>Success</response_code>")) {
      const payment = await Payment.findOne({ pid });
      if (payment) {
        payment.status = "Paid";
        await payment.save();
      }

      return res.json({ success: true, message: "Payment verified successfully" });
    } else {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.error("eSewa verification error:", err.message);
    return res.status(500).json({ success: false, message: "Server error during verification" });
  }
});

export default router;
