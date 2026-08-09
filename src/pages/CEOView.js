/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getCMTRates, approveCMTRate, getPOs, getAllocations, getPaymentEntries } from '../api';
import ProdFlowLogo from '../components/ProdFlowLogo';
import PoweredByFintrack from '../components/PoweredByFintrack';

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
    case 'Pending_CEO':      return { cls: 'badge', style: { background: '#d29922', color: 'white' } };
    case 'Approved':         return { cls: 'badge', style: { background: '#3fb950', color: 'white' } };
    case 'Rejected':         return { cls: 'badge', style: { background: '#f85149', color: 'white' } };
    default:                 return { cls: 'badge badge-pending', style: undefined };
  }
};

// ── Modal sub-components ──────────────────────────────────────────────────────
const ModalSectionTitle = ({ children }) => (
  <p style={{
    fontSize: '12px', fontWeight: '700', color: '#e6edf3',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    margin: '20px 0 12px', paddingBottom: '6px',
    borderBottom: '1px solid #30363d',
  }}>{children}</p>
);

const ModalSubTitle = ({ children }) => (
  <p style={{
    fontSize: '11px', fontWeight: '600', color: '#8b949e',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    marginTop: '14px', marginBottom: '8px',
  }}>{children}</p>
);

const FieldView = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
    <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
    <span style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '500' }}>{value ?? '—'}</span>
  </div>
);

