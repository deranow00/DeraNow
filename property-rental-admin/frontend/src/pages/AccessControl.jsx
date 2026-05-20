import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import './AccessControl.css';

const ROLES = ['super_admin', 'ops_admin', 'finance_admin', 'support_admin', 'readonly_admin'];
const READONLY_HINT = ['workflow:read', 'rules:read', 'audit:read', 'reports:read'];

const decodeAdminId = () => {
  try {
    const token = localStorage.getItem('adminToken');
    if (!token) return '';
    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!base64) return '';
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return payload?.id || '';
  } catch {
    return '';
  }
};

const sortByLabel = (items = []) =>
  [...items].sort((a, b) => String(a).localeCompare(String(b)));

const normalizePermissions = (values) =>
  sortByLabel(Array.from(new Set((values || []).map((item) => String(item).trim()).filter(Boolean))));

const parsePermissionText = (text) =>
  normalizePermissions(String(text || '').split(',').map((item) => item.trim()));

export default function AccessControl() {
  const [admins, setAdmins] = useState([]);
  const [baselineById, setBaselineById] = useState({});
  const [rolePermissionMap, setRolePermissionMap] = useState({});
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [savingId, setSavingId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    role: '',
    active: '',
  });
  const [permissionQuery, setPermissionQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'ops_admin',
    permissionsText: '',
    isActive: true,
  });

  const currentAdminId = useMemo(() => decodeAdminId(), []);

  const load = async () => {
    try {
      setError('');
      const res = await API.get('/admins/permissions');
      const list = Array.isArray(res.data?.admins) ? res.data.admins : [];
      const mapped = list.map((item) => {
        const customPermissions = Array.isArray(item.permissions) ? item.permissions : [];
        return {
          ...item,
          customPermissions,
          permissionsText: customPermissions.join(', '),
        };
      });
      setAdmins(mapped);
      setBaselineById(
        mapped.reduce((acc, item) => {
          acc[item._id] = {
            role: item.role,
            isActive: Boolean(item.isActive),
            customPermissions: [...item.customPermissions],
          };
          return acc;
        }, {})
      );
      setRolePermissionMap(res.data?.rolePermissionMap || {});
      setPermissionCatalog(sortByLabel(res.data?.permissionCatalog || []));
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Only super admin can manage Access Control.');
      } else {
        setError(err.response?.data?.error || 'Failed to load admin permissions');
      }
      setAdmins([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getRoleDefaults = (role) => sortByLabel(rolePermissionMap?.[role] || []);
  const getEffectivePermissions = (admin) =>
    normalizePermissions([...(getRoleDefaults(admin.role) || []), ...(admin.customPermissions || [])]);

  const isDirty = (admin) => {
    const baseline = baselineById[admin._id];
    if (!baseline) return true;
    const sameRole = baseline.role === admin.role;
    const sameActive = Boolean(baseline.isActive) === Boolean(admin.isActive);
    const sameCustom =
      JSON.stringify(normalizePermissions(baseline.customPermissions)) ===
      JSON.stringify(normalizePermissions(admin.customPermissions));
    return !(sameRole && sameActive && sameCustom);
  };

  const dirtyAdmins = useMemo(() => admins.filter((item) => isDirty(item)), [admins, baselineById]);
  const totalActive = useMemo(() => admins.filter((item) => item.isActive).length, [admins]);

  const filteredAdmins = useMemo(() => {
    const q = String(filters.q || '').trim().toLowerCase();
    return admins.filter((item) => {
      if (filters.role && item.role !== filters.role) return false;
      if (filters.active === 'active' && !item.isActive) return false;
      if (filters.active === 'inactive' && item.isActive) return false;
      if (!q) return true;
      const haystack = [
        item.displayName || '',
        item.username || '',
        item.role || '',
        ...(Array.isArray(item.customPermissions) ? item.customPermissions : []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [admins, filters]);

  const visiblePermissionCatalog = useMemo(() => {
    const q = String(permissionQuery || '').trim().toLowerCase();
    if (!q) return permissionCatalog;
    return permissionCatalog.filter((item) => item.toLowerCase().includes(q));
  }, [permissionCatalog, permissionQuery]);

  const createValidationError = useMemo(() => {
    if (String(newAdmin.username || '').trim().length < 3) return 'Username must be at least 3 characters.';
    if (String(newAdmin.password || '').length < 8) return 'Password must be at least 8 characters.';
    if (!ROLES.includes(String(newAdmin.role || ''))) return 'Invalid role selected.';
    const candidate = parsePermissionText(newAdmin.permissionsText);
    const invalid = candidate.filter((item) => item !== '*' && !permissionCatalog.includes(item));
    if (invalid.length) return `Invalid permissions: ${invalid.join(', ')}`;
    return '';
  }, [newAdmin, permissionCatalog]);

  const updateField = (id, field, value) => {
    setAdmins((prev) => prev.map((item) => (item._id === id ? { ...item, [field]: value } : item)));
  };

  const setCustomPermissions = (id, permissions) => {
    const normalized = normalizePermissions(permissions);
    setAdmins((prev) =>
      prev.map((item) =>
        item._id === id
          ? {
              ...item,
              customPermissions: normalized,
              permissionsText: normalized.join(', '),
            }
          : item
      )
    );
  };

  const togglePermission = (adminId, permission) => {
    const target = admins.find((item) => item._id === adminId);
    if (!target) return;
    const next = target.customPermissions.includes(permission)
      ? target.customPermissions.filter((item) => item !== permission)
      : [...target.customPermissions, permission];
    setCustomPermissions(adminId, next);
  };

  const applyReadonlyHint = (adminId) => {
    const allowed = READONLY_HINT.filter((perm) => permissionCatalog.includes(perm));
    setCustomPermissions(adminId, allowed);
  };

  const copyFromAdmin = (targetId, sourceId) => {
    const source = admins.find((item) => item._id === sourceId);
    if (!source) return;
    setAdmins((prev) =>
      prev.map((item) =>
        item._id === targetId
          ? {
              ...item,
              role: source.role,
              isActive: source.isActive,
              customPermissions: [...source.customPermissions],
              permissionsText: source.customPermissions.join(', '),
            }
          : item
      )
    );
  };

  const createAdmin = async () => {
    try {
      setCreating(true);
      setError('');
      setSuccess('');
      if (createValidationError) {
        setError(createValidationError);
        return;
      }
      await API.post('/admins', {
        username: newAdmin.username.trim(),
        password: newAdmin.password,
        displayName: newAdmin.displayName.trim(),
        role: newAdmin.role,
        permissions: parsePermissionText(newAdmin.permissionsText),
        isActive: Boolean(newAdmin.isActive),
      });
      setSuccess(`Created admin ${newAdmin.username.trim()}`);
      setNewAdmin({
        username: '',
        password: '',
        displayName: '',
        role: 'ops_admin',
        permissionsText: '',
        isActive: true,
      });
      await load();
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Only super admin can create admin accounts.');
      } else {
        setError(err.response?.data?.error || 'Failed to create admin');
      }
    } finally {
      setCreating(false);
    }
  };

  const resetAdmin = (adminId) => {
    const baseline = baselineById[adminId];
    if (!baseline) return;
    setAdmins((prev) =>
      prev.map((item) =>
        item._id === adminId
          ? {
              ...item,
              role: baseline.role,
              isActive: baseline.isActive,
              customPermissions: [...baseline.customPermissions],
              permissionsText: baseline.customPermissions.join(', '),
            }
          : item
      )
    );
  };

  const saveAdmin = async (admin) => {
    try {
      setSavingId(admin._id);
      setError('');
      setSuccess('');
      const permissions = normalizePermissions(admin.customPermissions);
      await API.patch(`/admins/${admin._id}/permissions`, {
        role: admin.role,
        isActive: Boolean(admin.isActive),
        permissions,
      });
      setSuccess(`Updated access for ${admin.displayName || admin.username}`);
      await load();
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Only super admin can update admin access.');
      } else {
        setError(err.response?.data?.error || 'Failed to update admin');
      }
    } finally {
      setSavingId('');
    }
  };

  const saveAllChanges = async () => {
    if (!dirtyAdmins.length) return;
    setBulkSaving(true);
    setError('');
    setSuccess('');
    try {
      for (const admin of dirtyAdmins) {
        // Run sequentially to keep audit log order predictable.
        await API.patch(`/admins/${admin._id}/permissions`, {
          role: admin.role,
          isActive: Boolean(admin.isActive),
          permissions: normalizePermissions(admin.customPermissions),
        });
      }
      setSuccess(`Saved ${dirtyAdmins.length} admin access change(s).`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save all changes');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="access-page">
      <div className="page-header">
        <div>
          <h1>Access Control</h1>
          <p className="page-subtitle">Manage admin accounts, role assignment, and custom permissions with safer workflows.</p>
        </div>
      </div>

      <section className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Admins</div><div className="kpi-value">{admins.length}</div></div>
        <div className="kpi"><div className="kpi-label">Active</div><div className="kpi-value">{totalActive}</div></div>
        <div className="kpi"><div className="kpi-label">Pending Changes</div><div className="kpi-value">{dirtyAdmins.length}</div></div>
        <div className="kpi"><div className="kpi-label">Permission Catalog</div><div className="kpi-value">{permissionCatalog.length}</div></div>
      </section>

      <section className="card access-card access-create-card">
        <div className="access-create-header">
          <h3>Create New Admin</h3>
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {showCreateForm ? (
          <div className="access-create-grid">
            <input
              type="text"
              placeholder="Username"
              value={newAdmin.username}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, username: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Display name"
              value={newAdmin.displayName}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, displayName: e.target.value }))}
            />
            <div className="access-password-wrap">
              <input
                type={showCreatePassword ? 'text' : 'password'}
                placeholder="Password (min 8 chars)"
                value={newAdmin.password}
                onChange={(e) => setNewAdmin((prev) => ({ ...prev, password: e.target.value }))}
              />
              <button
                className="btn secondary"
                type="button"
                onClick={() => setShowCreatePassword((prev) => !prev)}
              >
                {showCreatePassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <select
              value={newAdmin.role}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, role: e.target.value }))}
            >
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <input
              type="text"
              placeholder="Custom permissions (comma separated)"
              value={newAdmin.permissionsText}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, permissionsText: e.target.value }))}
            />
            <label className="access-checkbox">
              <input
                type="checkbox"
                checked={Boolean(newAdmin.isActive)}
                onChange={(e) => setNewAdmin((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
            <button className="btn" onClick={createAdmin} disabled={creating || Boolean(createValidationError)}>
              {creating ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        ) : null}
      </section>

      <div className="toolbar access-toolbar">
        <input
          type="text"
          placeholder="Search admin/role/permission"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
        />
        <select
          value={filters.role}
          onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
        >
          <option value="">All roles</option>
          {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <select
          value={filters.active}
          onChange={(e) => setFilters((prev) => ({ ...prev, active: e.target.value }))}
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <input
          type="text"
          placeholder="Filter permission catalog"
          value={permissionQuery}
          onChange={(e) => setPermissionQuery(e.target.value)}
        />
        <button
          className="btn secondary"
          onClick={() => {
            setFilters({ q: '', role: '', active: '' });
            setPermissionQuery('');
          }}
        >
          Reset Filters
        </button>
        <button className="btn" onClick={saveAllChanges} disabled={bulkSaving || !dirtyAdmins.length}>
          {bulkSaving ? 'Saving All...' : `Save All (${dirtyAdmins.length})`}
        </button>
      </div>

      {createValidationError && showCreateForm ? <p className="error access-alert">{createValidationError}</p> : null}
      {error ? <p className="error access-alert">{error}</p> : null}
      {success ? <p className="access-success access-alert">{success}</p> : null}

      <section className="card access-card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Active</th>
                <th>Role Defaults</th>
                <th>Custom Permissions</th>
                <th>Effective Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.map((admin) => {
                const roleDefaults = getRoleDefaults(admin.role);
                const effective = getEffectivePermissions(admin);
                const selfRow = String(admin._id) === String(currentAdminId);
                const cloneCandidates = admins.filter((item) => item._id !== admin._id);
                return (
                  <tr key={admin._id}>
                    <td>
                      <strong>{admin.displayName || admin.username}</strong>
                      <div>{admin.username}</div>
                      {selfRow ? <span className="badge active">Current Session</span> : null}
                      {!admin.isActive ? <span className="badge inactive">Inactive</span> : null}
                    </td>
                    <td>
                      <select
                        value={admin.role || 'ops_admin'}
                        onChange={(e) => updateField(admin._id, 'role', e.target.value)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(admin.isActive)}
                        disabled={selfRow}
                        onChange={(e) => updateField(admin._id, 'isActive', e.target.checked)}
                        title={selfRow ? 'You cannot deactivate your current session account' : ''}
                      />
                    </td>
                    <td>
                      <div className="admin-action-row">
                        {roleDefaults.map((permission) => (
                          <span key={permission} className="badge active">{permission}</span>
                        ))}
                        {!roleDefaults.length ? <span>-</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="admin-action-row access-permission-controls">
                        <button
                          className="btn admin-action-btn secondary"
                          type="button"
                          onClick={() => setCustomPermissions(admin._id, [])}
                        >
                          Clear
                        </button>
                        <button
                          className="btn admin-action-btn secondary"
                          type="button"
                          onClick={() => setCustomPermissions(admin._id, roleDefaults)}
                        >
                          Use Role Defaults
                        </button>
                        <button
                          className="btn admin-action-btn secondary"
                          type="button"
                          onClick={() => setCustomPermissions(admin._id, ['*'])}
                        >
                          Full Access
                        </button>
                        <button
                          className="btn admin-action-btn secondary"
                          type="button"
                          onClick={() => applyReadonlyHint(admin._id)}
                        >
                          Readonly Hint
                        </button>
                      </div>
                      <div className="admin-action-row access-permission-controls">
                        <select defaultValue="" onChange={(e) => copyFromAdmin(admin._id, e.target.value)}>
                          <option value="">Clone from admin...</option>
                          {cloneCandidates.map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.displayName || item.username}
                            </option>
                          ))}
                        </select>
                        <span className="access-permission-count">
                          Visible catalog: {visiblePermissionCatalog.length} / {permissionCatalog.length}
                        </span>
                      </div>
                      <div className="admin-action-row" style={{ marginBottom: '0.4rem' }}>
                        {visiblePermissionCatalog.map((permission) => (
                          <button
                            key={permission}
                            className={`btn admin-action-btn ${admin.customPermissions.includes(permission) ? 'active' : 'secondary'}`}
                            type="button"
                            onClick={() => togglePermission(admin._id, permission)}
                          >
                            {permission}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        value={admin.permissionsText}
                        onChange={(e) => updateField(admin._id, 'permissionsText', e.target.value)}
                        onBlur={(e) => setCustomPermissions(admin._id, parsePermissionText(e.target.value))}
                        placeholder="workflow:read, rules:read"
                        className="access-permission-textarea"
                      />
                    </td>
                    <td>
                      <div className="admin-action-row">
                        {effective.map((permission) => (
                          <span key={permission} className="badge approved">{permission}</span>
                        ))}
                        {!effective.length ? <span>-</span> : null}
                      </div>
                    </td>
                    <td className="admin-actions-cell">
                      <div className="admin-action-row">
                        <button
                          className="btn admin-action-btn"
                          onClick={() => saveAdmin(admin)}
                          disabled={savingId === admin._id || !isDirty(admin)}
                        >
                          {savingId === admin._id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="btn admin-action-btn secondary"
                          onClick={() => resetAdmin(admin._id)}
                          disabled={savingId === admin._id || !isDirty(admin)}
                        >
                          Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan="7">No admins found for current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
