import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Profile.css';

const DOC_TYPE_OPTIONS = ['Driving License', 'Citizenship', 'NID'];

export default function Profile() {
  const { token, user, setUser } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [files, setFiles] = useState([]);
  const [passportPhotoFile, setPassportPhotoFile] = useState(null);
  const [docType, setDocType] = useState(DOC_TYPE_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadProfile = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Failed to load profile');
      return;
    }
    setProfile(data);
    setUser({ ...(user || {}), ...data });
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitKyc = async () => {
    if (!files.length) {
      setMessage('Please select at least one ID document image.');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    const docTypes = [];

    files.forEach((file) => {
      formData.append('kycDocs', file);
      docTypes.push(docType);
    });

    if (passportPhotoFile) {
      formData.append('kycDocs', passportPhotoFile);
      docTypes.push('Passport Size Photo');
    }

    formData.append('docTypes', JSON.stringify(docTypes));

    const res = await fetch(`${API_BASE_URL}/api/users/me/kyc-submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'Failed to submit KYC');
      setUploading(false);
      return;
    }

    setMessage('KYC submitted successfully. Admin will review your request soon.');
    setFiles([]);
    setPassportPhotoFile(null);
    await loadProfile();
    setUploading(false);
  };

  const kycStatus = String(profile?.kycStatus || 'unsubmitted').toLowerCase();
  const docs = useMemo(() => (Array.isArray(profile?.kycDocuments) ? profile.kycDocuments : []), [profile]);
  const initials = String(profile?.name || user?.name || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  if (!profile) return <p className="profile-loading">Loading profile...</p>;

  return (
    <div className="profile-page">
      <div className="profile-header-card surface-card">
        <div className="profile-hero">
          <div className="profile-avatar" aria-hidden="true">{initials || 'U'}</div>
          <div className="profile-hero-copy">
            <span className="profile-eyebrow">Account Center</span>
            <h2>My Profile</h2>
            <p>Manage your account details and verification documents.</p>
          </div>
          <div className={`profile-status-card ${kycStatus}`}>
            <span className="profile-status-label">KYC Status</span>
            <span className={`kyc-chip ${kycStatus}`}>{kycStatus}</span>
          </div>
        </div>
        <div className="profile-meta-grid">
          <div>
            <span className="profile-label">Name</span>
            <strong>{profile.name}</strong>
          </div>
          <div>
            <span className="profile-label">Email</span>
            <strong>{profile.email}</strong>
          </div>
          <div>
            <span className="profile-label">Role</span>
            <strong className="capitalize">{profile.role}</strong>
          </div>
          <div>
            <span className="profile-label">Citizenship</span>
            <strong>{profile.citizenshipNumber || '-'}</strong>
          </div>
        </div>
      </div>

      <div className="profile-card surface-card">
        <div className="kyc-title-row">
          <div className="profile-section-copy">
            <span className="profile-section-eyebrow">Verification</span>
            <h3>KYC Verification</h3>
            <p>Upload your identity documents to unlock verified access.</p>
          </div>
          <span className={`kyc-chip ${kycStatus}`}>{kycStatus}</span>
        </div>

        {profile.kycStatus === 'rejected' && profile.kycRejectReason && (
          <p className="profile-error">Rejected: {profile.kycRejectReason}</p>
        )}

        {kycStatus === 'verified' ? (
          <p className="profile-verified-note">
            Your KYC is verified. Document submission is now locked.
          </p>
        ) : (
          <>
            <div className="profile-upload-hint">
              Add at least one ID document. A passport photo is optional but recommended.
            </div>
            <div className="kyc-form-grid">
              <label className="kyc-field">
                <span>Document Type</span>
                <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="kyc-field">
                <span>Upload ID Document(s)</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>

              <label className="kyc-field">
                <span>Passport Size Photo (Optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPassportPhotoFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="kyc-file-preview-row">
              <p>{files.length ? `${files.length} ID file(s) selected` : 'No ID files selected'}</p>
              <p>{passportPhotoFile ? `Passport photo: ${passportPhotoFile.name}` : 'No passport photo selected'}</p>
            </div>

            <button onClick={submitKyc} disabled={uploading} className="kyc-submit-btn">
              {uploading ? 'Submitting...' : 'Submit KYC'}
            </button>
          </>
        )}
      </div>

      <div className="profile-card surface-card">
        <div className="profile-section-copy">
          <span className="profile-section-eyebrow">Uploads</span>
          <h3>KYC Documents</h3>
          <p>Review the files you have already submitted.</p>
        </div>
        {docs.length > 0 ? (
          <div className="kyc-doc-grid">
            {docs.map((doc) => (
              <div className="kyc-doc-item" key={doc._id}>
                <a href={doc.imageUrl} target="_blank" rel="noreferrer" className="kyc-doc-link">
                  <img src={doc.imageUrl} alt={doc.docType || 'KYC Doc'} />
                </a>
                <p className="kyc-doc-title">{doc.docType || 'Document'}</p>
                <span className={`kyc-chip ${String(doc.status).toLowerCase()}`}>{doc.status}</span>
                {doc.rejectReason ? <small className="profile-error">{doc.rejectReason}</small> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-empty">No KYC documents uploaded yet.</p>
        )}
      </div>

      {message && <p className="profile-message">{message}</p>}
    </div>
  );
}
