import express from 'express';
import dotenv from 'dotenv';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import protect from '../middleware/authMiddleware.js';
import { sendNotification } from '../socket.js';
import User from '../models/User.js';

dotenv.config();
const router = express.Router();

const startOfMonth = (dateValue = new Date()) => {
  const date = new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const endOfMonth = (dateValue = new Date()) => {
  const date = new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

const addMonths = (dateValue, months) => {
  const date = new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
};

const monthDiffInclusive = (startDate, endDate) => {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  return years * 12 + months + 1;
};

const toMonthKey = (dateValue) => {
  const date = new Date(dateValue);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

router.post('/create', protect, async (req, res) => {
  try {
    const { bookingId, paymentMethod = 'QR', pid, transactionRef } = req.body;
    const idempotencyKey = String(
      req.get('Idempotency-Key') || req.body?.idempotencyKey || ''
    ).trim();

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking is required' });
    }

    const booking = await Booking.findById(bookingId).populate('property');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.renter.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (booking.status !== 'Approved') {
      return res.status(400).json({ error: 'Booking not approved yet' });
    }

    const existingPayment = await Payment.findOne({
      booking: bookingId,
      status: 'Pending',
    });
    if (existingPayment) {
      return res.status(400).json({ error: 'Payment request already submitted for this booking' });
    }

    const paidPayments = await Payment.find({
      booking: bookingId,
      status: 'Paid',
    }).sort({ paymentPeriodEnd: -1, createdAt: -1 });

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const bookingStartMonth = startOfMonth(booking.fromDate || now);

    const latestPaid = paidPayments[0];
    const latestPaidEnd = latestPaid?.paymentPeriodEnd
      ? startOfMonth(latestPaid.paymentPeriodEnd)
      : latestPaid?.createdAt
        ? startOfMonth(latestPaid.createdAt)
        : null;

    const dueStart = latestPaidEnd
      ? addMonths(latestPaidEnd, 1)
      : bookingStartMonth;

    if (dueStart > currentMonthStart) {
      return res.status(400).json({ error: 'No rent due for the current month' });
    }

    const monthsCount = monthDiffInclusive(dueStart, currentMonthStart);
    const monthlyRent = Number(booking.agreedMonthlyRent ?? booking.property?.price ?? 0);
    const amount = monthlyRent * monthsCount;
    const billingPeriodKey = `${toMonthKey(dueStart)}__${toMonthKey(currentMonthEnd)}`;

    if (idempotencyKey) {
      const alreadyCreated = await Payment.findOne({
        booking: bookingId,
        renter: req.user._id,
        idempotencyKey,
      });
      if (alreadyCreated) {
        return res.status(200).json({
          message: 'Payment request already created for this idempotency key',
          payment: alreadyCreated,
          deduplicated: true,
        });
      }
    }

    const existingPeriodPayment = await Payment.findOne({
      booking: bookingId,
      status: { $in: ['Pending', 'Paid'] },
      $or: [
        { billingPeriodKey },
        { paymentPeriodStart: dueStart, paymentPeriodEnd: currentMonthEnd },
      ],
    }).sort({ createdAt: -1 });

    if (existingPeriodPayment) {
      return res.status(200).json({
        message: 'Payment request already exists for this billing period',
        payment: existingPeriodPayment,
        deduplicated: true,
      });
    }

    const payment = new Payment({
      booking: bookingId,
      renter: req.user._id,
      amount,
      paymentMethod,
      pid,
      transactionRef,
      idempotencyKey: idempotencyKey || undefined,
      billingPeriodKey,
      monthsCount,
      paymentPeriodStart: dueStart,
      paymentPeriodEnd: currentMonthEnd,
      status: 'Pending',
    });

    try {
      await payment.save();
    } catch (saveError) {
      // Handle duplicate retries gracefully if save raced.
      if (saveError?.code === 11000 && idempotencyKey) {
        const existing = await Payment.findOne({
          booking: bookingId,
          renter: req.user._id,
          idempotencyKey,
        });
        if (existing) {
          return res.status(200).json({
            message: 'Payment request already created for this idempotency key',
            payment: existing,
            deduplicated: true,
          });
        }
      }
      throw saveError;
    }
    await Booking.findByIdAndUpdate(bookingId, { paymentStatus: 'pending_verification' });

    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await sendNotification(
        admin._id,
        'payment',
        `Payment verification requested for "${booking.property.title}"`,
        '/admin'
      );
    }

    await sendNotification(
      req.user._id,
      'payment',
      `Payment request submitted for "${booking.property.title}". Waiting for admin verification.`,
      `/renter/payments`
    );

    res.status(201).json({
      message: 'Payment submitted for admin verification',
      payment,
      due: {
        from: dueStart,
        to: currentMonthEnd,
        monthsCount,
        amount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify', protect, async (req, res) => {
  return res.status(410).json({ error: 'Khalti verification disabled. Use admin manual verification flow.' });
});

router.get('/history', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ renter: req.user._id })
      .populate({
        path: 'booking',
        populate: { path: 'property', select: 'title price ownerId' },
      })
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/owner/status', protect, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can access payment status summary' });
    }

    const ownerProperties = await Property.find({ ownerId: req.user._id }).select('_id title price');
    const propertyIds = ownerProperties.map((p) => p._id);
    if (propertyIds.length === 0) {
      return res.json({
        summary: {
          totalApprovedBookings: 0,
          paidByRenter: 0,
          pendingFromRenter: 0,
          transferredToOwner: 0,
          allocatedAmount: 0,
          transferredAmount: 0,
          pendingTransferAmount: 0,
        },
        payoutTrend: [],
        rows: [],
      });
    }

    const approvedBookings = await Booking.find({ property: { $in: propertyIds }, status: 'Approved' })
      .populate('property', 'title price')
      .populate('renter', 'name email')
      .sort({ createdAt: -1 });

    const bookingIds = approvedBookings.map((b) => b._id);
    const payments = await Payment.find({ booking: { $in: bookingIds } }).sort({ createdAt: -1 });

    const latestPaymentByBooking = {};
    payments.forEach((payment) => {
      const bookingId = payment.booking?.toString();
      if (bookingId && !latestPaymentByBooking[bookingId]) {
        latestPaymentByBooking[bookingId] = payment;
      }
    });

    const rows = approvedBookings.map((booking) => {
      const latestPayment = latestPaymentByBooking[booking._id.toString()];
      const renterPaymentStatus =
        latestPayment?.status === 'Paid'
          ? 'Paid'
          : latestPayment?.status === 'Pending'
            ? 'Pending Verification'
            : 'Unpaid';

      const ownerPayoutStatus =
        latestPayment?.status === 'Paid'
          ? latestPayment?.payoutStatus || 'Unallocated'
          : 'Not Eligible';

      return {
        bookingId: booking._id,
        propertyId: booking.property?._id,
        propertyTitle: booking.property?.title || 'Unknown property',
        renterName: booking.renter?.name || booking.renter?.email || 'Unknown renter',
        renterEmail: booking.renter?.email || '',
        monthlyRent: (booking.agreedMonthlyRent ?? booking.property?.price ?? 0),
        bookingFrom: booking.fromDate,
        renterPaymentStatus,
        latestPaymentAmount: latestPayment?.amount || 0,
        latestPaymentAt: latestPayment?.createdAt || null,
        ownerPayoutStatus,
        ownerAmount: latestPayment?.ownerAmount || 0,
        commissionAmount: latestPayment?.commissionAmount || 0,
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalApprovedBookings += 1;
        if (row.renterPaymentStatus === 'Paid') acc.paidByRenter += 1;
        if (row.renterPaymentStatus !== 'Paid') acc.pendingFromRenter += 1;
        if (row.ownerPayoutStatus === 'Transferred') acc.transferredToOwner += 1;
        return acc;
      },
      {
        totalApprovedBookings: 0,
        paidByRenter: 0,
        pendingFromRenter: 0,
        transferredToOwner: 0,
        allocatedAmount: 0,
        transferredAmount: 0,
        pendingTransferAmount: 0,
      }
    );

    const paidOwnerPayments = payments.filter((payment) => payment.status === 'Paid');
    paidOwnerPayments.forEach((payment) => {
      const ownerAmount = Number(payment.ownerAmount || 0);
      if (payment.payoutStatus === 'Allocated') {
        summary.allocatedAmount += ownerAmount;
        summary.pendingTransferAmount += ownerAmount;
      } else if (payment.payoutStatus === 'Transferred') {
        summary.transferredAmount += ownerAmount;
      } else {
        summary.pendingTransferAmount += ownerAmount;
      }
    });

    summary.allocatedAmount = Number(summary.allocatedAmount.toFixed(2));
    summary.transferredAmount = Number(summary.transferredAmount.toFixed(2));
    summary.pendingTransferAmount = Number(summary.pendingTransferAmount.toFixed(2));

    const monthBuckets = new Map();
    const currentMonth = startOfMonth(new Date());
    for (let i = 5; i >= 0; i -= 1) {
      const monthDate = addMonths(currentMonth, -i);
      const monthKey = monthDate.toISOString().slice(0, 7);
      monthBuckets.set(monthKey, { month: monthKey, allocated: 0, transferred: 0, pendingTransfer: 0 });
    }

    paidOwnerPayments.forEach((payment) => {
      const monthKey = new Date(payment.createdAt).toISOString().slice(0, 7);
      if (!monthBuckets.has(monthKey)) return;
      const bucket = monthBuckets.get(monthKey);
      const ownerAmount = Number(payment.ownerAmount || 0);
      if (payment.payoutStatus === 'Allocated') {
        bucket.allocated += ownerAmount;
        bucket.pendingTransfer += ownerAmount;
      } else if (payment.payoutStatus === 'Transferred') {
        bucket.transferred += ownerAmount;
      } else {
        bucket.pendingTransfer += ownerAmount;
      }
    });

    const payoutTrend = Array.from(monthBuckets.values()).map((row) => ({
      ...row,
      allocated: Number(row.allocated.toFixed(2)),
      transferred: Number(row.transferred.toFixed(2)),
      pendingTransfer: Number(row.pendingTransfer.toFixed(2)),
    }));

    return res.json({ summary, payoutTrend, rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch owner payment status' });
  }
});

router.get('/:paymentId/invoice', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate({
        path: 'booking',
        populate: { path: 'property', populate: { path: 'ownerId', select: 'name email' } },
      })
      .populate('renter', 'name email');

    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const booking = payment.booking;
    const ownerId = booking?.property?.ownerId?._id?.toString();

    if (
      payment.renter._id.toString() !== req.user._id.toString() &&
      ownerId !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const invoice = {
      invoiceNumber: `INV-${payment._id.toString().slice(-6).toUpperCase()}`,
      issuedAt: payment.updatedAt || payment.createdAt,
      status: payment.status,
      renter: payment.renter,
      owner: booking?.property?.ownerId,
      property: booking?.property,
      bookingPeriod: {
        from: booking?.fromDate,
        to: booking?.toDate,
      },
      paymentPeriod: {
        from: payment.paymentPeriodStart || payment.createdAt,
        to: payment.paymentPeriodEnd || payment.createdAt,
        monthsCount: payment.monthsCount || 1,
      },
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
    };

    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
