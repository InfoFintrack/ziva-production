/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getCMTRates, approveCMTRate } from '../api';

// ── Rate field definitions ────────────────────────────────────────────────────
const ALL_RATE_KEYS = [
  'cutting', 'shirt', 'trouser', 'dupatta', 'patching',
  'fs_clipping', 'fs_heming', 'fs_tussling', 'fs_pressing',
  'ft_clipping', 'ft_heming', 'ft_pressing', 'ft_patching',
  'fd_heming', 'fd_tussling', 'fd_pressing', 'fd_patching',
  'quality_packing',
];

const SEC_B = [
  { key: 'cutting', label: 'Cutting' },
  { key: 'shirt', label: 'Shirt' },
  { key: 'trouser', label: 'Trouser' },
  { key: 'dupatta', label: 'Dupatta' },
  { key: 'patching', label: 'Patching' },
];
const SEC_C_SHIRT = [
  { key: 'fs_clipping', label: 'Clipping' },
  { key: 'fs_heming', label: 'Heming' },
  { key: 'fs_tussling', label: 'Tussling' },
  { key: 'fs_pressing', label: 'Pressing' },
];
const SEC_C_TROUSER = [
  { key: 'ft_clipping', label: 'Clipping' },
  { key: 'ft_heming', label: 'Heming' },
  { key: 'ft_pressing', label: 'Pressing' },
  { key: 'ft_patching', label: 'Patching' },
];
const SEC_C_DUPATTA = [
  { key: 'fd_heming', label: 'Heming' },
  { key: 'fd_tussling', label: 'Tussling' },
  { key: 'fd_pressing', label: 'Pressing' },
  { key: 'fd_patching', label: 'Patching' },
];

// ── Badge helper ──────────────────────────────────────────────────────────────
const getCMTStatusBadge = (status) => {
  switch (status) {
    case 'Draft':            return { cls: 'badge badge-pending', style: undefined };
    case 'Pending_Accounts': return { cls: 'badge badge-issued',  style: undefined };
    case 'Pending_CEO':      return { cls: 'badge', style: { background: '#f97316', color: 'white' } };
    case 'Approved':         return { cls: 'badge', style: { background: '#16a34a', color: 'white' } };
    case 'Rejected':         return { cls: 'badge', style: { background: '#dc2626', color: 'white' } };
    default:                 return { cls: 'badge badge-pending', style: undefined };
  }
};

// ── Modal sub-components ──────────────────────────────────────────────────────
const ModalSectionTitle = ({ children }) => (
  <p style={{
    fontSize: '12px', fontWeight: '700', color: '#0f3460',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    margin: '20px 0 12px', paddingBottom: '6px',
    borderBottom: '1px solid #f0f2f5',
  }}>{children}</p>
);

const ModalSubTitle = ({ children }) => (
  <p style={{
    fontSize: '11px', fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    marginTop: '14px', marginBottom: '8px',
  }}>{children}</p>
);

const FieldView = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
    <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
    <span style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>{value ?? '—'}</span>
  </div>
);

