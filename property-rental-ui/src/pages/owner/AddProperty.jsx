import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FaCamera, FaImages, FaPlus, FaTimes } from 'react-icons/fa';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './AddProperty.css';

const initialForm = {
  title: '',
  location: '',
  approximateLocation: '',
  price: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  type: 'Apartment',
  image: '',
  imageFiles: [],
  parkingAvailable: false,
  petFriendly: false,
};

export default function AddProperty() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [keepAdding, setKeepAdding] = useState(true);

  const { token } = useContext(AuthContext);

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
      return { ...prev, imageFiles: merged };
    });
  };

  const removeImageFile = (id) => {
    setForm((prev) => ({
      ...prev,
      imageFiles: prev.imageFiles.filter((file) => `${file.name}-${file.lastModified}-${file.size}` !== id),
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setError('');
    setSuccess('');
  };

  const uploadImageToCloudinary = async () => {
    if (!form.imageFiles.length) {
      const fallbackImages = form.image ? [form.image] : [];
      return { imageUrl: form.image, imageUrls: fallbackImages };
    }

    const formData = new FormData();
    form.imageFiles.slice(0, 5).forEach((file) => {
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

    if (!form.title || !form.location || !form.approximateLocation || !form.price || !form.bedrooms || !form.bathrooms || !form.type) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!token) {
      setError('Please log in to add a property.');
      return;
    }

    setLoading(true);

    try {
      const uploaded = await uploadImageToCloudinary();

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
          price: Number(form.price),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          description: form.description,
          type: form.type,
          image: uploaded.imageUrl,
          images: uploaded.imageUrls,
          parkingAvailable: form.parkingAvailable,
          petFriendly: form.petFriendly,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to add property.');
      } else {
        setCreatedCount((prev) => prev + 1);
        setSuccess(keepAdding ? 'Property submitted for approval. You can add another listing now.' : 'Property submitted for approval.');
        if (keepAdding) {
          setForm(initialForm);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (err) {
      setError(err.message || 'Server error. Please try again later.');
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

      <form onSubmit={handleSubmit} className="add-property-form">
        <section className="add-property-panel details-panel">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <h3>Listing Details</h3>
              <p>Exact location stays private until a renter has paid and booked a visit.</p>
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
              <span>Exact Location *</span>
              <input
                type="text"
                placeholder="House number, street, area, city, nearby landmark"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </label>

            <label className="form-field span-2">
              <span>Approximate Public Location *</span>
              <input
                type="text"
                placeholder="e.g. Balkumari, Lalitpur"
                value={form.approximateLocation}
                onChange={(e) => updateField('approximateLocation', e.target.value)}
              />
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
          </div>

          <div className="amenity-toggle-grid">
            <label className="amenity-toggle">
              <input
                type="checkbox"
                checked={form.parkingAvailable}
                onChange={(e) => updateField('parkingAvailable', e.target.checked)}
              />
              <span>Parking Available</span>
            </label>
            <label className="amenity-toggle">
              <input
                type="checkbox"
                checked={form.petFriendly}
                onChange={(e) => updateField('petFriendly', e.target.checked)}
              />
              <span>Pet Friendly</span>
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
            <button type="submit" disabled={loading || uploadingImage}>
              {uploadingImage ? 'Uploading Photos...' : loading ? 'Submitting...' : keepAdding ? 'Submit & Add Another' : 'Submit Property'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
