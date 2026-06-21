import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCamera, FaCrosshairs, FaImages, FaMapMarkerAlt, FaPlus, FaTimes } from 'react-icons/fa';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config/api';
import { compressImageFiles } from '../../utils/imageCompression';
import 'leaflet/dist/leaflet.css';
import './AddProperty.css';

const initialForm = {
  title: '',
  location: '',
  approximateLocation: '',
  ownerPhone: '',
  locationCoordinates: null,
  price: '',
  bedrooms: '',
  bathrooms: '',
  bathroomType: 'general',
  description: '',
  type: 'Apartment',
  image: '',
  imageFiles: [],
  imageLabels: [],
  parkingType: 'none',
  petFriendly: false,
  kitchenAvailable: false,
};

const DEFAULT_MAP_CENTER = { lat: 27.7172, lng: 85.324 };

const parkingOptions = [
  { value: 'none', label: 'None' },
  { value: 'bike', label: 'Bike' },
  { value: 'car', label: 'Car' },
  { value: 'both', label: 'Both' },
];

const roomImageLabelOptions = Array.from({ length: 5 }, (_, index) => `Room ${index + 1}`);
const bathroomImageLabelOptions = ['Bathroom', 'General Bathroom', 'Personal Bathroom'];
const kitchenImageLabelOptions = ['Kitchen', 'Kitchen 1', 'Kitchen 2'];
const imageLabelOptions = [
  ...roomImageLabelOptions,
  ...bathroomImageLabelOptions,
  ...kitchenImageLabelOptions,
  'Living area',
  'Entrance',
  'Balcony',
  'Other',
];
const defaultImageLabel = (index) => imageLabelOptions[index] || `Photo ${index + 1}`;
const bathroomTypeOptions = [
  { value: 'general', label: 'General bathroom' },
  { value: 'personal', label: 'Personal bathroom' },
];

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 120);
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

