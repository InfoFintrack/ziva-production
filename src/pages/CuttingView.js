/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import { submitAcceptance, getRecords, getDropdowns, getPOs, submitCMTRate, getCMTRates, approveCMTRate, getStitchers, createStitcher } from '../api';

// ── CMT Rate form constants ──────────────────────────────────────────────────

const ALL_RATE_KEYS = [
  'cutting', 'shirt', 'trouser', 'dupatta', 'patching',
  'fs_clipping', 'fs_heming', 'fs_tussling', 'fs_pressing',
  'ft_clipping', 'ft_heming', 'ft_pressing', 'ft_patching',
  'fd_heming', 'fd_tussling', 'fd_pressing', 'fd_patching',
  'quality_packing',
];

const EMPTY_CMT_FORM = {
  po_number: '',
  color_design: '',
  remarks: '',
  cutting: '', shirt: '', trouser: '', dupatta: '', patching: '',
  fs_clipping: '', fs_heming: '', fs_tussling: '', fs_pressing: '',
  ft_clipping: '', ft_heming: '', ft_pressing: '', ft_patching: '',
  fd_heming: '', fd_tussling: '', fd_pressing: '', fd_patching: '',
  quality_packing: '',
};

const SEC_B = [
  { key: 'cutting',  label: 'Cutting' },
  { key: 'shirt',    label: 'Shirt' },
  { key: 'trouser',  label: 'Trouser' },
  { key: 'dupatta',  label: 'Dupatta' },
  { key: 'patching', label: 'Patching' },
];

const SEC_C_SHIRT   = [
  { key: 'fs_clipping', label: 'Clipping' },
  { key: 'fs_heming',   label: 'Heming' },
  { key: 'fs_tussling', label: 'Tussling' },
  { key: 'fs_pressing', label: 'Pressing' },
];
const SEC_C_TROUSER = [
  { key: 'ft_clipping', label: 'Clipping' },
  { key: 'ft_heming',   label: 'Heming' },
  { key: 'ft_pressing', label: 'Pressing' },
  { key: 'ft_patching', label: 'Patching' },
];
const SEC_C_DUPATTA = [
  { key: 'fd_heming',   label: 'Heming' },
  { key: 'fd_tussling', label: 'Tussling' },
  { key: 'fd_pressing', label: 'Pressing' },
  { key: 'fd_patching', label: 'Patching' },
];

// ── Stitcher constants ───────────────────────────────────────────────────────
const PHONE_REGEX = /^\d{4}-\d{7}$/;
const SPECIALIZATIONS = ['Shirt', 'Trouser', 'Dupatta', 'Mixed'];


