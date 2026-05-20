import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import Agreement from '../models/Agreement.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import LeaseAmendment from '../models/LeaseAmendment.js';
import DepositLedgerEntry from '../models/DepositLedgerEntry.js';
import BookingAuditLog from '../models/BookingAuditLog.js';
import { sendNotification } from '../socket.js';
import { sendNewBookingNotification, sendBookingStatusNotification } from '../cronJobs/paymentReminder.js';

const WORKFLOW_STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'agreement_signed', label: 'Agreement Signed' },
  { key: 'paid', label: 'Paid' },
  { key: 'moved_in', label: 'Moved In' },
];

const stageLabelMap = {
  requested: 'Requested',
  accepted: 'Accepted',
  agreement_signed: 'Agreement Signed',
  paid: 'Paid',
  moved_in: 'Moved In',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const toStartOfDay = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getActiveAgreementVersion = (agreement) => {
  if (!agreement) return null;
  const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
  return (
    versions.find((version) => Number(version.version) === Number(agreement.currentVersion)) ||
    versions[versions.length - 1] ||
    null
  );
};

const findOverlappingApprovedBooking = async ({ propertyId, fromDate, toDate, excludeBookingId = null }) => {
  const filter = {
    property: propertyId,
    status: 'Approved',
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate },
  };

  if (excludeBookingId) {
    filter._id = { $ne: excludeBookingId };
  }

  return Booking.findOne(filter).select('_id fromDate toDate renter').lean();
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLATION_POLICY = {
  fullRefundDays: 7,
  partialRefundDays: 2,
  partialPenaltyPct: 25,
  latePenaltyPct: 50,
};

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getPaidAmountForBooking = async (bookingId) => {
  const rows = await Payment.aggregate([
    { $match: { booking: bookingId, status: 'Paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return Number(rows[0]?.total || 0);
};

const buildCancellationResult = ({ booking, paidAmount }) => {
  const now = new Date();
  const start = toStartOfDay(booking.fromDate || now);
  const today = toStartOfDay(now);
  const daysBeforeStart = Math.floor((start.getTime() - today.getTime()) / DAY_MS);

  let penaltyPercent = 0;
  if (booking.status === 'Approved') {
    if (daysBeforeStart >= CANCELLATION_POLICY.fullRefundDays) penaltyPercent = 0;
    else if (daysBeforeStart >= CANCELLATION_POLICY.partialRefundDays) penaltyPercent = CANCELLATION_POLICY.partialPenaltyPct;
    else penaltyPercent = CANCELLATION_POLICY.latePenaltyPct;
  }

  const penaltyAmount = round2((paidAmount * penaltyPercent) / 100);
  const refundAmount = round2(Math.max(0, paidAmount - penaltyAmount));
  return {
    daysBeforeStart,
    penaltyPercent,
    penaltyAmount,
    refundAmount,
  };
};

const getBookingPartyInfo = async (bookingId) => {
  const booking = await Booking.findById(bookingId).populate({
    path: 'property',
    select: 'ownerId title',
  });
  if (!booking) return { booking: null };
  return {
    booking,
    ownerId: booking.property?.ownerId?.toString(),
    renterId: booking.renter?.toString(),
  };
};

const assertBookingAccess = ({ reqUser, ownerId, renterId }) => {
  if (reqUser.role === 'admin') return true;
  return reqUser._id.toString() === ownerId || reqUser._id.toString() === renterId;
};

const appendBookingAudit = async (booking, reqUser, action, details = {}) => {
  try {
    await BookingAuditLog.create({
      booking: booking._id,
      property: booking.property?._id || booking.property,
      actor: reqUser._id,
      actorRole: reqUser.role,
      action,
      details,
    });
  } catch (error) {
    console.error('Booking audit log failed:', error.message);
  }
};

const buildBookingWorkflow = (bookingDoc, agreementDoc, paidPaymentSummary) => {
  const status = bookingDoc.status || 'Pending';
  const approved = status === 'Approved';
  const rejected = status === 'Rejected';
  const cancelled = status === 'Cancelled';

  const activeAgreementVersion = getActiveAgreementVersion(agreementDoc);
  const agreementSigned = approved && activeAgreementVersion?.status === 'fully_signed';
  const paid = agreementSigned && Boolean(paidPaymentSummary);

  const fromDate = bookingDoc.fromDate ? new Date(bookingDoc.fromDate) : null;
  const movedIn =
    paid &&
    fromDate &&
    toStartOfDay(new Date()) >= toStartOfDay(fromDate);

  let stage = 'requested';
  if (rejected) stage = 'rejected';
  else if (cancelled) stage = 'cancelled';
  else if (movedIn) stage = 'moved_in';
  else if (paid) stage = 'paid';
  else if (agreementSigned) stage = 'agreement_signed';
  else if (approved) stage = 'accepted';

  const requestedAt = bookingDoc.createdAt || bookingDoc.fromDate || null;
  const acceptedAt = bookingDoc.acceptedAt || null;
  const rejectedAt = bookingDoc.rejectedAt || null;
  const agreementSignedAt =
    activeAgreementVersion?.renterSignedAt ||
    activeAgreementVersion?.ownerSignedAt ||
    null;
  const paidAt = paidPaymentSummary?.paidAt || null;
  const movedInAt = movedIn && fromDate ? fromDate : null;

  const stepTimeMap = {
    requested: requestedAt,
    accepted: acceptedAt,
    agreement_signed: agreementSignedAt,
    paid: paidAt,
    moved_in: movedInAt,
  };

  const stageIndex = WORKFLOW_STEPS.findIndex((step) => step.key === stage);
  const steps = WORKFLOW_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    completed: stage !== 'rejected' && index <= stageIndex,
    active: stage !== 'rejected' && index === stageIndex,
    at: stepTimeMap[step.key] || null,
  }));

  return {
    stage,
    label: stageLabelMap[stage] || 'Requested',
    rejected,
    requestedAt,
    acceptedAt,
    rejectedAt,
    agreementSignedAt,
    paidAt,
    movedInAt,
    flags: {
      approved,
      agreementSigned,
      paid,
      movedIn,
      cancelled,
    },
    steps,
  };
};

const decorateBookingsWithWorkflow = async (bookings = []) => {
  if (!Array.isArray(bookings) || !bookings.length) return [];

  const bookingDocs = bookings.map((booking) =>
    typeof booking.toObject === 'function' ? booking.toObject() : booking
  );
  const bookingIds = bookingDocs.map((booking) => booking._id);

  const [agreements, paidPayments] = await Promise.all([
    Agreement.find({ booking: { $in: bookingIds } })
      .select('booking currentVersion versions')
      .lean(),
    Payment.aggregate([
      { $match: { booking: { $in: bookingIds }, status: 'Paid' } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$booking',
          paidAt: { $first: '$createdAt' },
          paymentId: { $first: '$_id' },
        },
      },
    ]),
  ]);

  const agreementMap = new Map(
    agreements.map((agreement) => [agreement.booking.toString(), agreement])
  );
  const paidPaymentMap = new Map(
    paidPayments.map((payment) => [payment._id.toString(), payment])
  );

  return bookingDocs.map((booking) => {
    const bookingId = booking._id.toString();
    const workflow = buildBookingWorkflow(
      booking,
      agreementMap.get(bookingId),
      paidPaymentMap.get(bookingId)
    );
    return {
      ...booking,
      workflow,
    };
  });
};

// ==========================
// CREATE BOOKING
// ==========================
export const createBooking = async (req, res) => {
  const { propertyId, fromDate, toDate, bookingDetails = {} } = req.body;

  if (!propertyId || !fromDate) {
    return res.status(400).json({ error: 'Property ID and fromDate are required' });
  }

  if (!bookingDetails.fullName || !bookingDetails.phone || !bookingDetails.occupants) {
    return res.status(400).json({
      error: 'Full name, phone number, and number of occupants are required',
    });
  }

  try {
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate || fromDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid booking dates' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'toDate cannot be earlier than fromDate' });
    }

    // Prevent overlapping reservations for the same property.
    const overlappingBooking = await Booking.findOne({
      property: propertyId,
      status: { $in: ['Pending', 'Approved'] },
      fromDate: { $lte: endDate },
      toDate: { $gte: startDate },
    });

    if (overlappingBooking) {
      return res.status(409).json({
        error: 'This property is already booked for the selected date range',
      });
    }

    const property = await Property.findById(propertyId).select('title ownerId price');
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const booking = new Booking({
      property: propertyId,
      renter: req.user._id,
      fromDate: startDate,
      toDate: endDate,
      agreedMonthlyRent: Number(property?.price || 0),
      bookingDetails: {
        fullName: bookingDetails.fullName,
        phone: bookingDetails.phone,
        email: bookingDetails.email,
        occupants: Number(bookingDetails.occupants),
        employmentStatus: bookingDetails.employmentStatus,
        monthlyIncome: bookingDetails.monthlyIncome ? Number(bookingDetails.monthlyIncome) : undefined,
        moveInReason: bookingDetails.moveInReason,
        emergencyContactName: bookingDetails.emergencyContactName,
        emergencyContactPhone: bookingDetails.emergencyContactPhone,
        noteToOwner: bookingDetails.noteToOwner,
      },
      acceptedAt: null,
      rejectedAt: null,
    });

    await booking.save();
    await appendBookingAudit(booking, req.user, 'booking_created', {
      fromDate: startDate,
      toDate: endDate,
    });

    // ✅ Notify property owner about new booking
    if (property && property.ownerId) {
      await sendNewBookingNotification(property.ownerId, property.title, booking._id);
    }

    const [decoratedBooking] = await decorateBookingsWithWorkflow([booking]);
    res.status(201).json({ message: 'Booking successful', booking: decoratedBooking || booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ==========================
// GET BOOKINGS OF CURRENT RENTER
// ==========================
export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ renter: req.user._id }).populate('property');
    const decorated = await decorateBookingsWithWorkflow(bookings);
    res.json(decorated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while fetching bookings' });
  }
};

// ==========================
// GET BOOKINGS OF OWNER
// ==========================
export const getOwnerBookings = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const ownerProperties = await Property.find({ ownerId }).select('_id').lean();
    const ownerPropertyIds = ownerProperties.map((p) => p._id);

    if (!ownerPropertyIds.length) {
      return res.status(200).json([]);
    }

    const bookings = await Booking.find({ property: { $in: ownerPropertyIds } })
      .populate('property')
      .populate('renter', 'name email');

    const decorated = await decorateBookingsWithWorkflow(bookings);
    res.status(200).json(decorated);
  } catch (err) {
    console.error('❌ Error in getOwnerBookings:', err.message);
    res.status(500).json({ error: 'Failed to fetch owner bookings' });
  }
};

