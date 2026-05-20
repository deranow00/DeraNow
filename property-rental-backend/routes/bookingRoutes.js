import express from 'express';
import protect from '../middleware/authMiddleware.js';
import {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  updateStatus,
  getApprovedBookings,
  renewBooking,
  cancelBooking,
  requestLeaseAmendment,
  listLeaseAmendments,
  decideLeaseAmendment,
  getDepositLedger,
  receiveDeposit,
  addDepositDeduction,
  requestDepositRefund,
  approveDepositEntry,
  rejectDepositEntry,
  markDepositRefundPaid,
  getBookingAuditTrail,
} from '../controllers/bookingController.js';

const router = express.Router();

router.post('/', protect, createBooking);
router.get('/my', protect, getMyBookings);
router.get('/owner', protect, getOwnerBookings);
router.put('/:id/status', protect, updateStatus);
router.post('/:id/cancel', protect, cancelBooking);
router.post('/:id/renew', protect, renewBooking);
router.post('/:id/amendments', protect, requestLeaseAmendment);
router.get('/:id/amendments', protect, listLeaseAmendments);
router.patch('/:id/amendments/:amendmentId', protect, decideLeaseAmendment);
router.get('/:id/deposit-ledger', protect, getDepositLedger);
router.post('/:id/deposit-ledger/receive', protect, receiveDeposit);
router.post('/:id/deposit-ledger/deduction', protect, addDepositDeduction);
router.post('/:id/deposit-ledger/refund-request', protect, requestDepositRefund);
router.patch('/:id/deposit-ledger/:entryId/approve', protect, approveDepositEntry);
router.patch('/:id/deposit-ledger/:entryId/reject', protect, rejectDepositEntry);
router.post('/:id/deposit-ledger/:entryId/mark-paid', protect, markDepositRefundPaid);
router.get('/:id/audit-trail', protect, getBookingAuditTrail);
router.get('/approved/:renterId', protect, getApprovedBookings);

export default router;
