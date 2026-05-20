import cron from 'node-cron';
import Agreement from '../models/Agreement.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { sendNotification } from '../socket.js';

const notificationTypes = {
  PAYMENT: 'payment',
  NEW_BOOKING: 'newBooking',
  BOOKING_ACCEPTED: 'bookingAccepted',
  BOOKING_REJECTED: 'bookingRejected',
  LEASE_RENEWAL: 'leaseRenewal',
  WORKFLOW_REMINDER: 'workflowReminder',
  PAYOUT_REMINDER: 'payoutReminder',
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const hasRecentNotification = async (userId, type, link, withinDays = 7) => {
  const threshold = new Date(Date.now() - withinDays * ONE_DAY_MS);
  return Notification.findOne({
    userId,
    type,
    link,
    createdAt: { $gte: threshold },
  }).lean();
};

const getAgreementStatus = (agreement) => {
  if (!agreement) return 'missing';
  const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
  const active =
    versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
    versions[versions.length - 1];
  return active?.status || 'missing';
};

// ==========================
// PAYMENT REMINDERS
// ==========================
export const sendPaymentReminders = async () => {
  try {
    const pendingBookings = await Booking.find({ paymentStatus: 'pending' }).populate('renter property');
    for (const booking of pendingBookings) {
      if (!booking.renter?._id || !booking.property?.title) continue;

      const link = `/renter/payments`;
      const exists = await hasRecentNotification(booking.renter._id, notificationTypes.PAYMENT, link, 2);
      if (exists) continue;

      await sendNotification(
        booking.renter._id,
        notificationTypes.PAYMENT,
        `Your rent for "${booking.property.title}" is due soon.`,
        link
      );
    }
    console.log(`[Reminder] Checked ${pendingBookings.length} bookings for payment reminders`);
  } catch (err) {
    console.error('Payment reminder error:', err.message);
  }
};

// ==========================
// SMART REMINDERS
// ==========================
export const sendWorkflowAndRenewalReminders = async () => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * ONE_DAY_MS);
    const thirtyDaysFromNow = new Date(Date.now() + 30 * ONE_DAY_MS);

    const [approvedBookings, admins, delayedPayoutPayments] = await Promise.all([
      Booking.find({ status: 'Approved' })
        .populate('property', 'title ownerId')
        .populate('renter', 'name email')
        .lean(),
      User.find({ role: 'admin' }).select('_id').lean(),
      Payment.find({
        status: 'Paid',
        payoutStatus: { $ne: 'Transferred' },
        createdAt: { $lte: threeDaysAgo },
      })
        .populate({
          path: 'booking',
          populate: { path: 'property', select: 'title ownerId' },
        })
        .lean(),
    ]);

    const bookingIds = approvedBookings.map((booking) => booking._id);
    const agreements = await Agreement.find({ booking: { $in: bookingIds } })
      .select('booking currentVersion versions')
      .lean();
    const agreementMap = new Map(agreements.map((agreement) => [String(agreement.booking), agreement]));

    for (const booking of approvedBookings) {
      const bookingId = String(booking._id);
      const ownerId = booking.property?.ownerId;
      const renterId = booking.renter?._id;
      const propertyTitle = booking.property?.title || 'your property';

      const acceptedAt = booking.acceptedAt || booking.createdAt;
      const agreement = agreementMap.get(bookingId);
      const agreementStatus = getAgreementStatus(agreement);

      if (acceptedAt && new Date(acceptedAt) <= threeDaysAgo && agreementStatus !== 'fully_signed') {
        const link = '/renter/agreements';
        if (renterId) {
          const renterExists = await hasRecentNotification(
            renterId,
            notificationTypes.WORKFLOW_REMINDER,
            `${link}?booking=${bookingId}`,
            3
          );
          if (!renterExists) {
            await sendNotification(
              renterId,
              notificationTypes.WORKFLOW_REMINDER,
              `Booking approved but agreement unsigned for "${propertyTitle}" (3+ days).`,
              `${link}?booking=${bookingId}`
            );
          }
        }

        if (ownerId) {
          const ownerExists = await hasRecentNotification(
            ownerId,
            notificationTypes.WORKFLOW_REMINDER,
            `/owner/agreements?booking=${bookingId}`,
            3
          );
          if (!ownerExists) {
            await sendNotification(
              ownerId,
              notificationTypes.WORKFLOW_REMINDER,
              `Agreement is still unsigned for approved booking at "${propertyTitle}".`,
              `/owner/agreements?booking=${bookingId}`
            );
          }
        }
      }

      const endDate = booking.toDate ? new Date(booking.toDate) : null;
      if (!endDate || endDate < new Date() || endDate > thirtyDaysFromNow) continue;

      const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / ONE_DAY_MS);
      const reminderDays = new Set([30, 14, 7, 3, 1]);
      if (!reminderDays.has(daysLeft)) continue;

      const renewalMessage = `Lease for "${propertyTitle}" ends in ${daysLeft} day(s). Renew in one click.`;
      const renterRenewalLink = `/renter/bookings`;
      const ownerRenewalLink = `/owner/requests`;

      if (renterId) {
        const renterExists = await hasRecentNotification(
          renterId,
          notificationTypes.LEASE_RENEWAL,
          `${renterRenewalLink}?booking=${bookingId}&days=${daysLeft}`,
          2
        );
        if (!renterExists) {
          await sendNotification(
            renterId,
            notificationTypes.LEASE_RENEWAL,
            renewalMessage,
            `${renterRenewalLink}?booking=${bookingId}&days=${daysLeft}`
          );
        }
      }

      if (ownerId) {
        const ownerExists = await hasRecentNotification(
          ownerId,
          notificationTypes.LEASE_RENEWAL,
          `${ownerRenewalLink}?booking=${bookingId}&days=${daysLeft}`,
          2
        );
        if (!ownerExists) {
          await sendNotification(
            ownerId,
            notificationTypes.LEASE_RENEWAL,
            renewalMessage,
            `${ownerRenewalLink}?booking=${bookingId}&days=${daysLeft}`
          );
        }
      }
    }

    for (const payment of delayedPayoutPayments) {
      const paymentId = String(payment._id);
      const propertyTitle = payment.booking?.property?.title || 'property';
      const ownerId = payment.ownerId || payment.booking?.property?.ownerId;
      const link = `/admin/payments?payment=${paymentId}`;

      for (const admin of admins) {
        const exists = await hasRecentNotification(
          admin._id,
          notificationTypes.PAYOUT_REMINDER,
          link,
          2
        );
        if (!exists) {
          await sendNotification(
            admin._id,
            notificationTypes.PAYOUT_REMINDER,
            `Payment paid but owner payout not transferred for "${propertyTitle}".`,
            link
          );
        }
      }

      if (ownerId) {
        const ownerExists = await hasRecentNotification(
          ownerId,
          notificationTypes.PAYOUT_REMINDER,
          `/owner/payment-status?payment=${paymentId}`,
          2
        );
        if (!ownerExists) {
          await sendNotification(
            ownerId,
            notificationTypes.PAYOUT_REMINDER,
            `Your payout for "${propertyTitle}" is pending transfer.`,
            `/owner/payment-status?payment=${paymentId}`
          );
        }
      }
    }

    console.log(
      `[Reminder] Workflow reminders checked for ${approvedBookings.length} approved bookings and ${delayedPayoutPayments.length} delayed payouts`
    );
  } catch (err) {
    console.error('Workflow reminder error:', err.message);
  }
};