// ==========================
// UPDATE BOOKING STATUS
// ==========================
export const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['Approved', 'Rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const booking = await Booking.findById(id).populate({
      path: 'property',
      select: 'ownerId title',
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (status === 'Approved') {
      const overlap = await findOverlappingApprovedBooking({
        propertyId: booking.property._id,
        fromDate: booking.fromDate,
        toDate: booking.toDate,
        excludeBookingId: booking._id,
      });
      if (overlap) {
        return res.status(409).json({
          error: 'Cannot approve booking due to overlap with an existing approved booking',
        });
      }
    }

    booking.status = status;
    if (status === 'Approved') {
      booking.acceptedAt = new Date();
      booking.rejectedAt = null;
    } else if (status === 'Rejected') {
      booking.rejectedAt = new Date();
      booking.acceptedAt = null;
    }
    await booking.save();
    await appendBookingAudit(booking, req.user, 'booking_status_updated', { status });

    // ✅ Notify renter about booking status update
    await sendBookingStatusNotification(
      booking.renter,
      status.toLowerCase(),
      booking.property.title,
      booking._id
    );

    const [decoratedBooking] = await decorateBookingsWithWorkflow([booking]);
    res.status(200).json({ message: 'Status updated', booking: decoratedBooking || booking });
  } catch (err) {
    console.error('Error updating booking status:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// ==========================
// GET APPROVED BOOKINGS FOR A RENTER
// ==========================
export const getApprovedBookings = async (req, res) => {
  try {
    const requestedRenterId = req.params.renterId;
    let renterId = requestedRenterId;
    let bookingFilter = { status: 'Approved' };

    if (req.user.role === 'renter') {
      if (req.user._id.toString() !== requestedRenterId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      renterId = req.user._id;
      bookingFilter.renter = renterId;
    } else if (req.user.role === 'owner') {
      const ownerProperties = await Property.find({ ownerId: req.user._id }).select('_id').lean();
      const ownerPropertyIds = ownerProperties.map((property) => property._id);
      if (!ownerPropertyIds.length) return res.json([]);
      bookingFilter = {
        ...bookingFilter,
        renter: renterId,
        property: { $in: ownerPropertyIds },
      };
    } else if (req.user.role === 'admin') {
      bookingFilter.renter = renterId;
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const bookings = await Booking.find(bookingFilter).populate('property');
    const decorated = await decorateBookingsWithWorkflow(bookings);
    res.json(decorated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch bookings" });
  }
};

export const renewBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const months = Math.max(1, Math.min(Number(req.body?.months || 1), 12));
    const note = String(req.body?.note || '').trim();

    const booking = await Booking.findById(id).populate('property');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isRenter = booking.renter.toString() === req.user._id.toString();
    const isOwner = booking.property?.ownerId?.toString() === req.user._id.toString();
    if (!isRenter && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to renew this booking' });
    }

    if (booking.status !== 'Approved') {
      return res.status(400).json({ error: 'Only approved bookings can be renewed' });
    }

    const renterUser = await User.findById(booking.renter).select('name');
    const propertyTitle = booking.property?.title || 'property';
    if (isRenter && !isOwner && req.user.role !== 'admin') {
      booking.renewalStatus = 'pending';
      booking.renewalRequestedAt = new Date();
      booking.renewalApprovedAt = null;
      booking.renewalMonths = months;
      booking.renewalNote = note;
      await booking.save();

      if (booking.property?.ownerId) {
        await sendNotification(
          booking.property.ownerId,
          'leaseRenewal',
          `${renterUser?.name || 'Renter'} requested lease renewal for "${propertyTitle}" (${months} month(s)).`,
          '/owner/requests'
        );
      }

      const [decoratedPending] = await decorateBookingsWithWorkflow([booking]);
      return res.json({
        success: true,
        mode: 'requested',
        message: 'Renewal request sent to owner',
        booking: decoratedPending || booking,
      });
    }

    const currentEnd = booking.toDate ? new Date(booking.toDate) : new Date(booking.fromDate);
    const renewedEnd = new Date(currentEnd);
    renewedEnd.setMonth(renewedEnd.getMonth() + months);

    const overlap = await findOverlappingApprovedBooking({
      propertyId: booking.property?._id || booking.property,
      fromDate: booking.fromDate,
      toDate: renewedEnd,
      excludeBookingId: booking._id,
    });
    if (overlap) {
      return res.status(409).json({
        error: 'Cannot renew booking because it overlaps another approved booking',
      });
    }

    booking.toDate = renewedEnd;
    booking.renewalStatus = 'approved';
    booking.renewalRequestedAt = booking.renewalRequestedAt || new Date();
    booking.renewalApprovedAt = new Date();
    booking.renewalMonths = months;
    booking.renewalNote = note || booking.renewalNote;
    await booking.save();
    await appendBookingAudit(booking, req.user, 'booking_renewed', {
      months,
      renewedToDate: renewedEnd,
    });

    await sendNotification(
      booking.renter,
      'leaseRenewal',
      `Your booking for "${propertyTitle}" has been renewed by ${months} month(s).`,
      '/renter/bookings'
    );

    const [decorated] = await decorateBookingsWithWorkflow([booking]);
    return res.json({
      success: true,
      mode: 'approved',
      message: 'Lease renewed successfully',
      booking: decorated || booking,
    });
  } catch (err) {
    console.error('renewBooking error:', err);
    return res.status(500).json({ error: 'Failed to renew booking' });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    if (['Rejected', 'Cancelled'].includes(booking.status)) {
      return res.status(400).json({ error: `Booking is already ${booking.status.toLowerCase()}` });
    }

    const paidAmount = await getPaidAmountForBooking(booking._id);
    const decision = buildCancellationResult({ booking, paidAmount });

    booking.status = 'Cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user._id;
    booking.cancelledByRole = req.user.role;
    booking.cancellationReason = reason;
    booking.cancellationPenaltyPercent = decision.penaltyPercent;
    booking.cancellationPenaltyAmount = decision.penaltyAmount;
    booking.cancellationRefundAmount = decision.refundAmount;
    await booking.save();

    await appendBookingAudit(booking, req.user, 'booking_cancelled', {
      reason,
      ...decision,
      paidAmount,
    });

    const counterpartyId =
      req.user._id.toString() === renterId ? ownerId : renterId;
    if (counterpartyId) {
      await sendNotification(
        counterpartyId,
        'bookingRejected',
        `Booking "${booking.property?.title || ''}" was cancelled. Penalty ${decision.penaltyPercent}%`,
        '/bookings'
      );
    }

    return res.json({
      success: true,
      message: 'Booking cancelled',
      cancellation: {
        paidAmount: round2(paidAmount),
        ...decision,
        policy: CANCELLATION_POLICY,
      },
      booking,
    });
  } catch (error) {
    console.error('cancelBooking error:', error);
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

export const requestLeaseAmendment = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized to amend this booking' });
    }
    if (booking.status !== 'Approved') {
      return res.status(400).json({ error: 'Only approved bookings can be amended' });
    }

    const proposedFromDate = req.body?.proposedFromDate ? new Date(req.body.proposedFromDate) : null;
    const proposedToDate = req.body?.proposedToDate ? new Date(req.body.proposedToDate) : null;
    const proposedMonthlyRent = req.body?.proposedMonthlyRent == null ? null : Number(req.body.proposedMonthlyRent);
    const reason = String(req.body?.reason || '').trim();

    if (
      !proposedFromDate &&
      !proposedToDate &&
      (proposedMonthlyRent == null || Number.isNaN(proposedMonthlyRent))
    ) {
      return res.status(400).json({ error: 'Provide at least one amendment field' });
    }
    if (proposedFromDate && Number.isNaN(proposedFromDate.getTime())) {
      return res.status(400).json({ error: 'Invalid proposedFromDate' });
    }
    if (proposedToDate && Number.isNaN(proposedToDate.getTime())) {
      return res.status(400).json({ error: 'Invalid proposedToDate' });
    }
    if (proposedMonthlyRent != null && (!Number.isFinite(proposedMonthlyRent) || proposedMonthlyRent < 0)) {
      return res.status(400).json({ error: 'Invalid proposedMonthlyRent' });
    }

    const existingPending = await LeaseAmendment.findOne({ booking: booking._id, status: 'pending' });
    if (existingPending) {
      return res.status(409).json({ error: 'Another amendment request is already pending' });
    }

    const amendment = await LeaseAmendment.create({
      booking: booking._id,
      property: booking.property?._id || booking.property,
      requestedBy: req.user._id,
      requestedByRole: req.user.role,
      proposedFromDate: proposedFromDate || undefined,
      proposedToDate: proposedToDate || undefined,
      proposedMonthlyRent: proposedMonthlyRent == null ? undefined : proposedMonthlyRent,
      reason,
      status: 'pending',
    });

    await appendBookingAudit(booking, req.user, 'lease_amendment_requested', {
      amendmentId: amendment._id,
      proposedFromDate,
      proposedToDate,
      proposedMonthlyRent,
      reason,
    });

    const counterpartyId = req.user._id.toString() === renterId ? ownerId : renterId;
    if (counterpartyId) {
      await sendNotification(
        counterpartyId,
        'leaseRenewal',
        `New lease amendment request for "${booking.property?.title || 'property'}"`,
        '/bookings'
      );
    }

    return res.status(201).json({ success: true, amendment });
  } catch (error) {
    console.error('requestLeaseAmendment error:', error);
    return res.status(500).json({ error: 'Failed to request amendment' });
  }
};

export const listLeaseAmendments = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amendments = await LeaseAmendment.find({ booking: booking._id })
      .populate('requestedBy', 'name email role')
      .populate('decidedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({ items: amendments });
  } catch (error) {
    console.error('listLeaseAmendments error:', error);
    return res.status(500).json({ error: 'Failed to fetch amendments' });
  }
};

export const decideLeaseAmendment = async (req, res) => {
  try {
    const { id, amendmentId } = req.params;
    const nextStatus = String(req.body?.status || '').toLowerCase();
    const decisionNote = String(req.body?.decisionNote || '').trim();

    if (!['approved', 'rejected', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid amendment status' });
    }

    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amendment = await LeaseAmendment.findOne({ _id: amendmentId, booking: booking._id });
    if (!amendment) return res.status(404).json({ error: 'Amendment not found' });
    if (amendment.status !== 'pending') {
      return res.status(400).json({ error: 'Amendment already decided' });
    }

    const requesterId = amendment.requestedBy?.toString();
    const isRequester = requesterId && requesterId === req.user._id.toString();
    const isOwner = req.user._id.toString() === ownerId;

    if (nextStatus === 'cancelled') {
      if (!isRequester && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only requester can cancel amendment' });
      }
    } else if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner/admin can approve or reject amendment' });
    }

    if (nextStatus === 'approved') {
      const targetFrom = amendment.proposedFromDate || booking.fromDate;
      const targetTo = amendment.proposedToDate || booking.toDate;
      if (new Date(targetTo) < new Date(targetFrom)) {
        return res.status(400).json({ error: 'Amendment date range is invalid' });
      }

      const overlap = await findOverlappingApprovedBooking({
        propertyId: booking.property?._id || booking.property,
        fromDate: targetFrom,
        toDate: targetTo,
        excludeBookingId: booking._id,
      });
      if (overlap) {
        return res.status(409).json({ error: 'Approved amendment would overlap another approved booking' });
      }

      booking.fromDate = targetFrom;
      booking.toDate = targetTo;
      if (Number.isFinite(amendment.proposedMonthlyRent)) {
        booking.agreedMonthlyRent = amendment.proposedMonthlyRent;
      }
      await booking.save();
      amendment.appliedAt = new Date();
    }

    amendment.status = nextStatus;
    amendment.decisionNote = decisionNote;
    amendment.decidedBy = req.user._id;
    amendment.decidedByRole = req.user.role;
    amendment.decidedAt = new Date();
    await amendment.save();

    await appendBookingAudit(booking, req.user, 'lease_amendment_decided', {
      amendmentId: amendment._id,
      status: nextStatus,
      decisionNote,
    });

    return res.json({ success: true, amendment, booking });
  } catch (error) {
    console.error('decideLeaseAmendment error:', error);
    return res.status(500).json({ error: 'Failed to decide amendment' });
  }
};

const getDepositLedgerSummary = (entries = []) => {
  const summary = {
    received: 0,
    deductionsApproved: 0,
    refundsPaid: 0,
    pending: 0,
    netHeld: 0,
  };

  entries.forEach((entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === 'deposit_received' && ['recorded', 'approved', 'paid'].includes(entry.status)) {
      summary.received += amount;
    }
    if (entry.type === 'deduction' && entry.status === 'approved') {
      summary.deductionsApproved += amount;
    }
    if (entry.type === 'refund_paid' && entry.status === 'paid') {
      summary.refundsPaid += amount;
    }
    if (entry.status === 'pending') {
      summary.pending += amount;
    }
  });

  summary.netHeld = round2(summary.received - summary.deductionsApproved - summary.refundsPaid);
  Object.keys(summary).forEach((key) => {
    summary[key] = round2(summary[key]);
  });
  return summary;
};

