import { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PropertyCard from '../../components/common/PropertyCard';
import './Listings.css';
import PropertyDetails from '../../components/common/PropertyDetails';
import BookingPopup from '../../components/common/BookingPopup';
import { API_BASE_URL } from '../../config/api';
import { AuthContext } from '../../context/AuthContext';

const DEFAULT_FILTERS = {
  minPrice: '',
  maxPrice: '',
  bedrooms: '',
  type: '',
  bathrooms: '',
  sort: 'newest',
};

const getStateFromParams = (params) => ({
  searchTerm: params.get('q') || '',
  filters: {
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || '',
    bedrooms: params.get('bedrooms') || (params.get('bedroomsGte') === '4' ? '4+' : ''),
    type: params.get('type') || '',
    bathrooms: params.get('bathrooms') || (params.get('bathroomsGte') === '4' ? '4+' : ''),
    sort: params.get('sort') || DEFAULT_FILTERS.sort,
  },
});

const buildListingParams = (searchTerm, filters) => {
  const params = new URLSearchParams();
  if (searchTerm.trim()) params.set('q', searchTerm.trim());
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.bathrooms === '4+') params.set('bathroomsGte', '4');
  else if (filters.bathrooms) params.set('bathrooms', filters.bathrooms);
  if (filters.bedrooms === '4+') params.set('bedroomsGte', '4');
  else if (filters.bedrooms) params.set('bedrooms', filters.bedrooms);
  if (filters.type) params.set('type', filters.type);
  if (filters.sort) params.set('sort', filters.sort);
  return params;
};

const sortListings = (items, sortBy) => {
  const safeItems = [...items];
  if (sortBy === 'priceLow') return safeItems.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (sortBy === 'priceHigh') return safeItems.sort((a, b) => (b.price || 0) - (a.price || 0));
  return safeItems.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

export default function Listings() {
  const { token } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showDetailsId, setShowDetailsId] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStateFromParams(searchParams).searchTerm);
  const [filters, setFilters] = useState(() => getStateFromParams(searchParams).filters);

  const fetchProperties = async (params, signal) => {
    if (filteredProperties.length === 0) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const approvedParams = new URLSearchParams(params);
      approvedParams.set('status', 'Approved');
      approvedParams.set('availableOnly', 'true');

      const approvedRes = await fetch(`${API_BASE_URL}/api/properties?${approvedParams.toString()}`, {
        signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const approvedData = await approvedRes.json();
      if (!approvedRes.ok) throw new Error(approvedData.error || 'Failed to fetch listed properties');

      const approvedListings = Array.isArray(approvedData) ? approvedData : [];
      setFilteredProperties(sortListings(approvedListings, params.get('sort') || filters.sort));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setFilteredProperties([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const nextState = getStateFromParams(searchParams);
    setSearchTerm(nextState.searchTerm);
    setFilters(nextState.filters);
    // Only hydrate from URL when the route's query changes externally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsString]);

  useEffect(() => {
    const requestParams = buildListingParams(searchTerm, filters);
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      fetchProperties(requestParams, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchTerm, filters, token]);

  const closeDetailsModal = () => setShowDetailsId(null);
  const openBookingPopup = (property) => setSelectedProperty(property);
  const closeBookingPopup = () => setSelectedProperty(null);

  const handleClearSearch = () => setSearchTerm('');
  const handleClearAll = () => {
    setSearchTerm('');
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="listings-page">
      <div className="listings-header">
        <h2>Available Properties</h2>
        <p>Search approved DeraNow listings that are not already booked.</p>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search by title, location, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="clear-btn" onClick={handleClearSearch}>
            Clear
          </button>
        )}
        <input
          type="number"
          placeholder="Min price"
          value={filters.minPrice}
          onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
        />
        <input
          type="number"
          placeholder="Max price"
          value={filters.maxPrice}
          onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
        />
        <select
          value={filters.bedrooms}
          onChange={(e) => setFilters((prev) => ({ ...prev, bedrooms: e.target.value }))}
        >
          <option value="">Bedrooms</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4+">4+</option>
        </select>
        <select
          value={filters.bathrooms}
          onChange={(e) => setFilters((prev) => ({ ...prev, bathrooms: e.target.value }))}
        >
          <option value="">Bathrooms</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4+">4+</option>
        </select>
        <select
          value={filters.type}
          onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
        >
          <option value="">Type</option>
          <option value="Apartment">Apartment</option>
          <option value="House">House</option>
          <option value="Condo">Room</option>
        </select>
        <select
          value={filters.sort}
          onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
        >
          <option value="newest">Newest</option>
          <option value="priceLow">Price: Low to High</option>
          <option value="priceHigh">Price: High to Low</option>
        </select>
        <button className="clear-all-btn" onClick={handleClearAll}>
          Reset Filters
        </button>
      </div>

      {refreshing && <p className="listings-refreshing">Updating results...</p>}
      {loading ? (
        <div className="listings-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div className="listings-skeleton-card" key={item} />
          ))}
        </div>
      ) : error ? (
        <p className="error">{error}</p>
      ) : filteredProperties.length === 0 ? (
        <p className="listings-empty-state">
          No properties found matching your search.
        </p>
      ) : (
        <div className="listings-grid">
          {filteredProperties.map((listing) => (
            <PropertyCard
              key={listing._id}
              property={listing}
              onViewDetails={() => setShowDetailsId(listing._id)}
              onApplyBooking={() => openBookingPopup(listing)}
            />
          ))}
        </div>
      )}

      {showDetailsId && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeDetailsModal} aria-label="Close popup" title="Close">
              ✕
            </button>
            <PropertyDetails id={showDetailsId} />
          </div>
        </div>
      )}
      {selectedProperty && (
        <BookingPopup property={selectedProperty} onClose={closeBookingPopup} />
      )}
    </div>
  );
}
