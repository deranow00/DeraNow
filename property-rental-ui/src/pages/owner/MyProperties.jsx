import React, { useState, useEffect, useContext } from 'react';
import { FaCrosshairs, FaMapMarkerAlt, FaTimes } from 'react-icons/fa';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import './MyProperties.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import 'leaflet/dist/leaflet.css';

const PROPERTY_TYPES = ['Apartment', 'House', 'Condo'];
const displayPropertyType = (type) => (type === 'Condo' ? 'Room' : type);
const toBackendPropertyType = (type) => (type === 'Room' ? 'Condo' : type);
const DEFAULT_MAP_CENTER = { lat: 27.7172, lng: 85.324 };

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function MapRecenter({ center, version }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 17), { animate: false });
  }, [center, map, version]);
  return null;
}

function MapCenterPicker({ onSelect }) {
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      onSelect({ lat: center.lat, lng: center.lng }, 'Map moved. The pin marks the selected point.');
    },
  });
  return null;
}

export default function MyProperties() {
  const [viewProperty, setViewProperty] = useState(null);

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useContext(AuthContext);

  const [isEditing, setIsEditing] = useState(false);
  const [currentProperty, setCurrentProperty] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    description: '',
    type: PROPERTY_TYPES[0],
    image: '',
    images: [],
    locationCoordinates: null,
    parkingAvailable: false,
    petFriendly: false,
  });
  const [formError, setFormError] = useState('');
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [mapRecenterVersion, setMapRecenterVersion] = useState(0);
  const [mapStatus, setMapStatus] = useState('');
  const [mapSearch, setMapSearch] = useState('');

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        if (!token) {
          setError('Please log in to view properties.');
          return;
        }

        const res = await fetch(`${API_BASE_URL}/api/properties/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load properties');

        setProperties(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, [token]);

  const handleEditClick = (property) => {
    const selectedCoordinates = getValidCoordinates(property.locationCoordinates);
    setCurrentProperty(property);
    setFormData({
      title: property.title || '',
      location: property.location || '',
      price: property.price || '',
      bedrooms: property.bedrooms || '',
      bathrooms: property.bathrooms || '',
      description: property.description || '',
      type: toBackendPropertyType(property.type || PROPERTY_TYPES[0]),
      image: property.image || '',
      images: Array.isArray(property.images) ? property.images : property.image ? [property.image] : [],
      locationCoordinates: selectedCoordinates,
      parkingAvailable: Boolean(property.parkingAvailable),
      petFriendly: Boolean(property.petFriendly),
    });
    setMapCenter(selectedCoordinates || DEFAULT_MAP_CENTER);
    setMapRecenterVersion((prev) => prev + 1);
    setMapStatus(selectedCoordinates ? 'Saved location loaded. Move the map to update it.' : '');
    setMapSearch('');
    setFormError('');
    setEditImageFiles([]);
    setIsEditing(true);
  };

  const getValidCoordinates = (coordinates = {}) => {
    const lat = Number(coordinates?.lat);
    const lng = Number(coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };

  const formatCoordinates = (coords) =>
    coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : '';

  const setExactCoordinates = (coords, options = {}) => {
    const normalized = getValidCoordinates(coords);
    if (!normalized) return;
    if (options.recenter) {
      setMapCenter(normalized);
      setMapRecenterVersion((prev) => prev + 1);
    }
    setFormData((prev) => ({
      ...prev,
      locationCoordinates: normalized,
      location: prev.location || formatCoordinates(normalized),
    }));
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setMapStatus('Location is not supported on this device.');
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setMapStatus('Current location needs HTTPS. Use deployed app or enter/search location manually.');
      return;
    }

    setMapStatus('Finding your current location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setExactCoordinates(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          { recenter: true }
        );
        setMapStatus('Location selected. Move the map with your finger; the center pin marks the exact point.');
      },
      () => setMapStatus('Could not access location. Check location permission, then try again.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  };

  const searchMapLocation = async () => {
    const query = mapSearch.trim();
    if (!query) return;
    setMapStatus('Searching location...');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      const result = Array.isArray(data) ? data[0] : null;
      if (!result) {
        setMapStatus('No matching location found. Try a nearby landmark or area name.');
        return;
      }
      const coords = { lat: Number(result.lat), lng: Number(result.lon) };
      setExactCoordinates(coords, { recenter: true });
      setMapStatus('Location found. Move the map with your finger; the center pin marks the exact point.');
    } catch {
      setMapStatus('Search failed. Please try again or use current location.');
    }
  };

  const uploadImageToCloudinary = async () => {
    if (!editImageFiles.length) {
      return {
        imageUrl: formData.image,
        imageUrls: Array.isArray(formData.images) && formData.images.length
          ? formData.images
          : formData.image ? [formData.image] : [],
      };
    }

    const formPayload = new FormData();
    editImageFiles.slice(0, 5).forEach((file) => {
      formPayload.append('images', file);
    });

    setUploadingImage(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/properties/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formPayload,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed');
      return {
        imageUrl: data.imageUrl,
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [data.imageUrl].filter(Boolean),
      };
    } finally {
      setUploadingImage(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (
      !formData.title ||
      !formData.location ||
      !formData.price ||
      !formData.bedrooms ||
      !formData.bathrooms ||
      !formData.type
    ) {
      setFormError('Please fill in all required fields');
      return;
    }

    try {
      const uploaded = await uploadImageToCloudinary();
      const res = await fetch(`${API_BASE_URL}/api/properties/${currentProperty._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          type: toBackendPropertyType(formData.type),
          image: uploaded.imageUrl,
          images: uploaded.imageUrls,
          price: Number(formData.price),
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
          parkingAvailable: Boolean(formData.parkingAvailable),
          petFriendly: Boolean(formData.petFriendly),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update property');

      setProperties((prev) =>
        prev.map((p) => (p._id === currentProperty._id ? data.property : p))
      );

      setIsEditing(false);
      setCurrentProperty(null);
      setEditImageFiles([]);
    } catch (err) {
      setFormError(err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (propertyId) => {
    if (!token) return;

    if (!window.confirm('Are you sure you want to delete this property?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/properties/${propertyId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setProperties((prev) => prev.filter((p) => p._id !== propertyId));
    } catch (err) {
      alert(err.message || 'Failed to delete property');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setMapOpen(false);
    setFormError('');
    setEditImageFiles([]);
  };

  return (
    <div className="my-properties-container">
      <h1>My Properties</h1>
      {loading ? (
        <p>Loading properties...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : properties.length === 0 ? (
        <p>No properties found. Please add some!</p>
      ) : (
        <div className="properties-grid">
          {properties.map((property) => (
            <div key={property._id} className="property-card">
              <img
                src={property.image || property.images?.[0] || '/default-image.jpg'}
                alt={property.title}
                className="property-image"
              />
              <div className="property-details">
                <h3>{property.title}</h3>
                <p>Location: {property.location}</p>
                <p>
                  Rent: <span className="rent-amount">Rs. {property.price}</span>
                </p>
                <p>Parking: {property.parkingAvailable ? 'Available' : 'Not available'}</p>
                <p>Pet Friendly: {property.petFriendly ? 'Yes' : 'No'}</p>
                <p className="status available">Approval: {property.approvalStatus}</p>
                <p
                  className={`status ${
                    property.bookingStatus === 'Approved' ? 'approved' : 'available'
                  }`}
                >
                  Booking: {property.bookingStatus === 'Approved' ? 'booked' : 'Available'}
                </p>

                <div className="property-actions">
                  <button className="btn-edit" onClick={() => handleEditClick(property)}>
                    Edit
                  </button>
                  <button className="btn-delete" onClick={() => handleDelete(property._id)}>
                    Delete
                  </button>
                  <button className="btn-view" onClick={() => setViewProperty(property)}>
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isEditing && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={handleCancel}
              aria-label="Close popup"
              title="Close"
            >
              ✕
            </button>
            <h2>Edit Property</h2>
            <div className="form-group">
              <label>Title*</label>
              <input name="title" value={formData.title} onChange={handleInputChange} />
            </div>
            <div className="form-group">
              <label>Location*</label>
              <div className="location-edit-row">
                <input name="location" value={formData.location} onChange={handleInputChange} />
                <button type="button" onClick={() => setMapOpen(true)}>
                  <FaMapMarkerAlt aria-hidden="true" />
                  Pick on Map
                </button>
              </div>
              {formData.locationCoordinates && (
                <small className="location-coordinate-note">
                  Selected coordinates: {formatCoordinates(formData.locationCoordinates)}
                </small>
              )}
            </div>
            <div className="form-group">
              <label>Price (Rs)*</label>
              <input
                name="price"
                type="number"
                value={formData.price}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Bedrooms*</label>
              <input
                name="bedrooms"
                type="number"
                value={formData.bedrooms}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Bathrooms*</label>
              <input
                name="bathrooms"
                type="number"
                value={formData.bathrooms}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
              />
            </div>
            <div className="form-group">
              <label>Type*</label>
              <select name="type" value={formData.type} onChange={handleInputChange}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {displayPropertyType(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group amenity-edit-grid">
              <label className="amenity-edit-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(formData.parkingAvailable)}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, parkingAvailable: e.target.checked }))
                  }
                />
                <span>Parking Available</span>
              </label>
              <label className="amenity-edit-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(formData.petFriendly)}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, petFriendly: e.target.checked }))
                  }
                />
                <span>Pet Friendly</span>
              </label>
            </div>
            <div className="form-group">
              <span className="photo-upload-label">Upload New Images</span>
              <div className="photo-upload-actions">
                <label className="photo-upload-button" htmlFor="edit-property-image-gallery">
                  Choose from Photos
                </label>
                <label className="photo-upload-button" htmlFor="edit-property-image-camera">
                  Take Live Photo
                </label>
              </div>
              <input
                id="edit-property-image-gallery"
                className="photo-upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setEditImageFiles(Array.from(e.target.files || []).slice(0, 5))}
              />
              <input
                id="edit-property-image-camera"
                className="photo-upload-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setEditImageFiles(Array.from(e.target.files || []).slice(0, 5))}
              />
              <small className="photo-upload-selected">
                {editImageFiles.length ? `${editImageFiles.length} image${editImageFiles.length > 1 ? 's' : ''} selected` : 'No image selected'}
              </small>
            </div>
            <div className="form-group">
              <label>Image URL (Optional)</label>
              <input name="image" value={formData.image} onChange={handleInputChange} />
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-buttons">
              <button className="btn-save" onClick={handleSave} disabled={uploadingImage}>
                {uploadingImage ? 'Uploading...' : 'Save'}
              </button>
              <button className="btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {mapOpen && (
        <div className="edit-map-picker-overlay" onClick={() => setMapOpen(false)}>
          <div className="edit-map-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-map-picker-header">
              <div>
                <h3>Update Exact Location</h3>
                <p>Move the map and keep the pin on the property. This exact point unlocks for renters after visit access.</p>
              </div>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Close map picker">
                <FaTimes aria-hidden="true" />
              </button>
            </div>
            <div className="edit-map-picker-toolbar">
              <div className="edit-map-picker-search">
                <input
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchMapLocation();
                    }
                  }}
                  placeholder="Search address, area, or landmark"
                />
                <button type="button" onClick={searchMapLocation}>Search</button>
              </div>
              <button type="button" onClick={locateMe}>
                <FaCrosshairs aria-hidden="true" />
                Use Current Location
              </button>
            </div>
            <div className="edit-map-picker-canvas">
              <MapContainer
                center={[mapCenter.lat, mapCenter.lng]}
                zoom={17}
                scrollWheelZoom
                dragging
                tap={false}
                touchZoom
                doubleClickZoom
                className="edit-map-picker-leaflet"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapResize />
                <MapRecenter center={mapCenter} version={mapRecenterVersion} />
                <MapCenterPicker
                  onSelect={(coords, status) => {
                    setExactCoordinates(coords);
                    setMapStatus(status);
                  }}
                />
              </MapContainer>
              <span className="edit-map-center-pin"><FaMapMarkerAlt aria-hidden="true" /></span>
            </div>
            <div className="edit-map-picker-footer">
              <label>
                <span>Coordinates</span>
                <input
                  value={formatCoordinates(formData.locationCoordinates || mapCenter)}
                  onChange={(e) => {
                    const [lat, lng] = e.target.value.split(',').map((item) => Number(item.trim()));
                    setExactCoordinates({ lat, lng }, { recenter: true });
                  }}
                />
              </label>
              {mapStatus && <p>{mapStatus}</p>}
              <div>
                <button type="button" className="btn-cancel" onClick={() => setMapOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn-save"
                  onClick={() => {
                    const coords = formData.locationCoordinates || mapCenter;
                    setExactCoordinates(coords);
                    setMapOpen(false);
                  }}
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {viewProperty && (
        <div className="modal-overlay" onClick={() => setViewProperty(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setViewProperty(null)}
              aria-label="Close popup"
              title="Close"
            >
              ✕
            </button>
            <h2>Property Details</h2>
            <img
              src={viewProperty.image || viewProperty.images?.[0] || '/default-image.jpg'}
              alt={viewProperty.title}
              className="modal-image"
            />
            {Array.isArray(viewProperty.images) && viewProperty.images.length > 1 && (
              <div className="modal-image-thumbs">
                {viewProperty.images.slice(1, 5).map((imageUrl, index) => (
                  <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`${viewProperty.title} ${index + 2}`} />
                ))}
              </div>
            )}
            <p>
              <strong>Title:</strong> {viewProperty.title}
            </p>
            <p>
              <strong>Location:</strong> {viewProperty.location}
            </p>
            <p>
              <strong>Rent:</strong> Rs. {viewProperty.price}
            </p>
            <p>
              <strong>Bedrooms:</strong> {viewProperty.bedrooms}
            </p>
            <p>
              <strong>Bathrooms:</strong> {viewProperty.bathrooms}
            </p>
            <p>
              <strong>Description:</strong> {viewProperty.description || 'N/A'}
            </p>
            <p>
              <strong>Type:</strong> {displayPropertyType(viewProperty.type)}
            </p>
            <p>
              <strong>Parking:</strong> {viewProperty.parkingAvailable ? 'Available' : 'Not available'}
            </p>
            <p>
              <strong>Pet Friendly:</strong> {viewProperty.petFriendly ? 'Yes' : 'No'}
            </p>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setViewProperty(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