export const getDepositLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const entries = await DepositLedgerEntry.find({ booking: booking._id })
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({
      summary: getDepositLedgerSummary(entries),
      items: entries,
    });
  } catch (error) {
    console.error('getDepositLedger error:', error);
    return res.status(500).json({ error: 'Failed to fetch deposit ledger' });
  }
};

const createDepositEntry = async ({
  booking,
  reqUser,
  type,
  amount,
  reason = '',
  note = '',
  status = 'recorded',
  metadata = {},
}) => {
  return DepositLedgerEntry.create({
    booking: booking._id,
    property: booking.property?._id || booking.property,
    renter: booking.renter,
    owner: booking.property?.ownerId || booking.owner,
    type,
    amount: round2(amount),
    reason,
    note,
    status,
    metadata,
    createdBy: reqUser._id,
    createdByRole: reqUser.role,
  });
};

export const receiveDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason || 'Security deposit received');
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (![ownerId, renterId].includes(req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const entry = await createDepositEntry({
      booking,
      reqUser: req.user,
      type: 'deposit_received',
      amount,
      reason,
      note,
      status: 'recorded',
    });

    await appendBookingAudit(booking, req.user, 'deposit_recorded', { entryId: entry._id, amount });
    return res.status(201).json({ success: true, entry });
  } catch (error) {
    console.error('receiveDeposit error:', error);
    return res.status(500).json({ error: 'Failed to record deposit' });
  }
};

