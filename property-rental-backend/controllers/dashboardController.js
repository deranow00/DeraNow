import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Favorite from '../models/Favorite.js';
import Payment from '../models/Payment.js';
import { calcOccupancyRate, calcProfit } from '../utils/kpiMath.js';

export const getOwnerDashboardStats = async (req, res) => {
    try {
      const ownerId = req.user._id;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
      const properties = await Property.find({ ownerId }).sort({ createdAt: -1 });
      const propertyIds = properties.map(p => p._id);
  
      const bookings = await Booking.find({ property: { $in: propertyIds } });
  
      const favorites = await Favorite.find({ property: { $in: propertyIds } });

      const approvedBookings = await Booking.find({
        property: { $in: propertyIds },
        status: 'Approved',
      })
        .populate('property', 'title price')
        .populate('renter', 'name email');

      const approvedBookingIds = approvedBookings.map((booking) => booking._id);
      const paymentDocs = await Payment.find({ booking: { $in: approvedBookingIds } }).sort({
        createdAt: -1,
      });

      const activeApprovedBookings = approvedBookings.filter((booking) => {
        const start = booking.fromDate ? new Date(booking.fromDate) : null;
        const end = booking.toDate ? new Date(booking.toDate) : null;
        return start && end && start <= now && end >= now;
      });

      const latestPaymentByBooking = {};
      paymentDocs.forEach((payment) => {
        const bookingId = payment.booking?.toString();
        if (bookingId && !latestPaymentByBooking[bookingId]) {
          latestPaymentByBooking[bookingId] = payment;
        }
      });

      const ownerPaymentRows = approvedBookings
        .map((booking) => {
          const latestPayment = latestPaymentByBooking[booking._id.toString()];
          const paymentState =
            latestPayment?.status === 'Paid'
              ? 'Paid'
              : latestPayment?.status === 'Pending'
                ? 'Pending Verification'
                : 'Unpaid';

          return {
            bookingId: booking._id,
            propertyId: booking.property?._id,
            propertyTitle: booking.property?.title || 'Unknown property',
            monthlyRent: Number(booking.agreedMonthlyRent ?? booking.property?.price ?? 0),
            renterName: booking.renter?.name || booking.renter?.email || 'Unknown renter',
            renterEmail: booking.renter?.email || '',
            fromDate: booking.fromDate,
            paymentStatus: paymentState,
            latestPaymentAmount: latestPayment?.amount || 0,
            latestPaymentAt: latestPayment?.createdAt || null,
          };
        })
        .sort((a, b) => {
          const weight = { Unpaid: 0, 'Pending Verification': 1, Paid: 2 };
          return (weight[a.paymentStatus] ?? 99) - (weight[b.paymentStatus] ?? 99);
        });

      const liveMRR = activeApprovedBookings.reduce(
        (sum, booking) => sum + Number(booking.agreedMonthlyRent ?? booking.property?.price ?? 0),
        0
      );

      const paidPaymentsCurrentMonth = paymentDocs.filter(
        (payment) =>
          payment.status === 'Paid' &&
          payment.createdAt >= monthStart &&
          payment.createdAt <= monthEnd
      );

      const realizedMRR = paidPaymentsCurrentMonth.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const ownerProfitCurrentMonth = paidPaymentsCurrentMonth.reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.ownerAmount || Number(payment.amount || 0) - Number(payment.commissionAmount || 0)
          ),
        0
      );

      const approvedPropertyCount = properties.filter((property) => property.status === 'Approved').length;
      const occupiedPropertyIds = new Set(
        activeApprovedBookings.map((booking) => String(booking.property?._id || booking.property))
      );
      const occupancyRate = calcOccupancyRate(occupiedPropertyIds.size, approvedPropertyCount);
  
      // Count bookings by their status: Approved, Pending, Rejected
      const bookingStatusCount = bookings.reduce((acc, booking) => {
        const status = booking.status || 'Pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
  
      // Monthly properties added
      const propertyStats = await Property.aggregate([
        { $match: { ownerId } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
  
      // Build a map: propertyId -> latest booking status
      // Find latest booking per property
      const latestBookingMap = {};
  
      bookings.forEach(booking => {
        const pid = booking.property.toString();
        const current = latestBookingMap[pid];
        if (!current || booking.createdAt > current.createdAt) {
          latestBookingMap[pid] = booking;
        }
      });
  
      // Attach booking status to each recent property (latest 5)
      const recentProperties = properties.slice(0, 5).map(p => {
        const booking = latestBookingMap[p._id.toString()];
        return {
          ...p.toObject(),
          status: booking ? booking.status : 'Available'
        };
      });
  
      res.json({
        totalProperties: properties.length,
        totalBookings: bookings.length,
        totalFavorites: favorites.length,
        kpis: {
          formulas: {
            liveMRR:
              'Sum of monthly rent for active approved bookings where fromDate <= today <= toDate.',
            realizedMRR:
              'Sum of paid payment amount in current month for owner bookings.',
            occupancyRate:
              'Occupied approved owner properties / total approved owner properties * 100.',
            ownerProfit:
              'Sum of owner net amount (ownerAmount) from paid payments in current month.',
          },
          values: {
            liveMRR: Number(liveMRR.toFixed(2)),
            realizedMRR: Number(realizedMRR.toFixed(2)),
            occupancyRate,
            ownerProfit: calcProfit(ownerProfitCurrentMonth, 0),
            approvedProperties: approvedPropertyCount,
            occupiedProperties: occupiedPropertyIds.size,
          },
        },
        bookingStatusCount,
        recentProperties,
        ownerPaymentRows,
        propertyStats: propertyStats.map(p => ({
          month: p._id,
          count: p.count
        }))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load dashboard data' });
    }
  };
  

  export const getRenterDashboardStats = async (req, res) => {
    try {
      const renterId = req.user._id;
  
      const bookings = await Booking.find({ renter: renterId }).populate('property');
      const favorites = await Favorite.find({ user: renterId });
  
      const bookingStatusCount = bookings.reduce((acc, b) => {
        const status = b.status || 'Pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
  
      const bookingStats = await Booking.aggregate([
        { $match: { renter: renterId } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
  
      res.json({
        bookings: bookings.length,
        favorites: favorites.length,
        bookingStatusCount,
        bookingStats: bookingStats.map((b) => ({
          month: b._id,
          count: b.count
        })),
        recent: bookings.slice(0, 5)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load renter dashboard data' });
    }
  };
