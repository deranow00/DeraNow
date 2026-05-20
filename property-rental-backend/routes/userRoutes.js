import express from 'express';
import User from '../models/User.js';
import Agreement from '../models/Agreement.js';
import Payment from '../models/Payment.js';
import protect from '../middleware/authMiddleware.js';
import adminOnly from '../middleware/adminMiddleware.js';
import { sendNotification } from '../socket.js';
import upload from '../middleware/uploadMiddleware.js';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

const uploadImageBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'property-rental/owner-verification',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });

router.get('/', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.get('/documents/center', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select(
        'role kycDocuments ownerVerificationDocuments ownerVerificationStatus kycStatus'
      )
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isOwner = user.role === 'owner';
    const agreementFilter = isOwner ? { owner: req.user._id } : { renter: req.user._id };
    const paymentFilter = isOwner ? { ownerId: req.user._id } : { renter: req.user._id };

    const [agreements, payments] = await Promise.all([
      Agreement.find(agreementFilter)
        .populate('property', 'title location')
        .populate('booking', 'fromDate toDate')
        .select('property booking currentVersion versions updatedAt')
        .sort({ updatedAt: -1 })
        .lean(),
      Payment.find(paymentFilter)
        .populate({
          path: 'booking',
          populate: { path: 'property', select: 'title location' },
        })
        .select(
          'booking amount monthsCount paymentPeriodStart paymentPeriodEnd status paymentMethod createdAt'
        )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const agreementDocs = agreements.map((agreement) => {
      const versions = Array.isArray(agreement.versions) ? agreement.versions : [];
      const activeVersion =
        versions.find((item) => Number(item.version) === Number(agreement.currentVersion)) ||
        versions[versions.length - 1];
      return {
        id: agreement._id,
        type: 'agreement',
        title: agreement.property?.title || 'Lease Agreement',
        property: agreement.property?.title || 'Unknown property',
        status: activeVersion?.status || 'pending_owner',
        version: agreement.currentVersion || 1,
        updatedAt: agreement.updatedAt,
        openLink: `/${isOwner ? 'owner' : 'renter'}/agreements`,
      };
    });

    const invoiceDocs = payments.map((payment) => ({
      id: payment._id,
      type: 'invoice',
      title: `Invoice INV-${String(payment._id).slice(-6).toUpperCase()}`,
      property: payment.booking?.property?.title || 'Unknown property',
      amount: Number(payment.amount || 0),
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paymentPeriodStart: payment.paymentPeriodStart,
      paymentPeriodEnd: payment.paymentPeriodEnd,
      createdAt: payment.createdAt,
      openLink: `/api/payments/${payment._id}/invoice`,
    }));

    const verificationSource = isOwner
      ? user.ownerVerificationDocuments || []
      : user.kycDocuments || [];
    const verificationDocs = verificationSource.map((doc) => ({
      id: doc._id,
      type: 'verification',
      title: doc.docType || 'Identity document',
      status: doc.status || 'pending',
      uploadedAt: doc.uploadedAt,
      reviewedAt: doc.reviewedAt,
      imageUrl: doc.imageUrl,
      rejectReason: doc.rejectReason || '',
      openLink: doc.imageUrl,
    }));

    res.json({
      summary: {
        agreements: agreementDocs.length,
        invoices: invoiceDocs.length,
        verificationDocs: verificationDocs.length,
      },
      agreements: agreementDocs,
      invoices: invoiceDocs,
      verificationDocs,
    });
  } catch (err) {
    console.error('documents/center error:', err);
    res.status(500).json({ error: 'Failed to load document center' });
  }
});

router.put('/me/preferences', protect, async (req, res) => {
  try {
    const { notificationPreferences, privacyPreferences, appPreferences } = req.body;

    const user = await User.findById(req.user._id)
      .select('notificationPreferences privacyPreferences appPreferences');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updateDoc = {};

    if (notificationPreferences) {
      updateDoc.notificationPreferences = {
        ...user.notificationPreferences?.toObject?.(),
        ...notificationPreferences,
        types: {
          ...user.notificationPreferences?.types?.toObject?.(),
          ...(notificationPreferences?.types || {}),
        },
      };
    }

    if (privacyPreferences) {
      updateDoc.privacyPreferences = {
        ...user.privacyPreferences?.toObject?.(),
        ...privacyPreferences,
      };
    }

    if (appPreferences) {
      const allowedThemes = ['light', 'dark', 'system'];
      const nextTheme = allowedThemes.includes(appPreferences.theme)
        ? appPreferences.theme
        : user.appPreferences?.theme || 'system';
      const nextLanguage = ['en', 'ne'].includes(appPreferences.language)
        ? appPreferences.language
        : user.appPreferences?.language || 'en';

      updateDoc.appPreferences = {
        ...user.appPreferences?.toObject?.(),
        ...appPreferences,
        theme: nextTheme,
        language: nextLanguage,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateDoc },
      { new: true, runValidators: true }
    ).select('notificationPreferences privacyPreferences appPreferences');

    res.json({
      message: 'Preferences updated',
      preferences: {
        notificationPreferences: updatedUser.notificationPreferences,
        privacyPreferences: updatedUser.privacyPreferences,
        appPreferences: updatedUser.appPreferences,
      },
    });
  } catch (err) {
    console.error('Failed to update user preferences:', err);
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid preference value provided' });
    }
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.post('/me/kyc-submit', protect, upload.array('kycDocs', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one KYC document image' });
    }

    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(500).json({ error: 'Cloudinary credentials are not configured on server' });
    }

    let docTypes = [];
    if (req.body?.docTypes) {
      try {
        docTypes = JSON.parse(req.body.docTypes);
      } catch {
        docTypes = [];
      }
    }

    const uploadedDocs = [];
    for (let i = 0; i < req.files.length; i += 1) {
      const file = req.files[i];
      const uploaded = await uploadImageBufferToCloudinary(file.buffer);
      uploadedDocs.push({
        imageUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        docType: docTypes[i] || 'Government ID',
        status: 'pending',
        rejectReason: '',
        uploadedAt: new Date(),
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        kycStatus: 'pending',
        kycRejectReason: '',
        $push: { kycDocuments: { $each: uploadedDocs } },
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      try {
        await sendNotification(
          admin._id,
          'ownerVerification',
          `KYC submitted by ${user.name || user.email} (${user.role})`,
          `/admin/kyc`
        );
      } catch (notifyErr) {
        console.error('KYC notify(admin) failed:', notifyErr.message);
      }
    }

    return res.json({ message: 'KYC submitted successfully', kycStatus: user.kycStatus });
  } catch (err) {
    console.error('me/kyc-submit error:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit KYC' });
  }
});

router.get('/admin/kyc-requests', protect, adminOnly, async (_req, res) => {
  try {
    const users = await User.find({ kycStatus: { $in: ['pending', 'rejected'] } }).select(
      '-password'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch KYC requests' });
  }
});

router.get('/admin/kyc-requests/pending-docs', protect, adminOnly, async (_req, res) => {
  try {
    const users = await User.find({ 'kycDocuments.status': 'pending' }).select(
      'name email role kycStatus kycDocuments'
    );
    const pendingDocs = users.flatMap((user) =>
      (user.kycDocuments || [])
        .filter((doc) => doc.status === 'pending')
        .map((doc) => ({
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          kycStatus: user.kycStatus,
          documentId: doc._id,
          docType: doc.docType,
          imageUrl: doc.imageUrl,
          uploadedAt: doc.uploadedAt,
        }))
    );
    res.json(pendingDocs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending KYC docs' });
  }
});

router.put('/admin/kyc-requests/:id/documents/:docId', protect, adminOnly, async (req, res) => {
  try {
    const { status, rejectReason = '' } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid document status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const doc = user.kycDocuments?.id(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    doc.status = status;
    doc.rejectReason = status === 'rejected' ? String(rejectReason || 'Document rejected') : '';
    doc.reviewedAt = new Date();

    const pendingCount = user.kycDocuments.filter((d) => d.status === 'pending').length;
    const rejectedCount = user.kycDocuments.filter((d) => d.status === 'rejected').length;

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

    await user.save();

    try {
      await sendNotification(
        user._id,
        'ownerVerification',
        `Your KYC document was ${status}.${status === 'rejected' ? ` Reason: ${doc.rejectReason}` : ''}`,
        `/${user.role}/profile`
      );
    } catch (notifyErr) {
      console.error('KYC notify(user) failed:', notifyErr.message);
    }

    res.json({ message: 'KYC document review updated', user });
  } catch (err) {
    console.error('kyc document review error:', err);
    res.status(500).json({ error: err.message || 'Failed to review KYC document' });
  }
});

router.post('/owner/verify-request', protect, upload.array('idImages', 5), async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('role ownerVerificationStatus name');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can request verification' });
    }

    if (user.ownerVerificationStatus === 'verified') {
      return res.status(400).json({ error: 'Already verified' });
    }

    if (user.ownerVerificationStatus === 'pending') {
      return res.status(400).json({ error: 'Verification request is already pending' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one valid ID photo to request verification' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Cloudinary credentials are not configured on server' });
    }

    let docTypes = [];
    if (req.body?.docTypes) {
      try {
        docTypes = JSON.parse(req.body.docTypes);
      } catch {
        docTypes = [];
      }
    }

    const uploadedDocs = [];
    for (let i = 0; i < req.files.length; i += 1) {
      const file = req.files[i];
      const uploaded = await uploadImageBufferToCloudinary(file.buffer);
      uploadedDocs.push({
        imageUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        docType: docTypes[i] || 'Government ID',
        status: 'pending',
        rejectReason: '',
        uploadedAt: new Date(),
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      ownerVerificationStatus: 'pending',
      ownerVerificationRejectReason: '',
      $push: { ownerVerificationDocuments: { $each: uploadedDocs } },
    });

    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      try {
        await sendNotification(
          admin._id,
          'ownerVerification',
          `Owner verification requested by ${user.name}`,
          `/admin/owners`
        );
      } catch (notifyErr) {
        console.error('Owner verification notify(admin) failed:', notifyErr.message);
      }
    }

    res.json({ message: 'Verification request submitted', status: 'pending' });
  } catch (err) {
    console.error('owner/verify-request error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit verification request' });
  }
});