export const addDepositDeduction = async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const { booking, ownerId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (req.user._id.toString() !== ownerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner/admin can add deductions' });
    }

    const entry = await createDepositEntry({
      booking,
      reqUser: req.user,
      type: 'deduction',
      amount,
      reason,
      note,
      status: 'pending',
    });
    await appendBookingAudit(booking, req.user, 'deposit_deduction_requested', { entryId: entry._id, amount, reason });
    return res.status(201).json({ success: true, entry });
  } catch (error) {
    console.error('addDepositDeduction error:', error);
    return res.status(500).json({ error: 'Failed to add deduction' });
  }
};

export const requestDepositRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (![ownerId, renterId].includes(req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const entry = await createDepositEntry({
      booking,
      reqUser: req.user,
      type: 'refund_requested',
      amount,
      reason,
      note,
      status: 'pending',
    });
    await appendBookingAudit(booking, req.user, 'deposit_refund_requested', { entryId: entry._id, amount, reason });
    return res.status(201).json({ success: true, entry });
  } catch (error) {
    console.error('requestDepositRefund error:', error);
    return res.status(500).json({ error: 'Failed to request refund' });
  }
};

const ensureLedgerDecisionPermission = ({ reqUser, bookingOwnerId, entryType }) => {
  if (reqUser.role === 'admin') return true;
  if (entryType === 'deduction') return reqUser._id.toString() !== bookingOwnerId;
  if (entryType === 'refund_requested') return reqUser._id.toString() === bookingOwnerId;
  return false;
};