// ==========================
// NEW BOOKING NOTIFICATIONS
// ==========================
export const sendNewBookingNotification = async (ownerId, propertyTitle, bookingId) => {
  try {
    const link = `/owner/requests?booking=${bookingId}`;
    const exists = await Notification.findOne({
      userId: ownerId,
      type: notificationTypes.NEW_BOOKING,
      link,
    });

    if (exists) return;

    await sendNotification(
      ownerId,
      notificationTypes.NEW_BOOKING,
      `You have a new booking request for "${propertyTitle}".`,
      link
    );
  } catch (err) {
    console.error('New booking notification error:', err.message);
  }
};

// ==========================
// BOOKING STATUS NOTIFICATIONS
// ==========================
export const sendBookingStatusNotification = async (renterId, status, propertyTitle, bookingId) => {
  try {
    const normalizedStatus = status.toLowerCase();
    const type =
      normalizedStatus === 'approved' || normalizedStatus === 'accepted'
        ? notificationTypes.BOOKING_ACCEPTED
        : notificationTypes.BOOKING_REJECTED;

    const message =
      type === notificationTypes.BOOKING_ACCEPTED
        ? `Your booking for "${propertyTitle}" has been accepted!`
        : `Your booking for "${propertyTitle}" was rejected.`;

    const link = '/renter/bookings';
    const exists = await Notification.findOne({
      userId: renterId,
      type,
      link,
    });
    if (exists) return;

    await sendNotification(renterId, type, message, link);
  } catch (err) {
    console.error('Booking status notification error:', err.message);
  }
};

const runDailyReminderJobs = async () => {
  await sendPaymentReminders();
  await sendWorkflowAndRenewalReminders();
};

runDailyReminderJobs();

cron.schedule('0 8 * * *', () => {
  console.log('Running daily reminder jobs...');
  runDailyReminderJobs();
});
