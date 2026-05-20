import User from '../models/User.js';
import Admin, { PERMISSION_CATALOG, ROLE_PERMISSION_MAP } from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Complaint from '../models/Complaint.js';
import Payment from '../models/Payment.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import AdminSetting from '../models/AdminSetting.js';
import AuditLog from '../models/AuditLog.js';
import Agreement from '../models/Agreement.js';
import AdminAnnotation from '../models/AdminAnnotation.js';
import LeaseAmendment from '../models/LeaseAmendment.js';
import DepositLedgerEntry from '../models/DepositLedgerEntry.js';
import DuplicateCase from '../models/DuplicateCase.js';
import DuplicateMergeOperation from '../models/DuplicateMergeOperation.js';
import { calcMoMChangePct, calcOccupancyRate, calcProfit } from '../utils/kpiMath.js';

const safeRegex = (value) => new RegExp(String(value || '').trim(), 'i');
const parsePage = (value, fallback = 1) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
};
const parseLimit = (value, fallback = 20) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), 100);
};
const sendPaginated = (res, items, total, page, limit) => {
  res.json({
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (smtpHost && smtpUser && smtpPass && smtpFrom) {
    if (!to) return { sent: false, reason: 'missing_recipient' };
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, provider: 'smtp' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: 'email_not_configured' };
  }
  if (!to) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed (${response.status}): ${body}`);
  }
  return { sent: true, provider: 'resend' };
};

const notifyDuplicateMergeUsers = async ({
  sourceUser,
  targetUser,
  operation,
  totalModified,
  docsMoved,
  rollbackWindowMinutes,
}) => {
  const sourceName = sourceUser?.name || sourceUser?.email || 'User';
  const targetName = targetUser?.name || targetUser?.email || 'User';
  const targetEmail = targetUser?.email || '';
  const sourceEmail = sourceUser?.email || '';
  const rollbackUntilText = operation?.rollbackExpiresAt
    ? new Date(operation.rollbackExpiresAt).toLocaleString()
    : '';

  const sourceSubject = 'Duplicate account merged into superior account';
  const sourceText = [
    `Hello ${sourceName},`,
    '',
    'We detected a duplicate identity record and merged your less-superior account into a superior account to keep data consistent.',
    `Superior account: ${targetName} (${targetEmail})`,
    `Records moved: ${Number(totalModified || 0)}`,
    `KYC documents moved: ${Number(docsMoved || 0)}`,
    rollbackUntilText ? `Rollback window (admin): until ${rollbackUntilText}` : '',
    '',
    'You can continue using the superior account credentials.',
  ]
    .filter(Boolean)
    .join('\n');

  const targetSubject = 'Duplicate account consolidated into your account';
  const targetText = [
    `Hello ${targetName},`,
    '',
    'A duplicate account linked to your identity was consolidated into your superior account.',
    `Merged account: ${sourceName} (${sourceEmail})`,
    `Records moved: ${Number(totalModified || 0)}`,
    `KYC documents moved: ${Number(docsMoved || 0)}`,
    rollbackUntilText ? `Rollback window (admin): until ${rollbackUntilText}` : '',
    '',
    'No action is required from you.',
  ]
    .filter(Boolean)
    .join('\n');

  const htmlWrap = (body) => `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-line">${body}</div>`;
  const results = await Promise.allSettled([
    sourceEmail
      ? sendEmail({
          to: sourceEmail,
          subject: sourceSubject,
          text: sourceText,
          html: htmlWrap(sourceText),
        })
      : Promise.resolve({ sent: false, reason: 'missing_source_email' }),
    targetEmail
      ? sendEmail({
          to: targetEmail,
          subject: targetSubject,
          text: targetText,
          html: htmlWrap(targetText),
        })
      : Promise.resolve({ sent: false, reason: 'missing_target_email' }),
  ]);

  await Promise.allSettled([
    sourceUser?._id
      ? Notification.create({
          userId: sourceUser._id,
          type: 'account_merge',
          message: `Duplicate account merged into superior account (${targetName}).`,
          link: '/profile',
        })
      : Promise.resolve(null),
    targetUser?._id
      ? Notification.create({
          userId: targetUser._id,
          type: 'account_merge',
          message: `Duplicate account (${sourceName}) has been consolidated into your account.`,
          link: '/profile',
        })
      : Promise.resolve(null),
  ]);

  return {
    source: results[0].status === 'fulfilled' ? results[0].value : { sent: false, reason: results[0].reason?.message || 'failed' },
    target: results[1].status === 'fulfilled' ? results[1].value : { sent: false, reason: results[1].reason?.message || 'failed' },
  };
};

const toMonthKey = (value) => {
  const date = new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

const parseDateInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toCsvValue = (value) => {
  const normalized =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const startOfMonth = (value = new Date()) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const endOfMonth = (value = new Date()) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

const addMonths = (value, months) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
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

const buildActionableReminders = async () => {
  const reminders = [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [approvedBookings, agreements, payoutsPendingTransfer] = await Promise.all([
    Booking.find({ status: 'Approved', createdAt: { $lte: threeDaysAgo } })
      .select('_id createdAt fromDate toDate')
      .lean(),
    Agreement.find().select('booking currentVersion versions').lean(),
    Payment.countDocuments({
      status: 'Paid',
      payoutStatus: { $ne: 'Transferred' },
      createdAt: { $lte: threeDaysAgo },
    }),
  ]);

  const signedAgreementBookingIds = new Set(
    agreements
      .filter((agreement) => {
        const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
        const active =
          versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
          versions[versions.length - 1];
        return active?.status === 'fully_signed';
      })
      .map((agreement) => String(agreement.booking))
  );

  const unsignedBookingCount = approvedBookings.filter(
    (booking) => !signedAgreementBookingIds.has(String(booking._id))
  ).length;

  if (unsignedBookingCount > 0) {
    reminders.push({
      code: 'agreement_unsigned_over_3_days',
      title: 'Booking approved but agreement unsigned (3+ days)',
      count: unsignedBookingCount,
      severity: 'warning',
    });
  }

  if (payoutsPendingTransfer > 0) {
    reminders.push({
      code: 'paid_not_transferred',
      title: 'Payment paid but owner payout not transferred',
      count: payoutsPendingTransfer,
      severity: 'warning',
    });
  }

  return reminders;
};

const logAudit = async (req, action, entityType, entityId, details = null) => {
  try {
    await AuditLog.create({
      adminId: req.admin?._id,
      action,
      entityType,
      entityId: String(entityId),
      details,
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

export const getOverview = async (_req, res) => {
  try {
    const activityDays = Math.max(1, Math.min(Number(_req.query?.activityDays || 30), 365));
    const activitySince = new Date(Date.now() - activityDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const [users, properties, bookings, complaints, payments, messages] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Booking.countDocuments(),
      Complaint.countDocuments(),
      Payment.countDocuments(),
      Message.countDocuments(),
    ]);

    const [pendingListings, pendingOwnerVerifications, openComplaints, failedPayments] = await Promise.all([
      Property.countDocuments({ status: 'Pending' }),
      User.countDocuments({ ownerVerificationStatus: 'pending' }),
      Complaint.countDocuments({ status: { $ne: 'resolved' } }),
      Payment.countDocuments({ status: 'Failed' }),
    ]);

    const paymentAgg = await Payment.aggregate([
      { $match: { status: 'Paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalOwnerDistributed: {
            $sum: {
              $cond: [
                { $eq: ['$payoutStatus', 'Transferred'] },
                { $ifNull: ['$ownerAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalRevenue = paymentAgg[0]?.totalRevenue || 0;
    const ownerDistributed = paymentAgg[0]?.totalOwnerDistributed || 0;
    const profit = calcProfit(totalRevenue, ownerDistributed);

    const [
      activeBookingRentRows,
      approvedPropertyCount,
      occupiedPropertyRows,
      paidCurrentMonthAgg,
      transferredOwnerCurrentMonthAgg,
    ] = await Promise.all([
      Booking.aggregate([
        {
          $match: {
            status: 'Approved',
            fromDate: { $lte: now },
            toDate: { $gte: now },
          },
        },
        {
          $lookup: {
            from: 'properties',
            localField: 'property',
            foreignField: '_id',
            as: 'property',
          },
        },
        { $unwind: { path: '$property', preserveNullAndEmptyArrays: true } },
        { $project: { monthlyRent: { $ifNull: ['$property.price', 0] }, propertyId: '$property._id' } },
      ]),
      Property.countDocuments({ status: 'Approved' }),
      Booking.aggregate([
        {
          $match: {
            status: 'Approved',
            fromDate: { $lte: now },
            toDate: { $gte: now },
          },
        },
        { $group: { _id: '$property' } },
      ]),
      Payment.aggregate([
        { $match: { status: 'Paid', createdAt: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: 'Paid',
            payoutStatus: 'Transferred',
            createdAt: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: null, ownerAmount: { $sum: { $ifNull: ['$ownerAmount', 0] } } } },
      ]),
    ]);

    const liveMRR = activeBookingRentRows.reduce(
      (sum, row) => sum + Number(row.monthlyRent || 0),
      0
    );
    const realizedMRR = Number(paidCurrentMonthAgg[0]?.amount || 0);
    const ownerDistributedCurrentMonth = Number(transferredOwnerCurrentMonthAgg[0]?.ownerAmount || 0);
    const platformProfitCurrentMonth = calcProfit(realizedMRR, ownerDistributedCurrentMonth);
    const occupiedProperties = occupiedPropertyRows.length;
    const occupancyRate = calcOccupancyRate(occupiedProperties, approvedPropertyCount);

    const payoutSummary = await Payment.aggregate([
      {
        $match: {
          status: 'Paid',
        },
      },
      {
        $group: {
          _id: null,
          allocated: {
            $sum: {
              $cond: [{ $eq: ['$payoutStatus', 'Allocated'] }, { $ifNull: ['$ownerAmount', 0] }, 0],
            },
          },
          transferred: {
            $sum: {
              $cond: [{ $eq: ['$payoutStatus', 'Transferred'] }, { $ifNull: ['$ownerAmount', 0] }, 0],
            },
          },
          pendingTransfer: {
            $sum: {
              $cond: [
                { $in: ['$payoutStatus', ['Unallocated', 'Allocated']] },
                { $ifNull: ['$ownerAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const payoutTrendRows = await Payment.aggregate([
      { $match: { status: 'Paid' } },
      {
        $project: {
          month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          ownerAmount: { $ifNull: ['$ownerAmount', 0] },
          payoutStatus: '$payoutStatus',
        },
      },
      {
        $group: {
          _id: '$month',
          allocated: {
            $sum: {
              $cond: [{ $eq: ['$payoutStatus', 'Allocated'] }, '$ownerAmount', 0],
            },
          },
          transferred: {
            $sum: {
              $cond: [{ $eq: ['$payoutStatus', 'Transferred'] }, '$ownerAmount', 0],
            },
          },
          pendingTransfer: {
            $sum: {
              $cond: [{ $in: ['$payoutStatus', ['Unallocated', 'Allocated']] }, '$ownerAmount', 0],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 6 },
      { $sort: { _id: 1 } },
    ]);

    const [recentActivity, actionableReminders] = await Promise.all([
      AuditLog.find({ createdAt: { $gte: activitySince } }).sort({ createdAt: -1 }).limit(15),
      buildActionableReminders(),
    ]);

    res.json({
      totals: {
        users,
        properties,
        bookings,
        complaints,
        payments,
        messages,
        revenue: totalRevenue,
        ownerDistributed,
        profit,
      },
      kpis: {
        formulas: {
          liveMRR:
            'Sum of monthly rent (property.price) for active approved bookings where fromDate <= today <= toDate.',
          realizedMRR:
            'Sum of paid payment amount for current month (Payment.status = Paid within current month).',
          occupancyRate:
            'Occupied approved properties / total approved properties * 100, where occupied means at least one active approved booking.',
          platformProfit:
            'Realized MRR for current month - owner amount transferred in current month.',
        },
        values: {
          liveMRR: Number(liveMRR.toFixed(2)),
          realizedMRR: Number(realizedMRR.toFixed(2)),
          occupancyRate,
          approvedProperties: approvedPropertyCount,
          occupiedProperties,
          platformProfit: platformProfitCurrentMonth,
          ownerDistributedCurrentMonth: Number(ownerDistributedCurrentMonth.toFixed(2)),
        },
      },
      alerts: {
        pendingListings,
        pendingOwnerVerifications,
        openComplaints,
        failedPayments,
        actionableReminders,
        activityDays,
      },
      payoutSummary: {
        allocated: payoutSummary[0]?.allocated || 0,
        transferred: payoutSummary[0]?.transferred || 0,
        pendingTransfer: payoutSummary[0]?.pendingTransfer || 0,
        trend: payoutTrendRows.map((row) => ({
          month: row._id,
          allocated: row.allocated || 0,
          transferred: row.transferred || 0,
          pendingTransfer: row.pendingTransfer || 0,
        })),
      },
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { q, role, active, page, limit } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { name: safeRegex(q) },
        { email: safeRegex(q) },
        { citizenshipNumber: safeRegex(q) },
      ];
    }

    if (role) filter.role = role;
    if (active !== undefined) filter.isActive = active === 'true';

    const currentPage = parsePage(page);
    const currentLimit = parseLimit(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      User.countDocuments(filter),
    ]);
    sendPaginated(res, users, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: Boolean(isActive) },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    await logAudit(req, 'user_status_changed', 'User', user._id, { isActive: user.isActive });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

export const deleteUserPermanently = async (req, res) => {
  try {
    const force = String(req.query?.force || 'false').toLowerCase() === 'true';
    const user = await User.findById(req.params.id).select('_id name email role');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Admin users cannot be permanently deleted from this page' });
    }

    const { refs, totalRefs } = await getDuplicateUserImpactSummary(user._id);
    if (totalRefs > 0 && !force) {
      return res.status(409).json({
        error: 'Cannot permanently delete user with linked records. Use deactivate/suspend instead.',
        refs,
        totalRefs,
      });
    }

    let cascadeDeleted = {};
    if (force && totalRefs > 0) {
      const deletes = await Promise.all([
        Booking.deleteMany({ renter: user._id }),
        Property.deleteMany({ ownerId: user._id }),
        Payment.deleteMany({ renter: user._id }),
        Payment.deleteMany({ ownerId: user._id }),
        Message.deleteMany({ sender: user._id }),
        Message.deleteMany({ receiver: user._id }),
        Message.deleteMany({ recipient: user._id }),
        Agreement.deleteMany({ owner: user._id }),
        Agreement.deleteMany({ renter: user._id }),
        Complaint.deleteMany({ ownerId: user._id }),
        Notification.deleteMany({ userId: user._id }),
        LeaseAmendment.deleteMany({ requestedBy: user._id }),
        LeaseAmendment.deleteMany({ decidedBy: user._id }),
        DepositLedgerEntry.deleteMany({ renter: user._id }),
        DepositLedgerEntry.deleteMany({ owner: user._id }),
        DepositLedgerEntry.deleteMany({ createdBy: user._id }),
        DepositLedgerEntry.deleteMany({ approvedBy: user._id }),
      ]);
      const deletedCounts = deletes.map((item) => Number(item?.deletedCount || 0));
      cascadeDeleted = {
        bookingsAsRenter: deletedCounts[0],
        propertiesOwned: deletedCounts[1],
        paymentsAsRenter: deletedCounts[2],
        ownerPayments: deletedCounts[3],
        messagesSent: deletedCounts[4],
        messagesReceived: deletedCounts[5],
        messagesRecipient: deletedCounts[6],
        agreementsAsOwner: deletedCounts[7],
        agreementsAsRenter: deletedCounts[8],
        complaintsAsOwner: deletedCounts[9],
        notifications: deletedCounts[10],
        amendmentsRequested: deletedCounts[11],
        amendmentsDecided: deletedCounts[12],
        depositAsRenter: deletedCounts[13],
        depositAsOwner: deletedCounts[14],
        depositCreatedBy: deletedCounts[15],
        depositApprovedBy: deletedCounts[16],
      };
    }

    await User.deleteOne({ _id: user._id });
    await logAudit(req, 'user_deleted_permanently', 'User', user._id, {
      name: user.name,
      email: user.email,
      role: user.role,
      force,
      refsBefore: refs,
      totalRefsBefore: totalRefs,
      cascadeDeleted,
    });

    return res.json({
      success: true,
      deletedUserId: user._id,
      force,
      totalRefsBefore: totalRefs,
      cascadeDeleted,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to permanently delete user' });
  }
};

export const markUserEmailVerified = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
        $unset: {
          emailVerificationCodeHash: 1,
          emailVerificationExpiresAt: 1,
          emailVerificationAttemptCount: 1,
          emailVerificationLastSentAt: 1,
        },
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    await logAudit(req, 'user_email_verified_by_admin', 'User', user._id, {
      email: user.email,
      emailVerified: true,
    });

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark user email as verified' });
  }
};

export const getOwnerRequests = async (req, res) => {
  try {
    const currentPage = parsePage(req.query.page);
    const currentLimit = parseLimit(req.query.limit);
    const filter = { role: 'owner', ownerVerificationStatus: 'pending' };
    const [requests, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      User.countDocuments(filter),
    ]);
    sendPaginated(res, requests, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch owner verification requests' });
  }
};

export const updateOwnerRequest = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const owner = await User.findByIdAndUpdate(
      req.params.id,
      {
        ownerVerificationStatus: status,
        ownerVerifiedAt: status === 'verified' ? new Date() : null,
      },
      { new: true }
    );

    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    await logAudit(req, 'owner_verification_updated', 'User', owner._id, { status });
    res.json(owner);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update owner request' });
  }
};

export const getKycRequests = async (_req, res) => {
  try {
    const users = await User.find({ 'kycDocuments.0': { $exists: true } })
      .select('name email role kycStatus kycRejectReason kycDocuments')
      .sort({ updatedAt: -1 });

    const queue = users.flatMap((user) =>
      (user.kycDocuments || [])
        .map((doc) => ({
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          kycStatus: user.kycStatus || 'pending',
          kycRejectReason: user.kycRejectReason || '',
          documentId: doc._id,
          docType: doc.docType || 'Government ID',
          docStatus: doc.status || 'pending',
          imageUrl: doc.imageUrl,
          uploadedAt: doc.uploadedAt || doc.createdAt,
        }))
    );

    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KYC requests' });
  }
};

export const reviewKycDocument = async (req, res) => {
  try {
    const { status, rejectReason = '' } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const docs = Array.isArray(user.kycDocuments) ? user.kycDocuments : [];
    const doc = docs.id ? docs.id(req.params.docId) : docs.find((d) => String(d._id) === String(req.params.docId));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    doc.status = status;
    doc.rejectReason = status === 'rejected' ? String(rejectReason || 'Document rejected') : '';
    doc.reviewedAt = new Date();

    const pendingCount = docs.filter((d) => d.status === 'pending').length;
    const rejectedCount = docs.filter((d) => d.status === 'rejected').length;

    if (pendingCount === 0 && rejectedCount === 0) {
      user.kycStatus = 'verified';
      user.kycVerifiedAt = new Date();
      user.kycRejectReason = '';
    } else if (status === 'rejected') {
      user.kycStatus = 'rejected';
      user.kycRejectReason = doc.rejectReason;
    } else if (user.kycStatus !== 'verified') {
      user.kycStatus = 'pending';
    }

    user.markModified('kycDocuments');
    await user.save();
    await logAudit(req, 'kyc_document_reviewed', 'User', user._id, {
      documentId: req.params.docId,
      status,
      rejectReason: doc.rejectReason || '',
    });

    res.json({ message: 'KYC document reviewed', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to review KYC document' });
  }
};

export const reviewKycRequest = async (req, res) => {
  try {
    const { status, rejectReason = '' } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const docs = Array.isArray(user.kycDocuments) ? user.kycDocuments : [];
    const pendingDocs = docs.filter((d) => d.status === 'pending');
    if (pendingDocs.length === 0) {
      return res.status(400).json({ error: 'No pending KYC docs for this user' });
    }

    docs.forEach((doc) => {
      if (doc.status !== 'pending') return;
      doc.status = status;
      doc.rejectReason = status === 'rejected' ? String(rejectReason || 'KYC rejected') : '';
      doc.reviewedAt = new Date();
    });

    user.kycStatus = status;
    user.kycVerifiedAt = status === 'verified' ? new Date() : null;
    user.kycRejectReason = status === 'rejected' ? String(rejectReason || 'KYC rejected') : '';

    user.markModified('kycDocuments');
    await user.save();
    await logAudit(req, 'kyc_request_reviewed', 'User', user._id, {
      status,
      rejectReason: user.kycRejectReason || '',
      reviewedDocs: pendingDocs.length,
    });

    res.json({ message: 'KYC request reviewed', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to review KYC request' });
  }
};

export const getAllProperties = async (req, res) => {
  try {
    const { q, status, page, limit } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { title: safeRegex(q) },
        { location: safeRegex(q) },
        { description: safeRegex(q) },
      ];
    }
    if (status) filter.status = status;

    const currentPage = parsePage(page);
    const currentLimit = parseLimit(limit);
    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate('ownerId', 'name email ownerVerificationStatus')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      Property.countDocuments(filter),
    ]);

    sendPaginated(res, properties, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
};

export const updatePropertyStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid property status' });
    }

    const property = await Property.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    await logAudit(req, 'property_status_changed', 'Property', property._id, { status });
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update property status' });
  }
};

export const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    await logAudit(req, 'property_deleted', 'Property', property._id);
    res.json({ message: 'Property deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete property' });
  }
};

export const getAllBookings = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const filter = status ? { status } : {};
    const currentPage = parsePage(page);
    const currentLimit = parseLimit(limit);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate({
          path: 'property',
          populate: { path: 'ownerId', select: 'name email' },
        })
        .populate('renter', 'name email')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      Booking.countDocuments(filter),
    ]);

    sendPaginated(res, bookings, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (status === 'Approved') {
      const overlap = await findOverlappingApprovedBooking({
        propertyId: booking.property,
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
    booking.acceptedAt = status === 'Approved' ? new Date() : null;
    booking.rejectedAt = status === 'Rejected' ? new Date() : null;
    await booking.save();

    await logAudit(req, 'booking_status_changed', 'Booking', booking._id, { status });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const { status, payoutStatus, page, limit } = req.query;
    const filter = status ? { status } : {};
    if (payoutStatus) filter.payoutStatus = payoutStatus;
    const currentPage = parsePage(page);
    const currentLimit = parseLimit(limit);
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('renter', 'name email')
        .populate({
          path: 'booking',
          populate: { path: 'property', select: 'title location ownerId', populate: { path: 'ownerId', select: 'name email' } },
        })
        .populate('ownerId', 'name email')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      Payment.countDocuments(filter),
    ]);

    sendPaginated(res, payments, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { status, adminRemark } = req.body;
    if (!['Pending', 'Paid', 'Failed', 'Refunded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { status, ...(adminRemark ? { adminRemark } : {}) },
      { new: true }
    );
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    if (payment.booking) {
      if (status === 'Paid') {
        await Booking.findByIdAndUpdate(payment.booking, { paymentStatus: 'paid' });
      } else if (status === 'Failed' || status === 'Pending') {
        await Booking.findByIdAndUpdate(payment.booking, { paymentStatus: 'pending' });
        await Payment.findByIdAndUpdate(payment._id, {
          payoutStatus: 'Unallocated',
          commissionPercent: 0,
          commissionAmount: 0,
          ownerAmount: 0,
          payoutAllocatedAt: null,
          payoutTransferredAt: null,
        });
      }
    }

    await logAudit(req, 'payment_status_changed', 'Payment', payment._id, { status });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

export const allocateOwnerPayout = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate({
      path: 'booking',
      populate: { path: 'property', select: 'title ownerId' },
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'Paid') {
      return res.status(400).json({ error: 'Only paid payments can be allocated to owner' });
    }

    const ownerId = payment.booking?.property?.ownerId;
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner not found for booking property' });
    }

    const commissionSetting = await AdminSetting.findOne({ key: 'platformCommissionPct' });
    const defaultCommission = Number(commissionSetting?.value);
    const incomingCommission = Number(req.body?.commissionPercent);
    const commissionPercent = Number.isFinite(incomingCommission)
      ? incomingCommission
      : Number.isFinite(defaultCommission)
        ? defaultCommission
        : 10;

    if (commissionPercent < 0 || commissionPercent > 100) {
      return res.status(400).json({ error: 'Commission percent must be between 0 and 100' });
    }

    const commissionAmount = Number(((payment.amount * commissionPercent) / 100).toFixed(2));
    const ownerAmount = Number((payment.amount - commissionAmount).toFixed(2));

    payment.ownerId = ownerId;
    payment.commissionPercent = commissionPercent;
    payment.commissionAmount = commissionAmount;
    payment.ownerAmount = ownerAmount;
    payment.payoutStatus = 'Allocated';
    payment.payoutAllocatedAt = new Date();
    payment.payoutTransferredAt = null;
    payment.payoutNote = req.body?.payoutNote || payment.payoutNote;
    await payment.save();

    await logAudit(req, 'owner_payout_allocated', 'Payment', payment._id, {
      ownerId,
      commissionPercent,
      commissionAmount,
      ownerAmount,
    });

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to allocate owner payout' });
  }
};

export const markOwnerPayoutTransferred = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'Paid') {
      return res.status(400).json({ error: 'Only paid payments can be transferred' });
    }
    if (payment.payoutStatus !== 'Allocated' && payment.payoutStatus !== 'Transferred') {
      return res.status(400).json({ error: 'Allocate payout before marking as transferred' });
    }

    payment.payoutStatus = 'Transferred';
    payment.payoutTransferredAt = new Date();
    payment.payoutNote = req.body?.payoutNote || payment.payoutNote;
    await payment.save();

    await logAudit(req, 'owner_payout_transferred', 'Payment', payment._id, {
      ownerId: payment.ownerId,
      ownerAmount: payment.ownerAmount,
    });

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark owner payout transferred' });
  }
};

export const getAllComplaints = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const filter = status ? { status } : {};
    const currentPage = parsePage(page);
    const currentLimit = parseLimit(limit);
    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      Complaint.countDocuments(filter),
    ]);
    sendPaginated(res, complaints, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid complaint status' });
    }

    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    await logAudit(req, 'complaint_status_changed', 'Complaint', complaint._id, { status });
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update complaint status' });
  }
};

export const getAllMessages = async (req, res) => {
  try {
    const currentPage = parsePage(req.query.page);
    const currentLimit = parseLimit(req.query.limit, 50);
    const [messages, total] = await Promise.all([
      Message.find()
        .populate('sender', 'name email')
        .populate('receiver', 'name email')
        .populate('recipient', 'name email')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      Message.countDocuments(),
    ]);
    sendPaginated(res, messages, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const getAllReviews = async (req, res) => {
  try {
    const currentPage = parsePage(req.query.page);
    const currentLimit = parseLimit(req.query.limit, 30);
    const properties = await Property.find({ 'reviews.0': { $exists: true } })
      .select('title location reviews')
      .populate('reviews.user', 'name email');

    const reviewRows = properties.flatMap((property) =>
      (property.reviews || []).map((review, index) => ({
        reviewId: `${property._id}:${index}`,
        propertyId: property._id,
        propertyTitle: property.title,
        location: property.location,
        user: review.user,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      }))
    );

    const sortedRows = reviewRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const start = (currentPage - 1) * currentLimit;
    const paginatedRows = sortedRows.slice(start, start + currentLimit);
    sendPaginated(res, paginatedRows, sortedRows.length, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { propertyId, reviewId } = req.params;
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const [pid, indexRaw] = String(reviewId).split(':');
    if (String(pid) !== String(propertyId)) return res.status(400).json({ error: 'Invalid review id' });

    const index = Number(indexRaw);
    if (Number.isNaN(index) || index < 0 || index >= property.reviews.length) {
      return res.status(404).json({ error: 'Review not found' });
    }

    property.reviews.splice(index, 1);
    await property.save();

    await logAudit(req, 'review_deleted', 'PropertyReview', reviewId, { propertyId });
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
};

export const getSettings = async (_req, res) => {
  try {
    const settings = await AdminSetting.find().sort({ key: 1 });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

export const upsertSettings = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be an array' });

    await Promise.all(
      updates.map((item) =>
        AdminSetting.findOneAndUpdate(
          { key: item.key },
          { key: item.key, value: item.value },
          { new: true, upsert: true }
        )
      )
    );

    await logAudit(req, 'settings_updated', 'AdminSetting', 'bulk', { count: updates.length });
    const settings = await AdminSetting.find().sort({ key: 1 });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

export const getFeaturedListings = async (_req, res) => {
  try {
    const settings = await AdminSetting.findOne({ key: 'featuredListingIds' });
    const ids = settings?.value || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.json([]);

    const properties = await Property.find({ _id: { $in: ids } });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch featured listings' });
  }
};

export const updateFeaturedListings = async (req, res) => {
  try {
    const { propertyIds } = req.body;
    if (!Array.isArray(propertyIds)) {
      return res.status(400).json({ error: 'propertyIds must be an array' });
    }

    const setting = await AdminSetting.findOneAndUpdate(
      { key: 'featuredListingIds' },
      { value: propertyIds },
      { upsert: true, new: true }
    );

    await logAudit(req, 'featured_listings_updated', 'AdminSetting', setting._id, { count: propertyIds.length });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update featured listings' });
  }
};

export const sendBroadcast = async (req, res) => {
  try {
    const { message, type = 'announcement', role } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const filter = role ? { role } : {};
    const users = await User.find(filter).select('_id');

    const docs = users.map((u) => ({
      userId: u._id,
      type,
      message,
      link: '/notifications',
    }));

    if (docs.length) await Notification.insertMany(docs);

    await logAudit(req, 'broadcast_sent', 'Notification', 'bulk', { recipients: docs.length, role: role || 'all' });
    res.json({ message: 'Broadcast sent', recipients: docs.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
};

export const getReports = async (_req, res) => {
  try {
    const [propertyByStatus, bookingByStatus, paymentByStatus, complaintByStatus] = await Promise.all([
      Property.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }]),
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    res.json({ propertyByStatus, bookingByStatus, paymentByStatus, complaintByStatus });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

export const getRevenueCommandCenter = async (_req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const previousMonthStart = addMonths(currentMonthStart, -1);
    const previousThreeMonthStart = addMonths(currentMonthStart, -3);
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneDayMs = 24 * 60 * 60 * 1000;

    const [
      activeBookingRows,
      paidThisMonthAgg,
      paidPreviousMonthAgg,
      pendingPayoutRows,
      paymentStatuses7d,
      monthlyRevenueRows,
      churnRiskRows,
      unsignedAgreements,
    ] = await Promise.all([
      Booking.aggregate([
        {
          $match: {
            status: 'Approved',
            fromDate: { $lte: now },
            toDate: { $gte: now },
          },
        },
        {
          $lookup: {
            from: 'properties',
            localField: 'property',
            foreignField: '_id',
            as: 'property',
          },
        },
        { $unwind: { path: '$property', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            monthlyRent: { $ifNull: ['$property.price', 0] },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { status: 'Paid', createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'Paid', createdAt: { $gte: previousMonthStart, $lt: currentMonthStart } } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
      Payment.find({
        status: 'Paid',
        payoutStatus: { $ne: 'Transferred' },
      })
        .select('ownerAmount payoutAllocatedAt createdAt payoutStatus booking')
        .populate({
          path: 'booking',
          populate: { path: 'property', select: 'title' },
        })
        .lean(),
      Payment.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'Paid', createdAt: { $gte: previousThreeMonthStart, $lte: currentMonthEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Booking.find({
        status: 'Approved',
        toDate: { $gte: now, $lte: next30Days },
      })
        .select('_id toDate paymentStatus createdAt property renter')
        .populate('property', 'title')
        .populate('renter', 'name email')
        .lean(),
      Agreement.find().select('booking currentVersion versions').lean(),
    ]);

    const liveMRR = activeBookingRows.reduce((sum, row) => sum + Number(row.monthlyRent || 0), 0);
    const realizedMRR = Number(paidThisMonthAgg[0]?.amount || 0);
    const paidTxnThisMonth = Number(paidThisMonthAgg[0]?.count || 0);
    const previousMonthRevenue = Number(paidPreviousMonthAgg[0]?.amount || 0);
    const momChangePct = calcMoMChangePct(realizedMRR, previousMonthRevenue);

    const payoutAgingBuckets = {
      '0-3d': { count: 0, amount: 0 },
      '4-7d': { count: 0, amount: 0 },
      '8-14d': { count: 0, amount: 0 },
      '15+d': { count: 0, amount: 0 },
    };
    let totalPendingPayout = 0;
    let oldestPendingPayoutDays = 0;

    pendingPayoutRows.forEach((row) => {
      const amount = Number(row.ownerAmount || 0);
      const anchor = row.payoutAllocatedAt || row.createdAt;
      const ageDays = Math.max(0, Math.floor((now - new Date(anchor)) / oneDayMs));
      oldestPendingPayoutDays = Math.max(oldestPendingPayoutDays, ageDays);
      totalPendingPayout += amount;

      if (ageDays <= 3) {
        payoutAgingBuckets['0-3d'].count += 1;
        payoutAgingBuckets['0-3d'].amount += amount;
      } else if (ageDays <= 7) {
        payoutAgingBuckets['4-7d'].count += 1;
        payoutAgingBuckets['4-7d'].amount += amount;
      } else if (ageDays <= 14) {
        payoutAgingBuckets['8-14d'].count += 1;
        payoutAgingBuckets['8-14d'].amount += amount;
      } else {
        payoutAgingBuckets['15+d'].count += 1;
        payoutAgingBuckets['15+d'].amount += amount;
      }
    });

    const statusCountMap = new Map(paymentStatuses7d.map((row) => [row._id, row.count]));
    const paidCount7d = Number(statusCountMap.get('Paid') || 0);
    const failedCount7d = Number(statusCountMap.get('Failed') || 0);
    const pendingCount7d = Number(statusCountMap.get('Pending') || 0);
    const totalCount7d = paidCount7d + failedCount7d + pendingCount7d;
    const failedRate7d = totalCount7d ? Number(((failedCount7d / totalCount7d) * 100).toFixed(2)) : 0;

    const recentUnsignedAgreementCount = (() => {
      const signedBookingIds = new Set(
        unsignedAgreements
          .filter((agreement) => {
            const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
            const active =
              versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
              versions[versions.length - 1];
            return active?.status === 'fully_signed';
          })
          .map((agreement) => String(agreement.booking))
      );

      return churnRiskRows.filter(
        (booking) =>
          new Date(booking.createdAt) <= threeDaysAgo &&
          !signedBookingIds.has(String(booking._id))
      ).length;
    })();

    const churnRisk = churnRiskRows
      .map((booking) => {
        const daysToEnd = Math.max(0, Math.ceil((new Date(booking.toDate) - now) / oneDayMs));
        const paymentPending = String(booking.paymentStatus || 'pending').toLowerCase() !== 'paid';
        const score = Math.min(
          100,
          (daysToEnd <= 7 ? 45 : daysToEnd <= 14 ? 30 : 20) +
            (paymentPending ? 35 : 0) +
            (new Date(booking.createdAt) <= fourteenDaysAgo ? 20 : 8)
        );
        return {
          bookingId: booking._id,
          property: booking.property?.title || 'Unknown property',
          renter: booking.renter?.name || booking.renter?.email || 'Unknown renter',
          toDate: booking.toDate,
          paymentStatus: booking.paymentStatus || 'pending',
          daysToEnd,
          score,
          tier: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const anomalies = [];
    if (failedRate7d >= 20 && totalCount7d >= 8) {
      anomalies.push({
        code: 'payment_fail_rate_spike',
        severity: 'high',
        title: 'Payment failure spike in last 7 days',
        detail: `${failedRate7d}% failure rate (${failedCount7d}/${totalCount7d} transactions)`,
      });
    }
    if (oldestPendingPayoutDays > 7) {
      anomalies.push({
        code: 'payout_delay',
        severity: oldestPendingPayoutDays > 14 ? 'high' : 'medium',
        title: 'Owner payout delays detected',
        detail: `Oldest pending payout is ${oldestPendingPayoutDays} day(s) old`,
      });
    }
    if (momChangePct <= -25 && previousMonthRevenue > 0) {
      anomalies.push({
        code: 'revenue_drop',
        severity: 'medium',
        title: 'Month-over-month revenue drop',
        detail: `Revenue is down ${Math.abs(momChangePct)}% versus last month`,
      });
    }
    if (recentUnsignedAgreementCount > 0) {
      anomalies.push({
        code: 'unsigned_agreements',
        severity: 'medium',
        title: 'Approved bookings with unsigned agreements',
        detail: `${recentUnsignedAgreementCount} booking(s) need agreement completion`,
      });
    }

    res.json({
      headline: {
        liveMRR: Number(liveMRR.toFixed(2)),
        realizedMRR: Number(realizedMRR.toFixed(2)),
        paidTransactionsThisMonth: paidTxnThisMonth,
        pendingPayoutTotal: Number(totalPendingPayout.toFixed(2)),
        monthOverMonthChangePct: momChangePct,
      },
      payoutAging: {
        buckets: Object.entries(payoutAgingBuckets).map(([bucket, value]) => ({
          bucket,
          count: value.count,
          amount: Number(value.amount.toFixed(2)),
        })),
        oldestPendingDays: oldestPendingPayoutDays,
      },
      churnRisk: {
        atRiskCount: churnRisk.length,
        highRiskCount: churnRisk.filter((item) => item.tier === 'high').length,
        items: churnRisk,
      },
      anomalies,
      trend: monthlyRevenueRows.map((row) => ({
        month: row._id,
        revenue: Number(row.amount || 0),
        paidTransactions: Number(row.count || 0),
      })),
      paymentHealth7d: {
        paid: paidCount7d,
        failed: failedCount7d,
        pending: pendingCount7d,
        failedRatePct: failedRate7d,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch revenue command center' });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const {
      page,
      limit,
      q,
      entityType,
      action,
      adminId,
      dateFrom,
      dateTo,
      export: exportFormat,
    } = req.query;

    const filter = {};
    if (q) {
      const regex = safeRegex(q);
      filter.$or = [{ action: regex }, { entityType: regex }, { entityId: regex }];
    }
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;
    if (adminId) filter.adminId = adminId;

    const from = parseDateInput(dateFrom);
    const to = parseDateInput(dateTo);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const query = AuditLog.find(filter)
      .populate('adminId', 'username')
      .sort({ createdAt: -1 });

    if (String(exportFormat || '').toLowerCase() === 'csv') {
      const rows = await query.limit(5000).lean();
      const header = ['time', 'admin', 'action', 'entityType', 'entityId', 'details'];
      const csvRows = rows.map((row) =>
        [
          row.createdAt,
          row.adminId?.username || '',
          row.action,
          row.entityType,
          row.entityId,
          row.details,
        ]
          .map(toCsvValue)
          .join(',')
      );
      const csv = [header.join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return res.status(200).send(csv);
    }

    const currentPage = parsePage(req.query.page);
    const currentLimit = parseLimit(req.query.limit, 50);
    const [logs, total] = await Promise.all([
      query
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit),
      AuditLog.countDocuments(filter),
    ]);
    sendPaginated(res, logs, total, currentPage, currentLimit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

export const getDashboardViews = async (req, res) => {
  try {
    const key = `dashboardViews:${req.admin._id}`;
    const setting = await AdminSetting.findOne({ key }).lean();
    const views = Array.isArray(setting?.value) ? setting.value : [];
    res.json({ views });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard views' });
  }
};

export const saveDashboardView = async (req, res) => {
  try {
    const { id, name, filters = {}, layout = {} } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'View name is required' });

    const key = `dashboardViews:${req.admin._id}`;
    const setting = await AdminSetting.findOne({ key });
    const current = Array.isArray(setting?.value) ? setting.value : [];
    const nextId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextView = {
      id: nextId,
      name: trimmedName,
      filters,
      layout,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = current.findIndex((item) => item.id === nextId);
    if (existingIndex >= 0) current[existingIndex] = nextView;
    else current.unshift(nextView);

    const saved = await AdminSetting.findOneAndUpdate(
      { key },
      { key, value: current.slice(0, 20) },
      { upsert: true, new: true }
    );

    await logAudit(req, 'dashboard_view_saved', 'AdminSetting', saved._id, {
      viewId: nextId,
      name: trimmedName,
    });
    res.json({ views: saved.value || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save dashboard view' });
  }
};

export const deleteDashboardView = async (req, res) => {
  try {
    const viewId = String(req.params.id || '').trim();
    if (!viewId) return res.status(400).json({ error: 'View id is required' });

    const key = `dashboardViews:${req.admin._id}`;
    const setting = await AdminSetting.findOne({ key });
    const current = Array.isArray(setting?.value) ? setting.value : [];
    const filtered = current.filter((item) => item.id !== viewId);

    const saved = await AdminSetting.findOneAndUpdate(
      { key },
      { key, value: filtered },
      { upsert: true, new: true }
    );

    await logAudit(req, 'dashboard_view_deleted', 'AdminSetting', saved._id, { viewId });
    res.json({ views: saved.value || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete dashboard view' });
  }
};

export const getOpsInbox = async (_req, res) => {
  try {
    const [pendingProperties, pendingOwners, pendingKycUsers, pendingComplaints, pendingPayoutPayments, unsignedAgreements] =
      await Promise.all([
        Property.find({ status: 'Pending' }).select('_id title location createdAt').sort({ createdAt: 1 }).limit(30).lean(),
        User.find({ role: 'owner', ownerVerificationStatus: 'pending' }).select('_id name email createdAt').sort({ createdAt: 1 }).limit(30).lean(),
        User.find({ kycStatus: 'pending' }).select('_id name email role updatedAt').sort({ updatedAt: 1 }).limit(30).lean(),
        Complaint.find({ status: { $ne: 'resolved' } }).select('_id subject status createdAt').sort({ createdAt: 1 }).limit(30).lean(),
        Payment.find({ status: 'Paid', payoutStatus: { $ne: 'Transferred' } })
          .select('_id amount ownerAmount payoutStatus createdAt booking')
          .populate({ path: 'booking', populate: { path: 'property', select: 'title' } })
          .sort({ createdAt: 1 })
          .limit(30)
          .lean(),
        Agreement.find().select('_id booking property currentVersion versions updatedAt').populate('property', 'title').limit(80).lean(),
      ]);

    const unsignedAgreementItems = unsignedAgreements
      .filter((agreement) => {
        const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
        const active =
          versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
          versions[versions.length - 1];
        return active?.status !== 'fully_signed';
      })
      .slice(0, 30)
      .map((agreement) => ({
        id: agreement._id,
        property: agreement.property?.title || 'Unknown property',
        status: 'agreement_unsigned',
        createdAt: agreement.updatedAt,
      }));

    const inbox = [
      ...pendingProperties.map((item) => ({
        id: item._id,
        type: 'property_pending',
        title: item.title,
        subtitle: item.location || '',
        createdAt: item.createdAt,
        entityType: 'Property',
        entityId: String(item._id),
      })),
      ...pendingOwners.map((item) => ({
        id: item._id,
        type: 'owner_verification_pending',
        title: item.name || item.email,
        subtitle: item.email || '',
        createdAt: item.createdAt,
        entityType: 'User',
        entityId: String(item._id),
      })),
      ...pendingKycUsers.map((item) => ({
        id: item._id,
        type: 'kyc_pending',
        title: item.name || item.email,
        subtitle: `${item.role} • ${item.email || ''}`,
        createdAt: item.updatedAt,
        entityType: 'User',
        entityId: String(item._id),
      })),
      ...pendingComplaints.map((item) => ({
        id: item._id,
        type: 'complaint_open',
        title: item.subject || 'Complaint',
        subtitle: item.status || 'pending',
        createdAt: item.createdAt,
        entityType: 'Complaint',
        entityId: String(item._id),
      })),
      ...pendingPayoutPayments.map((item) => ({
        id: item._id,
        type: 'payout_pending_transfer',
        title: item.booking?.property?.title || 'Payment',
        subtitle: `Owner amount Rs. ${item.ownerAmount || 0}`,
        createdAt: item.createdAt,
        entityType: 'Payment',
        entityId: String(item._id),
      })),
      ...unsignedAgreementItems.map((item) => ({
        id: item.id,
        type: item.status,
        title: item.property,
        subtitle: 'Agreement needs signatures',
        createdAt: item.createdAt,
        entityType: 'Agreement',
        entityId: String(item.id),
      })),
    ]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 120);

    res.json({
      summary: {
        total: inbox.length,
        propertyPending: pendingProperties.length,
        ownerVerificationPending: pendingOwners.length,
        kycPending: pendingKycUsers.length,
        complaintOpen: pendingComplaints.length,
        payoutPending: pendingPayoutPayments.length,
        unsignedAgreements: unsignedAgreementItems.length,
      },
      items: inbox,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workflow inbox' });
  }
};

export const runBulkAction = async (req, res) => {
  try {
    const { action, ids = [], payload = {} } = req.body || {};
    const normalizedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!action || !normalizedIds.length) return res.status(400).json({ error: 'Action and ids are required' });

    let modified = 0;
    if (action === 'properties_approve') {
      const result = await Property.updateMany({ _id: { $in: normalizedIds } }, { $set: { status: 'Approved' } });
      modified = result.modifiedCount || 0;
    } else if (action === 'properties_reject') {
      const result = await Property.updateMany({ _id: { $in: normalizedIds } }, { $set: { status: 'Rejected' } });
      modified = result.modifiedCount || 0;
    } else if (action === 'bookings_approve') {
      const result = await Booking.updateMany({ _id: { $in: normalizedIds } }, { $set: { status: 'Approved' } });
      modified = result.modifiedCount || 0;
    } else if (action === 'bookings_reject') {
      const result = await Booking.updateMany({ _id: { $in: normalizedIds } }, { $set: { status: 'Rejected' } });
      modified = result.modifiedCount || 0;
    } else if (action === 'complaints_resolve') {
      const result = await Complaint.updateMany({ _id: { $in: normalizedIds } }, { $set: { status: 'resolved' } });
      modified = result.modifiedCount || 0;
    } else if (action === 'payments_mark_transferred') {
      const result = await Payment.updateMany(
        { _id: { $in: normalizedIds }, status: 'Paid' },
        {
          $set: {
            payoutStatus: 'Transferred',
            payoutTransferredAt: new Date(),
            ...(payload.payoutNote ? { payoutNote: String(payload.payoutNote) } : {}),
          },
        }
      );
      modified = result.modifiedCount || 0;
    } else {
      return res.status(400).json({ error: 'Unsupported bulk action' });
    }

    await logAudit(req, 'bulk_action_executed', 'BulkAction', action, {
      ids: normalizedIds.slice(0, 200),
      action,
      modified,
    });

    res.json({ success: true, action, modified, requested: normalizedIds.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to run bulk action' });
  }
};

export const getSlaDashboard = async (_req, res) => {
  try {
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const [pendingPropertyRows, pendingOwnerRows, openComplaintRows, pendingPayoutRows] = await Promise.all([
      Property.find({ status: 'Pending' }).select('_id createdAt').lean(),
      User.find({ role: 'owner', ownerVerificationStatus: 'pending' }).select('_id createdAt').lean(),
      Complaint.find({ status: { $ne: 'resolved' } }).select('_id createdAt').lean(),
      Payment.find({ status: 'Paid', payoutStatus: { $ne: 'Transferred' } }).select('_id createdAt payoutAllocatedAt').lean(),
    ]);

    const bucketize = (items, createdAtResolver) => {
      const buckets = { '0-1d': 0, '2-3d': 0, '4-7d': 0, '8+d': 0 };
      items.forEach((item) => {
        const base = createdAtResolver(item);
        const age = Math.max(0, Math.floor((now - new Date(base)) / oneDayMs));
        if (age <= 1) buckets['0-1d'] += 1;
        else if (age <= 3) buckets['2-3d'] += 1;
        else if (age <= 7) buckets['4-7d'] += 1;
        else buckets['8+d'] += 1;
      });
      return buckets;
    };

    res.json({
      listings: bucketize(pendingPropertyRows, (item) => item.createdAt),
      ownerVerification: bucketize(pendingOwnerRows, (item) => item.createdAt),
      complaints: bucketize(openComplaintRows, (item) => item.createdAt),
      payouts: bucketize(pendingPayoutRows, (item) => item.payoutAllocatedAt || item.createdAt),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SLA dashboard' });
  }
};

export const getIncidentBanner = async (_req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [failed7d, total7d, delayedPayout, unsignedCount] = await Promise.all([
      Payment.countDocuments({ status: 'Failed', createdAt: { $gte: sevenDaysAgo } }),
      Payment.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Payment.countDocuments({ status: 'Paid', payoutStatus: { $ne: 'Transferred' }, createdAt: { $lte: threeDaysAgo } }),
      (async () => {
        const [approved, agreements] = await Promise.all([
          Booking.find({ status: 'Approved', createdAt: { $lte: threeDaysAgo } }).select('_id').lean(),
          Agreement.find().select('booking currentVersion versions').lean(),
        ]);
        const signed = new Set(
          agreements
            .filter((agreement) => {
              const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
              const active =
                versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
                versions[versions.length - 1];
              return active?.status === 'fully_signed';
            })
            .map((agreement) => String(agreement.booking))
        );
        return approved.filter((item) => !signed.has(String(item._id))).length;
      })(),
    ]);

    const failedRate = total7d ? Number(((failed7d / total7d) * 100).toFixed(2)) : 0;
    const incidents = [];
    if (failedRate >= 20 && total7d >= 8) {
      incidents.push({ code: 'payment_fail_spike', severity: 'high', message: `Payment failure rate ${failedRate}% in last 7 days.` });
    }
    if (delayedPayout > 0) {
      incidents.push({ code: 'payout_delay', severity: delayedPayout > 10 ? 'high' : 'medium', message: `${delayedPayout} paid payments waiting payout transfer.` });
    }
    if (unsignedCount > 0) {
      incidents.push({ code: 'agreement_unsigned', severity: 'medium', message: `${unsignedCount} approved bookings still unsigned after 3+ days.` });
    }
    res.json({ incidents, hasIncident: incidents.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
};

export const getReconciliation = async (_req, res) => {
  try {
    const [bookings, payments, agreements] = await Promise.all([
      Booking.find().select('_id status paymentStatus').lean(),
      Payment.find().select('_id booking status payoutStatus ownerAmount amount').lean(),
      Agreement.find().select('_id booking currentVersion versions').lean(),
    ]);

    const paymentByBooking = new Map();
    payments.forEach((payment) => {
      const key = String(payment.booking);
      const current = paymentByBooking.get(key);
      if (!current || new Date(payment.createdAt || 0) > new Date(current.createdAt || 0)) {
        paymentByBooking.set(key, payment);
      }
    });
    const agreementByBooking = new Map(agreements.map((agreement) => [String(agreement.booking), agreement]));

    const issues = [];
    for (const booking of bookings) {
      const key = String(booking._id);
      const payment = paymentByBooking.get(key);
      const agreement = agreementByBooking.get(key);
      const versions = Array.isArray(agreement?.versions) ? agreement.versions : [];
      const active =
        versions.find((item) => Number(item.version) === Number(agreement?.currentVersion)) ||
        versions[versions.length - 1];
      const signed = active?.status === 'fully_signed';

      if (booking.status === 'Approved' && !signed) {
        issues.push({
          type: 'agreement_missing_signature',
          bookingId: booking._id,
          message: 'Approved booking without fully signed agreement',
          severity: 'medium',
        });
      }
      if (booking.status === 'Approved' && payment?.status === 'Paid' && payment.payoutStatus === 'Unallocated') {
        issues.push({
          type: 'payout_unallocated',
          bookingId: booking._id,
          paymentId: payment._id,
          message: 'Paid booking payment has not been allocated for payout',
          severity: 'high',
        });
      }
      if (booking.paymentStatus === 'paid' && (!payment || payment.status !== 'Paid')) {
        issues.push({
          type: 'booking_payment_mismatch',
          bookingId: booking._id,
          message: 'Booking payment status is paid but payment record is missing or not paid',
          severity: 'high',
        });
      }
    }

    res.json({
      totalIssues: issues.length,
      high: issues.filter((item) => item.severity === 'high').length,
      medium: issues.filter((item) => item.severity === 'medium').length,
      items: issues.slice(0, 200),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reconciliation data' });
  }
};

export const getRuleEngine = async (_req, res) => {
  try {
    const setting = await AdminSetting.findOne({ key: 'automationRules' }).lean();
    const defaults = {
      autoApproveLowRiskListings: false,
      listingAutoApproveScoreThreshold: 80,
      autoResolveStaleComplaintsDays: 0,
      complaintEscalationHours: 48,
      complaintAutoResolveOnlyIfNoOwnerReply: true,
      highRiskPaymentFailRatePct: 20,
      paymentFailSpikeWindowDays: 7,
      payoutDelayThresholdDays: 3,
      payoutDelayEscalationLevel: 'soft',
      broadcastOnCriticalIncident: false,
      incidentAutoCreateOpsTicket: true,
      anomalyAlertCooldownMinutes: 60,
    };
    const rules = { ...defaults, ...(setting?.value || {}) };
    res.json({ rules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
};

export const updateRuleEngine = async (req, res) => {
  try {
    const input = req.body || {};
    const payoutLevel = ['soft', 'strict'].includes(String(input.payoutDelayEscalationLevel))
      ? String(input.payoutDelayEscalationLevel)
      : 'soft';
    const rules = {
      autoApproveLowRiskListings: Boolean(input.autoApproveLowRiskListings),
      listingAutoApproveScoreThreshold: Math.max(50, Math.min(Number(input.listingAutoApproveScoreThreshold || 80), 100)),
      autoResolveStaleComplaintsDays: Math.max(0, Math.min(Number(input.autoResolveStaleComplaintsDays || 0), 365)),
      complaintEscalationHours: Math.max(1, Math.min(Number(input.complaintEscalationHours || 48), 336)),
      complaintAutoResolveOnlyIfNoOwnerReply: Boolean(input.complaintAutoResolveOnlyIfNoOwnerReply),
      highRiskPaymentFailRatePct: Math.max(1, Math.min(Number(input.highRiskPaymentFailRatePct || 20), 100)),
      paymentFailSpikeWindowDays: Math.max(1, Math.min(Number(input.paymentFailSpikeWindowDays || 7), 30)),
      payoutDelayThresholdDays: Math.max(1, Math.min(Number(input.payoutDelayThresholdDays || 3), 60)),
      payoutDelayEscalationLevel: payoutLevel,
      broadcastOnCriticalIncident: Boolean(input.broadcastOnCriticalIncident),
      incidentAutoCreateOpsTicket: Boolean(input.incidentAutoCreateOpsTicket),
      anomalyAlertCooldownMinutes: Math.max(5, Math.min(Number(input.anomalyAlertCooldownMinutes || 60), 1440)),
    };

    const saved = await AdminSetting.findOneAndUpdate(
      { key: 'automationRules' },
      { key: 'automationRules', value: rules },
      { upsert: true, new: true }
    );

    await logAudit(req, 'rule_engine_updated', 'AdminSetting', saved._id, rules);
    res.json({ rules: saved.value || rules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rules' });
  }
};

export const getAdminNotes = async (req, res) => {
  try {
    const { entityType, entityId, tag, q } = req.query;
    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = String(entityId);
    if (tag) filter.tags = tag;
    if (q) filter.note = safeRegex(q);

    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const [rows, total] = await Promise.all([
      AdminAnnotation.find(filter)
        .populate('updatedBy', 'username displayName role')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AdminAnnotation.countDocuments(filter),
    ]);
    sendPaginated(res, rows, total, page, limit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin notes' });
  }
};

export const upsertAdminNote = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const note = String(req.body?.note || '').trim();
    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!note && tags.length === 0) return res.status(400).json({ error: 'Note or tags required' });

    const doc = await AdminAnnotation.findOneAndUpdate(
      { entityType, entityId: String(entityId) },
      {
        entityType,
        entityId: String(entityId),
        note,
        tags,
        updatedBy: req.admin._id,
      },
      { upsert: true, new: true }
    ).populate('updatedBy', 'username displayName role');

    await logAudit(req, 'admin_note_upserted', entityType, entityId, { tags, noteLength: note.length });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save admin note' });
  }
};

export const getExportDataset = async (req, res) => {
  try {
    const dataset = String(req.params.dataset || '').trim();
    const maxRows = Math.max(1, Math.min(Number(req.query.limit || 5000), 10000));
    let rows = [];
    let headers = [];

    if (dataset === 'payments') {
      rows = await Payment.find().sort({ createdAt: -1 }).limit(maxRows).lean();
      headers = ['_id', 'booking', 'amount', 'status', 'payoutStatus', 'ownerAmount', 'createdAt'];
    } else if (dataset === 'bookings') {
      rows = await Booking.find().sort({ createdAt: -1 }).limit(maxRows).lean();
      headers = ['_id', 'property', 'renter', 'status', 'fromDate', 'toDate', 'createdAt'];
    } else if (dataset === 'users') {
      rows = await User.find().sort({ createdAt: -1 }).limit(maxRows).lean();
      headers = ['_id', 'name', 'email', 'role', 'isActive', 'ownerVerificationStatus', 'createdAt'];
    } else if (dataset === 'audit-logs') {
      rows = await AuditLog.find().sort({ createdAt: -1 }).limit(maxRows).lean();
      headers = ['_id', 'adminId', 'action', 'entityType', 'entityId', 'details', 'createdAt'];
    } else {
      return res.status(400).json({ error: 'Unsupported dataset' });
    }

    if (String(req.query.export || '').toLowerCase() !== 'csv') {
      return res.json({
        dataset,
        headers,
        count: rows.length,
        preview: rows.slice(0, 30),
      });
    }

    const csvRows = rows.map((row) =>
      headers.map((header) => toCsvValue(row?.[header])).join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset}-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export dataset' });
  }
};

export const getAdminPermissions = async (_req, res) => {
  try {
    const admins = await Admin.find().select('username displayName role permissions isActive createdAt').sort({ createdAt: -1 }).lean();
    res.json({
      admins,
      rolePermissionMap: ROLE_PERMISSION_MAP,
      permissionCatalog: PERMISSION_CATALOG,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin permissions' });
  }
};

export const createAdminAccount = async (req, res) => {
  try {
    const {
      username,
      password,
      displayName = '',
      role = 'ops_admin',
      permissions = [],
      isActive = true,
    } = req.body || {};

    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedDisplayName = String(displayName || '').trim();
    const normalizedRole = String(role || '').trim();

    if (!normalizedUsername || normalizedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!Object.keys(ROLE_PERMISSION_MAP).includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const sanitizedPermissions = Array.from(
      new Set((Array.isArray(permissions) ? permissions : []).map((item) => String(item).trim()).filter(Boolean))
    ).slice(0, 50);
    const invalid = sanitizedPermissions.filter(
      (item) => item !== '*' && !PERMISSION_CATALOG.includes(item)
    );
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
    }

    const existing = await Admin.findOne({ username: normalizedUsername }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const admin = await Admin.create({
      username: normalizedUsername,
      password: passwordHash,
      displayName: normalizedDisplayName,
      role: normalizedRole,
      permissions: sanitizedPermissions,
      isActive: Boolean(isActive),
    });

    await logAudit(req, 'admin_created', 'Admin', admin._id, {
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
    });

    return res.status(201).json({
      _id: admin._id,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
      permissions: admin.permissions || [],
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create admin account' });
  }
};

export const updateAdminPermissions = async (req, res) => {
  try {
    const { role, permissions, isActive } = req.body || {};
    const updates = {};
    if (role) {
      const nextRole = String(role);
      if (!Object.keys(ROLE_PERMISSION_MAP).includes(nextRole)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.role = nextRole;
    }
    if (Array.isArray(permissions)) {
      const sanitized = Array.from(
        new Set(permissions.map((item) => String(item).trim()).filter(Boolean))
      ).slice(0, 50);
      const invalid = sanitized.filter(
        (item) => item !== '*' && !PERMISSION_CATALOG.includes(item)
      );
      if (invalid.length) {
        return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
      }
      updates.permissions = sanitized;
    }
    if (typeof isActive === 'boolean') {
      if (isActive === false && String(req.admin?._id) === String(req.params.id)) {
        return res.status(400).json({ error: 'You cannot deactivate your current admin account' });
      }
      updates.isActive = isActive;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });

    const admin = await Admin.findByIdAndUpdate(req.params.id, updates, { new: true })
      .select('username displayName role permissions isActive createdAt');
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    await logAudit(req, 'admin_permission_updated', 'Admin', req.params.id, updates);
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin permissions' });
  }
};

export const getAuditLogDiff = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id).populate('adminId', 'username displayName').lean();
    if (!log) return res.status(404).json({ error: 'Audit log not found' });

    const details = log.details || {};
    const before = details.before || null;
    const after = details.after || null;

    const changedFields = [];
    if (before && after && typeof before === 'object' && typeof after === 'object') {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      keys.forEach((key) => {
        const left = before[key];
        const right = after[key];
        if (JSON.stringify(left) !== JSON.stringify(right)) {
          changedFields.push({ field: key, before: left, after: right });
        }
      });
    }

    res.json({
      log,
      diff: {
        before,
        after,
        changedFields,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit diff' });
  }
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeUrl = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '');

const normalizeNumberLike = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const resolveUserKycStatus = (user) => {
  if (user?.kycStatus) return user.kycStatus;
  const docs = Array.isArray(user?.kycDocuments) ? user.kycDocuments : [];
  if (!docs.length) return 'unsubmitted';
  const statuses = docs.map((doc) => String(doc?.status || '').toLowerCase());
  if (statuses.includes('rejected')) return 'rejected';
  if (statuses.every((status) => status === 'verified')) return 'verified';
  return 'pending';
};

const resolveOwnerVerificationStatus = (user) =>
  user?.ownerVerificationStatus || 'unverified';

const kycScore = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'verified') return 40;
  if (value === 'pending') return 18;
  if (value === 'rejected') return 6;
  return 0; // unsubmitted/unknown
};

const ownerVerificationScore = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'verified') return 30;
  if (value === 'pending') return 12;
  if (value === 'rejected') return 3;
  return 0; // unverified/unknown
};

const candidatePrimaryScore = (user) => {
  const kyc = resolveUserKycStatus(user);
  const owner = resolveOwnerVerificationStatus(user);
  const docsCount = Array.isArray(user?.kycDocuments) ? user.kycDocuments.length : 0;
  const hasCitizenship = Boolean(normalizeNumberLike(user?.citizenshipNumber));
  const isActive = user?.isActive === true;
  return (
    kycScore(kyc) +
    ownerVerificationScore(owner) +
    (isActive ? 10 : 0) +
    (hasCitizenship ? 6 : 0) +
    Math.min(8, docsCount * 2)
  );
};

const scoreDuplicateConfidence = (entityType, reason, matchCount) => {
  const normalizedReason = normalizeText(reason);
  let base = 45;

  if (normalizedReason.includes('citizenship')) base = 94;
  else if (normalizedReason.includes('publicid')) base = 95;
  else if (normalizedReason.includes('kyc image')) base = 88;
  else if (normalizedReason.includes('name + citizenship')) base = 90;
  else if (normalizedReason.includes('title + location + owner + price')) base = 82;
  else if (normalizedReason.includes('property image')) base = 72;

  const boost = Math.min(10, Math.max(0, (Number(matchCount || 0) - 2) * 2));
  return Math.max(1, Math.min(99, Math.round(base + boost)));
};

const toMergeSuggestion = (entityType, key, rows, reason) => {
  const sorted = [...rows].sort((a, b) => {
    // For user-like entities, prefer better verified profile as primary.
    if (entityType === 'user' || entityType === 'kyc_document') {
      const scoreDiff = candidatePrimaryScore(b) - candidatePrimaryScore(a);
      if (scoreDiff !== 0) return scoreDiff;
    }
    // Stable tie-breaker: oldest record first.
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  const [primary, ...duplicates] = sorted;
  const confidence = scoreDuplicateConfidence(entityType, reason, rows.length);
  const signals = {
    reason,
    matchCount: rows.length,
    highConfidence: confidence >= 85,
  };
  return {
    entityType,
    key,
    reason,
    confidence,
    signals,
    matchCount: rows.length,
    primary: {
      id: primary?._id,
      label:
        primary?.name ||
        primary?.email ||
        primary?.title ||
        primary?.location ||
        String(primary?._id || ''),
      name: primary?.name || '',
      email: primary?.email || '',
      role: primary?.role || '',
      citizenshipNumber: primary?.citizenshipNumber || '',
      createdAt: primary?.createdAt || null,
      kycStatus: resolveUserKycStatus(primary),
      ownerVerificationStatus: resolveOwnerVerificationStatus(primary),
      isActive: typeof primary?.isActive === 'boolean' ? primary.isActive : null,
    },
    duplicates: duplicates.map((row) => ({
      id: row._id,
      label: row?.name || row?.email || row?.title || row?.location || String(row?._id || ''),
      name: row?.name || '',
      email: row?.email || '',
      role: row?.role || '',
      citizenshipNumber: row?.citizenshipNumber || '',
      createdAt: row?.createdAt || null,
      kycStatus: resolveUserKycStatus(row),
      ownerVerificationStatus: resolveOwnerVerificationStatus(row),
      isActive: typeof row?.isActive === 'boolean' ? row.isActive : null,
    })),
    suggestedAction:
      entityType === 'property'
        ? 'Keep the earliest listing as canonical, then review and archive duplicate listings.'
        : entityType === 'kyc_document'
          ? 'Review KYC docs and retain one user identity record as source of truth.'
          : 'Review user profiles and merge duplicate identities manually.',
    workflow: {
      status: 'new',
      assignee: null,
    },
  };
};

const preferUserSuggestion = (existing, candidate) => {
  if (!existing) return candidate;
  const existingCitizenship = normalizeText(existing.reason).includes('citizenship number');
  const candidateCitizenship = normalizeText(candidate.reason).includes('citizenship number');
  if (candidateCitizenship && !existingCitizenship) return candidate;
  if (existingCitizenship && !candidateCitizenship) return existing;
  if (Number(candidate.confidence || 0) > Number(existing.confidence || 0)) return candidate;
  return existing;
};

const collapseUserSuggestionsToSingleEntity = (suggestions = []) => {
  const byMemberSet = new Map();
  suggestions.forEach((item) => {
    const memberIds = [
      item?.primary?.id,
      ...(Array.isArray(item?.duplicates) ? item.duplicates.map((row) => row?.id) : []),
    ]
      .filter(Boolean)
      .map((id) => String(id))
      .sort();
    if (!memberIds.length) return;
    const setKey = memberIds.join('|');
    const winner = preferUserSuggestion(byMemberSet.get(setKey), item);
    byMemberSet.set(setKey, winner);
  });

  return Array.from(byMemberSet.values()).map((item) => ({
    ...item,
    signals: {
      ...(item.signals || {}),
      singleCanonicalEntity: true,
      superiorPrimaryRule: 'highest_verified_profile',
    },
  }));
};

const toSeverity = (score) => {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

const computeSmartMeta = (suggestion, caseDoc) => {
  const confidence = Number(suggestion?.confidence || 0);
  const matchCount = Number(suggestion?.matchCount || 0);
  const reason = normalizeText(suggestion?.reason);
  const duplicateList = Array.isArray(suggestion?.duplicates) ? suggestion.duplicates : [];
  const activeDuplicates = duplicateList.filter((item) => item?.isActive === true).length;
  const unverifiedDuplicates = duplicateList.filter((item) =>
    ['unverified', 'unsubmitted', 'pending', 'rejected'].includes(String(item?.kycStatus || '').toLowerCase())
  ).length;
  const primaryIsInactive = suggestion?.primary?.isActive === false;
  const staleHours = caseDoc?.updatedAt
    ? Math.max(0, (Date.now() - new Date(caseDoc.updatedAt).getTime()) / (1000 * 60 * 60))
    : 0;

  let score = confidence * 0.62 + Math.min(20, matchCount * 5);
  if (suggestion?.entityType === 'kyc_document') score += 8;
  if (reason.includes('citizenship') || reason.includes('publicid')) score += 7;
  if (primaryIsInactive && activeDuplicates > 0) score += 6;
  if (unverifiedDuplicates > 0) score += Math.min(6, unverifiedDuplicates * 2);
  if (staleHours >= 72) score += 6;
  if (staleHours >= 168) score += 6;
  if ((caseDoc?.status || 'new') === 'new') score += 4;

  const roundedScore = Math.max(1, Math.min(99, Math.round(score)));
  const severity = toSeverity(roundedScore);
  const recommendedStatus = severity === 'low' ? 'false_positive' : 'reviewing';
  const nextStep =
    severity === 'critical'
      ? 'Assign immediately and verify merge impact before any deletion.'
      : severity === 'high'
        ? 'Start review now and resolve in current triage cycle.'
        : severity === 'medium'
          ? 'Queue for review and gather supporting notes.'
          : 'Likely false positive; verify quickly before closing.';

  return {
    priorityScore: roundedScore,
    severity,
    staleHours: Math.round(staleHours),
    recommendedStatus,
    signals: {
      activeDuplicates,
      unverifiedDuplicates,
      primaryIsInactive,
      staleReview: staleHours >= 72,
    },
    nextStep,
  };
};

export const getDuplicateHub = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
    const minConfidence = Math.max(0, Math.min(Number(req.query.minConfidence || 0), 100));
    const entityTypeFilter = String(req.query.entityType || '').trim().toLowerCase();
    const includeResolved = String(req.query.includeResolved || 'false').toLowerCase() === 'true';
    const statuses = ['new', 'reviewing', 'merged', 'ignored', 'false_positive'];
    const [users, properties] = await Promise.all([
      User.find()
        .select('_id name email citizenshipNumber kycStatus ownerVerificationStatus isActive kycDocuments createdAt')
        .sort({ createdAt: 1 })
        .limit(10_000)
        .lean(),
      Property.find()
        .select('_id title location price ownerId image createdAt')
        .sort({ createdAt: 1 })
        .limit(10_000)
        .lean(),
    ]);

    const userByCitizenship = new Map();
    const userByNameCitizenship = new Map();
    const propertyByFingerprint = new Map();
    const propertyByImage = new Map();
    const docsByPublicId = new Map();
    const docsByImage = new Map();

    users.forEach((user) => {
      const citizenship = normalizeNumberLike(user.citizenshipNumber);
      if (citizenship) {
        const list = userByCitizenship.get(citizenship) || [];
        list.push(user);
        userByCitizenship.set(citizenship, list);
      }

      const nameKey = normalizeText(user.name);
      if (nameKey && citizenship) {
        const key = `${nameKey}::${citizenship}`;
        const list = userByNameCitizenship.get(key) || [];
        list.push(user);
        userByNameCitizenship.set(key, list);
      }

      const docs = Array.isArray(user.kycDocuments) ? user.kycDocuments : [];
      docs.forEach((doc) => {
        const publicId = normalizeText(doc?.publicId);
        const imageUrl = normalizeUrl(doc?.imageUrl);

        if (publicId) {
          const list = docsByPublicId.get(publicId) || [];
          list.push({ user, doc });
          docsByPublicId.set(publicId, list);
        }
        if (imageUrl) {
          const list = docsByImage.get(imageUrl) || [];
          list.push({ user, doc });
          docsByImage.set(imageUrl, list);
        }
      });
    });

    properties.forEach((property) => {
      const key = [
        normalizeText(property.title),
        normalizeText(property.location),
        normalizeNumberLike(property.ownerId),
        Number(property.price || 0).toFixed(2),
      ].join('::');
      const list = propertyByFingerprint.get(key) || [];
      list.push(property);
      propertyByFingerprint.set(key, list);

      const image = normalizeUrl(property.image);
      if (image) {
        const sameImage = propertyByImage.get(image) || [];
        sameImage.push(property);
        propertyByImage.set(image, sameImage);
      }
    });

    const userSuggestionsRaw = [];
    userByCitizenship.forEach((rows, key) => {
      if (rows.length > 1) {
        userSuggestionsRaw.push(
          toMergeSuggestion('user', key, rows, 'Same citizenship number')
        );
      }
    });
    userByNameCitizenship.forEach((rows, key) => {
      if (rows.length > 1) {
        userSuggestionsRaw.push(
          toMergeSuggestion('user', key, rows, 'Same normalized name + citizenship')
        );
      }
    });
    const userSuggestions = collapseUserSuggestionsToSingleEntity(userSuggestionsRaw);

    const propertySuggestions = [];
    propertyByFingerprint.forEach((rows, key) => {
      if (rows.length > 1) {
        propertySuggestions.push(
          toMergeSuggestion('property', key, rows, 'Same title + location + owner + price')
        );
      }
    });
    propertyByImage.forEach((rows, key) => {
      if (rows.length > 1) {
        propertySuggestions.push(
          toMergeSuggestion('property', key, rows, 'Same property image URL')
        );
      }
    });

    const docSuggestions = [];
    docsByPublicId.forEach((rows, key) => {
      if (rows.length > 1) {
        const mapped = rows.map(({ user }) => user);
        docSuggestions.push(
          toMergeSuggestion('kyc_document', key, mapped, 'Same KYC publicId across users')
        );
      }
    });
    docsByImage.forEach((rows, key) => {
      if (rows.length > 1) {
        const mapped = rows.map(({ user }) => user);
        docSuggestions.push(
          toMergeSuggestion('kyc_document', key, mapped, 'Same KYC image URL across users')
        );
      }
    });

    const uniqueBySignature = new Map();
    [...userSuggestions, ...propertySuggestions, ...docSuggestions].forEach((item) => {
      const sig = `${item.entityType}:${item.key}:${item.primary?.id || ''}`;
      if (!uniqueBySignature.has(sig)) uniqueBySignature.set(sig, item);
    });

    const suggestions = Array.from(uniqueBySignature.values())
      .sort((a, b) => b.confidence - a.confidence || b.matchCount - a.matchCount);

    const keys = suggestions.map((item) => item.key);
    const entityTypes = suggestions.map((item) => item.entityType);
    const cases = keys.length
      ? await DuplicateCase.find({
          key: { $in: keys },
          entityType: { $in: entityTypes },
        })
          .populate('assignee', 'username displayName role')
          .lean()
      : [];
    const caseMap = new Map(cases.map((row) => [`${row.entityType}:${row.key}`, row]));

    // Auto-reopen incorrectly closed merged cases if duplicates still exist in a fresh scan.
    const staleMergedCaseIds = suggestions
      .filter((item) => {
        const caseDoc = caseMap.get(`${item.entityType}:${item.key}`);
        if (!caseDoc || caseDoc.status !== 'merged') return false;
        const duplicates = Array.isArray(item?.duplicates) ? item.duplicates : [];
        // Reopen only if there is at least one actionable active duplicate left.
        return duplicates.some((dup) => dup?.isActive === true);
      })
      .map((item) => {
        const row = caseMap.get(`${item.entityType}:${item.key}`);
        return String(row?._id || '');
      })
      .filter(Boolean);
    if (staleMergedCaseIds.length) {
      await DuplicateCase.updateMany(
        { _id: { $in: staleMergedCaseIds } },
        {
          $set: {
            status: 'reviewing',
            reviewedBy: null,
            resolvedAt: null,
          },
        }
      );
      staleMergedCaseIds.forEach((id) => {
        const hit = cases.find((row) => String(row._id) === String(id));
        if (hit) {
          hit.status = 'reviewing';
          hit.reviewedBy = null;
          hit.resolvedAt = null;
        }
      });
    }

    const enriched = suggestions
      .map((item) => {
        const caseDoc = caseMap.get(`${item.entityType}:${item.key}`);
        const status = caseDoc?.status || 'new';
        const smart = computeSmartMeta(item, caseDoc);
        return {
          ...item,
          smart,
          workflow: {
            status,
            assignee: caseDoc?.assignee || null,
            caseId: caseDoc?._id || null,
            updatedAt: caseDoc?.updatedAt || null,
          },
        };
      })
      .filter((item) => (!entityTypeFilter ? true : item.entityType === entityTypeFilter))
      .filter((item) => item.confidence >= minConfidence)
      .filter((item) => (includeResolved ? true : ['new', 'reviewing'].includes(item.workflow.status)))
      .slice(0, limit);

    const smartSummary = enriched.reduce(
      (acc, item) => {
        const severity = item?.smart?.severity || 'low';
        if (severity === 'critical') acc.critical += 1;
        else if (severity === 'high') acc.high += 1;
        else if (severity === 'medium') acc.medium += 1;
        else acc.low += 1;
        if (item?.smart?.signals?.staleReview) acc.stale += 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, stale: 0 }
    );

    return res.json({
      scanned: {
        users: users.length,
        properties: properties.length,
      },
      totals: {
        userDuplicateGroups: userSuggestions.length,
        propertyDuplicateGroups: propertySuggestions.length,
        docDuplicateGroups: docSuggestions.length,
        allGroups: uniqueBySignature.size,
      },
      filters: {
        entityType: entityTypeFilter || null,
        minConfidence,
        includeResolved,
      },
      smartSummary,
      statuses,
      suggestions: enriched,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to scan duplicates' });
  }
};

export const getDuplicateCases = async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 30);
    const status = String(req.query.status || '').trim().toLowerCase();
    const entityType = String(req.query.entityType || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim();

    const filter = {};
    if (status) filter.status = status;
    if (entityType) filter.entityType = entityType;
    if (q) {
      filter.$or = [{ key: safeRegex(q) }, { reason: safeRegex(q) }, { notes: safeRegex(q) }];
    }

    const [items, total] = await Promise.all([
      DuplicateCase.find(filter)
        .populate('assignee', 'username displayName role')
        .populate('reviewedBy', 'username displayName role')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DuplicateCase.countDocuments(filter),
    ]);

    return sendPaginated(res, items, total, page, limit);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch duplicate cases' });
  }
};

export const upsertDuplicateCase = async (req, res) => {
  try {
    const {
      entityType,
      key,
      reason,
      confidence,
      signals,
      primary,
      duplicates,
      suggestedAction,
      status,
      assigneeId,
      notes,
      resolutionSummary,
    } = req.body || {};

    if (!entityType || !key) {
      return res.status(400).json({ error: 'entityType and key are required' });
    }

    const updates = {
      entityType: String(entityType),
      key: String(key),
      reason: String(reason || ''),
      confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
      signals: signals || {},
      primary: primary || {},
      duplicates: Array.isArray(duplicates) ? duplicates : [],
      suggestedAction: String(suggestedAction || ''),
      status: status || 'reviewing',
      assignee: assigneeId || undefined,
      notes: String(notes || ''),
      resolutionSummary: String(resolutionSummary || ''),
    };

    if (['merged', 'ignored', 'false_positive'].includes(String(updates.status))) {
      updates.reviewedBy = req.admin._id;
      updates.resolvedAt = new Date();
    } else {
      updates.reviewedBy = undefined;
      updates.resolvedAt = undefined;
    }

    const doc = await DuplicateCase.findOneAndUpdate(
      { entityType: updates.entityType, key: updates.key },
      updates,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate('assignee', 'username displayName role')
      .populate('reviewedBy', 'username displayName role');

    await logAudit(req, 'duplicate_case_upserted', 'DuplicateCase', doc._id, {
      entityType: updates.entityType,
      key: updates.key,
      status: updates.status,
    });

    return res.json(doc);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save duplicate case' });
  }
};

export const updateDuplicateCase = async (req, res) => {
  try {
    const { status, assigneeId, notes, resolutionSummary } = req.body || {};
    const updates = {};
    if (status) updates.status = String(status);
    if (assigneeId !== undefined) updates.assignee = assigneeId || null;
    if (notes !== undefined) updates.notes = String(notes || '');
    if (resolutionSummary !== undefined) updates.resolutionSummary = String(resolutionSummary || '');
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    if (updates.status && ['merged', 'ignored', 'false_positive'].includes(updates.status)) {
      updates.reviewedBy = req.admin._id;
      updates.resolvedAt = new Date();
    } else if (updates.status && ['new', 'reviewing'].includes(updates.status)) {
      updates.reviewedBy = null;
      updates.resolvedAt = null;
    }

    const doc = await DuplicateCase.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignee', 'username displayName role')
      .populate('reviewedBy', 'username displayName role');
    if (!doc) return res.status(404).json({ error: 'Duplicate case not found' });

    await logAudit(req, 'duplicate_case_updated', 'DuplicateCase', doc._id, updates);
    return res.json(doc);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update duplicate case' });
  }
};

export const bulkUpdateDuplicateCases = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const status = String(req.body?.status || '').trim();
    const assigneeId = req.body?.assigneeId;
    if (!ids.length) return res.status(400).json({ error: 'ids array is required' });
    if (!status && assigneeId === undefined) {
      return res.status(400).json({ error: 'status or assigneeId is required' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (assigneeId !== undefined) updates.assignee = assigneeId || null;
    if (status && ['merged', 'ignored', 'false_positive'].includes(status)) {
      updates.reviewedBy = req.admin._id;
      updates.resolvedAt = new Date();
    } else if (status && ['new', 'reviewing'].includes(status)) {
      updates.reviewedBy = null;
      updates.resolvedAt = null;
    }

    const result = await DuplicateCase.updateMany({ _id: { $in: ids } }, updates);
    await logAudit(req, 'duplicate_case_bulk_updated', 'DuplicateCase', 'bulk', {
      idsCount: ids.length,
      updates,
      modifiedCount: result.modifiedCount || 0,
    });
    return res.json({
      success: true,
      requested: ids.length,
      modified: result.modifiedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to bulk update duplicate cases' });
  }
};

const getDuplicateUserImpactSummary = async (userId) => {
  const [
    bookingsAsRenter,
    propertiesOwned,
    paymentsAsRenter,
    ownerPayments,
    messagesSent,
    messagesReceived,
    messagesRecipient,
    agreementsAsOwner,
    agreementsAsRenter,
    complaintsAsOwner,
    notifications,
    amendmentsRequested,
    amendmentsDecided,
    depositAsRenter,
    depositAsOwner,
    depositCreatedBy,
    depositApprovedBy,
  ] = await Promise.all([
    Booking.countDocuments({ renter: userId }),
    Property.countDocuments({ ownerId: userId }),
    Payment.countDocuments({ renter: userId }),
    Payment.countDocuments({ ownerId: userId }),
    Message.countDocuments({ sender: userId }),
    Message.countDocuments({ receiver: userId }),
    Message.countDocuments({ recipient: userId }),
    Agreement.countDocuments({ owner: userId }),
    Agreement.countDocuments({ renter: userId }),
    Complaint.countDocuments({ ownerId: userId }),
    Notification.countDocuments({ userId }),
    LeaseAmendment.countDocuments({ requestedBy: userId }),
    LeaseAmendment.countDocuments({ decidedBy: userId }),
    DepositLedgerEntry.countDocuments({ renter: userId }),
    DepositLedgerEntry.countDocuments({ owner: userId }),
    DepositLedgerEntry.countDocuments({ createdBy: userId }),
    DepositLedgerEntry.countDocuments({ approvedBy: userId }),
  ]);

  const refs = {
    bookingsAsRenter,
    propertiesOwned,
    paymentsAsRenter,
    ownerPayments,
    messagesSent,
    messagesReceived,
    messagesRecipient,
    agreementsAsOwner,
    agreementsAsRenter,
    complaintsAsOwner,
    notifications,
    amendmentsRequested,
    amendmentsDecided,
    depositAsRenter,
    depositAsOwner,
    depositCreatedBy,
    depositApprovedBy,
  };

  const totalRefs = Object.values(refs).reduce((sum, value) => sum + Number(value || 0), 0);
  return { refs, totalRefs };
};

const DUPLICATE_USER_MERGE_MAPPINGS = [
  { label: 'bookingsAsRenter', model: Booking, modelName: 'Booking', field: 'renter' },
  { label: 'propertiesOwned', model: Property, modelName: 'Property', field: 'ownerId' },
  { label: 'paymentsAsRenter', model: Payment, modelName: 'Payment', field: 'renter' },
  { label: 'ownerPayments', model: Payment, modelName: 'Payment', field: 'ownerId' },
  { label: 'messagesSent', model: Message, modelName: 'Message', field: 'sender' },
  { label: 'messagesReceived', model: Message, modelName: 'Message', field: 'receiver' },
  { label: 'messagesRecipient', model: Message, modelName: 'Message', field: 'recipient' },
  { label: 'agreementsAsOwner', model: Agreement, modelName: 'Agreement', field: 'owner' },
  { label: 'agreementsAsRenter', model: Agreement, modelName: 'Agreement', field: 'renter' },
  { label: 'complaintsAsOwner', model: Complaint, modelName: 'Complaint', field: 'ownerId' },
  { label: 'notifications', model: Notification, modelName: 'Notification', field: 'userId' },
  { label: 'amendmentsRequested', model: LeaseAmendment, modelName: 'LeaseAmendment', field: 'requestedBy' },
  { label: 'amendmentsDecided', model: LeaseAmendment, modelName: 'LeaseAmendment', field: 'decidedBy' },
  { label: 'depositAsRenter', model: DepositLedgerEntry, modelName: 'DepositLedgerEntry', field: 'renter' },
  { label: 'depositAsOwner', model: DepositLedgerEntry, modelName: 'DepositLedgerEntry', field: 'owner' },
  { label: 'depositCreatedBy', model: DepositLedgerEntry, modelName: 'DepositLedgerEntry', field: 'createdBy' },
  { label: 'depositApprovedBy', model: DepositLedgerEntry, modelName: 'DepositLedgerEntry', field: 'approvedBy' },
];

const DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES = 30;

const toDocDedupKey = (doc) => {
  const publicId = normalizeText(doc?.publicId);
  const imageUrl = normalizeUrl(doc?.imageUrl);
  if (publicId) return `pid:${publicId}`;
  if (imageUrl) return `img:${imageUrl}`;
  return `fallback:${normalizeText(JSON.stringify(doc || {}))}`;
};

const detectMergeConflicts = async (source, target) => {
  const conflicts = [];

  if (source.role === 'admin' || target.role === 'admin') {
    conflicts.push({
      code: 'admin_role_user',
      severity: 'blocking',
      message: 'Admin users cannot be merged from duplicate hub.',
    });
  }

  const sourceIdNo = normalizeNumberLike(source.citizenshipNumber);
  const targetIdNo = normalizeNumberLike(target.citizenshipNumber);
  if (sourceIdNo && targetIdNo && sourceIdNo !== targetIdNo) {
    conflicts.push({
      code: 'citizenship_mismatch',
      severity: 'warning',
      message: 'Source and target have different citizenship numbers.',
    });
  }

  const [sourceActiveApproved, targetActiveApproved] = await Promise.all([
    Booking.find({ renter: source._id, status: 'Approved' })
      .select('_id property fromDate toDate')
      .lean(),
    Booking.find({ renter: target._id, status: 'Approved' })
      .select('_id property fromDate toDate')
      .lean(),
  ]);

  let overlapCount = 0;
  for (const sRow of sourceActiveApproved) {
    const hasOverlap = targetActiveApproved.some((tRow) => {
      if (String(sRow.property || '') !== String(tRow.property || '')) return false;
      const sFrom = new Date(sRow.fromDate || 0).getTime();
      const sTo = new Date(sRow.toDate || 0).getTime();
      const tFrom = new Date(tRow.fromDate || 0).getTime();
      const tTo = new Date(tRow.toDate || 0).getTime();
      return sFrom <= tTo && sTo >= tFrom;
    });
    if (hasOverlap) overlapCount += 1;
  }
  if (overlapCount > 0) {
    conflicts.push({
      code: 'approved_booking_overlap',
      severity: 'warning',
      message: `Found ${overlapCount} overlapping approved booking(s) for target renter profile.`,
      count: overlapCount,
    });
  }

  return conflicts;
};

const getUserMoveCounts = async (sourceUserId) => {
  const rows = await Promise.all(
    DUPLICATE_USER_MERGE_MAPPINGS.map(async (mapRow) => ({
      key: mapRow.label,
      count: await mapRow.model.countDocuments({ [mapRow.field]: sourceUserId }),
    }))
  );
  return rows.reduce((acc, row) => {
    acc[row.key] = Number(row.count || 0);
    return acc;
  }, {});
};

const runDuplicateUserMerge = async ({ req, source, target, note }) => {
  const sourceUserId = source._id;
  const targetUserId = target._id;
  const sourceSnapshot = {
    isActive: source.isActive,
    ownerVerificationStatus: source.ownerVerificationStatus || null,
    kycStatus: source.kycStatus || null,
    kycDocuments: Array.isArray(source.kycDocuments) ? source.kycDocuments : [],
  };
  const targetSnapshot = {
    isActive: target.isActive,
    ownerVerificationStatus: target.ownerVerificationStatus || null,
    kycStatus: target.kycStatus || null,
    kycDocuments: Array.isArray(target.kycDocuments) ? target.kycDocuments : [],
  };

  const movedRefs = [];
  let totalModified = 0;

  for (const mapRow of DUPLICATE_USER_MERGE_MAPPINGS) {
    const found = await mapRow.model.find({ [mapRow.field]: sourceUserId }).select('_id').lean();
    const ids = found.map((row) => row._id);
    if (!ids.length) continue;
    const write = await mapRow.model.updateMany(
      { _id: { $in: ids } },
      { $set: { [mapRow.field]: targetUserId } }
    );
    totalModified += Number(write?.modifiedCount || 0);
    movedRefs.push({
      label: mapRow.label,
      model: mapRow.modelName,
      field: mapRow.field,
      ids,
    });
  }

  const sourceDocs = Array.isArray(source.kycDocuments) ? source.kycDocuments : [];
  const targetDocs = Array.isArray(target.kycDocuments) ? target.kycDocuments : [];
  const targetKeys = new Set(targetDocs.map((doc) => toDocDedupKey(doc)));
  const docsToMove = sourceDocs.filter((doc) => !targetKeys.has(toDocDedupKey(doc)));
  if (docsToMove.length) {
    target.kycDocuments = [...targetDocs, ...docsToMove];
    await target.save();
  }

  source.isActive = false;
  source.ownerVerificationStatus = source.ownerVerificationStatus || 'unverified';
  source.kycStatus = source.kycStatus || 'unsubmitted';
  source.mergeStatus = 'duplicate_merged';
  source.mergedIntoUserId = targetUserId;
  source.mergedAt = new Date();
  source.mergeNote = String(note || '');
  await source.save();

  const rollbackExpiresAt = new Date(Date.now() + DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES * 60 * 1000);
  const operation = await DuplicateMergeOperation.create({
    sourceUserId,
    targetUserId,
    performedBy: req.admin._id,
    note: String(note || ''),
    rollbackExpiresAt,
    sourceSnapshot,
    targetSnapshot,
    movedRefs,
    movedDocPublicIds: docsToMove.map((doc) => String(doc?.publicId || '')).filter(Boolean),
    movedDocImageUrls: docsToMove.map((doc) => String(doc?.imageUrl || '')).filter(Boolean),
  });

  return { operation, totalModified, movedRefsCount: movedRefs.length, docsMoved: docsToMove.length };
};

export const getDuplicateUserImpact = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('_id name email role isActive createdAt')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { refs, totalRefs } = await getDuplicateUserImpactSummary(user._id);
    const safeToHardDelete = totalRefs === 0 && user.role !== 'admin';
    const allowedActions = [
      'deactivate',
      'merge_into_primary',
      ...(safeToHardDelete ? ['hard_delete_if_safe'] : []),
    ];

    return res.json({
      user,
      refs,
      totalRefs,
      safeToHardDelete,
      allowedActions,
      recommendations: {
        primary: totalRefs > 0 ? 'merge_into_primary' : 'hard_delete_if_safe',
        fallback: 'deactivate',
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to evaluate duplicate user impact' });
  }
};

export const getDuplicateUserMergePreview = async (req, res) => {
  try {
    const sourceUserId = String(req.params.userId || '').trim();
    const targetUserId = String(req.query.targetUserId || '').trim();
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });
    if (sourceUserId === targetUserId) {
      return res.status(400).json({ error: 'targetUserId must be different from source user' });
    }

    const [source, target] = await Promise.all([
      User.findById(sourceUserId)
        .select('_id name email role isActive citizenshipNumber kycStatus ownerVerificationStatus kycDocuments createdAt')
        .lean(),
      User.findById(targetUserId)
        .select('_id name email role isActive citizenshipNumber kycStatus ownerVerificationStatus kycDocuments createdAt')
        .lean(),
    ]);

    if (!source) return res.status(404).json({ error: 'Source user not found' });
    if (!target) return res.status(404).json({ error: 'Target user not found' });

    const moveCounts = await getUserMoveCounts(source._id);
    const sourceDocs = Array.isArray(source.kycDocuments) ? source.kycDocuments : [];
    const targetDocs = Array.isArray(target.kycDocuments) ? target.kycDocuments : [];
    const targetKeys = new Set(targetDocs.map((doc) => toDocDedupKey(doc)));
    const docsToMove = sourceDocs.filter((doc) => !targetKeys.has(toDocDedupKey(doc)));
    const conflicts = await detectMergeConflicts(source, target);
    const blockingConflicts = conflicts.filter((item) => item.severity === 'blocking');

    return res.json({
      source: {
        _id: source._id,
        name: source.name,
        email: source.email,
        role: source.role,
        isActive: source.isActive,
      },
      target: {
        _id: target._id,
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: target.isActive,
      },
      moveCounts,
      docs: {
        sourceCount: sourceDocs.length,
        targetCount: targetDocs.length,
        willMove: docsToMove.length,
      },
      conflicts,
      canMerge: blockingConflicts.length === 0,
      rollbackWindowMinutes: DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to build merge preview' });
  }
};

export const commitDuplicateUserMerge = async (req, res) => {
  try {
    const sourceUserId = String(req.params.userId || '').trim();
    const targetUserId = String(req.body?.targetUserId || '').trim();
    const duplicateCaseId = String(req.body?.duplicateCaseId || '').trim();
    const suggestionEntityType = String(req.body?.suggestionEntityType || '').trim().toLowerCase();
    const suggestionKey = String(req.body?.suggestionKey || '').trim();
    const note = String(req.body?.note || '').trim();
    const confirmed = Boolean(req.body?.confirmed);

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });
    if (!confirmed) return res.status(400).json({ error: 'Merge confirmation is required' });
    if (sourceUserId === targetUserId) {
      return res.status(400).json({ error: 'targetUserId must be different from source user' });
    }

    const source = await User.findById(sourceUserId);
    if (!source) return res.status(404).json({ error: 'Source user not found' });
    const target = await User.findById(targetUserId);
    if (!target) return res.status(404).json({ error: 'Target user not found' });

    const conflicts = await detectMergeConflicts(source, target);
    const blockingConflicts = conflicts.filter((item) => item.severity === 'blocking');
    if (blockingConflicts.length) {
      return res.status(409).json({ error: 'Merge blocked due to conflicts', conflicts });
    }

    const { refs } = await getDuplicateUserImpactSummary(source._id);
    const { operation, totalModified, movedRefsCount, docsMoved } = await runDuplicateUserMerge({
      req,
      source,
      target,
      note,
    });
    const emailDelivery = await notifyDuplicateMergeUsers({
      sourceUser: source,
      targetUser: target,
      operation,
      totalModified,
      docsMoved,
      rollbackWindowMinutes: DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES,
    });

    await logAudit(req, 'duplicate_user_merged', 'User', source._id, {
      targetUserId: target._id,
      note,
      refsBefore: refs,
      totalModified,
      movedRefsCount,
      docsMoved,
      mergeOperationId: operation._id,
      rollbackExpiresAt: operation.rollbackExpiresAt,
      emailDelivery,
    });

    let updatedCase = null;
    const mergedCaseUpdate = {
      status: 'merged',
      reviewedBy: req.admin._id,
      resolvedAt: new Date(),
      resolutionSummary: `Merged ${source._id} into ${target._id} via confirm merge.`,
    };
    if (duplicateCaseId) {
      updatedCase = await DuplicateCase.findByIdAndUpdate(
        duplicateCaseId,
        { $set: mergedCaseUpdate },
        { new: true }
      )
        .populate('assignee', 'username displayName role')
        .populate('reviewedBy', 'username displayName role');
    } else if (suggestionEntityType && suggestionKey) {
      updatedCase = await DuplicateCase.findOneAndUpdate(
        { entityType: suggestionEntityType, key: suggestionKey },
        {
          $set: mergedCaseUpdate,
          $setOnInsert: {
            entityType: suggestionEntityType,
            key: suggestionKey,
            reason: 'Auto-updated after confirmed merge',
            confidence: 90,
            primary: { id: target._id, label: target.name || target.email || String(target._id) },
            duplicates: [{ id: source._id, label: source.name || source.email || String(source._id) }],
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
        .populate('assignee', 'username displayName role')
        .populate('reviewedBy', 'username displayName role');
    }

    return res.json({
      success: true,
      action: 'merge_into_primary',
      sourceUserId: source._id,
      targetUserId: target._id,
      totalModified,
      movedRefsCount,
      docsMoved,
      mergeOperationId: operation._id,
      rollbackExpiresAt: operation.rollbackExpiresAt,
      rollbackWindowMinutes: DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES,
      emailDelivery,
      case: updatedCase,
      sourceAfterMerge: {
        _id: source._id,
        isActive: source.isActive,
        mergeStatus: source.mergeStatus || null,
        mergedIntoUserId: source.mergedIntoUserId || null,
        mergedAt: source.mergedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to commit duplicate merge' });
  }
};

export const rollbackDuplicateUserMerge = async (req, res) => {
  try {
    const operation = await DuplicateMergeOperation.findById(req.params.operationId);
    if (!operation) return res.status(404).json({ error: 'Merge operation not found' });
    if (operation.status !== 'completed') {
      return res.status(409).json({ error: `Cannot rollback. Operation is ${operation.status}.` });
    }

    if (new Date(operation.rollbackExpiresAt).getTime() < Date.now()) {
      operation.status = 'expired';
      await operation.save();
      return res.status(409).json({ error: 'Rollback window expired' });
    }

    const source = await User.findById(operation.sourceUserId);
    const target = await User.findById(operation.targetUserId);
    if (!source || !target) return res.status(404).json({ error: 'Source or target user not found for rollback' });

    for (const row of operation.movedRefs || []) {
      const mapping = DUPLICATE_USER_MERGE_MAPPINGS.find(
        (item) => item.modelName === row.model && item.field === row.field
      );
      if (!mapping) continue;
      const ids = Array.isArray(row.ids) ? row.ids : [];
      if (!ids.length) continue;
      await mapping.model.updateMany(
        { _id: { $in: ids } },
        { $set: { [mapping.field]: operation.sourceUserId } }
      );
    }

    source.isActive = operation.sourceSnapshot?.isActive ?? source.isActive;
    source.ownerVerificationStatus = operation.sourceSnapshot?.ownerVerificationStatus ?? source.ownerVerificationStatus;
    source.kycStatus = operation.sourceSnapshot?.kycStatus ?? source.kycStatus;
    source.kycDocuments = Array.isArray(operation.sourceSnapshot?.kycDocuments)
      ? operation.sourceSnapshot.kycDocuments
      : source.kycDocuments;

    target.isActive = operation.targetSnapshot?.isActive ?? target.isActive;
    target.ownerVerificationStatus = operation.targetSnapshot?.ownerVerificationStatus ?? target.ownerVerificationStatus;
    target.kycStatus = operation.targetSnapshot?.kycStatus ?? target.kycStatus;
    target.kycDocuments = Array.isArray(operation.targetSnapshot?.kycDocuments)
      ? operation.targetSnapshot.kycDocuments
      : target.kycDocuments;

    await Promise.all([source.save(), target.save()]);

    operation.status = 'rolled_back';
    operation.rolledBackAt = new Date();
    operation.rolledBackBy = req.admin._id;
    await operation.save();

    await logAudit(req, 'duplicate_user_merge_rolled_back', 'DuplicateMergeOperation', operation._id, {
      sourceUserId: operation.sourceUserId,
      targetUserId: operation.targetUserId,
    });

    return res.json({
      success: true,
      operationId: operation._id,
      status: operation.status,
      rolledBackAt: operation.rolledBackAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to rollback duplicate merge' });
  }
};

export const getDuplicateMergeHistory = async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20);
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();

    const filter = {};
    if (status) filter.status = status;

    const rows = await DuplicateMergeOperation.find(filter)
      .populate('sourceUserId', 'name email role isActive mergedAt mergeStatus')
      .populate('targetUserId', 'name email role isActive')
      .populate('performedBy', 'username displayName role')
      .populate('rolledBackBy', 'username displayName role')
      .sort({ createdAt: -1 })
      .lean();

    const filtered = q
      ? rows.filter((row) => {
          const haystack = [
            row?._id,
            row?.status,
            row?.sourceUserId?.name,
            row?.sourceUserId?.email,
            row?.targetUserId?.name,
            row?.targetUserId?.email,
            row?.performedBy?.displayName,
            row?.performedBy?.username,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        })
      : rows;

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return sendPaginated(res, items, total, page, limit);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch duplicate merge history' });
  }
};

export const getSoftDeletedDuplicateUsers = async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20);
    const q = String(req.query.q || '').trim().toLowerCase();

    const rows = await User.find({
      isActive: false,
      mergeStatus: 'duplicate_merged',
    })
      .select(
        '_id name email role isActive citizenshipNumber kycStatus ownerVerificationStatus mergeStatus mergedIntoUserId mergedAt mergeNote createdAt updatedAt'
      )
      .populate('mergedIntoUserId', 'name email role isActive')
      .sort({ mergedAt: -1, updatedAt: -1 })
      .lean();

    const filtered = q
      ? rows.filter((row) => {
          const haystack = [
            row?._id,
            row?.name,
            row?.email,
            row?.citizenshipNumber,
            row?.role,
            row?.mergeStatus,
            row?.mergedIntoUserId?._id,
            row?.mergedIntoUserId?.name,
            row?.mergedIntoUserId?.email,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        })
      : rows;

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return sendPaginated(res, items, total, page, limit);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch soft deleted duplicate users' });
  }
};

export const resolveDuplicateUser = async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    const targetUserId = req.body?.targetUserId ? String(req.body.targetUserId) : '';
    const note = String(req.body?.note || '').trim();
    if (!['deactivate', 'hard_delete_if_safe', 'merge_into_primary'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const source = await User.findById(req.params.userId);
    if (!source) return res.status(404).json({ error: 'User not found' });

    const { refs, totalRefs } = await getDuplicateUserImpactSummary(source._id);

    if (action === 'hard_delete_if_safe') {
      if (source.role === 'admin') {
        return res.status(400).json({ error: 'Admin users cannot be hard deleted from duplicate hub' });
      }
      if (totalRefs > 0) {
        return res.status(409).json({ error: 'User has linked records. Use merge or deactivate.' });
      }
      await User.deleteOne({ _id: source._id });
      await logAudit(req, 'duplicate_user_hard_deleted', 'User', source._id, {
        note,
        refs,
      });
      return res.json({ success: true, action, deletedUserId: source._id });
    }

    if (action === 'deactivate') {
      source.isActive = false;
      await source.save();
      await logAudit(req, 'duplicate_user_deactivated', 'User', source._id, {
        note,
        refs,
      });
      return res.json({ success: true, action, user: source });
    }

    // merge_into_primary
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required for merge' });
    }
    if (String(source._id) === String(targetUserId)) {
      return res.status(400).json({ error: 'targetUserId must be different from source user' });
    }
    const target = await User.findById(targetUserId);
    if (!target) return res.status(404).json({ error: 'Target user not found' });

    const conflicts = await detectMergeConflicts(source, target);
    const blockingConflicts = conflicts.filter((item) => item.severity === 'blocking');
    if (blockingConflicts.length) {
      return res.status(409).json({ error: 'Merge blocked due to conflicts', conflicts });
    }

    const { operation, totalModified, movedRefsCount, docsMoved } = await runDuplicateUserMerge({
      req,
      source,
      target,
      note,
    });
    const emailDelivery = await notifyDuplicateMergeUsers({
      sourceUser: source,
      targetUser: target,
      operation,
      totalModified,
      docsMoved,
      rollbackWindowMinutes: DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES,
    });

    await logAudit(req, 'duplicate_user_merged', 'User', source._id, {
      targetUserId: target._id,
      note,
      refsBefore: refs,
      totalModified,
      movedRefsCount,
      docsMoved,
      mergeOperationId: operation._id,
      rollbackExpiresAt: operation.rollbackExpiresAt,
      emailDelivery,
    });

    return res.json({
      success: true,
      action,
      sourceUserId: source._id,
      targetUserId: target._id,
      totalModified,
      movedRefsCount,
      docsMoved,
      mergeOperationId: operation._id,
      rollbackExpiresAt: operation.rollbackExpiresAt,
      rollbackWindowMinutes: DUPLICATE_MERGE_ROLLBACK_WINDOW_MINUTES,
      emailDelivery,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve duplicate user' });
  }
};

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const buildDepositSummary = (entries = []) => {
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

export const getBookingAmendmentsAdmin = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).select('_id fromDate toDate status agreedMonthlyRent').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const rows = await LeaseAmendment.find({ booking: booking._id })
      .populate('requestedBy', 'name email role')
      .populate('decidedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({ booking, items: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch booking amendments' });
  }
};

export const decideBookingAmendmentAdmin = async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    const decisionNote = String(req.body?.decisionNote || '').trim();
    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await Booking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const amendment = await LeaseAmendment.findOne({
      _id: req.params.amendmentId,
      booking: booking._id,
    });
    if (!amendment) return res.status(404).json({ error: 'Amendment not found' });
    if (amendment.status !== 'pending') return res.status(400).json({ error: 'Amendment already decided' });

    if (status === 'approved') {
      const targetFrom = amendment.proposedFromDate || booking.fromDate;
      const targetTo = amendment.proposedToDate || booking.toDate;
      if (new Date(targetTo) < new Date(targetFrom)) {
        return res.status(400).json({ error: 'Invalid amendment date range' });
      }

      const overlap = await findOverlappingApprovedBooking({
        propertyId: booking.property,
        fromDate: targetFrom,
        toDate: targetTo,
        excludeBookingId: booking._id,
      });
      if (overlap) {
        return res.status(409).json({ error: 'Approved amendment would overlap another approved booking' });
      }

      const updates = {
        fromDate: targetFrom,
        toDate: targetTo,
      };
      if (Number.isFinite(amendment.proposedMonthlyRent)) {
        updates.agreedMonthlyRent = amendment.proposedMonthlyRent;
      }
      await Booking.findByIdAndUpdate(booking._id, updates);
      amendment.appliedAt = new Date();
    }

    amendment.status = status;
    amendment.decisionNote = decisionNote;
    amendment.decidedBy = req.admin._id;
    amendment.decidedByRole = 'admin';
    amendment.decidedAt = new Date();
    await amendment.save();

    await logAudit(req, 'booking_amendment_decided', 'LeaseAmendment', amendment._id, {
      bookingId: booking._id,
      status,
      decisionNote,
    });

    return res.json({ success: true, amendment });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update amendment' });
  }
};

export const getBookingDepositLedgerAdmin = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).select('_id status property renter').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const entries = await DepositLedgerEntry.find({ booking: booking._id })
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({
      booking,
      summary: buildDepositSummary(entries),
      items: entries,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch deposit ledger' });
  }
};

export const updateBookingDepositLedgerEntryAdmin = async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    const note = String(req.body?.note || '').trim();
    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const entry = await DepositLedgerEntry.findOne({
      _id: req.params.entryId,
      booking: req.params.id,
    });
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    if (status === 'paid') {
      if (entry.type !== 'refund_requested') {
        return res.status(400).json({ error: 'Only refund request can be marked paid' });
      }
      if (!['approved', 'paid'].includes(entry.status)) {
        return res.status(400).json({ error: 'Refund request must be approved before paid' });
      }
      entry.status = 'paid';
      entry.note = [entry.note, note].filter(Boolean).join(' | ');
      entry.approvedBy = req.admin._id;
      entry.approvedByRole = 'admin';
      entry.approvedAt = new Date();
      await entry.save();

      await DepositLedgerEntry.create({
        booking: entry.booking,
        property: entry.property,
        renter: entry.renter,
        owner: entry.owner,
        type: 'refund_paid',
        status: 'paid',
        amount: entry.amount,
        reason: 'Refund paid',
        note,
        metadata: { sourceEntryId: entry._id },
        createdBy: req.admin._id,
        createdByRole: 'admin',
      });
    } else {
      if (entry.status !== 'pending') {
        return res.status(400).json({ error: 'Only pending entries can be approved/rejected' });
      }
      entry.status = status;
      entry.note = [entry.note, note].filter(Boolean).join(' | ');
      entry.approvedBy = req.admin._id;
      entry.approvedByRole = 'admin';
      entry.approvedAt = new Date();
      await entry.save();
    }

    await logAudit(req, 'deposit_ledger_entry_updated', 'DepositLedgerEntry', entry._id, {
      status,
      note,
      bookingId: req.params.id,
    });

    return res.json({ success: true, entry });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update ledger entry' });
  }
};
