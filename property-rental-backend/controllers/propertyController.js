import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import PropertyVisit from '../models/PropertyVisit.js';
import AdminSetting from '../models/AdminSetting.js';
import User from '../models/User.js';
import { sendNotification } from '../socket.js';
import mongoose from 'mongoose';
import cloudinary from '../config/cloudinary.js';

const uploadImageBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'property-rental/listings',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });

const availabilityPriority = {
  Available: 0,
  'Visit Scheduled': 1,
  'Booking Pending': 2,
  Occupied: 3,
};

const setAvailability = (map, propertyId, status) => {
  const key = String(propertyId);
  const current = map.get(key) || 'Available';
  if (availabilityPriority[status] > availabilityPriority[current]) {
    map.set(key, status);
  }
};

const buildAvailabilityMap = async (propertyIds = []) => {
  const ids = propertyIds.filter(Boolean);
  const availabilityMap = new Map(ids.map((id) => [String(id), 'Available']));
  if (!ids.length) return availabilityMap;

  const now = new Date();
  const [occupiedBookings, pendingBookings, activeVisits] = await Promise.all([
    Booking.find({
      property: { $in: ids },
      status: 'Approved',
      fromDate: { $lte: now },
      toDate: { $gte: now },
    }).select('property').lean(),
    Booking.find({
      property: { $in: ids },
      status: 'Pending',
    }).select('property').lean(),
    PropertyVisit.find({
      property: { $in: ids },
      status: { $in: ['scheduled', 'booking_pending'] },
      bookingConfirmationStatus: { $ne: 'failed' },
    }).select('property').lean(),
  ]);

  activeVisits.forEach((visit) => setAvailability(availabilityMap, visit.property, 'Visit Scheduled'));
  pendingBookings.forEach((booking) => setAvailability(availabilityMap, booking.property, 'Booking Pending'));
  occupiedBookings.forEach((booking) => setAvailability(availabilityMap, booking.property, 'Occupied'));

  return availabilityMap;
};

const attachAvailability = async (input) => {
  const list = Array.isArray(input) ? input : [input];
  const propertyIds = list.map((property) => property?._id).filter(Boolean);
  const availabilityMap = await buildAvailabilityMap(propertyIds);
  const mapped = list.map((property) => {
    const plain = typeof property?.toObject === 'function' ? property.toObject() : property;
    if (!plain) return plain;
    return {
      ...plain,
      availabilityStatus: availabilityMap.get(String(plain._id)) || 'Available',
    };
  });
  return Array.isArray(input) ? mapped : mapped[0];
};

const normalizeImageLabels = (labels = [], imageCount = 5) => {
  if (!Array.isArray(labels)) return [];
  const maxLabels = Math.min(Math.max(Number(imageCount) || 0, 0), 5);
  return labels
    .slice(0, maxLabels)
    .map((label) => String(label || '').trim().slice(0, 40));
};

