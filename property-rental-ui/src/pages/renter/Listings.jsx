import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PropertyCard from '../../components/common/PropertyCard';
import './Listings.css';
import PropertyDetails from '../../components/common/PropertyDetails';
import BookingPopup from '../../components/common/BookingPopup';
import { API_BASE_URL } from '../../config/api';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetailsId, setShowDetailsId] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStateFromParams(searchParams).searchTerm);
  const [filters, setFilters] = useState(() => getStateFromParams(searchParams).filters);
  const prevSearchParamStringRef = useRef(searchParamsString);

  const fetchProperties = async (params, signal) => {
    setLoading(true);
    setError('');
    try {
      // Fetch both listed states directly so UI works even if backend status aliases aren't deployed.
      const pendingParams = new URLSearchParams(params);
      pendingParams.set('status', 'Pending');
      pendingParams.set('availableOnly', 'true');
      const approvedParams = new URLSearchParams(params);
      approvedParams.set('status', 'Approved');
      approvedParams.set('availableOnly', 'true');

      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/properties?${pendingParams.toString()}`, { signal }),
        fetch(`${API_BASE_URL}/api/properties?${approvedParams.toString()}`, { signal }),
      ]);

      const [pendingData, approvedData] = await Promise.all([pendingRes.json(), approvedRes.json()]);
      if (!pendingRes.ok) throw new Error(pendingData.error || 'Failed to fetch listed properties');
      if (!approvedRes.ok) throw new Error(approvedData.error || 'Failed to fetch listed properties');

      const merged = [...(Array.isArray(pendingData) ? pendingData : []), ...(Array.isArray(approvedData) ? approvedData : [])];
      const dedupedById = Object.values(
        merged.reduce((acc, item) => {
          if (item?._id) acc[item._id] = item;
          return acc;
        }, {})
      );
      setFilteredProperties(sortListings(dedupedById, filters.sort));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setFilteredProperties([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const nextParamsString = searchParamsString;
    if (nextParamsString === prevSearchParamStringRef.current) return;

    prevSearchParamStringRef.current = nextParamsString;
    const nextState = getStateFromParams(searchParams);
    setSearchTerm(nextState.searchTerm);
    setFilters(nextState.filters);
  }, [searchParams, searchParamsString]);

  useEffect(() => {
    const requestParams = buildListingParams(searchTerm, filters);
    const requestParamsString = requestParams.toString();
    const currentParamsString = searchParamsString;
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      if (requestParamsString !== currentParamsString) {
        prevSearchParamStringRef.current = requestParamsString;
        setSearchParams(requestParams, { replace: true });
      }
      fetchProperties(requestParams, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchTerm, filters, searchParamsString, setSearchParams]);

  const closeDetailsModal = () => setShowDetailsId(null);
  const openBookingPopup = (property) => setSelectedProperty(property);
  const closeBookingPopup = () => setSelectedProperty(null);

  const handleClearSearch = () => setSearchTerm('');
  const handleClearAll = () => {
    setSearchTerm('');
    setFilters(DEFAULT_FILTERS);
  };

  if (loading) return <p>Loading properties...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div className="listings-page">
      <div className="listings-header">
        <h2>Available Listed Properties</h2>
        <p>Showing listed properties that are not already booked.</p>
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
          <option value="Condo">Condo</option>
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

      {filteredProperties.length === 0 && !loading && !error ? (
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