const FieldGrid = ({ children, cols = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px', marginBottom: '4px' }}>
    {children}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
function CEOView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('pending');

  const [pendingRates, setPendingRates] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [allRates, setAllRates] = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [actionMessage, setActionMessage] = useState(null);

  // Modal state
  const [modalRate, setModalRate] = useState(null);
  const [modalContext, setModalContext] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [editForm, setEditForm] = useState({});
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectInput, setRejectInput] = useState('');
  const [modalActing, setModalActing] = useState(false);
  const [modalMessage, setModalMessage] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    loadPending();
    loadAll();
  }, []);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const res = await getCMTRates('?status=Pending_CEO');
      if (res.success) setPendingRates(res.rates);
    } catch { /* silently fail */ }
    setPendingLoading(false);
  };

  const loadAll = async () => {
    setAllLoading(true);
    try {
      const res = await getCMTRates();
      if (res.success) setAllRates(res.rates);
    } catch { /* silently fail */ }
    setAllLoading(false);
  };

  const filteredRates = allRates.filter(r => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return r.po_number?.toLowerCase().includes(s) || r.submitted_by?.toLowerCase().includes(s);
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openModal = (r, context) => {
    setModalRate(r);
    setModalContext(context);
    setModalMode('view');
    setShowRejectInput(false);
    setRejectInput('');
    setModalMessage(null);
    setEditForm({});
  };

  const closeModal = () => {
    setModalRate(null);
    setModalContext(null);
    setModalMode('view');
    setShowRejectInput(false);
    setRejectInput('');
    setModalMessage(null);
    setEditForm({});
  };

  const enterEditMode = () => {
    const f = { color_design: modalRate.color_design || '' };
    ALL_RATE_KEYS.forEach(k => { f[k] = modalRate[k] != null ? String(modalRate[k]) : '0'; });
    setEditForm(f);
    setModalMode('edit');
    setModalMessage(null);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSave = async () => {
    setEditSubmitting(true);
    setModalMessage(null);
    try {
      const payload = { id: modalRate.id, action: 'admin_edit', color_design: editForm.color_design || null };
      ALL_RATE_KEYS.forEach(k => { payload[k] = editForm[k] !== '' ? Number(editForm[k]) : 0; });
      const res = await approveCMTRate(payload);
      if (res.success) {
        setActionMessage({ type: 'success', text: `✓ CMT rates for ${modalRate.po_number} updated and approved.` });
        closeModal();
        loadPending();
        loadAll();
      } else {
        setModalMessage({ type: 'error', text: res.message || res.error || 'Save failed.' });
      }
    } catch {
      setModalMessage({ type: 'error', text: 'Request failed. Please try again.' });
    }
    setEditSubmitting(false);
  };

  const handleModalApprove = async () => {
    setModalActing(true);
    setModalMessage(null);
    try {
      const res = await approveCMTRate({ id: modalRate.id, action: 'approve' });
      if (res.success) {
        setActionMessage({ type: 'success', text: '✓ Rate approved and locked. No further changes can be made.' });
        closeModal();
        loadPending();
        loadAll();
      } else {
        setModalMessage({ type: 'error', text: res.message || res.error || 'Action failed.' });
      }
    } catch {
      setModalMessage({ type: 'error', text: 'Request failed. Please try again.' });
    }
    setModalActing(false);
  };

  const handleModalRejectConfirm = async () => {
    if (!rejectInput.trim()) {
      setModalMessage({ type: 'error', text: 'Rejection remarks are required.' });
      return;
    }
    setModalActing(true);
    setModalMessage(null);
    try {
      const res = await approveCMTRate({ id: modalRate.id, action: 'reject', remarks: rejectInput.trim() });
      if (res.success) {
        setActionMessage({ type: 'success', text: '✓ Rate rejected.' });
        closeModal();
        loadPending();
        loadAll();
      } else {
        setModalMessage({ type: 'error', text: res.message || res.error || 'Action failed.' });
      }
    } catch {
      setModalMessage({ type: 'error', text: 'Request failed. Please try again.' });
    }
    setModalActing(false);
  };

  // ── Excel export ───────────────────────────────────────────────────────────

  const handleExcelExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = filteredRates.map(r => ({
      'PO Number': r.po_number,
      'Color/Design': r.color_design || '',
      'Cutting': Number(r.cutting) || 0,
      'Shirt': Number(r.shirt) || 0,
      'Trouser': Number(r.trouser) || 0,
      'Dupatta': Number(r.dupatta) || 0,
      'Patching': Number(r.patching) || 0,
      'FS Clipping': Number(r.fs_clipping) || 0,
      'FS Heming': Number(r.fs_heming) || 0,
      'FS Tussling': Number(r.fs_tussling) || 0,
      'FS Pressing': Number(r.fs_pressing) || 0,
      'FT Clipping': Number(r.ft_clipping) || 0,
      'FT Heming': Number(r.ft_heming) || 0,
      'FT Pressing': Number(r.ft_pressing) || 0,
      'FT Patching': Number(r.ft_patching) || 0,
      'FD Heming': Number(r.fd_heming) || 0,
      'FD Tussling': Number(r.fd_tussling) || 0,
      'FD Pressing': Number(r.fd_pressing) || 0,
      'FD Patching': Number(r.fd_patching) || 0,
      'Quality Packing': Number(r.quality_packing) || 0,
      'Total': r.total != null ? Number(r.total) : 0,
      'Status': r.status,
      'Submitted By': r.submitted_by,
      'Submitted Date': r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CMT Rates');
    XLSX.writeFile(wb, `CMT_Rates_${today}.xlsx`);
  };

  // ── Modal render helper ────────────────────────────────────────────────────

  const computeTotal = (src) =>
    ALL_RATE_KEYS.reduce((s, k) => s + (Number(src[k]) || 0), 0);

  const renderRateModal = () => {
    if (!modalRate) return null;
    const r = modalRate;
    const badge = getCMTStatusBadge(r.status);
    const isEditMode = modalMode === 'edit';

    return (
      <div
        className="modal-overlay"
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div className="modal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f3460' }}>
              CMT Rate Detail — {r.po_number}
            </h3>
            <button
              onClick={closeModal}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#888', lineHeight: 1, padding: '0 4px' }}
            >
              ✕
            </button>
          </div>

          {modalMessage && (
            <div className={`alert alert-${modalMessage.type}`} style={{ marginTop: '12px' }}>
              {modalMessage.text}
            </div>
          )}

          {/* SECTION A */}
          <ModalSectionTitle>Section A — Header</ModalSectionTitle>
          {isEditMode ? (
            <FieldGrid>
              <FieldView label="PO Number" value={r.po_number} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Color / Design</span>
                <input
                  type="text"
                  name="color_design"
                  value={editForm.color_design || ''}
                  onChange={handleEditFormChange}
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>
            </FieldGrid>
          ) : (
            <FieldGrid>
              <FieldView label="PO Number" value={r.po_number} />
              <FieldView label="Color / Design" value={r.color_design} />
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldView label="Remarks" value={r.remarks} />
              </div>
            </FieldGrid>
          )}

          {/* SECTION B */}
          <ModalSectionTitle>Section B — Cutting &amp; Stitching Rates</ModalSectionTitle>
          <FieldGrid>
            {SEC_B.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>

          {/* SECTION C */}
          <ModalSectionTitle>Section C — Finishing Rates</ModalSectionTitle>
          <ModalSubTitle>Shirt Finishing</ModalSubTitle>
          <FieldGrid>
            {SEC_C_SHIRT.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>
          <ModalSubTitle>Trouser Finishing</ModalSubTitle>
          <FieldGrid>
            {SEC_C_TROUSER.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>
          <ModalSubTitle>Dupatta Finishing</ModalSubTitle>
          <FieldGrid>
            {SEC_C_DUPATTA.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>

          {/* SECTION D */}
          <ModalSectionTitle>Section D — Overhead</ModalSectionTitle>
          <FieldGrid>
            {isEditMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quality &amp; Packing (PKR)</span>
                <input type="number" name="quality_packing" value={editForm.quality_packing ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView label="Quality &amp; Packing (PKR)" value={r.quality_packing != null ? Number(r.quality_packing).toLocaleString() : '0'} />
            )}
            <FieldView
              label="Total (PKR)"
              value={
                isEditMode
                  ? computeTotal(editForm).toLocaleString()
                  : (r.total != null ? Number(r.total).toLocaleString() : '—')
              }
            />
          </FieldGrid>

          {/* META */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f2f5' }}>
            <FieldGrid>
              <FieldView label="Submitted By" value={r.submitted_by} />
              <FieldView label="Submitted Date" value={r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'} />
            </FieldGrid>
            <div style={{ marginTop: '8px' }}>
              <span className={badge.cls} style={badge.style}>{r.status}</span>
            </div>
          </div>

          {/* Rejection remarks */}
          {r.status === 'Rejected' && (r.accounts_remarks || r.ceo_remarks) && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              {r.accounts_remarks && (
                <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
                  <strong>Accounts remarks:</strong> {r.accounts_remarks}
                </p>
              )}
              {r.ceo_remarks && (
                <p style={{ fontSize: '13px', color: '#dc2626', margin: r.accounts_remarks ? '6px 0 0' : 0 }}>
                  <strong>CEO remarks:</strong> {r.ceo_remarks}
                </p>
              )}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #f0f2f5', flexWrap: 'wrap' }}>
            {modalContext === 'pending' && !isEditMode && (
              <>
                {showRejectInput ? (
                  <>
                    <input
                      type="text"
                      placeholder="Rejection reason (required)"
                      value={rejectInput}
                      onChange={e => setRejectInput(e.target.value)}
                      style={{ flex: 1, minWidth: '180px', padding: '8px 12px', border: '2px solid #e8e8e8', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <button
                      className="btn btn-danger btn-small"
                      onClick={handleModalRejectConfirm}
                      disabled={modalActing}
                      style={{ width: 'auto' }}
                    >
                      {modalActing ? '...' : 'Confirm Reject'}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => { setShowRejectInput(false); setRejectInput(''); setModalMessage(null); }}
                      disabled={modalActing}
                      style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-success btn-small"
                      onClick={handleModalApprove}
                      disabled={modalActing}
                      style={{ width: 'auto' }}
                    >
                      {modalActing ? '...' : 'Approve'}
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => { setShowRejectInput(true); setModalMessage(null); }}
                      disabled={modalActing}
                      style={{ width: 'auto' }}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={closeModal}
                      style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                    >
                      Close
                    </button>
                  </>
                )}
              </>
            )}

            {modalContext === 'all' && (
              <>
                {isEditMode ? (
                  <>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={handleEditSave}
                      disabled={editSubmitting}
                      style={{ width: 'auto' }}
                    >
                      {editSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => { setModalMode('view'); setModalMessage(null); }}
                      disabled={editSubmitting}
                      style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-small"
                      onClick={enterEditMode}
                      style={{ width: 'auto', background: '#0f3460', color: 'white' }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={closeModal}
                      style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                    >
                      Close
                    </button>
                  </>
                )}
              </>
            )}

            {modalContext === 'pending' && isEditMode && (
              <button
                className="btn btn-small"
                onClick={closeModal}
                style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <h2>ZIVA — CEO Dashboard</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">CEO</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">

        {/* TAB SWITCHER */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e8e8e8' }}>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600',
              color: activeTab === 'pending' ? '#0f3460' : '#888',
              borderBottom: activeTab === 'pending' ? '3px solid #0f3460' : '3px solid transparent',
              marginBottom: '-2px', transition: 'color 0.15s',
            }}
          >
            Pending Rates
            {pendingRates.length > 0 && (
              <span style={{ background: '#dc2626', color: 'white', borderRadius: '10px', fontSize: '11px', fontWeight: '700', padding: '1px 7px', marginLeft: '8px', verticalAlign: 'middle' }}>
                {pendingRates.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600',
              color: activeTab === 'all' ? '#0f3460' : '#888',
              borderBottom: activeTab === 'all' ? '3px solid #0f3460' : '3px solid transparent',
              marginBottom: '-2px', transition: 'color 0.15s',
            }}
          >
            All Rates
          </button>
        </div>

        {/* ── TAB 1: PENDING RATES ──────────────────────────────────────── */}
        {activeTab === 'pending' && (
          <div className="card">
            <h3>Pending CEO Approval</h3>

            {actionMessage && (
              <div className={`alert alert-${actionMessage.type}`}>{actionMessage.text}</div>
            )}

            {pendingLoading ? (
              <div className="loading"><div className="spinner"></div>Loading pending rates...</div>
            ) : pendingRates.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No pending rates. All caught up.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Color / Design</th>
                      <th>Total (PKR)</th>
                      <th>Submitted By</th>
                      <th>Submitted Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRates.map((r) => (
                      <tr key={r.id} onClick={() => openModal(r, 'pending')} style={{ cursor: 'pointer' }}>
                        <td>{r.po_number}</td>
                        <td>{r.color_design || '—'}</td>
                        <td>{r.total != null ? Number(r.total).toLocaleString() : '—'}</td>
                        <td>{r.submitted_by}</td>
                        <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: ALL RATES ──────────────────────────────────────────── */}
        {activeTab === 'all' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>All CMT Rates</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search by PO or submitted by..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: '8px 12px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '14px', width: '260px' }}
                />
                <button
                  className="btn btn-small"
                  onClick={handleExcelExport}
                  disabled={filteredRates.length === 0}
                  style={{ width: 'auto', background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            {allLoading ? (
              <div className="loading"><div className="spinner"></div>Loading rates...</div>
            ) : filteredRates.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                {allRates.length === 0 ? 'No CMT rates found.' : 'No results match your search.'}
              </p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Color / Design</th>
                      <th>Total (PKR)</th>
                      <th>Submitted By</th>
                      <th>Submitted Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRates.map((r) => {
                      const badge = getCMTStatusBadge(r.status);
                      return (
                        <tr key={r.id} onClick={() => openModal(r, 'all')} style={{ cursor: 'pointer' }}>
                          <td>{r.po_number}</td>
                          <td>{r.color_design || '—'}</td>
                          <td>{r.total != null ? Number(r.total).toLocaleString() : '—'}</td>
                          <td>{r.submitted_by}</td>
                          <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td>
                            <span className={badge.cls} style={badge.style}>{r.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {renderRateModal()}
    </div>
  );
}

export default CEOView;
