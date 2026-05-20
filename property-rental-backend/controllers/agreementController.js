import Agreement from '../models/Agreement.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import User from '../models/User.js';

const getTemplateContent = ({ ownerName, renterName, propertyTitle, propertyLocation, monthlyRent, fromDate }) => {
  const start = fromDate ? new Date(fromDate).toLocaleDateString() : 'N/A';
  return `RENTAL AGREEMENT

This Rental Agreement is made between:
- Owner: ${ownerName}
- Renter: ${renterName}

Property:
- Title: ${propertyTitle}
- Location: ${propertyLocation}
- Monthly Rent: Rs. ${monthlyRent}
- Start Date: ${start}

Terms:
1. Rent is payable monthly in advance.
2. The renter must maintain the property in good condition.
3. The owner is responsible for major structural repairs unless damage is caused by renter negligence.
4. Either party may request termination according to platform policy and applicable law.
5. Digital signatures by both parties constitute acceptance of this agreement.

Both parties agree to these terms.
`;
};

const withCurrentVersion = (agreement) => {
  const doc = agreement.toObject();
  doc.activeVersion = doc.versions?.find((v) => v.version === doc.currentVersion) || null;
  return doc;
};

export const generateAgreement = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can generate agreements' });
    }

    const booking = await Booking.findById(req.params.bookingId)
      .populate('property')
      .populate('renter', 'name email');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'Approved') return res.status(400).json({ error: 'Booking is not approved' });

    const property = booking.property;
    if (!property || property.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized for this booking' });
    }

    const owner = await User.findById(req.user._id).select('name email');
    const renter = booking.renter;

    const content =
      req.body?.content?.trim() ||
      getTemplateContent({
        ownerName: owner?.name || owner?.email || 'Owner',
        renterName: renter?.name || renter?.email || 'Renter',
        propertyTitle: property?.title || 'Property',
        propertyLocation: property?.location || 'N/A',
        monthlyRent: property?.price || 0,
        fromDate: booking?.fromDate,
      });

    let agreement = await Agreement.findOne({ booking: booking._id });
    if (!agreement) {
      agreement = await Agreement.create({
        booking: booking._id,
        property: property._id,
        owner: req.user._id,
        renter: renter._id,
        currentVersion: 1,
        versions: [
          {
            version: 1,
            content,
            createdBy: req.user._id,
            status: 'pending_owner',
          },
        ],
      });
    } else {
      const nextVersion = (agreement.currentVersion || 0) + 1;
      agreement.currentVersion = nextVersion;
      agreement.versions.push({
        version: nextVersion,
        content,
        createdBy: req.user._id,
        status: 'pending_owner',
      });
      await agreement.save();
    }

    const populated = await Agreement.findById(agreement._id)
      .populate('owner', 'name email')
      .populate('renter', 'name email')
      .populate('property', 'title location price');

    res.status(201).json(withCurrentVersion(populated));
  } catch (err) {
    console.error('generateAgreement error:', err);
    res.status(500).json({ error: 'Failed to generate agreement' });
  }
};

export const getMyAgreements = async (req, res) => {
  try {
    const filter =
      req.user.role === 'owner'
        ? { owner: req.user._id }
        : req.user.role === 'renter'
          ? { renter: req.user._id }
          : {};

    const agreements = await Agreement.find(filter)
      .populate('owner', 'name email')
      .populate('renter', 'name email')
      .populate('property', 'title location price')
      .sort({ updatedAt: -1 });

    res.json(agreements.map(withCurrentVersion));
  } catch (err) {
    console.error('getMyAgreements error:', err);
    res.status(500).json({ error: 'Failed to fetch agreements' });
  }
};

export const getAgreementById = async (req, res) => {
  try {
    const agreement = await Agreement.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('renter', 'name email')
      .populate('property', 'title location price');

    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const isParticipant =
      agreement.owner?._id?.toString() === req.user._id.toString() ||
      agreement.renter?._id?.toString() === req.user._id.toString() ||
      req.user.role === 'admin';
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    res.json(withCurrentVersion(agreement));
  } catch (err) {
    console.error('getAgreementById error:', err);
    res.status(500).json({ error: 'Failed to fetch agreement' });
  }
};

export const signAgreement = async (req, res) => {
  try {
    const { signature } = req.body;
    if (!signature || String(signature).trim().length < 2) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    const agreement = await Agreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const activeVersion = agreement.versions.find((v) => v.version === agreement.currentVersion);
    if (!activeVersion) return res.status(400).json({ error: 'Active agreement version not found' });

    const isOwner = agreement.owner.toString() === req.user._id.toString();
    const isRenter = agreement.renter.toString() === req.user._id.toString();
    if (!isOwner && !isRenter) return res.status(403).json({ error: 'Not authorized' });

    if (isOwner) {
      activeVersion.ownerSignature = signature;
      activeVersion.ownerSignedAt = new Date();
    }
    if (isRenter) {
      activeVersion.renterSignature = signature;
      activeVersion.renterSignedAt = new Date();
    }

    if (activeVersion.ownerSignature && activeVersion.renterSignature) {
      activeVersion.status = 'fully_signed';
    } else if (activeVersion.ownerSignature) {
      activeVersion.status = 'pending_renter';
    } else {
      activeVersion.status = 'pending_owner';
    }

    await agreement.save();

    const populated = await Agreement.findById(agreement._id)
      .populate('owner', 'name email')
      .populate('renter', 'name email')
      .populate('property', 'title location price');

    res.json(withCurrentVersion(populated));
  } catch (err) {
    console.error('signAgreement error:', err);
    res.status(500).json({ error: 'Failed to sign agreement' });
  }
};
