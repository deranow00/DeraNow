import React, { useState, useEffect, useContext } from 'react';
import './MyProperties.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const PROPERTY_TYPES = ['Apartment', 'House', 'Condo'];
const displayPropertyType = (type) => (type === 'Condo' ? 'Room' : type);
const toBackendPropertyType = (type) => (type === 'Room' ? 'Condo' : type);

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
    parkingAvailable: false,
    petFriendly: false,
  });
  const [formError, setFormError] = useState('');
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);

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
      parkingAvailable: Boolean(property.parkingAvailable),
      petFriendly: Boolean(property.petFriendly),
    });
    setFormError('');
    setEditImageFiles([]);
    setIsEditing(true);
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
              <input name="location" value={formData.location} onChange={handleInputChange} />
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
