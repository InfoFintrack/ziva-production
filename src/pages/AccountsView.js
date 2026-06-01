/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getCMTRates, approveCMTRate, getPaymentEntries, getAdvances, addAdvance, updatePayment, getStitchers, getPOs } from '../api';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUpcomingSaturday() {
  const d = new Date();
  const daysUntilSat = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d.toISOString().split('T')[0];
}

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

function PayStatusBadge({ status }) {
  const cfg = {
    Pending:  { bg: '#fef3c7', color: '#92400e' },
    Verified: { bg: '#dbeafe', color: '#1e40af' },
    Paid:     { bg: '#dcfce7', color: '#166534' },
  };
  const s = cfg[status] || cfg.Pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
      fontWeight: '700', textTransform: 'uppercase', background: s.bg, color: s.color,
    }}>
      {status || 'Pending'}
    </span>
  );
}

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
function AccountsView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('pending');

  // ── Rates state ────────────────────────────────────────────────────────────
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

  // ── Payments state ─────────────────────────────────────────────────────────
  const [paySubTab,    setPaySubTab]    = useState('weekly');
  const [payWeek,      setPayWeek]      = useState(getUpcomingSaturday());
  const [weekPayments, setWeekPayments] = useState([]);
  const [weekAdvances, setWeekAdvances] = useState([]);
  const [payLoading,   setPayLoading]   = useState(false);
  const [expandedRow,  setExpandedRow]  = useState(null);
  const [payActing,    setPayActing]    = useState({});
  const [payMsg,       setPayMsg]       = useState(null);

  // Advances sub-tab
  const [stitchers,     setStitchers]     = useState([]);
  const [advForm,       setAdvForm]       = useState({ stitcher_code: '', amount: '', note: '' });
  const [advSubmitting, setAdvSubmitting] = useState(false);
  const [advMsg,        setAdvMsg]        = useState(null);

  // PO list for collection_name lookup in payment tables
  const [pos, setPos] = useState([]);

  // ── Rate loaders ───────────────────────────────────────────────────────────

  useEffect(() => {
    loadPending();
    loadAll();
  }, []);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const res = await getCMTRates('?status=Pending_Accounts');
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

  // ── Payments loaders ───────────────────────────────────────────────────────

  const loadWeekData = async (week) => {
    setPayLoading(true);
    try {
      const [paymentsRes, advancesRes] = await Promise.all([
        getPaymentEntries(`?week_ending=${week}`),
        getAdvances(`week_ending=${week}`),
      ]);
      if (paymentsRes.success) setWeekPayments(paymentsRes.payments);
      if (advancesRes.success) setWeekAdvances(advancesRes.advances);
    } catch { /* silently fail */ }
    setPayLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'payments') {
      loadWeekData(payWeek);
    }
  }, [activeTab, payWeek]);

  useEffect(() => {
    if (activeTab === 'payments' && paySubTab === 'advances' && stitchers.length === 0) {
      getStitchers(true)
        .then(res => { if (res.success) setStitchers(res.stitchers); })
        .catch(() => {});
    }
  }, [activeTab, paySubTab]);

  useEffect(() => {
    if (activeTab === 'payments' && pos.length === 0) {
      getPOs().then(r => { if (r.success) setPos(r.pos); }).catch(() => {});
    }
  }, [activeTab]);

  // ── Stitcher groups computed from weekPayments + weekAdvances ──────────────

  const computeGroups = () => {
    const groups = {};
    weekPayments
      .filter(p => !p.worker_type || p.worker_type === 'Stitching')
      .forEach(p => {
        const k = p.stitcher_code;
        if (!groups[k]) groups[k] = { code: k, name: p.stitcher_name || k, entries: [], gross: 0, totalPieces: 0, advance: 0 };
        groups[k].entries.push(p);
        groups[k].gross       += Number(p.amount     || 0);
        groups[k].totalPieces += Number(p.qty_claimed || 0);
      });
    weekAdvances.forEach(a => {
      const k = a.stitcher_code;
      if (!groups[k]) groups[k] = { code: k, name: a.stitcher_name || k, entries: [], gross: 0, totalPieces: 0, advance: 0 };
      groups[k].advance += Number(a.amount || 0);
    });
    Object.values(groups).forEach(g => {
      g.net = g.gross - g.advance;
      if (!g.entries.length) { g.status = 'Pending'; return; }
      const uniq = [...new Set(g.entries.map(e => e.payment_status))];
      if (uniq.every(s => s === 'Paid'))                         g.status = 'Paid';
      else if (uniq.every(s => s === 'Verified' || s === 'Paid')) g.status = 'Verified';
      else                                                         g.status = 'Pending';
    });
    return Object.values(groups);
  };

  const computeFinishingGroups = () => {
    const groups = {};
    weekPayments
      .filter(p => p.worker_type === 'Finishing_InHouse' || p.worker_type === 'Finishing_OutOfFactory')
      .forEach(p => {
        const k = p.stitcher_code;
        if (!groups[k]) groups[k] = { code: k, name: p.stitcher_name || k, entries: [], gross: 0, totalPieces: 0, worker_type: p.worker_type };
        groups[k].entries.push(p);
        groups[k].gross       += Number(p.amount     || 0);
        groups[k].totalPieces += Number(p.qty_claimed || 0);
      });
    Object.values(groups).forEach(g => {
      if (!g.entries.length) { g.status = 'Pending'; return; }
      const uniq = [...new Set(g.entries.map(e => e.payment_status))];
      if (uniq.every(s => s === 'Paid'))                          g.status = 'Paid';
      else if (uniq.every(s => s === 'Verified' || s === 'Paid')) g.status = 'Verified';
      else                                                          g.status = 'Pending';
    });
    return Object.values(groups);
  };

  // ── Payment handlers ───────────────────────────────────────────────────────

  const handleVerify = async (stitcherCode) => {
    setPayActing(prev => ({ ...prev, [stitcherCode]: true }));
    setPayMsg(null);
    try {
      const res = await updatePayment({ stitcher_code: stitcherCode, week_ending: payWeek, action: 'verify' });
      if (res.success) {
        setPayMsg({ type: 'success', text: `Entries verified for ${stitcherCode}.` });
        loadWeekData(payWeek);
      } else {
        setPayMsg({ type: 'error', text: res.message || 'Verify failed.' });
      }
    } catch {
      setPayMsg({ type: 'error', text: 'Request failed.' });
    }
    setPayActing(prev => ({ ...prev, [stitcherCode]: false }));
  };

  const handleMarkPaid = async (stitcherCode) => {
    setPayActing(prev => ({ ...prev, [stitcherCode]: true }));
    setPayMsg(null);
    try {
      const res = await updatePayment({ stitcher_code: stitcherCode, week_ending: payWeek, action: 'mark_paid' });
      if (res.success) {
        setPayMsg({ type: 'success', text: `Marked as paid for ${stitcherCode}.` });
        loadWeekData(payWeek);
      } else {
        setPayMsg({ type: 'error', text: res.message || 'Mark paid failed.' });
      }
    } catch {
      setPayMsg({ type: 'error', text: 'Request failed.' });
    }
    setPayActing(prev => ({ ...prev, [stitcherCode]: false }));
  };

  const handleMarkPaidFlexible = async (id) => {
    setPayActing(prev => ({ ...prev, [id]: true }));
    setPayMsg(null);
    try {
      const res = await updatePayment({ action: 'mark_paid_flexible', id });
      if (res.success) {
        setPayMsg({ type: 'success', text: 'Payment marked as paid.' });
        loadWeekData(payWeek);
      } else {
        setPayMsg({ type: 'error', text: res.message || 'Mark paid failed.' });
      }
    } catch {
      setPayMsg({ type: 'error', text: 'Request failed.' });
    }
    setPayActing(prev => ({ ...prev, [id]: false }));
  };

  const handleAdvanceChange = (e) => setAdvForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleAdvanceSubmit = async (e) => {
    e.preventDefault();
    if (!advForm.stitcher_code || !advForm.amount) {
      setAdvMsg({ type: 'error', text: 'Stitcher and amount are required.' });
      return;
    }
    setAdvSubmitting(true);
    setAdvMsg(null);
    try {
      const res = await addAdvance({
        stitcher_code: advForm.stitcher_code,
        amount:        Number(advForm.amount),
        week_ending:   payWeek,
        ...(advForm.note ? { note: advForm.note } : {}),
      });
      if (res.success) {
        setAdvMsg({ type: 'success', text: 'Advance logged.' });
        setAdvForm({ stitcher_code: '', amount: '', note: '' });
        loadWeekData(payWeek);
      } else {
        setAdvMsg({ type: 'error', text: res.message || 'Failed to log advance.' });
      }
    } catch {
      setAdvMsg({ type: 'error', text: 'Request failed.' });
    }
    setAdvSubmitting(false);
  };

  const handlePaymentExcelExport = () => {
    const groups = computeGroups();
    if (!groups.length) return;
    const rows = groups.map(g => ({
      'Stitcher Code':    g.code,
      'Stitcher':         g.name,
      'Total Pieces':     g.totalPieces,
      'Gross (PKR)':      g.gross.toFixed(2),
      'Advance (PKR)':    g.advance.toFixed(2),
      'Net Payable (PKR)':g.net.toFixed(2),
      'Status':           g.status,
      'Week Ending':      payWeek,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment Summary');
    XLSX.writeFile(wb, `Payment_Summary_${payWeek}.xlsx`);
  };

  // ── CMT Rate modal helpers ─────────────────────────────────────────────────

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
        setActionMessage({ type: 'success', text: '✓ Rate approved and forwarded to CEO for final sign-off.' });
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

  // ── Excel export (CMT Rates) ───────────────────────────────────────────────

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

  // ── CMT Rate modal render ──────────────────────────────────────────────────

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
              value={isEditMode ? computeTotal(editForm).toLocaleString() : (r.total != null ? Number(r.total).toLocaleString() : '—')}
            />
          </FieldGrid>

          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f2f5' }}>
            <FieldGrid>
              <FieldView label="Submitted By" value={r.submitted_by} />
              <FieldView label="Submitted Date" value={r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'} />
            </FieldGrid>
            <div style={{ marginTop: '8px' }}>
              <span className={badge.cls} style={badge.style}>{r.status}</span>
            </div>
          </div>

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
                    <button className="btn btn-danger btn-small" onClick={handleModalRejectConfirm} disabled={modalActing} style={{ width: 'auto' }}>
                      {modalActing ? '...' : 'Confirm Reject'}
                    </button>
                    <button className="btn btn-small" onClick={() => { setShowRejectInput(false); setRejectInput(''); setModalMessage(null); }} disabled={modalActing} style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-success btn-small" onClick={handleModalApprove} disabled={modalActing} style={{ width: 'auto' }}>
                      {modalActing ? '...' : 'Approve'}
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => { setShowRejectInput(true); setModalMessage(null); }} disabled={modalActing} style={{ width: 'auto' }}>
                      Reject
                    </button>
                    <button className="btn btn-small" onClick={closeModal} style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}>
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
                    <button className="btn btn-primary btn-small" onClick={handleEditSave} disabled={editSubmitting} style={{ width: 'auto' }}>
                      {editSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-small" onClick={() => { setModalMode('view'); setModalMessage(null); }} disabled={editSubmitting} style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-small" onClick={enterEditMode} style={{ width: 'auto', background: '#0f3460', color: 'white' }}>Edit</button>
                    <button className="btn btn-small" onClick={closeModal} style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}>Close</button>
                  </>
                )}
              </>
            )}

            {modalContext === 'pending' && isEditMode && (
              <button className="btn btn-small" onClick={closeModal} style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}>Close</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Shared tab button style ────────────────────────────────────────────────

  const tabBtnStyle = (tab) => ({
    padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
    color: activeTab === tab ? '#0f3460' : '#888',
    borderBottom: activeTab === tab ? '3px solid #0f3460' : '3px solid transparent',
    marginBottom: '-2px', transition: 'color 0.15s',
  });

  const subTabBtnStyle = (tab) => ({
    padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600',
    color: paySubTab === tab ? '#0f3460' : '#888',
    borderBottom: paySubTab === tab ? '3px solid #0f3460' : '3px solid transparent',
    marginBottom: '-2px', transition: 'color 0.15s',
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <ProdFlowLogo height={32} />
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Accounts</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content">

        {/* ── MAIN TAB BAR ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e8e8e8' }}>
          <button onClick={() => setActiveTab('pending')} style={tabBtnStyle('pending')}>
            Pending Rates
            {pendingRates.length > 0 && (
              <span style={{ background: '#dc2626', color: 'white', borderRadius: '10px', fontSize: '11px', fontWeight: '700', padding: '1px 7px', marginLeft: '8px', verticalAlign: 'middle' }}>
                {pendingRates.length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('all')} style={tabBtnStyle('all')}>
            All Rates
          </button>
          <button onClick={() => setActiveTab('payments')} style={tabBtnStyle('payments')}>
            Payments
          </button>
        </div>

        {/* ── TAB 1: PENDING RATES ──────────────────────────────────────── */}
        {activeTab === 'pending' && (
          <div className="card">
            <h3>Pending Accounts Review</h3>

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
                          <td><span className={badge.cls} style={badge.style}>{r.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: PAYMENTS ───────────────────────────────────────────── */}
        {activeTab === 'payments' && (
          <>
            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '2px solid #e8e8e8' }}>
              <button onClick={() => setPaySubTab('weekly')}   style={subTabBtnStyle('weekly')}>Weekly Summary</button>
              <button onClick={() => setPaySubTab('advances')} style={subTabBtnStyle('advances')}>Advances</button>
            </div>

            {/* ── Weekly Summary sub-tab ──────────────────────────────────── */}
            {paySubTab === 'weekly' && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                        Week Ending (Saturday)
                      </label>
                      <input
                        type="date"
                        value={payWeek}
                        onChange={e => { setPayWeek(e.target.value); setExpandedRow(null); }}
                        style={{ padding: '8px 12px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => loadWeekData(payWeek)}
                      disabled={payLoading}
                      style={{ marginTop: '20px' }}
                    >
                      {payLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <button
                    className="btn btn-small"
                    onClick={handlePaymentExcelExport}
                    disabled={weekPayments.length === 0}
                    style={{ width: 'auto', background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                  >
                    ↓ Excel
                  </button>
                </div>

                {payMsg && (
                  <div className={`alert alert-${payMsg.type === 'error' ? 'error' : 'success'}`}>
                    {payMsg.text}
                  </div>
                )}

                {payLoading ? (
                  <div className="loading"><div className="spinner" />Loading...</div>
                ) : (() => {
                  const groups = computeGroups();
                  const fGroups = computeFinishingGroups();
                  return (
                    <>
                      {groups.length === 0 ? (
                        <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No stitching entries for this week.</p>
                      ) : (
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr>
                                <th>Code</th>
                                <th>Stitcher</th>
                                <th>Total Pieces</th>
                                <th>Gross (PKR)</th>
                                <th>Advance (PKR)</th>
                                <th>Net Payable (PKR)</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groups.map(g => (
                                <React.Fragment key={g.code}>
                                  <tr
                                    onClick={() => setExpandedRow(expandedRow === g.code ? null : g.code)}
                                    style={{ cursor: 'pointer', background: expandedRow === g.code ? '#f0f7ff' : undefined }}
                                  >
                                    <td>{g.code}</td>
                                    <td>
                                      <span style={{ marginRight: '6px', fontSize: '11px', color: '#888' }}>
                                        {expandedRow === g.code ? '▲' : '▶'}
                                      </span>
                                      {g.name}
                                    </td>
                                    <td>{g.totalPieces.toLocaleString()}</td>
                                    <td>PKR {g.gross.toLocaleString()}</td>
                                    <td>PKR {g.advance.toLocaleString()}</td>
                                    <td style={{ fontWeight: '700', color: g.net >= 0 ? '#16a34a' : '#dc2626' }}>
                                      PKR {g.net.toLocaleString()}
                                    </td>
                                    <td><PayStatusBadge status={g.status} /></td>
                                    <td onClick={e => e.stopPropagation()}>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        {g.status === 'Pending' && (
                                          <button
                                            className="btn btn-small"
                                            style={{ background: '#3b82f6', color: 'white', whiteSpace: 'nowrap' }}
                                            onClick={() => handleVerify(g.code)}
                                            disabled={!!payActing[g.code]}
                                          >
                                            {payActing[g.code] ? '...' : 'Verify'}
                                          </button>
                                        )}
                                        {g.status === 'Verified' && (
                                          <button
                                            className="btn btn-small"
                                            style={{ background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                                            onClick={() => handleMarkPaid(g.code)}
                                            disabled={!!payActing[g.code]}
                                          >
                                            {payActing[g.code] ? '...' : 'Mark Paid'}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {expandedRow === g.code && g.entries.map(e => {
                                    const po = pos.find(p => p.po_number === e.po_number);
                                    return (
                                      <tr key={e.id} style={{ background: '#fafbff' }}>
                                        <td style={{ paddingLeft: '32px', color: '#888', fontSize: '13px' }}>
                                          {e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}
                                          &nbsp;·&nbsp;{e.po_number}
                                        </td>
                                        <td style={{ fontSize: '13px', color: '#555' }}>{po?.collection_name || '—'}</td>
                                        <td style={{ fontSize: '13px', color: '#555' }}>{e.department}</td>
                                        <td style={{ fontSize: '13px', color: '#555' }}>{e.operation}</td>
                                        <td style={{ fontSize: '13px' }}>{e.qty_claimed}</td>
                                        <td style={{ fontSize: '13px' }}>PKR {Number(e.rate || 0).toLocaleString()}</td>
                                        <td style={{ fontSize: '13px', fontWeight: '600' }} colSpan={2}>
                                          PKR {Number(e.amount || 0).toLocaleString()}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* ── Finishing Payments ── */}
                      <div style={{ marginTop: '32px' }}>
                        <h4 style={{ color: '#0f3460', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e0e7ff', fontSize: '15px', fontWeight: '700' }}>
                          Finishing Payments
                        </h4>
                        {fGroups.length === 0 ? (
                          <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No finishing entries for this week.</p>
                        ) : (
                          <div className="table-container">
                            <table>
                              <thead>
                                <tr>
                                  <th>Code</th>
                                  <th>Worker</th>
                                  <th>Type</th>
                                  <th>Total Pieces</th>
                                  <th>Gross (PKR)</th>
                                  <th>Status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fGroups.map(g => {
                                  const isFlexible = g.worker_type === 'Finishing_OutOfFactory';
                                  const expandKey = `f_${g.code}`;
                                  return (
                                    <React.Fragment key={g.code}>
                                      <tr
                                        onClick={() => setExpandedRow(expandedRow === expandKey ? null : expandKey)}
                                        style={{ cursor: 'pointer', background: expandedRow === expandKey ? '#f0f7ff' : undefined }}
                                      >
                                        <td>{g.code}</td>
                                        <td>
                                          <span style={{ marginRight: '6px', fontSize: '11px', color: '#888' }}>
                                            {expandedRow === expandKey ? '▲' : '▶'}
                                          </span>
                                          {g.name}
                                        </td>
                                        <td>
                                          {isFlexible ? (
                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: '#fdf4ff', color: '#7c3aed' }}>
                                              Flexible
                                            </span>
                                          ) : (
                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: '#eff6ff', color: '#1e40af' }}>
                                              In-House
                                            </span>
                                          )}
                                        </td>
                                        <td>{g.totalPieces.toLocaleString()}</td>
                                        <td>PKR {g.gross.toLocaleString()}</td>
                                        <td><PayStatusBadge status={g.status} /></td>
                                        <td onClick={e => e.stopPropagation()}>
                                          {!isFlexible && (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                              {g.status === 'Pending' && (
                                                <button
                                                  className="btn btn-small"
                                                  style={{ background: '#3b82f6', color: 'white', whiteSpace: 'nowrap' }}
                                                  onClick={() => handleVerify(g.code)}
                                                  disabled={!!payActing[g.code]}
                                                >
                                                  {payActing[g.code] ? '...' : 'Verify'}
                                                </button>
                                              )}
                                              {g.status === 'Verified' && (
                                                <button
                                                  className="btn btn-small"
                                                  style={{ background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                                                  onClick={() => handleMarkPaid(g.code)}
                                                  disabled={!!payActing[g.code]}
                                                >
                                                  {payActing[g.code] ? '...' : 'Mark Paid'}
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                      {expandedRow === expandKey && g.entries.map(e => {
                                        const po = pos.find(p => p.po_number === e.po_number);
                                        return (
                                          <tr key={e.id} style={{ background: '#fafbff' }}>
                                            <td style={{ paddingLeft: '32px', color: '#888', fontSize: '13px' }}>
                                              {e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}
                                              &nbsp;·&nbsp;{e.po_number}
                                            </td>
                                            <td style={{ fontSize: '13px', color: '#555' }}>{po?.collection_name || '—'}</td>
                                            <td style={{ fontSize: '13px', color: '#555' }}>{e.department}</td>
                                            <td style={{ fontSize: '13px' }}>{e.qty_claimed}</td>
                                            <td style={{ fontSize: '13px' }}>PKR {Number(e.amount || 0).toLocaleString()}</td>
                                            <td><PayStatusBadge status={e.payment_status} /></td>
                                            <td>
                                              {isFlexible && e.payment_status !== 'Paid' && (
                                                <button
                                                  className="btn btn-small"
                                                  style={{ background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                                                  onClick={() => handleMarkPaidFlexible(e.id)}
                                                  disabled={!!payActing[e.id]}
                                                >
                                                  {payActing[e.id] ? '...' : 'Mark Paid'}
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── Advances sub-tab ────────────────────────────────────────── */}
            {paySubTab === 'advances' && (
              <>
                <div className="card">
                  <h3>Log Advance</h3>
                  <form onSubmit={handleAdvanceSubmit}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Stitcher *</label>
                        <select name="stitcher_code" value={advForm.stitcher_code} onChange={handleAdvanceChange} required>
                          <option value="">Select stitcher...</option>
                          {stitchers.map(s => (
                            <option key={s.stitcher_code} value={s.stitcher_code}>
                              {s.stitcher_code} — {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Amount (PKR) *</label>
                        <input
                          type="number"
                          name="amount"
                          value={advForm.amount}
                          onChange={handleAdvanceChange}
                          min="1"
                          required
                          placeholder="Enter amount"
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Note</label>
                        <input
                          type="text"
                          name="note"
                          value={advForm.note}
                          onChange={handleAdvanceChange}
                          placeholder="Optional note"
                        />
                      </div>
                    </div>
                    {advMsg && (
                      <div className={`alert alert-${advMsg.type === 'error' ? 'error' : 'success'}`} style={{ marginTop: '8px' }}>
                        {advMsg.text}
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={advSubmitting} style={{ marginTop: '8px', maxWidth: '200px' }}>
                      {advSubmitting ? 'Logging...' : 'Log Advance'}
                    </button>
                  </form>
                </div>

                <div className="card">
                  <h3>
                    Advances — Week of {payWeek}
                  </h3>
                  {payLoading ? (
                    <div className="loading"><div className="spinner" />Loading...</div>
                  ) : weekAdvances.length === 0 ? (
                    <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No advances logged for this week.</p>
                  ) : (
                    <>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Stitcher</th>
                              <th>Amount (PKR)</th>
                              <th>Note</th>
                              <th>Added By</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {weekAdvances.map(a => (
                              <tr key={a.id}>
                                <td>{a.stitcher_code}</td>
                                <td>{a.stitcher_name}</td>
                                <td>PKR {Number(a.amount || 0).toLocaleString()}</td>
                                <td>{a.note || '—'}</td>
                                <td>{a.added_by}</td>
                                <td>{a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: '12px', padding: '10px 16px', background: '#f0fdf4', borderRadius: '8px', textAlign: 'right' }}>
                        <span style={{ fontWeight: '700', color: '#16a34a', fontSize: '15px' }}>
                          Total advances this week: PKR {weekAdvances.reduce((s, a) => s + Number(a.amount || 0), 0).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <PoweredByFintrack />
      </div>

      {renderRateModal()}
    </div>
  );
}

export default AccountsView;
