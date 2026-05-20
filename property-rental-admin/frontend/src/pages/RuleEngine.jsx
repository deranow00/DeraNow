import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import './RuleEngine.css';

const defaultRules = {
  autoApproveLowRiskListings: false,
  listingAutoApproveScoreThreshold: 80,
  autoResolveStaleComplaintsDays: 0,
  complaintEscalationHours: 48,
  complaintAutoResolveOnlyIfNoOwnerReply: true,
  highRiskPaymentFailRatePct: 20,
  paymentFailSpikeWindowDays: 7,
  payoutDelayThresholdDays: 3,
  payoutDelayEscalationLevel: 'soft',
  broadcastOnCriticalIncident: false,
  incidentAutoCreateOpsTicket: true,
  anomalyAlertCooldownMinutes: 60,
};

export default function RuleEngine() {
  const [rules, setRules] = useState(defaultRules);
  const [initialRules, setInitialRules] = useState(defaultRules);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get('/rules');
      const next = { ...defaultRules, ...(res.data?.rules || {}) };
      setRules(next);
      setInitialRules(next);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const validations = [];
  if (Number(rules.listingAutoApproveScoreThreshold) < 50 || Number(rules.listingAutoApproveScoreThreshold) > 100) {
    validations.push('Listing score threshold must be between 50 and 100.');
  }
  if (Number(rules.autoResolveStaleComplaintsDays) < 0 || Number(rules.autoResolveStaleComplaintsDays) > 365) {
    validations.push('Auto-resolve stale complaints must be between 0 and 365 days.');
  }
  if (Number(rules.complaintEscalationHours) < 1 || Number(rules.complaintEscalationHours) > 336) {
    validations.push('Complaint escalation hours must be between 1 and 336.');
  }
  if (Number(rules.highRiskPaymentFailRatePct) < 1 || Number(rules.highRiskPaymentFailRatePct) > 100) {
    validations.push('High-risk payment fail rate must be between 1 and 100%.');
  }
  if (Number(rules.paymentFailSpikeWindowDays) < 1 || Number(rules.paymentFailSpikeWindowDays) > 30) {
    validations.push('Payment fail spike window must be between 1 and 30 days.');
  }
  if (Number(rules.payoutDelayThresholdDays) < 1 || Number(rules.payoutDelayThresholdDays) > 60) {
    validations.push('Payout delay threshold must be between 1 and 60 days.');
  }
  if (Number(rules.anomalyAlertCooldownMinutes) < 5 || Number(rules.anomalyAlertCooldownMinutes) > 1440) {
    validations.push('Anomaly alert cooldown must be between 5 and 1440 minutes.');
  }
  const isValid = validations.length === 0;
  const isDirty = JSON.stringify(rules) !== JSON.stringify(initialRules);

  const changedRules = useMemo(
    () =>
      Object.keys(rules)
        .filter((key) => rules[key] !== initialRules[key])
        .map((key) => ({ key, from: initialRules[key], to: rules[key] })),
    [rules, initialRules]
  );

  const setField = (key, value) => {
    setError('');
    setSuccess('');
    setRules((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset) => {
    setError('');
    setSuccess('');
    if (preset === 'balanced') {
      setRules((prev) => ({
        ...prev,
        autoApproveLowRiskListings: false,
        listingAutoApproveScoreThreshold: 82,
        autoResolveStaleComplaintsDays: 21,
        complaintEscalationHours: 48,
        complaintAutoResolveOnlyIfNoOwnerReply: true,
        highRiskPaymentFailRatePct: 20,
        paymentFailSpikeWindowDays: 7,
        payoutDelayThresholdDays: 3,
        payoutDelayEscalationLevel: 'soft',
        broadcastOnCriticalIncident: false,
        incidentAutoCreateOpsTicket: true,
        anomalyAlertCooldownMinutes: 60,
      }));
      return;
    }
    if (preset === 'strict') {
      setRules((prev) => ({
        ...prev,
        autoApproveLowRiskListings: false,
        listingAutoApproveScoreThreshold: 90,
        autoResolveStaleComplaintsDays: 7,
        complaintEscalationHours: 24,
        complaintAutoResolveOnlyIfNoOwnerReply: true,
        highRiskPaymentFailRatePct: 12,
        paymentFailSpikeWindowDays: 3,
        payoutDelayThresholdDays: 2,
        payoutDelayEscalationLevel: 'strict',
        broadcastOnCriticalIncident: true,
        incidentAutoCreateOpsTicket: true,
        anomalyAlertCooldownMinutes: 20,
      }));
      return;
    }
    if (preset === 'growth') {
      setRules((prev) => ({
        ...prev,
        autoApproveLowRiskListings: true,
        listingAutoApproveScoreThreshold: 75,
        autoResolveStaleComplaintsDays: 30,
        complaintEscalationHours: 72,
        complaintAutoResolveOnlyIfNoOwnerReply: false,
        highRiskPaymentFailRatePct: 28,
        paymentFailSpikeWindowDays: 10,
        payoutDelayThresholdDays: 5,
        payoutDelayEscalationLevel: 'soft',
        broadcastOnCriticalIncident: false,
        incidentAutoCreateOpsTicket: false,
        anomalyAlertCooldownMinutes: 120,
      }));
    }
  };

  const resetChanges = () => {
    setRules(initialRules);
    setError('');
    setSuccess('');
  };

  const save = async () => {
    try {
      if (!isValid) {
        setError('Please fix validation errors before saving.');
        return;
      }
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        autoApproveLowRiskListings: Boolean(rules.autoApproveLowRiskListings),
        listingAutoApproveScoreThreshold: Number(rules.listingAutoApproveScoreThreshold || 80),
        autoResolveStaleComplaintsDays: Number(rules.autoResolveStaleComplaintsDays || 0),
        complaintEscalationHours: Number(rules.complaintEscalationHours || 48),
        complaintAutoResolveOnlyIfNoOwnerReply: Boolean(rules.complaintAutoResolveOnlyIfNoOwnerReply),
        highRiskPaymentFailRatePct: Number(rules.highRiskPaymentFailRatePct || 20),
        paymentFailSpikeWindowDays: Number(rules.paymentFailSpikeWindowDays || 7),
        payoutDelayThresholdDays: Number(rules.payoutDelayThresholdDays || 3),
        payoutDelayEscalationLevel: rules.payoutDelayEscalationLevel || 'soft',
        broadcastOnCriticalIncident: Boolean(rules.broadcastOnCriticalIncident),
        incidentAutoCreateOpsTicket: Boolean(rules.incidentAutoCreateOpsTicket),
        anomalyAlertCooldownMinutes: Number(rules.anomalyAlertCooldownMinutes || 60),
      };
      const res = await API.put('/rules', payload);
      const next = { ...defaultRules, ...(res.data?.rules || payload) };
      setRules(next);
      setInitialRules(next);
      setSuccess('Rule engine updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rule-engine-page">
        <div className="page-header"><div><h1>Rule Engine</h1></div></div>
        <p>Loading rules...</p>
      </div>
    );
  }

  return (
    <div className="rule-engine-page">
      <div className="page-header">
        <div>
          <h1>Rule Engine</h1>
          <p className="page-subtitle">Configure automation thresholds, escalation logic, and incident policy.</p>
        </div>
        <span className={`rule-status-chip ${isDirty ? 'dirty' : 'clean'}`}>
          {isDirty ? 'Unsaved changes' : 'Synced'}
        </span>
      </div>

      <section className="card rule-preset-bar">
        <div className="rule-preset-group">
          <span>Presets:</span>
          <button className="btn secondary" type="button" onClick={() => applyPreset('balanced')}>Balanced</button>
          <button className="btn secondary" type="button" onClick={() => applyPreset('strict')}>Strict</button>
          <button className="btn secondary" type="button" onClick={() => applyPreset('growth')}>Growth</button>
        </div>
      </section>

      <div className="rule-grid">
        <section className="card">
          <h3>Listing Automation</h3>
          <div className="rule-row">
            <label className="rule-toggle">
              <input
                type="checkbox"
                checked={Boolean(rules.autoApproveLowRiskListings)}
                onChange={(e) => setField('autoApproveLowRiskListings', e.target.checked)}
              />
              Auto-approve low-risk listings
            </label>
          </div>
          <div className="rule-field">
            <label>Auto-approve score threshold (50-100)</label>
            <input
              type="number"
              min="50"
              max="100"
              value={rules.listingAutoApproveScoreThreshold}
              onChange={(e) => setField('listingAutoApproveScoreThreshold', e.target.value)}
            />
          </div>
        </section>

        <section className="card">
          <h3>Complaints Workflow</h3>
          <div className="rule-field">
            <label>Auto-resolve stale complaints (days)</label>
            <input
              type="number"
              min="0"
              max="365"
              value={rules.autoResolveStaleComplaintsDays}
              onChange={(e) => setField('autoResolveStaleComplaintsDays', e.target.value)}
            />
          </div>
          <div className="rule-field">
            <label>Escalate unresolved complaints after (hours)</label>
            <input
              type="number"
              min="1"
              max="336"
              value={rules.complaintEscalationHours}
              onChange={(e) => setField('complaintEscalationHours', e.target.value)}
            />
          </div>
          <label className="rule-toggle">
            <input
              type="checkbox"
              checked={Boolean(rules.complaintAutoResolveOnlyIfNoOwnerReply)}
              onChange={(e) => setField('complaintAutoResolveOnlyIfNoOwnerReply', e.target.checked)}
            />
            Auto-resolve only if owner has not replied
          </label>
        </section>

        <section className="card">
          <h3>Payment Risk Policy</h3>
          <div className="rule-field">
            <label>High-risk payment fail rate (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={rules.highRiskPaymentFailRatePct}
              onChange={(e) => setField('highRiskPaymentFailRatePct', e.target.value)}
            />
          </div>
          <div className="rule-field">
            <label>Payment fail spike window (days)</label>
            <input
              type="number"
              min="1"
              max="30"
              value={rules.paymentFailSpikeWindowDays}
              onChange={(e) => setField('paymentFailSpikeWindowDays', e.target.value)}
            />
          </div>
        </section>

        <section className="card">
          <h3>Payout Escalation</h3>
          <div className="rule-field">
            <label>Payout delay threshold (days)</label>
            <input
              type="number"
              min="1"
              max="60"
              value={rules.payoutDelayThresholdDays}
              onChange={(e) => setField('payoutDelayThresholdDays', e.target.value)}
            />
          </div>
          <div className="rule-field">
            <label>Escalation level</label>
            <select
              value={rules.payoutDelayEscalationLevel}
              onChange={(e) => setField('payoutDelayEscalationLevel', e.target.value)}
            >
              <option value="soft">Soft (warn + reminder)</option>
              <option value="strict">Strict (raise high priority issue)</option>
            </select>
          </div>
        </section>

        <section className="card">
          <h3>Incident Automation</h3>
          <label className="rule-toggle">
            <input
              type="checkbox"
              checked={Boolean(rules.broadcastOnCriticalIncident)}
              onChange={(e) => setField('broadcastOnCriticalIncident', e.target.checked)}
            />
            Broadcast alerts on critical incidents
          </label>
          <label className="rule-toggle">
            <input
              type="checkbox"
              checked={Boolean(rules.incidentAutoCreateOpsTicket)}
              onChange={(e) => setField('incidentAutoCreateOpsTicket', e.target.checked)}
            />
            Auto-create ops ticket on critical incident
          </label>
          <div className="rule-field">
            <label>Anomaly alert cooldown (minutes)</label>
            <input
              type="number"
              min="5"
              max="1440"
              value={rules.anomalyAlertCooldownMinutes}
              onChange={(e) => setField('anomalyAlertCooldownMinutes', e.target.value)}
            />
          </div>
        </section>

        <section className="card rule-summary-card">
          <h3>Change Summary</h3>
          {changedRules.length === 0 ? (
            <p className="rule-empty">No pending changes.</p>
          ) : (
            <div className="rule-change-list">
              {changedRules.map((item) => (
                <div className="rule-change-item" key={item.key}>
                  <span>{item.key}</span>
                  <code>{String(item.from)}</code>
                  <span>→</span>
                  <code>{String(item.to)}</code>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {validations.length > 0 ? (
        <div className="rule-alert error">
          {validations.map((v) => (
            <div key={v}>{v}</div>
          ))}
        </div>
      ) : null}

      {error ? <div className="rule-alert error">{error}</div> : null}
      {success ? <div className="rule-alert success">{success}</div> : null}

      <div className="rule-actions">
        <button className="btn secondary" type="button" onClick={resetChanges} disabled={!isDirty || saving}>
          Reset Changes
        </button>
        <button className="btn" type="button" onClick={save} disabled={saving || !isDirty || !isValid}>
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </div>
    </div>
  );
}
