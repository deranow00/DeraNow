import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import { sendNotification } from '../socket.js';

// Create a new payment (Pending)
export const createPayment = async (req, res) => {
  const { bookingId, amount, paymentMethod, pid } = req.body;
  if (!bookingId || !amount || !paymentMethod || !pid) {
    return res.status(400).json({ error: 'Booking, amount, payment method, and pid are required' });
  }

  try {
    const booking = await Booking.findById(bookingId).populate('property');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.renter.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not authorized' });
    if (booking.status !== 'Approved') return res.status(400).json({ error: 'Booking not approved yet' });

    const payment = new Payment({ booking: bookingId, renter: req.user._id, amount, paymentMethod, pid, status: 'Pending' });
    await payment.save();

    await sendNotification(
      req.user._id,
      'payment',
      `Payment of Rs. ${amount} for "${booking.property.title}" has been initiated.`,
      `/payments/${payment._id}`
    );

    res.status(201).json({ message: 'Payment initiated', payment });
  } catch (err) {
    console.error('Error creating payment:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all payments for a renter
export const getRenterPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ renter: req.user._id })
      .populate({
        path: 'booking',
        populate: { path: 'property', select: 'title price ownerId' },
      });
    res.json(payments);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update payment status manually (Admin or webhook)
export const updatePaymentStatus = async (req, res) => {
  const { paymentId, status } = req.body;
  if (!['Paid', 'Failed'].includes(status)) return res.status(400).json({ error: 'Invalid payment status' });

  try {
    const payment = await Payment.findById(paymentId).populate('booking');
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    payment.status = status;
    await payment.save();

    await sendNotification(
      payment.renter,
      'payment',
      `Payment for "${payment.booking.property}" is now ${status}.`,
      `/payments/${payment._id}`
    );

    res.status(200).json({ message: 'Payment status updated', payment });
  } catch (err) {
    console.error('Error updating payment status:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Verify eSewa payment
export const verifyPayment = async (req, res) => {
  const { pid, amount } = req.body;
  if (!pid || !amount) return res.status(400).json({ error: 'pid and amount required' });

  try {
    const payment = await Payment.findOne({ pid }).populate('booking');
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const merchantCode = 'EPAYTEST'; // Sandbox
    const verificationURL = `https://esewa.com.np/epay/transrec`;

    const params = new URLSearchParams({ amt: amount, pid, scd: merchantCode, rid: '', prn: '' });

    const response = await fetch(verificationURL, { method: 'POST', body: params });
    const text = await response.text();

    if (text.includes('Success')) {
      payment.status = 'Paid';
      await payment.save();

      await sendNotification(
        payment.renter,
        'payment',
        `Payment of Rs. ${amount} for "${payment.booking.property}" verified successfully.`,
        `/payments/${payment._id}`
      );

      res.json({ message: 'Payment verified successfully', payment });
    } else {
      payment.status = 'Failed';
      await payment.save();

      await sendNotification(
        payment.renter,
        'payment',
        `Payment of Rs. ${amount} for "${payment.booking.property}" failed verification.`,
        `/payments/${payment._id}`
      );

      res.status(400).json({ error: 'Payment verification failed', payment });
    }
  } catch (err) {
    console.error('Error verifying payment:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