const getApproximateLocation = (property = {}) => {
  if (property.approximateLocation) return property.approximateLocation;
  const parts = String(property.location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(', ');
  return parts[0] || 'Approximate area available after visit booking';
};

const getNumericSetting = async (key, fallback) => {
  const setting = await AdminSetting.findOne({ key }).lean();
  const value = Number(setting?.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const getVisitPassAmount = () => getNumericSetting('visitCharge', Number(process.env.VISIT_PASS_AMOUNT || 500));

const getBookingChargeAmount = async (propertyType) => {
  const defaults = {
    Condo: 2000,
    Apartment: 2500,
    House: 4000,
  };
  const keyByType = {
    Condo: 'roomBookingCharge',
    Apartment: 'flatBookingCharge',
    House: 'houseBookingCharge',
  };
  const normalizedType = keyByType[propertyType] ? propertyType : 'Condo';
  return getNumericSetting(keyByType[normalizedType], defaults[normalizedType]);
};

const getValidCoordinates = (coordinates = {}) => {
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const normalizePhone = (value = '') =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);

const canViewExactLocation = async (property, user) => {
  if (!user?._id || !property?._id) return false;
  if (user.role === 'admin') return true;
  if (String(property.ownerId?._id || property.ownerId) === String(user._id)) return true;
  if (user.role !== 'renter') return false;

  const visit = await PropertyVisit.exists({
    property: property._id,
    renter: user._id,
    status: { $ne: 'cancelled' },
  });
  return Boolean(visit);
};

const applyLocationPrivacy = async (input, user) => {
  const list = Array.isArray(input) ? input : [input];
  const mapped = await Promise.all(list.map(async (property) => {
    if (!property) return property;
    const plain = typeof property.toObject === 'function' ? property.toObject() : { ...property };
    const exactLocation = plain.location;
    const hasExactLocationAccess = await canViewExactLocation(plain, user);
    if (hasExactLocationAccess) {
      return {
        ...plain,
        location: exactLocation,
        exactLocation,
        ownerPhone: normalizePhone(plain.ownerPhone),
        locationCoordinates: getValidCoordinates(plain.locationCoordinates),
        approximateLocation: plain.approximateLocation || getApproximateLocation(plain),
        exactLocationLocked: false,
        ownerPhoneLocked: false,
      };
    }
    return {
      ...plain,
      location: getApproximateLocation(plain),
      approximateLocation: plain.approximateLocation || getApproximateLocation(plain),
      exactLocation: '',
      ownerPhone: '',
      locationCoordinates: null,
      exactLocationLocked: true,
      ownerPhoneLocked: true,
    };
  }));
  return Array.isArray(input) ? mapped : mapped[0];
};

export const uploadPropertyImage = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can upload property images' });
    }
    if (req.user.kycStatus !== 'verified') {
      return res.status(403).json({
        error: 'KYC verification is required before uploading property photos',
        code: 'KYC_VERIFICATION_REQUIRED',
      });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Cloudinary credentials are not configured on server' });
    }

    const files = req.files?.length ? req.files : req.file ? [req.file] : [];
    if (!files.length) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }
    if (files.length > 5) {
      return res.status(400).json({ error: 'You can upload up to 5 images per property' });
    }

    const uploadedImages = await Promise.all(
      files.map((file) => uploadImageBufferToCloudinary(file.buffer))
    );
    const imageUrls = uploadedImages.map((uploaded) => uploaded.secure_url);
    return res.status(201).json({
      imageUrl: imageUrls[0],
      imageUrls,
      publicIds: uploadedImages.map((uploaded) => uploaded.public_id),
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
};

export const addProperty = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can add properties' });
    }
    if (req.user.kycStatus !== 'verified') {
      return res.status(403).json({
        error: 'KYC verification is required before adding a property',
        code: 'KYC_VERIFICATION_REQUIRED',
      });
    }

    const {
      title,
      description,
      location,
      price,
      type,
      bedrooms,
      bathrooms,
      image,
      images = [],
      imageLabels = [],
      approximateLocation = '',
      ownerPhone = '',
      locationCoordinates = {},
      parkingAvailable = false,
      parkingType = parkingAvailable ? 'both' : 'none',
      petFriendly = false,
      kitchenAvailable = false,
    } = req.body;
    const ownerId = req.user._id;

    const normalizedOwnerPhone = normalizePhone(ownerPhone);

    if (!title || !location || !approximateLocation || !normalizedOwnerPhone || !price || !type || bedrooms == null || bathrooms == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedImages = Array.isArray(images)
      ? images.filter(Boolean).slice(0, 5)
      : [];
    const primaryImage = image || normalizedImages[0] || '';
    const savedImages = normalizedImages.length ? normalizedImages : primaryImage ? [primaryImage] : [];
    const normalizedImageLabels = normalizeImageLabels(imageLabels, savedImages.length);
    const normalizedParkingType = ['none', 'bike', 'car', 'both'].includes(parkingType) ? parkingType : 'none';
    const coordinates =
      Number.isFinite(Number(locationCoordinates?.lat)) && Number.isFinite(Number(locationCoordinates?.lng))
        ? {
            lat: Number(locationCoordinates.lat),
            lng: Number(locationCoordinates.lng),
          }
        : undefined;

    if (!coordinates) {
      return res.status(400).json({ error: 'Precise map location is required' });
    }

    const newProperty = new Property({
      title,
      description,
      location,
      approximateLocation,
      ownerPhone: normalizedOwnerPhone,
      locationCoordinates: coordinates,
      price,
      type,
      bedrooms,
      bathrooms,
      image: primaryImage,
      images: savedImages,
      imageLabels: normalizedImageLabels,
      parkingAvailable: normalizedParkingType !== 'none',
      parkingType: normalizedParkingType,
      petFriendly: Boolean(petFriendly),
      kitchenAvailable: Boolean(kitchenAvailable),
      ownerId,
      status: 'Pending',
    });

    await newProperty.save();

    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await sendNotification(
        admin._id,
        'listingApproval',
        `New listing pending approval: "${title}"`,
        `/property/${newProperty._id}`
      );
    }

    res.status(201).json({ message: 'Property added successfully', property: newProperty });
  } catch (error) {
    console.error('Add property error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMyProperties = async (req, res) => {
  try {
    const properties = await Property.find({ ownerId: req.user._id });
    const propertiesWithAvailability = await attachAvailability(properties);
    res.status(200).json(propertiesWithAvailability);
  } catch (error) {
    console.error('Get my properties error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const ownerId = req.user._id;

    const property = await Property.findOne({ _id: propertyId, ownerId });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const update = { ...req.body };
    if (update.location != null) {
      update.location = String(update.location).trim();
    }
    if (update.approximateLocation != null) {
      update.approximateLocation = String(update.approximateLocation).trim();
    }
    if (update.ownerPhone != null) {
      update.ownerPhone = normalizePhone(update.ownerPhone);
      if (!update.ownerPhone) {
        return res.status(400).json({ error: 'Owner phone number is required' });
      }
    }
    if (update.locationCoordinates) {
      const lat = Number(update.locationCoordinates.lat);
      const lng = Number(update.locationCoordinates.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        update.locationCoordinates = { lat, lng };
      } else {
        delete update.locationCoordinates;
      }
    }
    if (Object.prototype.hasOwnProperty.call(update, 'locationCoordinates') && !update.locationCoordinates) {
      return res.status(400).json({ error: 'Precise map location is required' });
    }
    if (update.parkingType != null) {
      update.parkingType = ['none', 'bike', 'car', 'both'].includes(update.parkingType) ? update.parkingType : 'none';
      update.parkingAvailable = update.parkingType !== 'none';
    }
    if (Array.isArray(update.images)) {
      update.images = update.images.filter(Boolean).slice(0, 5);
      update.image = update.image || update.images[0] || property.image;
    }
    if (Array.isArray(update.imageLabels)) {
      const imageCount = Array.isArray(update.images) && update.images.length
        ? update.images.length
        : (property.images?.length || (property.image ? 1 : 0));
      update.imageLabels = normalizeImageLabels(update.imageLabels, imageCount);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'kitchenAvailable')) {
      update.kitchenAvailable = Boolean(update.kitchenAvailable);
    }

    Object.assign(property, update);

    await property.save();
    res.status(200).json({ message: 'Property updated successfully', property });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (!property.ownerId.equals(req.user._id)) {
      return res.status(401).json({ error: 'Not authorized to delete this property' });
    }
    await Property.findByIdAndDelete(req.params.id);
    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProperty = async (req, res) => {
  try {
    const {
      q,
      location,
      minPrice,
      maxPrice,
      bedrooms,
      bedroomsGte,
      bathrooms,
      bathroomsGte,
      type,
      status,
      ownerId,
      sort,
      availableOnly,
    } = req.query;

    const filter = {};

    if (q) {
      filter.$or = [
        { title: new RegExp(q, 'i') },
        { location: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
      ];
    }

    if (location) {
      filter.location = new RegExp(location, 'i');
    }

    if (type) {
      filter.type = type;
    }

    if (bedroomsGte) {
      filter.bedrooms = { $gte: Number(bedroomsGte) };
    } else if (bedrooms) {
      filter.bedrooms = Number(bedrooms);
    }

    if (bathroomsGte) {
      filter.bathrooms = { $gte: Number(bathroomsGte) };
    } else if (bathrooms) {
      filter.bathrooms = Number(bathrooms);
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (ownerId) {
      filter.ownerId = ownerId;
    }

    if (status === 'listed') {
      // "Listed" means publicly listed records that are not rejected.
      filter.status = { $in: ['Pending', 'Approved'] };
    } else if (status) {
      filter.status = status;
    } else {
      filter.status = 'Approved';
    }

    const sortMap = {
      newest: { createdAt: -1 },
      priceLow: { price: 1 },
      priceHigh: { price: -1 },
    };

    if (availableOnly === 'true' || availableOnly === '1') {
      const bookedPropertyIds = await Booking.distinct('property', { status: 'Approved' });
      filter._id = { $nin: bookedPropertyIds };
    }

    const properties = await Property.find(filter)
      .populate('ownerId', 'name kycStatus')
      .sort(sortMap[sort] || { createdAt: -1 });

    const propertiesWithAvailability = await attachAvailability(properties);
    const publicProperties = await applyLocationPrivacy(propertiesWithAvailability, req.user);
    res.status(200).json(publicProperties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
};

export const getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('ownerId', 'name email kycStatus')
      .populate('reviews.user', 'name email');
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const response = await applyLocationPrivacy(await attachAvailability(property), req.user);
    if (req.user?._id) {
      const userRating = property.reviews?.find(
        (review) => review.user?._id?.toString() === req.user._id.toString()
      );
      response.userRating = userRating?.rating || null;
    }
    response.visitPassAmount = await getVisitPassAmount();
    response.bookingChargeAmount = await getBookingChargeAmount(property.type);

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property details' });
  }
};

export const getOwnerPropertiesWithBookingStatus = async (req, res) => {
  try {
    const properties = await Property.find({ ownerId: req.user._id });
    const propertyIds = properties.map((p) => p._id);

    const latestBookings = await Booking.aggregate([
      { $match: { property: { $in: propertyIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$property',
          latestStatus: { $first: '$status' },
        },
      },
    ]);

    const statusMap = {};
    latestBookings.forEach((b) => {
      statusMap[b._id.toString()] = b.latestStatus;
    });

    const propertiesWithStatus = properties.map((p) => ({
      ...p.toObject(),
      bookingStatus: statusMap[p._id.toString()] || 'Available',
      approvalStatus: p.status,
    }));

    res.json(propertiesWithStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching properties with booking status' });
  }
};

export const addReview = async (req, res) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }

    const propertyId = new mongoose.Types.ObjectId(req.params.id);
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const booking = await Booking.findOne({
      renter: userId,
      property: propertyId,
      status: 'Approved',
    });

    if (!booking) {
      return res.status(403).json({ message: 'You can only review properties you have booked' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    const existingReview = property.reviews?.find((r) => r.user.equals(userId));
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this property' });
    }

    property.reviews.push({ user: userId, rating, comment });
    property.numRatings += 1;
    property.rating = (property.rating * (property.numRatings - 1) + rating) / property.numRatings;

    await property.save();

    await sendNotification(
      property.ownerId,
      'review',
      `New review received for "${property.title}"`,
      `/owner/properties`
    );

    return res.json({ message: 'Review submitted successfully', rating: property.rating });
  } catch (err) {
    console.error('Review error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getReviews = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).populate('reviews.user', 'name email');
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json(property.reviews || []);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const adminGetPendingProperties = async (req, res) => {
  try {
    const properties = await Property.find({ status: 'Pending' }).populate(
      'ownerId',
      'name email kycStatus'
    );
    res.json(properties);
  } catch (err) {
    console.error('Admin pending properties error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const adminUpdatePropertyStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const property = await Property.findById(id);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    property.status = status;
    await property.save();

    await sendNotification(
      property.ownerId,
      'listingApproval',
      `Your listing "${property.title}" was ${status.toLowerCase()}.`,
      `/property/${property._id}`
    );

    res.json({ message: 'Property status updated', property });
  } catch (err) {
    console.error('Admin update property error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
