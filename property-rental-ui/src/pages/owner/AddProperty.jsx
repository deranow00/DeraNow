import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './AddProperty.css';

export default function AddProperty() {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Apartment');
  const [image, setImage] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [petFriendly, setPetFriendly] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { token } = useContext(AuthContext);

  const uploadImageToCloudinary = async () => {
    if (!imageFiles.length) {
      const fallbackImages = image ? [image] : [];
      return { imageUrl: image, imageUrls: fallbackImages };
    }

    const formData = new FormData();
    imageFiles.slice(0, 5).forEach((file) => {
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

    if (!title || !location || !price || !bedrooms || !bathrooms || !type) {
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
          title,
          location,
          price: Number(price),
          bedrooms: Number(bedrooms),
          bathrooms: Number(bathrooms),
          description,
          type,
          image: uploaded.imageUrl,
          images: uploaded.imageUrls,
          parkingAvailable,
          petFriendly,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to add property.');
      } else {
        setSuccess('Property added successfully!');
        setTitle('');
        setLocation('');
        setPrice('');
        setBedrooms('');
        setBathrooms('');
        setDescription('');
        setType('Apartment');
        setImage('');
        setImageFiles([]);
        setParkingAvailable(false);
        setPetFriendly(false);
      }
    } catch (err) {
      setError(err.message || 'Server error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-property-container">
      <h2>Add New Property</h2>
      <form onSubmit={handleSubmit} className="add-property-form">
        <label>Title *</label>
        <input
          type="text"
          placeholder="Property title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label>Location *</label>
        <input
          type="text"
          placeholder="Property location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <label>Price (per month) *</label>
        <input
          type="number"
          placeholder="e.g. 15000"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />

        <label>Bedrooms *</label>
        <input
          type="number"
          placeholder="Number of bedrooms"
          value={bedrooms}
          onChange={(e) => setBedrooms(e.target.value)}
        />

        <label>Bathrooms *</label>
        <input
          type="number"
          placeholder="Number of bathrooms"
          value={bathrooms}
          onChange={(e) => setBathrooms(e.target.value)}
        />

        <label>Type *</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="Apartment">Apartment</option>
          <option value="House">House</option>
          <option value="Condo">Room</option>
        </select>

        <div className="amenity-toggle-grid">
          <label className="amenity-toggle">
            <input
              type="checkbox"
              checked={parkingAvailable}
              onChange={(e) => setParkingAvailable(e.target.checked)}
            />
            <span>Parking Available</span>
          </label>
          <label className="amenity-toggle">
            <input
              type="checkbox"
              checked={petFriendly}
              onChange={(e) => setPetFriendly(e.target.checked)}
            />
            <span>Pet Friendly</span>
          </label>
        </div>

        <label>Description</label>
        <textarea
          placeholder="Additional details about the property"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        ></textarea>

        <div className="photo-upload-field">
          <span className="photo-upload-label">Property Images</span>
          <div className="photo-upload-actions">
            <label className="photo-upload-button" htmlFor="property-image-gallery">
              Choose from Photos
            </label>
            <label className="photo-upload-button" htmlFor="property-image-camera">
              Take Live Photo
            </label>
          </div>
          <input
            id="property-image-gallery"
            className="photo-upload-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImageFiles(Array.from(e.target.files || []).slice(0, 5))}
          />
          <input
            id="property-image-camera"
            className="photo-upload-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setImageFiles(Array.from(e.target.files || []).slice(0, 5))}
          />
          <small className="photo-upload-selected">
            {imageFiles.length ? `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} selected` : 'No image selected'}
          </small>
        </div>

        <label>Or Primary Image URL</label>
        <input
          type="text"
          placeholder="http://example.com/image.jpg"
          value={image}
          onChange={(e) => setImage(e.target.value)}
        />

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        <button type="submit" disabled={loading || uploadingImage}>
          {uploadingImage ? 'Uploading Image...' : loading ? 'Adding...' : 'Add Property'}
        </button>
      </form>
    </div>
  );
}