router.get('/admin/owner-requests', protect, adminOnly, async (req, res) => {
  try {
    const owners = await User.find({
      role: 'owner',
      ownerVerificationStatus: 'pending',
      'ownerVerificationDocuments.status': 'pending',
    }).select('-password');
    res.json(owners);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch owner requests' });
  }
});

router.get('/admin/owner-requests/pending-docs', protect, adminOnly, async (req, res) => {
  try {
    const owners = await User.find({ role: 'owner', 'ownerVerificationDocuments.status': 'pending' })
      .select('name email ownerVerificationDocuments ownerVerificationStatus');

    const pendingDocs = owners.flatMap((owner) =>
      (owner.ownerVerificationDocuments || [])
        .filter((doc) => doc.status === 'pending')
        .map((doc) => ({
          ownerId: owner._id,
          ownerName: owner.name,
          ownerEmail: owner.email,
          ownerVerificationStatus: owner.ownerVerificationStatus,
          documentId: doc._id,
          docType: doc.docType,
          imageUrl: doc.imageUrl,
          uploadedAt: doc.uploadedAt,
        }))
    );

    res.json(pendingDocs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending KYC documents' });
  }
});

router.put('/admin/owner-requests/:id/documents/:docId', protect, adminOnly, async (req, res) => {
  try {
    const { status, rejectReason = '' } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid document review status' });
    }

    const owner = await User.findOne({ _id: req.params.id, role: 'owner' });
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const doc = owner.ownerVerificationDocuments?.id(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    doc.status = status;
    doc.rejectReason = status === 'rejected' ? String(rejectReason || 'Invalid or unclear document') : '';
    doc.reviewedAt = new Date();

    const pendingCount = owner.ownerVerificationDocuments.filter((d) => d.status === 'pending').length;
    const rejectedCount = owner.ownerVerificationDocuments.filter((d) => d.status === 'rejected').length;

    if (pendingCount === 0 && rejectedCount === 0) {
      owner.ownerVerificationStatus = 'verified';
      owner.ownerVerifiedAt = new Date();
      owner.ownerVerificationRejectReason = '';
    } else if (status === 'rejected') {
      owner.ownerVerificationStatus = 'rejected';
      owner.ownerVerificationRejectReason = doc.rejectReason;
    } else if (owner.ownerVerificationStatus !== 'verified') {
      owner.ownerVerificationStatus = 'pending';
    }

    await owner.save();
    res.json({ message: 'Document review updated', owner });
  } catch (err) {
    console.error('owner document review error:', err);
    res.status(500).json({ error: 'Failed to update document review' });
  }
});

router.put('/admin/owner-requests/:id', protect, adminOnly, async (req, res) => {
  try {
    const { status, rejectReason = '' } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const owner = await User.findOne({ _id: req.params.id, role: 'owner' });
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    owner.ownerVerificationStatus = status;
    owner.ownerVerifiedAt = status === 'verified' ? new Date() : null;
    owner.ownerVerificationRejectReason = status === 'rejected' ? String(rejectReason || 'Verification rejected') : '';

    owner.ownerVerificationDocuments = (owner.ownerVerificationDocuments || []).map((doc) => {
      if (doc.status === 'pending') {
        return {
          ...doc.toObject(),
          status,
          rejectReason: status === 'rejected' ? owner.ownerVerificationRejectReason : '',
          reviewedAt: new Date(),
        };
      }
      return doc;
    });
    await owner.save();

    try {
      await sendNotification(
        owner._id,
        'ownerVerification',
        `Your verification was ${status}.${status === 'rejected' ? ` Reason: ${owner.ownerVerificationRejectReason}` : ''}`,
        `/owner`
      );
    } catch (notifyErr) {
      console.error('Owner verification notify(owner) failed:', notifyErr.message);
    }

    res.json({ message: 'Owner verification updated', owner });
  } catch (err) {
    console.error('admin/owner-requests update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update owner status' });
  }
});

export default router;