export const approveDepositEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { booking, ownerId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const entry = await DepositLedgerEntry.findOne({ _id: entryId, booking: booking._id });
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
    if (entry.status !== 'pending') return res.status(400).json({ error: 'Entry is not pending' });

    if (!ensureLedgerDecisionPermission({ reqUser: req.user, bookingOwnerId: ownerId, entryType: entry.type })) {
      return res.status(403).json({ error: 'Not authorized to approve this entry' });
    }

    entry.status = 'approved';
    entry.approvedBy = req.user._id;
    entry.approvedByRole = req.user.role;
    entry.approvedAt = new Date();
    entry.note = String(req.body?.note || entry.note || '');
    await entry.save();

    await appendBookingAudit(booking, req.user, 'deposit_entry_approved', { entryId: entry._id, type: entry.type, amount: entry.amount });
    return res.json({ success: true, entry });
  } catch (error) {
    console.error('approveDepositEntry error:', error);
    return res.status(500).json({ error: 'Failed to approve entry' });
  }
};

export const rejectDepositEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { booking, ownerId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const entry = await DepositLedgerEntry.findOne({ _id: entryId, booking: booking._id });
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
    if (entry.status !== 'pending') return res.status(400).json({ error: 'Entry is not pending' });

    if (!ensureLedgerDecisionPermission({ reqUser: req.user, bookingOwnerId: ownerId, entryType: entry.type })) {
      return res.status(403).json({ error: 'Not authorized to reject this entry' });
    }

    entry.status = 'rejected';
    entry.approvedBy = req.user._id;
    entry.approvedByRole = req.user.role;
    entry.approvedAt = new Date();
    entry.note = String(req.body?.note || entry.note || '');
    await entry.save();

    await appendBookingAudit(booking, req.user, 'deposit_entry_rejected', { entryId: entry._id, type: entry.type, amount: entry.amount });
    return res.json({ success: true, entry });
  } catch (error) {
    console.error('rejectDepositEntry error:', error);
    return res.status(500).json({ error: 'Failed to reject entry' });
  }
};

