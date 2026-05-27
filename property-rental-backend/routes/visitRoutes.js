import express from 'express';
import crypto from 'crypto';
import VisitPass from '../models/VisitPass.js';
import PropertyVisit from '../models/PropertyVisit.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import protect from '../middleware/authMiddleware.js';
import adminOnly from '../middleware/adminMiddleware.js';
import { sendNotification } from '../socket.js';

const router = express.Router();

const VISIT_PASS_AMOUNT = Number(process.env.VISIT_PASS_AMOUNT || 100);

const normalizeCode = (value = '') => String(value).trim().toUpperCase();

const generatePromoCode = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `DERA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const exists = await VisitPass.exists({ promoCode: code });
    if (!exists) return code;
  }
  return `DERA-${Date.now().toString(36).toUpperCase()}`;
};

const getActivePassForRenter = async (renterId, promoCode = '') => {
  const filter = { renter: renterId, status: 'active' };
  const code = normalizeCode(promoCode);
  if (code) filter.promoCode = code;
  return VisitPass.findOne(filter).sort({ approvedAt: -1, createdAt: -1 });
};

router.get('/pass/me', protect, async (req, res) => {
  try {
    const latestPass = await VisitPass.findOne({ renter: req.user._id })
      .populate('requestedForProperty', 'title location image price type')
      .sort({ createdAt: -1 })
      .lean();

    const activePass = latestPass?.status === 'active' ? latestPass : await getActivePassForRenter(req.user._id);

    return res.json({
      amount: VISIT_PASS_AMOUNT,
      latestPass,
      activePass,
      hasActivePass: Boolean(activePass),
    });
  } catch (err) {
    console.error('get visit pass error:', err);
    return res.status(500).json({ error: 'Failed to load visit pass' });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const visits = await PropertyVisit.find({ renter: req.user._id })
      .populate('property', 'title location image price type')
      .populate('owner', 'name email')
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();
    return res.json(visits);
  } catch (err) {
    console.error('get renter visits error:', err);
    return res.status(500).json({ error: 'Failed to load visits' });
  }
});

router.post('/pass/payment-request', protect, async (req, res) => {
  try {
    if (req.user.role !== 'renter') {
      return res.status(403).json({ error: 'Only renters can request a visit pass' });
    }

    const { propertyId, visitDate, transactionRef = '', contactPhone = '' } = req.body;
    if (!propertyId || !visitDate) {
      return res.status(400).json({ error: 'Property and visit date are required' });
    }
    if (!String(contactPhone).trim()) {
      return res.status(400).json({ error: 'Phone number is required for admin verification' });
    }

    const parsedVisitDate = new Date(visitDate);
    if (Number.isNaN(parsedVisitDate.getTime())) {
      return res.status(400).json({ error: 'Invalid visit date' });
    }

    const property = await Property.findById(propertyId).select('title location ownerId');
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const activePass = await getActivePassForRenter(req.user._id);
    if (activePass) {
      return res.status(409).json({
        error: 'You already have an active visit promo code',
        pass: activePass,
      });
    }

    const existingPending = await VisitPass.findOne({
      renter: req.user._id,
      status: 'pending_payment',
    }).sort({ createdAt: -1 });

    if (existingPending) {
      return res.status(409).json({
        error: 'Visit pass payment is already waiting for admin approval',
        pass: existingPending,
      });
    }

    const visitPass = await VisitPass.create({
      renter: req.user._id,
      amount: VISIT_PASS_AMOUNT,
      transactionRef,
      contactPhone,
      requestedForProperty: property._id,
      requestedVisitDate: parsedVisitDate,
      paidNotifiedAt: new Date(),
    });

    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await sendNotification(
        admin._id,
        'payment',
        `${req.user.name || 'A renter'} submitted visit pass payment for "${property.title}".`,
        '/admin/visits'
      );
    }

    await sendNotification(
      req.user._id,
      'payment',
      'Your visit pass payment was submitted. DeraNow admin will verify it soon.',
      '/renter/visits'
    );

    return res.status(201).json({
      message: 'Visit pass payment submitted for admin approval',
      pass: visitPass,
    });
  } catch (err) {
    console.error('visit pass payment request error:', err);
    return res.status(500).json({ error: 'Failed to submit visit pass payment' });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'renter') {
      return res.status(403).json({ error: 'Only renters can book visits' });
    }

    const { propertyId, visitDate, promoCode = '', note = '' } = req.body;
    if (!propertyId || !visitDate) {
      return res.status(400).json({ error: 'Property and visit date are required' });
    }

    const parsedVisitDate = new Date(visitDate);
    if (Number.isNaN(parsedVisitDate.getTime())) {
      return res.status(400).json({ error: 'Invalid visit date' });
    }

    const property = await Property.findById(propertyId).select('title location ownerId');
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const visitPass = await getActivePassForRenter(req.user._id, promoCode);
    if (!visitPass) {
      return res.status(403).json({ error: 'Approved visit promo code required before booking visits' });
    }

    const visit = await PropertyVisit.create({
      visitPass: visitPass._id,
      promoCode: visitPass.promoCode,
      property: property._id,
      renter: req.user._id,
      owner: property.ownerId,
      visitDate: parsedVisitDate,
      note,
    });

    await sendNotification(
      req.user._id,
      'newBooking',
      `Visit booked for "${property.title}" on ${parsedVisitDate.toLocaleDateString()}.`,
      '/renter/visits'
    );

    if (property.ownerId) {
      await sendNotification(
        property.ownerId,
        'newBooking',
        `${req.user.name || 'A renter'} booked a visit for "${property.title}".`,
        '/owner/requests'
      );
    }

    return res.status(201).json({
      message: 'Visit booked successfully',
      visit,
    });
  } catch (err) {
    console.error('book visit error:', err);
    return res.status(500).json({ error: 'Failed to book visit' });
  }
});

router.get('/admin/passes', protect, adminOnly, async (_req, res) => {
  try {
    const passes = await VisitPass.find({})
      .populate('renter', 'name email citizenshipNumber')
      .populate('requestedForProperty', 'title location image price type')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    return res.json(passes);
  } catch (err) {
    console.error('admin passes error:', err);
    return res.status(500).json({ error: 'Failed to load visit pass requests' });
  }
});

router.get('/admin', protect, adminOnly, async (_req, res) => {
  try {
    const visits = await PropertyVisit.find({})
      .populate('renter', 'name email citizenshipNumber')
      .populate('property', 'title location image price type')
      .populate('owner', 'name email')
      .populate('visitPass', 'promoCode status amount transactionRef')
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();
    return res.json(visits);
  } catch (err) {
    console.error('admin visits error:', err);
    return res.status(500).json({ error: 'Failed to load property visits' });
  }
});

router.patch('/admin/passes/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const visitPass = await VisitPass.findById(req.params.id).populate('renter', 'name email');
    if (!visitPass) return res.status(404).json({ error: 'Visit pass not found' });

    if (visitPass.status === 'active') {
      return res.json({ message: 'Visit pass already approved', pass: visitPass });
    }

    visitPass.status = 'active';
    visitPass.promoCode = visitPass.promoCode || await generatePromoCode();
    visitPass.approvedAt = new Date();
    visitPass.approvedBy = req.user._id;
    visitPass.rejectedAt = undefined;
    visitPass.rejectedBy = undefined;
    visitPass.adminRemark = String(req.body?.adminRemark || visitPass.adminRemark || '').trim();
    await visitPass.save();

    await sendNotification(
      visitPass.renter._id || visitPass.renter,
      'payment',
      `Your DeraNow visit pass is approved. Promo code: ${visitPass.promoCode}`,
      '/renter/visits'
    );

    return res.json({
      message: 'Visit pass approved and promo code sent',
      pass: visitPass,
    });
  } catch (err) {
    console.error('approve visit pass error:', err);
    return res.status(500).json({ error: 'Failed to approve visit pass' });
  }
});

router.patch('/admin/passes/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const visitPass = await VisitPass.findById(req.params.id).populate('renter', 'name email');
    if (!visitPass) return res.status(404).json({ error: 'Visit pass not found' });

    visitPass.status = 'rejected';
    visitPass.rejectedAt = new Date();
    visitPass.rejectedBy = req.user._id;
    visitPass.adminRemark = String(req.body?.adminRemark || '').trim();
    await visitPass.save();

    await sendNotification(
      visitPass.renter._id || visitPass.renter,
      'payment',
      `Your visit pass payment could not be approved.${visitPass.adminRemark ? ` ${visitPass.adminRemark}` : ''}`,
      '/renter/visits'
    );

    return res.json({
      message: 'Visit pass rejected',
      pass: visitPass,
    });
  } catch (err) {
    console.error('reject visit pass error:', err);
    return res.status(500).json({ error: 'Failed to reject visit pass' });
  }
});

export default router;