const EMPTY_STITCHER_FORM = {
  name: '', phone: '', cnic: '', specialization: '', date_joined: '',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const sectionHeader = (text) => (
  <div style={{
    marginTop: '24px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '2px solid #f0f2f5',
  }}>
    <p style={{
      fontSize: '13px',
      fontWeight: '700',
      color: '#0f3460',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: 0,
    }}>
      {text}
    </p>
  </div>
);

const subHeader = (text) => (
  <p style={{
    fontSize: '12px',
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginTop: '16px',
    marginBottom: '8px',
  }}>
    {text}
  </p>
);

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

// ── Component ────────────────────────────────────────────────────────────────

function CuttingView({ user, onLogout }) {
  // ── Existing acceptance state (unchanged) ──────────────────────────────
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [dropdowns, setDropdowns] = useState({ fabricConditions: [] });
  const [form, setForm] = useState({
    qtyReceived: '',
    fabricCondition: '',
    acceptanceRemarks: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [tab, setTab] = useState('pending');

  // ── Top-level tab state ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('acceptance');

  // ── CMT Rates state ────────────────────────────────────────────────────
  const [activePOs, setActivePOs] = useState([]);
  const [posLoadError, setPosLoadError] = useState(null);
  const [cmtForm, setCMTForm] = useState(EMPTY_CMT_FORM);
  const [colorDesignLocked, setColorDesignLocked] = useState(false);
  const [cmtSubmitting, setCMTSubmitting] = useState(false);
  const [cmtMessage, setCMTMessage] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [editingRateId, setEditingRateId] = useState(null);
  const cmtFormRef = useRef(null);

  // ── Stitchers state ────────────────────────────────────────────────────
  const [stitchers, setStitchers] = useState([]);
  const [stitchersLoading, setStitchersLoading] = useState(false);
  const [stitcherForm, setStitcherForm] = useState(EMPTY_STITCHER_FORM);
  const [stitcherSubmitting, setStitcherSubmitting] = useState(false);
  const [stitcherMessage, setStitcherMessage] = useState(null);
  const [stitcherPhoneError, setStitcherPhoneError] = useState('');
  const [stitcherSearch, setStitcherSearch] = useState('');
  const [stitcherStatusFilter, setStitcherStatusFilter] = useState('Active');

  // ── Data loaders ───────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
    loadActivePOs();
    loadSubmissions();
    loadStitchers();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recordsRes, dropdownsRes] = await Promise.all([
        getRecords(),
        getDropdowns()
      ]);
      if (recordsRes.success) {
        setRecords(recordsRes.records.reverse());
      }
      if (dropdownsRes.success) {
        setDropdowns({ fabricConditions: dropdownsRes.fabricConditions });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load records.' });
    }
    setLoading(false);
  };

  const loadActivePOs = async () => {
    setPosLoadError(null);
    try {
      const res = await getPOs();
      if (res.success) {
        setActivePOs(res.pos.filter(p => p.status === 'Active'));
      } else {
        setPosLoadError('Failed to load POs. Please refresh the page.');
      }
    } catch {
      setPosLoadError('Failed to load POs. Please refresh the page.');
    }
  };

  const loadSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const res = await getCMTRates();
      if (res.success) {
        // API has no ?submitted_by= filter — filter client-side by name
        setSubmissions(res.rates.filter(r => r.submitted_by === user.name));
      }
    } catch {
      // silently fail — table will remain empty
    }
    setSubmissionsLoading(false);
  };

  // ── Existing acceptance handlers (unchanged) ───────────────────────────

  const pendingRecords   = records.filter(r => r.Issue_Status === 'Issued' && !r.Acceptance_Status && r.Receiving_Vendor === 'Cutting');
  const completedRecords = records.filter(r => r.Acceptance_Status);
  const historyRecords   = records.filter(r => r.Accepted_By === user.name);

  const handleSelect = (record) => {
    setSelectedRecord(record);
    setForm({ qtyReceived: '', fabricCondition: '', acceptanceRemarks: '' });
    setMessage(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const getDiscrepancyPreview = () => {
    if (!selectedRecord || !form.qtyReceived) return null;
    const diff = Number(selectedRecord.Qty_Issued) - Number(form.qtyReceived);
    return diff;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.qtyReceived || !form.fabricCondition) {
      setMessage({ type: 'error', text: 'Please fill all required fields.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitAcceptance({
        recordId: selectedRecord.Record_ID,
        qtyReceived: form.qtyReceived,
        fabricCondition: form.fabricCondition,
        acceptanceRemarks: form.acceptanceRemarks,
        acceptedBy: user.name
      });
      if (result.success) {
        let msg = `✓ Accepted successfully!`;
        if (result.discrepancy > 0) {
          msg = `⚠ Accepted with discrepancy of ${result.discrepancy} ${selectedRecord.Unit}. Status: ${result.acceptanceStatus}`;
        }
        setMessage({ type: result.discrepancy > 0 ? 'warning' : 'success', text: msg });
        setSelectedRecord(null);
        loadData();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setSubmitting(false);
  };

  const getStatusBadge = (status) => {
    const map = {
      'Issued': 'badge-issued',
      'Accepted': 'badge-accepted',
      'Partial': 'badge-partial',
      'Rejected': 'badge-rejected'
    };
    return `badge ${map[status] || 'badge-pending'}`;
  };

  const discrepancyPreview = getDiscrepancyPreview();

  // ── CMT Rates handlers ─────────────────────────────────────────────────

  const handlePOSelect = (e) => {
    const val = e.target.value;
    const selected = activePOs.find(p => p.po_number === val);
    if (selected) {
      const hasColor = !!selected.color_design;
      setCMTForm(prev => ({
        ...prev,
        po_number: val,
        color_design: selected.color_design || '',
      }));
      setColorDesignLocked(hasColor);
    } else {
      setCMTForm(prev => ({ ...prev, po_number: val, color_design: '' }));
      setColorDesignLocked(false);
    }
  };

  const handleCMTChange = (e) => {
    const { name, value } = e.target;
    setCMTForm(prev => ({ ...prev, [name]: value }));
  };

  // Live total — recalculated on every render from current cmtForm
  const cmtTotal = ALL_RATE_KEYS.reduce(
    (sum, k) => sum + (Number(cmtForm[k]) || 0),
    0
  );

  const handleEditRate = (r) => {
    const prefilledForm = {
      po_number:    r.po_number,
      color_design: r.color_design || '',
      remarks:      r.remarks || '',
    };
    ALL_RATE_KEYS.forEach(k => {
      prefilledForm[k] = r[k] != null ? String(r[k]) : '0';
    });
    setCMTForm(prefilledForm);
    setColorDesignLocked(!!r.color_design);
    setEditingRateId(r.id);
    setCMTMessage(null);
    if (cmtFormRef.current) {
      cmtFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCancelEdit = () => {
    setEditingRateId(null);
    setCMTForm(EMPTY_CMT_FORM);
    setColorDesignLocked(false);
    setCMTMessage(null);
  };

  const handleCMTSubmit = async (e) => {
    e.preventDefault();
    if (!cmtForm.po_number) {
      setCMTMessage({ type: 'error', text: 'PO Number is required.' });
      return;
    }
    const hasAnyRate = ALL_RATE_KEYS.some(k => Number(cmtForm[k]) > 0);
    if (!hasAnyRate) {
      setCMTMessage({ type: 'error', text: 'At least one rate field must be greater than 0.' });
      return;
    }

    setCMTSubmitting(true);
    setCMTMessage(null);

    try {
      if (editingRateId) {
        const payload = { id: editingRateId, action: 'resubmit', color_design: cmtForm.color_design || null };
        ALL_RATE_KEYS.forEach(k => { payload[k] = cmtForm[k] !== '' ? Number(cmtForm[k]) : 0; });
        const res = await approveCMTRate(payload);
        if (res.success) {
          setCMTMessage({ type: 'success', text: '✓ CMT rates updated and resubmitted for Accounts review.' });
          setCMTForm(EMPTY_CMT_FORM);
          setColorDesignLocked(false);
          setEditingRateId(null);
          loadSubmissions();
        } else {
          setCMTMessage({ type: 'error', text: res.message || 'Update failed.' });
        }
      } else {
        const payload = {
          po_number:    cmtForm.po_number,
          color_design: cmtForm.color_design || undefined,
          remarks:      cmtForm.remarks      || undefined,
          status:       'Pending_Accounts',
        };
        ALL_RATE_KEYS.forEach(k => { payload[k] = cmtForm[k] !== '' ? Number(cmtForm[k]) : 0; });
        const res = await submitCMTRate(payload);
        if (res.success) {
          setCMTMessage({
            type: 'success',
            text: `✓ CMT rates for ${cmtForm.po_number} submitted successfully. Pending Accounts review.`,
          });
          setCMTForm(EMPTY_CMT_FORM);
          setColorDesignLocked(false);
          loadSubmissions();
        } else {
          setCMTMessage({ type: 'error', text: res.message || 'Submission failed.' });
        }
      }
    } catch {
      setCMTMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setCMTSubmitting(false);
  };

  // ── Stitcher handlers ──────────────────────────────────────────────────

  const loadStitchers = async () => {
    setStitchersLoading(true);
    try {
      const res = await getStitchers();
      if (res.success) setStitchers(res.stitchers);
    } catch { /* silently fail */ }
    setStitchersLoading(false);
  };

  const handleStitcherFormChange = (e) => {
    const { name, value } = e.target;
    setStitcherForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = digits.slice(0, 4) + '-' + digits.slice(4);
    }
    setStitcherForm(prev => ({ ...prev, phone: formatted }));
    if (stitcherPhoneError) setStitcherPhoneError('');
  };

  const handleCNICChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
    let formatted = digits;
    if (digits.length > 5) {
      formatted = digits.slice(0, 5) + '-' + digits.slice(5);
    }
    if (digits.length > 12) {
      formatted = digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12);
    }
    setStitcherForm(prev => ({ ...prev, cnic: formatted }));
  };

  const handleStitcherSubmit = async (e) => {
    e.preventDefault();
    // Phone validation
    if (!stitcherForm.phone || !PHONE_REGEX.test(stitcherForm.phone)) {
      setStitcherPhoneError('Phone number required in format XXXX-XXXXXXX');
      return;
    }
    setStitcherSubmitting(true);
    setStitcherMessage(null);
    try {
      const res = await createStitcher({
        name:           stitcherForm.name,
        phone:          stitcherForm.phone,
        cnic:           stitcherForm.cnic  || undefined,
        specialization: stitcherForm.specialization,
        date_joined:    stitcherForm.date_joined || undefined,
      });
      if (res.success) {
        setStitcherMessage({ type: 'success', text: `✓ Stitcher ${res.stitcher.stitcher_code} — ${res.stitcher.name} added successfully.` });
        setStitcherForm(EMPTY_STITCHER_FORM);
        setStitcherPhoneError('');
        loadStitchers();
      } else {
        setStitcherMessage({ type: 'error', text: res.message || 'Failed to add stitcher.' });
      }
    } catch {
      setStitcherMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setStitcherSubmitting(false);
  };

  const filteredStitchers = stitchers.filter(s => {
    const matchSearch = !stitcherSearch.trim() ||
      s.name?.toLowerCase().includes(stitcherSearch.toLowerCase()) ||
      s.stitcher_code?.toLowerCase().includes(stitcherSearch.toLowerCase());
    const matchStatus = stitcherStatusFilter === 'All' || s.status === stitcherStatusFilter;
    return matchSearch && matchStatus;
  });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <h2>ZIVA — Fabric Acceptance</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Cutting Department</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">

        {/* ── TOP-LEVEL TAB SWITCHER (PPView.js pattern) ──────────────── */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: '2px solid #e8e8e8',
        }}>
          {[
            { key: 'acceptance', label: 'Fabric Acceptance' },
            { key: 'cmt',        label: 'CMT Rates' },
            { key: 'stitchers',  label: 'Stitchers' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 24px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: activeTab === t.key ? '#0f3460' : '#888',
                borderBottom: activeTab === t.key
                  ? '3px solid #0f3460'
                  : '3px solid transparent',
                marginBottom: '-2px',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: FABRIC ACCEPTANCE (existing content, untouched) ───── */}
        {activeTab === 'acceptance' && (
          <>
            {message && !selectedRecord && (
              <div className={`alert alert-${message.type}`}>{message.text}</div>
            )}

            {/* ACCEPTANCE FORM */}
            {selectedRecord && (
              <div className="card">
                <h3>Accept Fabric — {selectedRecord.Record_ID}</h3>

                {message && (
                  <div className={`alert alert-${message.type}`}>{message.text}</div>
                )}

                {/* READ ONLY PP DETAILS */}
                <div style={{
                  background: '#f8f9ff',
                  border: '1px solid #e0e7ff',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f3460', marginBottom: '12px', textTransform: 'uppercase' }}>
                    Issued By PP Department — Read Only
                  </p>
                  <div className="form-grid">
                    {[
                      ['PO Number', selectedRecord.PO_Number],
                      ['Lot Number', selectedRecord.Lot_Number],
                      ['Garment Type', selectedRecord.Garment_Type],
                      ['Fabric Name', selectedRecord.Fabric_Name],
                      ['Fabric Color', selectedRecord.Fabric_Color],
                      ['No. of Thaan', selectedRecord.No_of_Thaan],
                      ['Qty Issued', `${selectedRecord.Qty_Issued} ${selectedRecord.Unit}`],
                      ['Issued By', selectedRecord.Issued_By],
                      ['Accessories', (() => {
                        try {
                          const items = selectedRecord.Accessories ? JSON.parse(selectedRecord.Accessories) : [];
                          return items.length > 0
                            ? items.map(a => `${a.type}: ${a.qty} ${a.unit}`).join(', ')
                            : 'None';
                        } catch { return 'None'; }
                      })()],
                      ['Laces', (() => {
                        try {
                          const items = selectedRecord.Laces ? JSON.parse(selectedRecord.Laces) : [];
                          return items.length > 0
                            ? items.map(l => `${l.laceType}: ${l.qty} ${l.unit}`).join(', ')
                            : 'None';
                        } catch { return 'None'; }
                      })()],
                    ].map(([label, value]) => (
                      <div className="form-group" key={label}>
                        <label>{label}</label>
                        <input type="text" value={value || '—'} disabled className="auto-field" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* CUTTING FIELDS */}
                <form onSubmit={handleSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Qty Received *</label>
                      <input
                        type="number"
                        name="qtyReceived"
                        placeholder={`Expected: ${selectedRecord.Qty_Issued}`}
                        value={form.qtyReceived}
                        onChange={handleChange}
                        min="0"
                      />
                    </div>

                    <div className="form-group">
                      <label>Discrepancy</label>
                      <input
                        type="text"
                        value={
                          discrepancyPreview === null ? 'Fill qty received' :
                          discrepancyPreview === 0 ? '✓ No discrepancy' :
                          `⚠ ${discrepancyPreview} ${selectedRecord.Unit} short`
                        }
                        disabled
                        className="auto-field"
                        style={{
                          color: discrepancyPreview > 0 ? '#e74c3c' :
                                 discrepancyPreview === 0 ? '#2ecc71' : '#0f3460'
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Fabric Condition *</label>
                      <select
                        name="fabricCondition"
                        value={form.fabricCondition}
                        onChange={handleChange}
                      >
                        <option value="">Select condition</option>
                        {dropdowns.fabricConditions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Remarks</label>
                      <input
                        type="text"
                        name="acceptanceRemarks"
                        placeholder="Required if discrepancy exists"
                        value={form.acceptanceRemarks}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button
                      type="submit"
                      className="btn btn-success"
                      disabled={submitting}
                      style={{ flex: 1 }}
                    >
                      {submitting ? 'Submitting...' : 'Confirm Acceptance'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setSelectedRecord(null)}
                      style={{ flex: 1 }}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TABS */}
            <div className="card">
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button
                  className={`btn btn-small ${tab === 'pending' ? 'btn-primary' : ''}`}
                  onClick={() => setTab('pending')}
                  style={{ width: 'auto', background: tab === 'pending' ? '#0f3460' : '#e0e7ff', color: tab === 'pending' ? 'white' : '#0f3460' }}
                >
                  Pending ({pendingRecords.length})
                </button>
                <button
                  className={`btn btn-small`}
                  onClick={() => setTab('completed')}
                  style={{ width: 'auto', background: tab === 'completed' ? '#0f3460' : '#e0e7ff', color: tab === 'completed' ? 'white' : '#0f3460' }}
                >
                  Completed ({completedRecords.length})
                </button>
                <button
                  className={`btn btn-small`}
                  onClick={() => setTab('history')}
                  style={{ width: 'auto', background: tab === 'history' ? '#0f3460' : '#e0e7ff', color: tab === 'history' ? 'white' : '#0f3460' }}
                >
                  My History ({historyRecords.length})
                </button>
                <button
                  className="btn btn-small"
                  onClick={loadData}
                  style={{ width: 'auto', background: '#f0f2f5', color: '#333', marginLeft: 'auto' }}
                >
                  ↻ Refresh
                </button>
              </div>

              {loading ? (
                <div className="loading">
                  <div className="spinner"></div>
                  Loading records...
                </div>
              ) : tab === 'pending' ? (
                pendingRecords.length === 0 ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                    No pending records. All fabric accounted for.
                  </p>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Record ID</th>
                          <th>Date</th>
                          <th>PO</th>
                          <th>Lot</th>
                          <th>Fabric</th>
                          <th>Qty Issued</th>
                          <th>Issued By</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRecords.map((r, i) => (
                          <tr key={i}>
                            <td>{r.Record_ID}</td>
                            <td>{r.Issue_Date}</td>
                            <td>{r.PO_Number}</td>
                            <td>{r.Lot_Number}</td>
                            <td>{r.Fabric_Name} — {r.Fabric_Color}</td>
                            <td>{r.Qty_Issued} {r.Unit}</td>
                            <td>{r.Issued_By}</td>
                            <td>
                              <button
                                className="btn btn-success btn-small"
                                onClick={() => handleSelect(r)}
                              >
                                Accept
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : tab === 'completed' ? (
                completedRecords.length === 0 ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                    No completed records yet.
                  </p>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Record ID</th>
                          <th>Date</th>
                          <th>PO</th>
                          <th>Lot</th>
                          <th>Qty Issued</th>
                          <th>Qty Received</th>
                          <th>Discrepancy</th>
                          <th>Condition</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedRecords.map((r, i) => (
                          <tr key={i}>
                            <td>{r.Record_ID}</td>
                            <td>{r.Issue_Date ? new Date(r.Issue_Date).toLocaleDateString('en-GB') : '—'}</td>
                            <td>{r.PO_Number}</td>
                            <td>{r.Lot_Number}</td>
                            <td>{r.Qty_Issued}</td>
                            <td>{r.Qty_Received}</td>
                            <td className={Number(r.Discrepancy) > 0 ? 'discrepancy-flag' : ''}>
                              {Number(r.Discrepancy) > 0 ? `⚠ ${r.Discrepancy}` : '✓ 0'}
                            </td>
                            <td>{r.Fabric_Condition}</td>
                            <td>
                              <span className={getStatusBadge(r.Acceptance_Status)}>
                                {r.Acceptance_Status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                historyRecords.length === 0 ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                    No records accepted by you yet.
                  </p>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Record ID</th>
                          <th>Date</th>
                          <th>PO</th>
                          <th>Lot</th>
                          <th>Qty Issued</th>
                          <th>Qty Received</th>
                          <th>Discrepancy</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRecords.map((r, i) => (
                          <tr key={i}>
                            <td>{r.Record_ID}</td>
                            <td>{r.Issue_Date ? new Date(r.Issue_Date).toLocaleDateString('en-GB') : '—'}</td>
                            <td>{r.PO_Number}</td>
                            <td>{r.Lot_Number}</td>
                            <td>{r.Qty_Issued} {r.Unit}</td>
                            <td>{r.Qty_Received} {r.Unit}</td>
                            <td className={Number(r.Discrepancy) > 0 ? 'discrepancy-flag' : ''}>
                              {Number(r.Discrepancy) > 0 ? `⚠ ${r.Discrepancy}` : '✓ 0'}
                            </td>
                            <td>
                              <span className={getStatusBadge(r.Acceptance_Status)}>
                                {r.Acceptance_Status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* ── TAB 2: CMT RATES ────────────────────────────────────────── */}
        {activeTab === 'cmt' && (
          <>
            {/* SUBMIT RATES FORM */}
            <div className="card" ref={cmtFormRef}>
              <h3>{editingRateId ? 'Edit CMT Rates' : 'Submit CMT Rates'}</h3>

              {cmtMessage && (
                <div className={`alert alert-${cmtMessage.type}`}>
                  {cmtMessage.text}
                </div>
              )}

              {posLoadError && (
                <div className="alert alert-error">{posLoadError}</div>
              )}

              <form onSubmit={handleCMTSubmit}>

                {/* SECTION A — HEADER */}
                {sectionHeader('Section A — Header')}

                <div className="form-grid">
                  <div className="form-group">
                    <label>PO Number *</label>
                    {editingRateId ? (
                      <input
                        type="text"
                        value={cmtForm.po_number}
                        disabled
                        className="auto-field"
                      />
                    ) : (
                      <select
                        name="po_number"
                        value={cmtForm.po_number}
                        onChange={handlePOSelect}
                      >
                        <option value="">Select active PO</option>
                        {activePOs.map(p => (
                          <option key={p.po_number} value={p.po_number}>
                            {p.po_number}{p.buyer_name ? ` — ${p.buyer_name}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Color / Design</label>
                    <input
                      type="text"
                      name="color_design"
                      placeholder="e.g. Black Karundi"
                      value={cmtForm.color_design}
                      onChange={handleCMTChange}
                      disabled={colorDesignLocked}
                      className={colorDesignLocked ? 'auto-field' : ''}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Remarks</label>
                    <textarea
                      name="remarks"
                      placeholder="Optional notes"
                      value={cmtForm.remarks}
                      onChange={handleCMTChange}
                      rows={2}
                    />
                  </div>
                </div>

                {/* SECTION B — CUTTING & STITCHING RATES */}
                {sectionHeader('Section B — Cutting & Stitching Rates')}

                <div className="form-grid">
                  {SEC_B.map(({ key, label }) => (
                    <div className="form-group" key={key}>
                      <label>{label} (PKR)</label>
                      <input
                        type="number"
                        name={key}
                        placeholder="0"
                        value={cmtForm[key]}
                        onChange={handleCMTChange}
                        min="0"
                      />
                    </div>
                  ))}
                </div>

                {/* SECTION C — FINISHING RATES */}
                {sectionHeader('Section C — Finishing Rates')}

                {subHeader('Shirt Finishing')}
                <div className="form-grid">
                  {SEC_C_SHIRT.map(({ key, label }) => (
                    <div className="form-group" key={key}>
                      <label>{label} (PKR)</label>
                      <input
                        type="number"
                        name={key}
                        placeholder="0"
                        value={cmtForm[key]}
                        onChange={handleCMTChange}
                        min="0"
                      />
                    </div>
                  ))}
                </div>

                {subHeader('Trouser Finishing')}
                <div className="form-grid">
                  {SEC_C_TROUSER.map(({ key, label }) => (
                    <div className="form-group" key={key}>
                      <label>{label} (PKR)</label>
                      <input
                        type="number"
                        name={key}
                        placeholder="0"
                        value={cmtForm[key]}
                        onChange={handleCMTChange}
                        min="0"
                      />
                    </div>
                  ))}
                </div>

                {subHeader('Dupatta Finishing')}
                <div className="form-grid">
                  {SEC_C_DUPATTA.map(({ key, label }) => (
                    <div className="form-group" key={key}>
                      <label>{label} (PKR)</label>
                      <input
                        type="number"
                        name={key}
                        placeholder="0"
                        value={cmtForm[key]}
                        onChange={handleCMTChange}
                        min="0"
                      />
                    </div>
                  ))}
                </div>

                {/* SECTION D — OVERHEAD */}
                {sectionHeader('Section D — Overhead')}

                <div className="form-grid">
                  <div className="form-group">
                    <label>Quality & Packing (PKR)</label>
                    <input
                      type="number"
                      name="quality_packing"
                      placeholder="0"
                      value={cmtForm.quality_packing}
                      onChange={handleCMTChange}
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label>Total (PKR) — Auto</label>
                    <input
                      type="text"
                      value={cmtTotal.toLocaleString()}
                      disabled
                      className="auto-field"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={cmtSubmitting}
                    style={{ flex: 1 }}
                  >
                    {cmtSubmitting
                      ? (editingRateId ? 'Updating...' : 'Submitting...')
                      : (editingRateId ? 'Update & Resubmit' : 'Submit CMT Rates')}
                  </button>
                  {editingRateId && (
                    <button
                      type="button"
                      className="btn"
                      onClick={handleCancelEdit}
                      disabled={cmtSubmitting}
                      style={{ flex: 1, background: '#e0e7ff', color: '#0f3460' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* MY SUBMISSIONS TABLE */}
            <div className="card">
              <h3>My Submissions</h3>
              {submissionsLoading ? (
                <div className="loading">
                  <div className="spinner"></div>
                  Loading submissions...
                </div>
              ) : submissions.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  No submissions yet.
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>PO Number</th>
                        <th>Color / Design</th>
                        <th>Total (PKR)</th>
                        <th>Submitted Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((r, i) => {
                        const badge = getCMTStatusBadge(r.status);
                        const rejectionRemarks = r.accounts_remarks || r.ceo_remarks;
                        return (
                          <tr key={i}>
                            <td>{r.po_number}</td>
                            <td>{r.color_design || '—'}</td>
                            <td>{r.total != null ? Number(r.total).toLocaleString() : '—'}</td>
                            <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                            <td>
                              <span className={badge.cls} style={badge.style}>
                                {r.status}
                              </span>
                              {r.status === 'Rejected' && rejectionRemarks && (
                                <p style={{
                                  fontSize: '11px',
                                  color: '#dc2626',
                                  marginTop: '4px',
                                  fontStyle: 'italic',
                                  whiteSpace: 'normal',
                                }}>
                                  {rejectionRemarks}
                                </p>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn btn-small"
                                onClick={() => handleEditRate(r)}
                                style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB 3: STITCHERS ────────────────────────────────────────── */}
        {activeTab === 'stitchers' && (
          <>
            {/* ADD STITCHER FORM */}
            <div className="card">
              <h3>Add Stitcher</h3>

              {stitcherMessage && (
                <div className={`alert alert-${stitcherMessage.type}`}>{stitcherMessage.text}</div>
              )}

              <form onSubmit={handleStitcherSubmit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="Full name"
                      value={stitcherForm.name}
                      onChange={handleStitcherFormChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Phone *</label>
                    <input
                      type="text"
                      name="phone"
                      placeholder="0300-1234567"
                      value={stitcherForm.phone}
                      onChange={handlePhoneChange}
                      style={stitcherPhoneError ? { borderColor: '#dc2626' } : {}}
                    />
                    {stitcherPhoneError && (
                      <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>
                        {stitcherPhoneError}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label>CNIC</label>
                    <input
                      type="text"
                      name="cnic"
                      placeholder="00000-0000000-0"
                      value={stitcherForm.cnic}
                      onChange={handleCNICChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Specialization *</label>
                    <select
                      name="specialization"
                      value={stitcherForm.specialization}
                      onChange={handleStitcherFormChange}
                      required
                    >
                      <option value="">Select specialization</option>
                      {SPECIALIZATIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Date Joined</label>
                    <input
                      type="date"
                      name="date_joined"
                      value={stitcherForm.date_joined}
                      onChange={handleStitcherFormChange}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={stitcherSubmitting}
                  >
                    {stitcherSubmitting ? 'Adding...' : 'Add Stitcher'}
                  </button>
                </div>
              </form>
            </div>

            {/* STITCHERS TABLE */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>All Stitchers</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    value={stitcherSearch}
                    onChange={e => setStitcherSearch(e.target.value)}
                    style={{ padding: '7px 12px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '13px', width: '200px' }}
                  />
                  <select
                    value={stitcherStatusFilter}
                    onChange={e => setStitcherStatusFilter(e.target.value)}
                    style={{ padding: '7px 10px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '13px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="All">All</option>
                  </select>
                  <button
                    className="btn btn-small"
                    onClick={loadStitchers}
                    style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {stitchersLoading ? (
                <div className="loading"><div className="spinner"></div>Loading stitchers...</div>
              ) : filteredStitchers.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  {stitchers.length === 0 ? 'No stitchers yet.' : 'No results match your search.'}
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Specialization</th>
                        <th>Phone</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStitchers.map(s => (
                        <tr key={s.id}>
                          <td>{s.stitcher_code}</td>
                          <td>{s.name}</td>
                          <td>{s.specialization}</td>
                          <td>{s.phone}</td>
                          <td>
                            <span className={`badge ${s.status === 'Active' ? 'badge-accepted' : 'badge-rejected'}`}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default CuttingView;
