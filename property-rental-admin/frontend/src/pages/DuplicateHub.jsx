import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

const STATUS_OPTIONS = ['new', 'reviewing', 'merged', 'ignored', 'false_positive'];

export default function DuplicateHub() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    q: '',
    entityType: '',
    minConfidence: 0,
    includeResolved: false,
    smartOnly: false,
    sortBy: 'priority',
  });
  const [data, setData] = useState({
    scanned: { users: 0, properties: 0 },
    totals: {
      userDuplicateGroups: 0,
      propertyDuplicateGroups: 0,
      docDuplicateGroups: 0,
      allGroups: 0,
    },
    suggestions: [],
  });
  const [cases, setCases] = useState([]);
  const [caseMeta, setCaseMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [admins, setAdmins] = useState([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bulkStatus, setBulkStatus] = useState('reviewing');
  const [impactByUserId, setImpactByUserId] = useState({});
  const [mergePreviewByKey, setMergePreviewByKey] = useState({});
  const [mergeLoadingKey, setMergeLoadingKey] = useState('');
  const [lastMergeResult, setLastMergeResult] = useState(null);
  const [selectedPrimaryBySuggestion, setSelectedPrimaryBySuggestion] = useState({});

  const loadHub = async () => {
    const res = await API.get('/duplicates/hub', {
      params: {
        limit: 200,
        entityType: filters.entityType || undefined,
        minConfidence: Number(filters.minConfidence || 0),
        includeResolved: filters.includeResolved,
      },
    });
    setData(res.data || data);
  };

  const loadCases = async (nextPage = 1) => {
    const res = await API.get('/duplicates/cases', {
      params: {
        page: nextPage,
        limit: 20,
      },
    });
    const parsed = parsePaged(res.data);
    setCases(parsed.items);
    setCaseMeta(parsed.meta);
  };

  const loadAdmins = async () => {
    try {
      const res = await API.get('/admins/permissions');
      setAdmins(Array.isArray(res.data?.admins) ? res.data.admins : []);
    } catch (err) {
      if (err.response?.status === 403) {
        setAdmins([]);
        return;
      }
      throw err;
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');
      await Promise.all([loadHub(), loadCases(1), loadAdmins()]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load duplicate hub');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caseBySuggestionKey = useMemo(() => {
    const map = new Map();
    (data.suggestions || []).forEach((item) => {
      if (item.workflow?.caseId) {
        map.set(`${item.entityType}:${item.key}`, item.workflow.caseId);
      }
    });
    return map;
  }, [data.suggestions]);

  const upsertFromSuggestion = async (suggestion, status = 'reviewing') => {
    try {
      setSaving(true);
      await API.post('/duplicates/cases', {
        entityType: suggestion.entityType,
        key: suggestion.key,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        signals: suggestion.signals || {},
        primary: suggestion.primary,
        duplicates: suggestion.duplicates || [],
        suggestedAction: suggestion.suggestedAction || '',
        status,
      });
      await Promise.all([loadHub(), loadCases(caseMeta.page)]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save duplicate case');
    } finally {
      setSaving(false);
    }
  };

  const updateCase = async (id, payload) => {
    try {
      setSaving(true);
      await API.patch(`/duplicates/cases/${id}`, payload);
      await Promise.all([loadHub(), loadCases(caseMeta.page)]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update duplicate case');
    } finally {
      setSaving(false);
    }
  };

  const runBulkStatus = async () => {
    if (!selectedCaseIds.length) return;
    try {
      setSaving(true);
      await API.post('/duplicates/cases/bulk-update', {
        ids: selectedCaseIds,
        status: bulkStatus,
      });
      setSelectedCaseIds([]);
      await loadCases(caseMeta.page);
      await loadHub();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to bulk update cases');
    } finally {
      setSaving(false);
    }
  };

  const toggleCase = (id) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const loadUserImpact = async (userId) => {
    try {
      const res = await API.get(`/duplicates/users/${userId}/impact`);
      setImpactByUserId((prev) => ({ ...prev, [userId]: res.data }));
      return res.data;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load user impact');
      return null;
    }
  };

  const resolveUser = async (sourceUserId, action, targetUserId = '') => {
    try {
      setSaving(true);
      const res = await API.post(`/duplicates/users/${sourceUserId}/resolve`, {
        action,
        targetUserId: targetUserId || undefined,
        note: `Resolved from Duplicate Hub via ${action}`,
      });
      const message = action === 'merge_into_primary'
        ? `Merged user ${sourceUserId} into ${targetUserId}. Modified ${res.data?.totalModified || 0} records.`
        : action === 'hard_delete_if_safe'
          ? `Deleted user ${sourceUserId}.`
          : `Deactivated user ${sourceUserId}.`;
      window.alert(message);
      await Promise.all([loadHub(), loadCases(caseMeta.page)]);
      setImpactByUserId((prev) => {
        const next = { ...prev };
        delete next[sourceUserId];
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resolve duplicate user');
    } finally {
      setSaving(false);
    }
  };

  const mergePairKey = (sourceUserId, targetUserId) => `${sourceUserId}::${targetUserId}`;

  const loadMergePreview = async (sourceUserId, targetUserId) => {
    try {
      const key = mergePairKey(sourceUserId, targetUserId);
      setMergeLoadingKey(key);
      setError('');
      const res = await API.get(`/duplicates/users/${sourceUserId}/merge-preview`, {
        params: { targetUserId },
      });
      setMergePreviewByKey((prev) => ({
        ...prev,
        [key]: res.data,
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load merge preview');
    } finally {
      setMergeLoadingKey('');
    }
  };

  const clearMergePreview = (sourceUserId, targetUserId) => {
    const key = mergePairKey(sourceUserId, targetUserId);
    setMergePreviewByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const commitMerge = async (
    sourceUserId,
    targetUserId,
    duplicateCaseId = '',
    suggestionEntityType = '',
    suggestionKey = ''
  ) => {
    try {
      setSaving(true);
      setError('');
      const res = await API.post(`/duplicates/users/${sourceUserId}/merge-commit`, {
        targetUserId,
        duplicateCaseId: duplicateCaseId || undefined,
        suggestionEntityType: suggestionEntityType || undefined,
        suggestionKey: suggestionKey || undefined,
        confirmed: true,
        note: 'Confirmed via merge preview sandbox',
      });
      setLastMergeResult(res.data || null);
      clearMergePreview(sourceUserId, targetUserId);
      await Promise.all([loadHub(), loadCases(caseMeta.page)]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to commit merge');
    } finally {
      setSaving(false);
    }
  };

  const rollbackMerge = async (operationId) => {
    try {
      setSaving(true);
      setError('');
      await API.post(`/duplicates/merge-operations/${operationId}/rollback`);
      window.alert('Merge rolled back successfully.');
      setLastMergeResult(null);
      await Promise.all([loadHub(), loadCases(caseMeta.page)]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rollback merge');
    } finally {
      setSaving(false);
    }
  };

  const renderStatusBadge = (value, labelPrefix = '') => {
    const normalized = String(value || '').toLowerCase();
    const safe = normalized || 'unknown';
    const className = safe === 'unverified' ? 'inactive' : safe;
    const label = safe.charAt(0).toUpperCase() + safe.slice(1);
    return <span className={`badge ${statusClass(className)}`}>{labelPrefix}{label}</span>;
  };

  const getAutoTriageStatus = (item) => {
    const recommended = item?.smart?.recommendedStatus || 'reviewing';
    return STATUS_OPTIONS.includes(recommended) ? recommended : 'reviewing';
  };

  const suggestionKeyOf = (item) => `${item.entityType}:${item.key}`;

  const getCandidates = (item) => [item.primary, ...(item.duplicates || [])].filter(Boolean);

  const getSelectedPrimaryId = (item) =>
    selectedPrimaryBySuggestion[suggestionKeyOf(item)] || item.primary?.id || '';

  const filteredSuggestions = useMemo(() => {
    const source = Array.isArray(data.suggestions) ? data.suggestions : [];
    const filtered = filters.smartOnly
      ? source.filter((item) => ['critical', 'high'].includes(item?.smart?.severity))
      : source;
    const q = String(filters.q || '').trim().toLowerCase();
    const searched = !q
      ? filtered
      : filtered.filter((item) => {
          const candidates = getCandidates(item);
          const haystack = [
            item.entityType,
            item.reason,
            item.key,
            ...candidates.flatMap((c) => [
              c?.id,
              c?.label,
              c?.name,
              c?.email,
              c?.role,
              c?.citizenshipNumber,
            ]),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
    const next = [...searched];
    next.sort((a, b) => {
      if (filters.sortBy === 'confidence') {
        return Number(b.confidence || 0) - Number(a.confidence || 0);
      }
      if (filters.sortBy === 'stale') {
        return Number(b?.smart?.staleHours || 0) - Number(a?.smart?.staleHours || 0);
      }
      return Number(b?.smart?.priorityScore || 0) - Number(a?.smart?.priorityScore || 0);
    });
    return next;
  }, [data.suggestions, filters.smartOnly, filters.sortBy, filters.q]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Duplicate Hub</h1>
          <p className="page-subtitle">Detect, triage, and resolve duplicate users, listings, and KYC docs.</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search name/email/citizenship"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
        />
        <select
          value={filters.entityType}
          onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
        >
          <option value="">All entities</option>
          <option value="user">user</option>
          <option value="property">property</option>
          <option value="kyc_document">kyc_document</option>
        </select>
        <input
          type="number"
          min="0"
          max="100"
          value={filters.minConfidence}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, minConfidence: Number(e.target.value || 0) }))
          }
          placeholder="Min confidence"
        />
        <label>
          <input
            type="checkbox"
            checked={filters.includeResolved}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, includeResolved: e.target.checked }))
            }
          />
          {' '}
          Include resolved
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.smartOnly}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, smartOnly: e.target.checked }))
            }
          />
          {' '}
          High priority only
        </label>
        <select
          value={filters.sortBy}
          onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value }))}
        >
          <option value="priority">Sort: Priority</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="stale">Sort: Stale cases</option>
        </select>
        <button className="btn" onClick={loadHub} disabled={loading || saving}>
          {loading ? 'Loading...' : 'Apply Filter'}
        </button>
        <button className="btn secondary" onClick={loadAll} disabled={loading || saving}>
          Rescan All
        </button>
        <button className="btn secondary" onClick={() => navigate('/duplicate-merge-history')}>
          Open Merge History
        </button>
        <button className="btn secondary" onClick={() => navigate('/soft-deleted-users')}>
          Open Soft Deleted Users
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {lastMergeResult?.mergeOperationId ? (
        <section className="card" style={{ marginBottom: '0.8rem' }}>
          <strong>Last merge completed.</strong>{' '}
          <span>
            Rollback available until {formatDate(lastMergeResult.rollbackExpiresAt)}.
          </span>
          <div style={{ marginTop: '0.45rem' }}>
            <small>
              Case status: {lastMergeResult?.case?.status || 'not-linked'}
              {' | '}
              Source active: {String(lastMergeResult?.sourceAfterMerge?.isActive)}
              {' | '}
              Merge marker: {lastMergeResult?.sourceAfterMerge?.mergeStatus || 'n/a'}
            </small>
          </div>
          <div style={{ marginTop: '0.3rem' }}>
            <small>
              Email delivery:
              {' '}
              source={lastMergeResult?.emailDelivery?.source?.sent ? `sent (${lastMergeResult?.emailDelivery?.source?.provider || 'ok'})` : `not sent (${lastMergeResult?.emailDelivery?.source?.reason || 'unknown'})`}
              {' | '}
              target={lastMergeResult?.emailDelivery?.target?.sent ? `sent (${lastMergeResult?.emailDelivery?.target?.provider || 'ok'})` : `not sent (${lastMergeResult?.emailDelivery?.target?.reason || 'unknown'})`}
            </small>
          </div>
          <div className="admin-action-row" style={{ marginTop: '0.5rem' }}>
            <button
              className="btn warn"
              onClick={() => rollbackMerge(lastMergeResult.mergeOperationId)}
              disabled={saving}
            >
              Rollback Last Merge
            </button>
          </div>
        </section>
      ) : null}

      <section className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Users Scanned</div>
          <div className="kpi-value">{data.scanned?.users || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Properties Scanned</div>
          <div className="kpi-value">{data.scanned?.properties || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Duplicate Groups</div>
          <div className="kpi-value">{data.totals?.allGroups || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Doc Groups</div>
          <div className="kpi-value">{data.totals?.docDuplicateGroups || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Critical</div>
          <div className="kpi-value">{data.smartSummary?.critical || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">High</div>
          <div className="kpi-value">{data.smartSummary?.high || 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Stale</div>
          <div className="kpi-value">{data.smartSummary?.stale || 0}</div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Merge Suggestions (Canonical Groups)</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Reason</th>
                <th>Confidence</th>
                <th>Candidates</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.map((item, idx) => {
                const caseId = caseBySuggestionKey.get(`${item.entityType}:${item.key}`);
                const workflowStatus = item.workflow?.status || 'new';
                const candidates = getCandidates(item);
                const selectedPrimaryId = getSelectedPrimaryId(item);
                const selectedPrimary = candidates.find((c) => String(c.id) === String(selectedPrimaryId));
                const isUserLike = ['user', 'kyc_document'].includes(item.entityType);
                const nonPrimaryCandidates = candidates.filter(
                  (c) => String(c.id) !== String(selectedPrimaryId)
                );
                return (
                  <tr key={`${item.entityType}-${item.key}-${idx}`}>
                    <td>{item.entityType}</td>
                    <td>{item.reason}</td>
                    <td>
                      <strong>{item.confidence}</strong>/100
                    </td>
                    <td>
                      {candidates.map((candidate) => (
                        <div key={`${item.key}-${candidate.id}`} style={{ marginBottom: '0.45rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.35rem' }}>
                          <div>
                            <strong>{candidate.label || '-'}</strong>{' '}
                            {String(candidate.id) === String(selectedPrimaryId) ? (
                              <span className="badge active">Superior Primary</span>
                            ) : null}
                          </div>
                          <div><small>ID: {candidate.id || '-'}</small></div>
                          {isUserLike ? (
                            <>
                              <div><small>Name: {candidate.name || '-'}</small></div>
                              <div><small>Email: {candidate.email || '-'}</small></div>
                              <div><small>Role: {candidate.role || '-'}</small></div>
                              <div><small>Citizenship: {candidate.citizenshipNumber || '-'}</small></div>
                              <div><small>Joined: {formatDate(candidate.createdAt)}</small></div>
                              <div><small>Status: {candidate.isActive ? 'Active' : 'Inactive'}</small></div>
                            </>
                          ) : (
                            <div><small>Created: {formatDate(candidate.createdAt)}</small></div>
                          )}
                          {isUserLike ? (
                            <div>
                              {renderStatusBadge(candidate.kycStatus, 'KYC: ')}{' '}
                              {renderStatusBadge(candidate.ownerVerificationStatus, 'Owner: ')}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`badge ${statusClass(workflowStatus)}`}>{workflowStatus}</span>
                    </td>
                    <td>
                      <div>
                        <span className={`badge ${statusClass(item?.smart?.severity || 'new')}`}>
                          {(item?.smart?.severity || 'low').toUpperCase()}
                        </span>
                        {item?.signals?.singleCanonicalEntity ? (
                          <span className="badge active" style={{ marginLeft: '0.35rem' }}>
                            Canonical Citizenship Group
                          </span>
                        ) : null}
                        <small style={{ marginLeft: '0.35rem' }}>
                          {item?.smart?.priorityScore || 0}/100
                        </small>
                      </div>
                      <div>
                        <small>
                          stale: {item?.smart?.staleHours || 0}h
                        </small>
                      </div>
                      <div>
                        <small>{item?.smart?.nextStep || '-'}</small>
                      </div>
                    </td>
                    <td className="admin-actions-cell">
                      <div className="admin-action-row">
                        {!caseId ? (
                          <button className="btn admin-action-btn" onClick={() => upsertFromSuggestion(item, 'reviewing')} disabled={saving}>
                            Start Review
                          </button>
                        ) : (
                          <>
                            <button className="btn admin-action-btn" onClick={() => updateCase(caseId, { status: 'merged' })} disabled={saving}>Mark Merged</button>
                            <button className="btn admin-action-btn warn" onClick={() => updateCase(caseId, { status: 'ignored' })} disabled={saving}>Ignore</button>
                            <button className="btn admin-action-btn danger" onClick={() => updateCase(caseId, { status: 'false_positive' })} disabled={saving}>False Positive</button>
                          </>
                        )}
                        <button
                          className="btn admin-action-btn secondary"
                          onClick={() => {
                            const nextStatus = getAutoTriageStatus(item);
                            if (!caseId) upsertFromSuggestion(item, nextStatus);
                            else updateCase(caseId, { status: nextStatus });
                          }}
                          disabled={saving}
                        >
                          Auto Triage
                        </button>
                        {isUserLike ? (
                          <button
                            className="btn admin-action-btn secondary"
                            onClick={() => loadUserImpact(selectedPrimaryId)}
                            disabled={saving || !selectedPrimaryId}
                          >
                            Check Primary Impact
                          </button>
                        ) : null}
                      </div>
                      {isUserLike ? (
                        <div className="admin-action-row" style={{ marginTop: '0.45rem' }}>
                          <label style={{ minWidth: '120px' }}><small>Superior primary</small></label>
                          <select
                            value={selectedPrimaryId}
                            onChange={(e) =>
                              setSelectedPrimaryBySuggestion((prev) => ({
                                ...prev,
                                [suggestionKeyOf(item)]: e.target.value,
                              }))
                            }
                          >
                            {candidates.map((candidate) => (
                              <option key={`${item.key}-primary-${candidate.id}`} value={candidate.id}>
                                {(candidate.label || candidate.id)} ({String(candidate.id || '').slice(-6)})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {isUserLike && impactByUserId[selectedPrimaryId] ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <small>
                            refs: {impactByUserId[selectedPrimaryId]?.totalRefs || 0}
                            {' | '}
                            safe-delete: {impactByUserId[selectedPrimaryId]?.safeToHardDelete ? 'yes' : 'no'}
                          </small>
                          <div className="admin-action-row" style={{ marginTop: '0.35rem' }}>
                            <button
                              className="btn admin-action-btn warn"
                              onClick={() => resolveUser(selectedPrimaryId, 'deactivate')}
                              disabled={saving || !selectedPrimaryId}
                            >
                              Deactivate Primary
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {isUserLike ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          {nonPrimaryCandidates.map((d) => (
                            <div key={`actions-${d.id}`} className="admin-action-row" style={{ marginTop: '0.3rem' }}>
                              <small style={{ width: '100%' }}>
                                Operate target: {d.label || d.id} ({String(d.id || '').slice(-6)})
                              </small>
                              <button
                                className="btn admin-action-btn"
                                onClick={() => loadMergePreview(d.id, selectedPrimaryId)}
                                disabled={saving || !selectedPrimaryId}
                                >
                                  {mergeLoadingKey === mergePairKey(d.id, selectedPrimaryId)
                                    ? 'Loading Preview...'
                                    : `Preview Merge ${d.id?.slice(-6) || ''}`}
                                </button>
                              <button
                                className="btn admin-action-btn warn"
                                onClick={() => resolveUser(d.id, 'deactivate')}
                                disabled={saving}
                              >
                                Deactivate
                              </button>
                              <button
                                className="btn admin-action-btn danger"
                                onClick={async () => {
                                  const impact = await loadUserImpact(d.id);
                                  if (!impact) return;
                                  if (!impact.safeToHardDelete) {
                                    window.alert(`Cannot hard delete. Linked refs: ${impact.totalRefs}`);
                                    return;
                                  }
                                  const confirmed = window.confirm(`Hard delete user ${d.id}? This cannot be undone.`);
                                  if (!confirmed) return;
                                  resolveUser(d.id, 'hard_delete_if_safe');
                                }}
                                disabled={saving}
                              >
                                Hard Delete (Safe)
                              </button>
                              {mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)] ? (
                                <div className="card" style={{ marginTop: '0.4rem', width: '100%' }}>
                                  <div>
                                    <strong>Merge Preview</strong>{' '}
                                    <span>
                                      ({mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.rollbackWindowMinutes || 30} min rollback window)
                                    </span>
                                  </div>
                                  <small>
                                    Move counts:
                                    {' '}
                                    B:{mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.moveCounts?.bookingsAsRenter || 0}
                                    {' '}
                                    P:{mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.moveCounts?.paymentsAsRenter || 0}
                                    {' '}
                                    M:{(mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.moveCounts?.messagesSent || 0) + (mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.moveCounts?.messagesReceived || 0)}
                                    {' '}
                                    D:{mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.docs?.willMove || 0}
                                  </small>
                                  <div style={{ marginTop: '0.35rem' }}>
                                    {(mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.conflicts || []).map((conflict) => (
                                      <div key={`${conflict.code}-${d.id}`}>
                                        <span className={`badge ${statusClass(conflict.severity === 'blocking' ? 'rejected' : 'pending')}`}>
                                          {conflict.severity}
                                        </span>
                                        {' '}
                                        <small>{conflict.message}</small>
                                      </div>
                                    ))}
                                    {(mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.conflicts || []).length === 0 ? (
                                      <small>No merge conflicts detected.</small>
                                    ) : null}
                                  </div>
                                  <div className="admin-action-row" style={{ marginTop: '0.45rem' }}>
                                    <button
                                      className="btn admin-action-btn"
                                      onClick={() =>
                                        commitMerge(
                                          d.id,
                                          selectedPrimaryId,
                                          caseId,
                                          item.entityType,
                                          item.key
                                        )
                                      }
                                      disabled={
                                        saving ||
                                        !mergePreviewByKey[mergePairKey(d.id, selectedPrimaryId)]?.canMerge
                                      }
                                    >
                                      Confirm Merge
                                    </button>
                                    <button
                                      className="btn admin-action-btn secondary"
                                      onClick={() => clearMergePreview(d.id, selectedPrimaryId)}
                                      disabled={saving}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filteredSuggestions.length === 0 ? (
                <tr>
                  <td colSpan="7">No duplicate suggestions found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Review Queue</h3>
        <div className="toolbar" style={{ marginTop: '0.7rem' }}>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_OPTIONS.map((status) => (
              <option value={status} key={status}>{status}</option>
            ))}
          </select>
          <button className="btn secondary" onClick={runBulkStatus} disabled={!selectedCaseIds.length || saving}>
            Bulk Set ({selectedCaseIds.length})
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Entity</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Notes</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((row) => (
                <tr key={row._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedCaseIds.includes(row._id)}
                      onChange={() => toggleCase(row._id)}
                    />
                  </td>
                  <td>{row.entityType}</td>
                  <td>{row.confidence}</td>
                  <td>
                    <select value={row.status} onChange={(e) => updateCase(row._id, { status: e.target.value })}>
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.assignee?._id || ''}
                      onChange={(e) => updateCase(row._id, { assigneeId: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {admins.map((admin) => (
                        <option key={admin._id} value={admin._id}>
                          {admin.displayName || admin.username}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        const next = window.prompt('Update case notes', row.notes || '');
                        if (next !== null) updateCase(row._id, { notes: next });
                      }}
                    >
                      {row.notes ? 'Edit Notes' : 'Add Notes'}
                    </button>
                  </td>
                  <td>{formatDate(row.updatedAt)}</td>
                </tr>
              ))}
              {cases.length === 0 ? (
                <tr>
                  <td colSpan="7">No duplicate cases yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination meta={caseMeta} onPageChange={loadCases} />
      </section>
    </div>
  );
}