const FieldGrid = ({ children, cols = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px', marginBottom: '4px' }}>
    {children}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
function CEOView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');

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

  // Dashboard state
  const [dashLoading, setDashLoading] = useState(false);
  const [dashData, setDashData] = useState(null);

  useEffect(() => {
    loadPending();
    loadAll();
    loadDashboard();
  }, []);

  // ── Dashboard data loader ──────────────────────────────────────────────────
  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const [posRes, allocRes, payRes] = await Promise.all([
        getPOs(),
        getAllocations(),
        getPaymentEntries(),
      ]);
      const allPOs = posRes.success ? posRes.pos : [];
      const allocs = allocRes.success ? allocRes.allocations : [];
      const payments = payRes.success ? payRes.payments : [];

      // KPI calculations
      const activePOs = allPOs.filter(p => p.status === 'Active');
      const totalFabricIssued = activePOs.reduce((s, p) => s + (Number(p.total_qty) || 0), 0);
      const totalAllocated = allocs.reduce((s, a) => s + (Number(a.qty_allocated) || 0), 0);
      const totalCompleted = allocs.filter(a => a.status === 'Complete').reduce((s, a) => s + (Number(a.qty_allocated) || 0), 0);
      const wip = totalAllocated - totalCompleted;
      const totalCost = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const pendingPayments = payments.filter(p => p.payment_status !== 'Paid');
      const pendingAmount = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      // Stitcher leaderboard
      const stitcherMap = {};
      payments.forEach(p => {
        const key = p.stitcher_name || p.stitcher_code || 'Unknown';
        if (!stitcherMap[key]) stitcherMap[key] = { name: key, sets: 0, amount: 0, pending: 0 };
        stitcherMap[key].sets += Number(p.qty_claimed) || 0;
        stitcherMap[key].amount += Number(p.amount) || 0;
        if (p.payment_status !== 'Paid') stitcherMap[key].pending += Number(p.amount) || 0;
      });
      const leaderboard = Object.values(stitcherMap).sort((a, b) => b.sets - a.sets).slice(0, 10);

      // Cost by department
      const deptCost = {};
      payments.forEach(p => {
        const dept = p.department || 'Other';
        if (!deptCost[dept]) deptCost[dept] = { department: dept, qty: 0, amount: 0 };
        deptCost[dept].qty += Number(p.qty_claimed) || 0;
        deptCost[dept].amount += Number(p.amount) || 0;
      });
      const costBreakdown = Object.values(deptCost).sort((a, b) => b.amount - a.amount);

      // Alerts
      const alerts = [];
      if (pendingAmount > 0) {
        const unitCount = new Set(pendingPayments.map(p => p.stitcher_name || p.stitcher_code)).size;
        alerts.push({ priority: 'Critical', text: `PKR ${pendingAmount.toLocaleString()} pending across ${unitCount} stitching unit${unitCount !== 1 ? 's' : ''}` });
      }
      const overdueAllocs = allocs.filter(a => a.status === 'Overdue');
      if (overdueAllocs.length > 0) {
        alerts.push({ priority: 'Warning', text: `${overdueAllocs.length} allocation${overdueAllocs.length !== 1 ? 's' : ''} overdue` });
      }
      const allRatesCheck = await getCMTRates('?status=Pending_CEO');
      if (allRatesCheck.success && allRatesCheck.rates.length > 0) {
        alerts.push({ priority: 'Warning', text: `${allRatesCheck.rates.length} CMT rate${allRatesCheck.rates.length !== 1 ? 's' : ''} awaiting CEO approval` });
      }

      setDashData({
        totalFabricIssued, totalAllocated, totalCompleted, wip, totalCost, pendingAmount,
        leaderboard, costBreakdown, alerts, poCount: activePOs.length,
      });
    } catch { /* silently fail */ }
    setDashLoading(false);
  };

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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#e6edf3' }}>
              CMT Rate Detail — {r.po_number}
            </h3>
            <button
              onClick={closeModal}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#8b949e', lineHeight: 1, padding: '0 4px' }}
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
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Color / Design</span>
                <input
                  type="text"
                  name="color_design"
                  value={editForm.color_design || ''}
                  onChange={handleEditFormChange}
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }}
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
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }} />
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
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>
          <ModalSubTitle>Trouser Finishing</ModalSubTitle>
          <FieldGrid>
            {SEC_C_TROUSER.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            ) : (
              <FieldView key={key} label={`${label} (PKR)`} value={r[key] != null ? Number(r[key]).toLocaleString() : '0'} />
            ))}
          </FieldGrid>
          <ModalSubTitle>Dupatta Finishing</ModalSubTitle>
          <FieldGrid>
            {SEC_C_DUPATTA.map(({ key, label }) => isEditMode ? (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label} (PKR)</span>
                <input type="number" name={key} value={editForm[key] ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }} />
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
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quality &amp; Packing (PKR)</span>
                <input type="number" name="quality_packing" value={editForm.quality_packing ?? ''} onChange={handleEditFormChange} min="0"
                  style={{ padding: '8px 10px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '14px' }} />
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
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #30363d' }}>
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
            <div style={{ marginTop: '12px', padding: '10px 14px', background: '#3d1417', borderRadius: '8px', border: '1px solid #5c2124' }}>
              {r.accounts_remarks && (
                <p style={{ fontSize: '13px', color: '#f85149', margin: 0 }}>
                  <strong>Accounts remarks:</strong> {r.accounts_remarks}
                </p>
              )}
              {r.ceo_remarks && (
                <p style={{ fontSize: '13px', color: '#f85149', margin: r.accounts_remarks ? '6px 0 0' : 0 }}>
                  <strong>CEO remarks:</strong> {r.ceo_remarks}
                </p>
              )}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #30363d', flexWrap: 'wrap' }}>
            {modalContext === 'pending' && !isEditMode && (
              <>
                {showRejectInput ? (
                  <>
                    <input
                      type="text"
                      placeholder="Rejection reason (required)"
                      value={rejectInput}
                      onChange={e => setRejectInput(e.target.value)}
                      style={{ flex: 1, minWidth: '180px', padding: '8px 12px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '13px' }}
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
                      style={{ width: 'auto', background: '#1c2d4a', color: '#e6edf3' }}
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
                      style={{ width: 'auto', background: '#1c2d4a', color: '#e6edf3' }}
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
                      style={{ width: 'auto', background: '#1c2d4a', color: '#e6edf3' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-small"
                      onClick={enterEditMode}
                      style={{ width: 'auto', background: '#4a7cc9', color: 'white' }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={closeModal}
                      style={{ width: 'auto', background: '#1c2d4a', color: '#e6edf3' }}
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
                style={{ width: 'auto', background: '#1c2d4a', color: '#e6edf3' }}
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
        <ProdFlowLogo height={32} />
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
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '1px solid #30363d' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600',
              color: activeTab === 'dashboard' ? '#4a7cc9' : '#8b949e',
              borderBottom: activeTab === 'dashboard' ? '3px solid #4a7cc9' : '3px solid transparent',
              marginBottom: '-2px', transition: 'color 0.15s',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600',
              color: activeTab === 'pending' ? '#4a7cc9' : '#8b949e',
              borderBottom: activeTab === 'pending' ? '3px solid #4a7cc9' : '3px solid transparent',
              marginBottom: '-2px', transition: 'color 0.15s',
            }}
          >
            Pending Rates
            {pendingRates.length > 0 && (
              <span style={{ background: '#f85149', color: 'white', borderRadius: '10px', fontSize: '11px', fontWeight: '700', padding: '1px 7px', marginLeft: '8px', verticalAlign: 'middle' }}>
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

        {/* ── DASHBOARD TAB ────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <>
            {dashLoading ? (
              <div className="loading"><div className="spinner" />Loading dashboard...</div>
            ) : !dashData ? (
              <p style={{ color: '#8b949e', textAlign: 'center', padding: '40px' }}>Failed to load dashboard data.</p>
            ) : (
              <>
                {/* KPI CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Active POs', value: dashData.poCount, color: '#4a7cc9' },
                    { label: 'Fabric Issued', value: dashData.totalFabricIssued.toLocaleString() + ' pcs', color: '#4a7cc9' },
                    { label: 'Allocated', value: dashData.totalAllocated.toLocaleString() + ' pcs', color: '#d29922' },
                    { label: 'Completed', value: dashData.totalCompleted.toLocaleString() + ' pcs', color: '#3fb950' },
                    { label: 'Work in Process', value: dashData.wip.toLocaleString() + ' pcs', color: '#d29922' },
                    { label: 'Total Cost', value: 'PKR ' + dashData.totalCost.toLocaleString(), color: '#4a7cc9' },
                    { label: 'Pending Payments', value: 'PKR ' + dashData.pendingAmount.toLocaleString(), color: dashData.pendingAmount > 0 ? '#f85149' : '#3fb950' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
                      padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
                      <span style={{ fontSize: '22px', fontWeight: '700', color: kpi.color }}>{kpi.value}</span>
                    </div>
                  ))}
                </div>

                {/* ALERTS */}
                {dashData.alerts.length > 0 && (
                  <div className="card" style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0, marginBottom: '14px' }}>⚠ Attention Required</h3>
                    {dashData.alerts.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', marginBottom: '8px', borderRadius: '8px',
                        background: a.priority === 'Critical' ? '#3d1417' : '#2d2208',
                        border: `1px solid ${a.priority === 'Critical' ? '#5c2124' : '#4d3a0e'}`,
                      }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                          padding: '2px 8px', borderRadius: '4px',
                          background: a.priority === 'Critical' ? '#f85149' : '#d29922',
                          color: '#fff',
                        }}>{a.priority}</span>
                        <span style={{ fontSize: '14px', color: '#e6edf3' }}>{a.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* TWO-COLUMN: COST BREAKDOWN + LEADERBOARD */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                  <div className="card" style={{ margin: 0 }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0, marginBottom: '16px' }}>Cost by Department</h3>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Department</th><th>Qty</th><th>Amount (PKR)</th></tr></thead>
                        <tbody>
                          {dashData.costBreakdown.map(c => (
                            <tr key={c.department}>
                              <td>{c.department}</td>
                              <td>{c.qty.toLocaleString()}</td>
                              <td style={{ fontWeight: '600' }}>{c.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '1px solid #30363d' }}>
                            <td style={{ fontWeight: '700', color: '#4a7cc9' }}>Total</td>
                            <td style={{ fontWeight: '700' }}>{dashData.costBreakdown.reduce((s, c) => s + c.qty, 0).toLocaleString()}</td>
                            <td style={{ fontWeight: '700', color: '#4a7cc9' }}>{dashData.costBreakdown.reduce((s, c) => s + c.amount, 0).toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="card" style={{ margin: 0 }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0, marginBottom: '16px' }}>Stitching Leaderboard</h3>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Unit</th><th>Pcs</th><th>Amount</th><th>Pending</th></tr></thead>
                        <tbody>
                          {dashData.leaderboard.map(s => (
                            <tr key={s.name}>
                              <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>
                              <td>{s.sets.toLocaleString()}</td>
                              <td>{s.amount.toLocaleString()}</td>
                              <td style={{ color: s.pending > 0 ? '#f85149' : '#3fb950', fontWeight: '600' }}>
                                {s.pending > 0 ? s.pending.toLocaleString() : '✓'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* PRODUCTION PIPELINE */}
                <div className="card">
                  <h3 style={{ margin: 0, borderBottom: 'none', padding: 0, marginBottom: '16px' }}>Production Pipeline</h3>
                  <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                    {[
                      { label: 'Fabric Issued', value: dashData.totalFabricIssued, color: '#4a7cc9' },
                      { label: 'Allocated', value: dashData.totalAllocated, color: '#d29922' },
                      { label: 'Completed', value: dashData.totalCompleted, color: '#3fb950' },
                    ].map((stage, i, arr) => {
                      const pct = dashData.totalFabricIssued > 0 ? Math.round((stage.value / dashData.totalFabricIssued) * 100) : 0;
                      return (
                        <div key={stage.label} style={{ flex: 1, textAlign: 'center', padding: '16px 12px', position: 'relative' }}>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: stage.color }}>{stage.value.toLocaleString()}</div>
                          <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>{stage.label}</div>
                          {i < arr.length - 1 && (
                            <div style={{ position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)', color: '#30363d', fontSize: '20px' }}>→</div>
                          )}
                          <div style={{ marginTop: '10px', background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: stage.color, borderRadius: '4px', transition: 'width 0.5s' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

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
              <p style={{ color: '#8b949e', textAlign: 'center', padding: '20px' }}>No pending rates. All caught up.</p>
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
                  style={{ padding: '8px 12px', border: '1px solid #30363d', borderRadius: '8px', fontSize: '14px', width: '260px' }}
                />
                <button
                  className="btn btn-small"
                  onClick={handleExcelExport}
                  disabled={filteredRates.length === 0}
                  style={{ width: 'auto', background: '#3fb950', color: 'white', whiteSpace: 'nowrap' }}
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            {allLoading ? (
              <div className="loading"><div className="spinner"></div>Loading rates...</div>
            ) : filteredRates.length === 0 ? (
              <p style={{ color: '#8b949e', textAlign: 'center', padding: '20px' }}>
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

        <PoweredByFintrack />
      </div>

      {renderRateModal()}
    </div>
  );
}

export default CEOView;
