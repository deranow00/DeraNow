import React, { useState, useEffect, useContext } from 'react';
import './MyProperties.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const PROPERTY_TYPES = ['Apartment', 'House', 'Condo'];

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
  });
  const [formError, setFormError] = useState('');
  const [editImageFile, setEditImageFile] = useState(null);
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
      type: property.type || PROPERTY_TYPES[0],
      image: property.image || '',
    });
    setFormError('');
    setEditImageFile(null);
    setIsEditing(true);
  };

  const uploadImageToCloudinary = async () => {
    if (!editImageFile) return formData.image;

    const formPayload = new FormData();
    formPayload.append('image', editImageFile);

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
      return data.imageUrl;
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
      const imageUrl = await uploadImageToCloudinary();
      const res = await fetch(`${API_BASE_URL}/api/properties/${currentProperty._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          image: imageUrl,
          price: Number(formData.price),
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update property');

      setProperties((prev) =>
        prev.map((p) => (p._id === currentProperty._id ? data.property : p))
      );

      setIsEditing(false);
      setCurrentProperty(null);
      setEditImageFile(null);
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
    setEditImageFile(null);
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
                src={property.image || '/default-image.jpg'}
                alt={property.title}
                className="property-image"
              />
              <div className="property-details">
                <h3>{property.title}</h3>
                <p>Location: {property.location}</p>
                <p>
                  Rent: <span className="rent-amount">Rs. {property.price}</span>
                </p>
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
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Upload New Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
              />
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
              src={viewProperty.image || '/default-image.jpg'}
              alt={viewProperty.title}
              className="modal-image"
            />
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
              <strong>Type:</strong> {viewProperty.type}
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