export default function AddProperty() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [keepAdding, setKeepAdding] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [mapRecenterVersion, setMapRecenterVersion] = useState(0);
  const [mapStatus, setMapStatus] = useState('');
  const [mapSearch, setMapSearch] = useState('');

  const { token, user } = useContext(AuthContext);
  const { showToast } = useToast();
  const kycStatus = user?.kycStatus || 'unsubmitted';
  const ownerVerified = kycStatus === 'verified';

  const imagePreviews = useMemo(
    () => form.imageFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    })),
    [form.imageFiles]
  );

  useEffect(() => () => {
    imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [imagePreviews]);

  const updateField = (field, value) => {
    setError('');
    setSuccess('');
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addImageFiles = (files) => {
    const incoming = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) return;

    setError('');
    setSuccess('');
    setForm((prev) => {
      const merged = [...prev.imageFiles, ...incoming]
        .filter((file, index, list) => (
          list.findIndex((item) => (
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
          )) === index
        ))
        .slice(0, 5);
      const imageLabels = merged.map((_, index) => prev.imageLabels[index] || defaultImageLabel(index));
      return { ...prev, imageFiles: merged, imageLabels };
    });
  };

  const removeImageFile = (id) => {
    setForm((prev) => ({
      ...prev,
      imageFiles: prev.imageFiles.filter((file) => `${file.name}-${file.lastModified}-${file.size}` !== id),
      imageLabels: prev.imageFiles
        .map((file, index) => ({ file, label: prev.imageLabels[index] }))
        .filter(({ file }) => `${file.name}-${file.lastModified}-${file.size}` !== id)
        .map(({ label }, index) => label || defaultImageLabel(index)),
    }));
  };

  const updateImageLabel = (index, value) => {
    setForm((prev) => {
      const imageLabels = [...prev.imageLabels];
      imageLabels[index] = value;
      return { ...prev, imageLabels };
    });
  };

  const formatCoordinates = (coords) =>
    coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : '';

  const setExactCoordinates = (coords, options = {}) => {
    const normalized = {
      lat: Number(coords.lat),
      lng: Number(coords.lng),
    };
    if (options.recenter) {
      setMapCenter(normalized);
      setMapRecenterVersion((prev) => prev + 1);
    }
    setForm((prev) => ({
      ...prev,
      locationCoordinates: normalized,
    }));
  };

  const locateMe = () => {
    const applyCurrentPosition = (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setExactCoordinates(coords, { recenter: true });
      setMapStatus('Location selected. Move the map with your finger; the center pin marks the exact point.');
    };

    const fallbackToBrowserLocation = () => {
      if (!navigator.geolocation) {
        setMapStatus('Location is not supported on this device.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        applyCurrentPosition,
        () => setMapStatus('Could not access location. Check location permission, then try again.'),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    };

    setMapStatus('Finding your current location...');

    if (Capacitor.isNativePlatform()) {
      Geolocation.requestPermissions()
        .then(() => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 }))
        .then(applyCurrentPosition)
        .catch(() => fallbackToBrowserLocation());
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setMapStatus('Current location needs HTTPS. Use deployed app or enter/search location manually.');
      return;
    }

    if (!navigator.geolocation) {
      setMapStatus('Location is not supported on this device.');
      return;
    }
    fallbackToBrowserLocation();
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
      if (!form.location) updateField('location', result.display_name || query);
      setMapStatus('Location found. Move the map with your finger; the center pin marks the exact point.');
    } catch {
      setMapStatus('Search failed. Please try again or use current location.');
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setError('');
    setSuccess('');
  };

  const uploadImageToCloudinary = async () => {
    if (!ownerVerified) {
      throw new Error('KYC verification is required before uploading property photos.');
    }

    if (!form.imageFiles.length) {
      const fallbackImages = form.image ? [form.image] : [];
      return { imageUrl: form.image, imageUrls: fallbackImages };
    }

    const formData = new FormData();
    const compressedFiles = await compressImageFiles(form.imageFiles.slice(0, 5), {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.82,
      mimeType: 'image/webp',
    });

    compressedFiles.forEach((file) => {
      formData.append('images', file);
    });

    setUploadingImage(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/properties/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.title || !form.location || !form.approximateLocation || !form.ownerPhone || !form.locationCoordinates || !form.price || !form.bedrooms || !form.bathrooms || !form.type) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!token) {
      setError('Please log in to add a property.');
      return;
    }

    if (!ownerVerified) {
      setError('KYC verification is required before adding a property.');
      return;
    }

    setLoading(true);

    try {
      const uploaded = await uploadImageToCloudinary();
      const imageCount = uploaded.imageUrls.length || (uploaded.imageUrl ? 1 : 0);
      const imageLabels = Array.from({ length: imageCount }, (_, index) => (
        form.imageLabels[index] || defaultImageLabel(index)
      ));

      const response = await fetch(`${API_BASE_URL}/api/properties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          location: form.location,
          approximateLocation: form.approximateLocation,
          ownerPhone: form.ownerPhone,
          locationCoordinates: form.locationCoordinates,
          price: Number(form.price),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          bathroomType: form.bathroomType,
          description: form.description,
          type: form.type,
          image: uploaded.imageUrl,
          images: uploaded.imageUrls,
          imageLabels,
          parkingAvailable: form.parkingType !== 'none',
          parkingType: form.parkingType,
          petFriendly: form.petFriendly,
          kitchenAvailable: form.kitchenAvailable,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const nextError = data.error || data.message || 'Failed to add property.';
        setError(nextError);
        showToast(nextError, { type: 'error' });
      } else {
        setCreatedCount((prev) => prev + 1);
        const nextSuccess = keepAdding ? 'Property submitted for approval. You can add another listing now.' : 'Property submitted for approval.';
        setSuccess(nextSuccess);
        showToast('The form submitted successfully.');
        if (keepAdding) {
          setForm(initialForm);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (err) {
      const nextError = err.message || 'Server error. Please try again later.';
      setError(nextError);
      showToast(nextError, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-property-container">
      <div className="add-property-header">
        <div>
          <span className="add-property-eyebrow">Owner Workspace</span>
          <h2>Add Property</h2>
          <p>Create a complete DeraNow listing with photos, amenities, rent details, and review-ready information.</p>
        </div>
        <div className="add-property-stat">
          <span>Created this session</span>
          <strong>{createdCount}</strong>
        </div>
      </div>

      {!ownerVerified && (
        <section className="add-property-locked">
          <span className={`owner-kyc-status ${kycStatus}`}>
            KYC: {kycStatus}
          </span>
          <h3>Complete KYC before adding properties</h3>
          <p>
            DeraNow uses the same KYC verification already available in your profile.
            Verified KYC protects renters, improves trust, and unlocks property submission.
          </p>
          {kycStatus === 'pending' ? (
            <p className="add-property-locked-note">
              Your KYC request is under admin review. You can add properties once it is approved.
            </p>
          ) : (
            <Link to="/owner/profile" className="add-property-locked-action">
              Complete KYC
            </Link>
          )}
        </section>
      )}

      <form onSubmit={handleSubmit} className={`add-property-form ${!ownerVerified ? 'is-locked' : ''}`}>
        <section className="add-property-panel details-panel">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <h3>Listing Details</h3>
              <p>Renters only see the public area first. The exact map location unlocks only after they book a visit for this property.</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="form-field span-2">
              <span>Title *</span>
              <input
                type="text"
                placeholder="e.g. Sunny room near Balkumari"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
              />
            </label>

            <label className="form-field span-2">
              <span>Exact Address / Landmark *</span>
              <div className="location-input-row">
                <input
                  type="text"
                  placeholder="House number, street, area, city, nearby landmark"
                  value={form.location}
                  onChange={(e) => updateField('location', e.target.value)}
                />
                <button type="button" onClick={() => setMapOpen(true)}>
                  <FaMapMarkerAlt aria-hidden="true" />
                  Pick Precise Map Point
                </button>
              </div>
              {form.locationCoordinates && (
                <small className="location-coordinate-note">
                  Precise map point: {formatCoordinates(form.locationCoordinates)}
                </small>
              )}
            </label>

            <label className="form-field span-2">
              <span>Approximate Public Location *</span>
              <input
                type="text"
                placeholder="e.g. Hetauda-6, Chaughada"
                value={form.approximateLocation}
                onChange={(e) => updateField('approximateLocation', e.target.value)}
              />
            </label>

            <label className="form-field span-2">
              <span>Owner Phone Number *</span>
              <input
                type="tel"
                inputMode="tel"
                placeholder="e.g. 98XXXXXXXX"
                value={form.ownerPhone}
                onChange={(e) => updateField('ownerPhone', e.target.value)}
              />
              <small className="location-coordinate-note">
                Renters can see this only after they book a visit for this property.
              </small>
            </label>

            <label className="form-field">
              <span>Monthly Rent *</span>
              <input
                type="number"
                min="0"
                placeholder="15000"
                value={form.price}
                onChange={(e) => updateField('price', e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Property Type *</span>
              <select value={form.type} onChange={(e) => updateField('type', e.target.value)}>
                <option value="Apartment">Flat</option>
                <option value="House">House</option>
                <option value="Condo">Room</option>
              </select>
            </label>

            <label className="form-field">
              <span>Bedrooms *</span>
              <input
                type="number"
                min="0"
                placeholder="1"
                value={form.bedrooms}
                onChange={(e) => updateField('bedrooms', e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Bathrooms *</span>
              <input
                type="number"
                min="0"
                placeholder="1"
                value={form.bathrooms}
                onChange={(e) => updateField('bathrooms', e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Bathroom Type *</span>
              <select value={form.bathroomType} onChange={(e) => updateField('bathroomType', e.target.value)}>
                {bathroomTypeOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="amenity-section">
            <span className="amenity-section-title">Parking</span>
            <div className="parking-choice-grid">
              {parkingOptions.map((option) => (
                <label className={`parking-choice ${form.parkingType === option.value ? 'selected' : ''}`} key={option.value}>
                  <input
                    type="radio"
                    name="parkingType"
                    value={option.value}
                    checked={form.parkingType === option.value}
                    onChange={(e) => updateField('parkingType', e.target.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <label className="amenity-toggle">
              <input
                type="checkbox"
                checked={form.petFriendly}
                onChange={(e) => updateField('petFriendly', e.target.checked)}
              />
              <span>Pet Friendly</span>
            </label>
            <label className="amenity-toggle">
              <input
                type="checkbox"
                checked={form.kitchenAvailable}
                onChange={(e) => updateField('kitchenAvailable', e.target.checked)}
              />
              <span>Kitchen Available</span>
            </label>
          </div>

          <label className="form-field">
            <span>Description</span>
            <textarea
              placeholder="Mention sunlight, floor, water access, nearby transport, house rules, and what is included in rent."
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={5}
            />
          </label>
        </section>

        <section className="add-property-panel photos-panel">
          <div className="panel-heading">
            <span>02</span>
            <div>
              <h3>Photos</h3>
              <p>Add up to 5 clear photos. The first photo becomes the cover image.</p>
            </div>
          </div>

          <div className="photo-upload-field">
            <div className="photo-upload-drop">
              <FaImages aria-hidden="true" />
              <strong>{form.imageFiles.length ? `${form.imageFiles.length}/5 photos selected` : 'Add property photos'}</strong>
              <small>Use bright, real photos of the room, flat, house, bathroom, and entrance.</small>
              <div className="photo-upload-actions">
                <label className="photo-upload-button" htmlFor="property-image-gallery">
                  <FaPlus aria-hidden="true" />
                  <span>Choose Photos</span>
                </label>
                <label className="photo-upload-button secondary" htmlFor="property-image-camera">
                  <FaCamera aria-hidden="true" />
                  <span>Take Photo</span>
                </label>
              </div>
            </div>

            <input
              id="property-image-gallery"
              className="photo-upload-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              id="property-image-camera"
              className="photo-upload-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {imagePreviews.length ? (
            <div className="photo-preview-grid">
              {imagePreviews.map((preview, index) => (
                <figure className="photo-preview-card" key={preview.id}>
                  <img src={preview.url} alt={`Selected property ${index + 1}`} />
                  <figcaption>
                    <span>{index === 0 ? 'Cover photo' : `Photo ${index + 1}`}</span>
                    <small>{(preview.size / 1024 / 1024).toFixed(1)} MB</small>
                    <label className="photo-label-field">
                      <span>Photo label</span>
                      <select
                        value={form.imageLabels[index] || defaultImageLabel(index)}
                        onChange={(e) => updateImageLabel(index, e.target.value)}
                      >
                        {imageLabelOptions.map((label) => (
                          <option value={label} key={label}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </figcaption>
                  <button type="button" onClick={() => removeImageFile(preview.id)} aria-label={`Remove ${preview.name}`}>
                    <FaTimes aria-hidden="true" />
                  </button>
                </figure>
              ))}
            </div>
          ) : (
            <div className="photo-empty-preview">
              <span>No photos selected yet.</span>
              <small>You can still submit with an image URL below, but real uploaded photos look better on renter listings.</small>
            </div>
          )}

          <label className="form-field">
            <span>Primary Image URL</span>
            <input
              type="text"
              placeholder="https://example.com/image.jpg"
              value={form.image}
              onChange={(e) => updateField('image', e.target.value)}
            />
          </label>
        </section>

        <section className="add-property-panel publish-panel">
          <div className="panel-heading">
            <span>03</span>
            <div>
              <h3>Publish</h3>
              <p>New listings go to admin review before becoming public.</p>
            </div>
          </div>

          <label className="keep-adding-toggle">
            <input
              type="checkbox"
              checked={keepAdding}
              onChange={(e) => setKeepAdding(e.target.checked)}
            />
            <span>After saving, clear the form so I can add another property</span>
          </label>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <div className="submit-row">
            <button type="button" className="reset-btn" onClick={resetForm} disabled={loading || uploadingImage}>
              Reset
            </button>
            <button type="submit" disabled={loading || uploadingImage || !ownerVerified}>
              {uploadingImage ? 'Uploading Photos...' : loading ? 'Submitting...' : keepAdding ? 'Submit & Add Another' : 'Submit Property'}
            </button>
          </div>
        </section>
      </form>

      {mapOpen && (
        <div className="map-picker-overlay" onClick={() => setMapOpen(false)}>
          <div className="map-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="map-picker-header">
              <div>
                <h3>Select Exact Location</h3>
                <p>Move the map with your finger and keep the pin on the exact property point. Renters only see this after they book a visit for this property.</p>
              </div>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Close map picker">
                <FaTimes aria-hidden="true" />
              </button>
            </div>
            <div className="map-picker-toolbar">
              <div className="map-picker-search">
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
            <div className="map-picker-canvas">
              <MapContainer
                center={[mapCenter.lat, mapCenter.lng]}
                zoom={17}
                scrollWheelZoom
                dragging
                tap={false}
                touchZoom
                doubleClickZoom
                className="map-picker-leaflet"
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
              <span className="map-center-pin"><FaMapMarkerAlt aria-hidden="true" /></span>
            </div>
            <div className="map-picker-footer">
              <label>
                <span>Coordinates</span>
                <input
                  value={formatCoordinates(form.locationCoordinates || mapCenter)}
                  onChange={(e) => {
                    const [lat, lng] = e.target.value.split(',').map((item) => Number(item.trim()));
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                      setExactCoordinates({ lat, lng }, { recenter: true });
                    }
                  }}
                />
              </label>
              {mapStatus && <p>{mapStatus}</p>}
              <div>
                <button type="button" className="reset-btn" onClick={() => setMapOpen(false)}>Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    const coords = form.locationCoordinates || mapCenter;
                    setExactCoordinates(coords);
                    if (!form.location) updateField('location', formatCoordinates(coords));
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
    </div>
  );
}
