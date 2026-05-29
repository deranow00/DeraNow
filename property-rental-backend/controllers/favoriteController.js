import Favorite from '../models/Favorite.js';

const getApproximateLocation = (property = {}) => {
  if (property.approximateLocation) return property.approximateLocation;
  const parts = String(property.location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(', ');
  return parts[0] || 'Approximate area available after visit booking';
};

const hideExactLocation = (property) => {
  const plain = typeof property?.toObject === 'function' ? property.toObject() : property;
  return {
    ...plain,
    location: getApproximateLocation(plain),
    exactLocation: '',
    exactLocationLocked: true,
  };
};

export const addFavorite = async (req, res) => {
  try {
    const { propertyId } = req.body;
    const existing = await Favorite.findOne({ user: req.user._id, property: propertyId });
    if (existing) return res.status(400).json({ error: 'Already in favorites' });

    const favorite = new Favorite({ user: req.user._id, property: propertyId });
    await favorite.save();
    res.status(201).json(favorite);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id }).populate('property');
    const validFavorites = favorites.filter((f) => f.property);
    const staleFavoriteIds = favorites.filter((f) => !f.property).map((f) => f._id);

    // Clean up favorites that reference deleted properties.
    if (staleFavoriteIds.length > 0) {
      await Favorite.deleteMany({ _id: { $in: staleFavoriteIds } });
    }

    res.json(validFavorites.map((f) => hideExactLocation(f.property)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    await Favorite.findOneAndDelete({ user: req.user._id, property: req.params.id });
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
};