export const markDepositRefundPaid = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const note = String(req.body?.note || '').trim();
    const { booking, ownerId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (req.user._id.toString() !== ownerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner/admin can mark refund paid' });
    }

    const source = await DepositLedgerEntry.findOne({ _id: entryId, booking: booking._id });
    if (!source) return res.status(404).json({ error: 'Ledger entry not found' });
    if (source.type !== 'refund_requested') return res.status(400).json({ error: 'Only refund request can be paid' });
    if (source.status !== 'approved') return res.status(400).json({ error: 'Refund request must be approved first' });

    source.status = 'paid';
    source.note = [source.note, note].filter(Boolean).join(' | ');
    source.approvedBy = source.approvedBy || req.user._id;
    source.approvedByRole = source.approvedByRole || req.user.role;
    source.approvedAt = source.approvedAt || new Date();
    await source.save();

    const paidEntry = await createDepositEntry({
      booking,
      reqUser: req.user,
      type: 'refund_paid',
      amount: source.amount,
      reason: 'Refund paid',
      note,
      status: 'paid',
      metadata: { sourceEntryId: source._id },
    });

    await appendBookingAudit(booking, req.user, 'deposit_refund_paid', { sourceEntryId: source._id, paidEntryId: paidEntry._id, amount: source.amount });
    return res.json({ success: true, source, paidEntry });
  } catch (error) {
    console.error('markDepositRefundPaid error:', error);
    return res.status(500).json({ error: 'Failed to mark refund paid' });
  }
};

export const getBookingAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking, ownerId, renterId } = await getBookingPartyInfo(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!assertBookingAccess({ reqUser: req.user, ownerId, renterId })) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const rows = await BookingAuditLog.find({ booking: booking._id })
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .limit(500);
    return res.json({ items: rows });
  } catch (error) {
    console.error('getBookingAuditTrail error:', error);
    return res.status(500).json({ error: 'Failed to fetch booking audit trail' });
  }
};
