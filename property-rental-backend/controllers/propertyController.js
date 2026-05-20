import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
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

export const uploadPropertyImage = async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Cloudinary credentials are not configured on server' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const uploaded = await uploadImageBufferToCloudinary(req.file.buffer);
    return res.status(201).json({
      imageUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
};

export const addProperty = async (req, res) => {
  try {
    const { title, description, location, price, type, bedrooms, bathrooms, image } = req.body;
    const ownerId = req.user._id;

    if (!title || !location || !price || !type || bedrooms == null || bathrooms == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newProperty = new Property({
      title,
      description,
      location,
      price,
      type,
      bedrooms,
      bathrooms,
      image,
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
    res.status(200).json(properties);
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

    Object.assign(property, req.body);

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
      .populate('ownerId', 'name ownerVerificationStatus')
      .sort(sortMap[sort] || { createdAt: -1 });

    res.status(200).json(properties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
};

export const getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('ownerId', 'name email ownerVerificationStatus')
      .populate('reviews.user', 'name email');
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const response = property.toObject();
    if (req.user?._id) {
      const userRating = property.reviews?.find(
        (review) => review.user?._id?.toString() === req.user._id.toString()
      );
      response.userRating = userRating?.rating || null;
    }

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
      'name email ownerVerificationStatus'
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
