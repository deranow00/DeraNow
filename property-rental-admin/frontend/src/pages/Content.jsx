import { useEffect, useState } from 'react';
import API from '../api';
import { parsePaged } from '../utils';

export default function Content() {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState([]);

  const load = async () => {
    const [listRes, featuredRes] = await Promise.all([
      API.get('/properties', { params: { status: 'Pending', page: 1, limit: 200 } }),
      API.get('/featured-listings'),
    ]);

    setProperties(parsePaged(listRes.data).items);
    setSelected(featuredRes.data.map((p) => String(p._id)));
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    await API.put('/featured-listings', { propertyIds: selected });
    alert('Featured listings updated');
  };

  return (
    <div>
      <div className="page-header"><div><h1>Content Control</h1><p className="page-subtitle">Manage homepage featured listings and visibility rules.</p></div></div>
      <div className="card">
        <h3>Select Featured Listings</h3>
        <p className="page-subtitle">By default this view lists pending listed properties.</p>
        <div className="table-wrap" style={{ marginTop: '0.8rem' }}>
          <table className="table">
            <thead><tr><th>Feature</th><th>Title</th><th>Location</th><th>Price</th><th>Status</th></tr></thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p._id}>
                  <td><input type="checkbox" checked={selected.includes(String(p._id))} onChange={() => toggle(String(p._id))} /></td>
                  <td>{p.title}</td>
                  <td>{p.location}</td>
                  <td>Rs. {p.price}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
              {properties.length === 0 && <tr><td colSpan="5">No listings found.</td></tr>}
            </tbody>
          </table>
        </div>
        <button className="btn" style={{ marginTop: '0.8rem' }} onClick={save}>Save Featured</button>
      </div>
    </div>
  );
}
