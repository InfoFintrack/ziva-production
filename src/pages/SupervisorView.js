/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getPOs, getCMTRates, getStitchers, getAllocations, createAllocation, updateAllocation, getPaymentEntries } from '../api';
import ProdFlowLogo from '../components/ProdFlowLogo';
import PoweredByFintrack from '../components/PoweredByFintrack';

const TODAY = new Date().toISOString().split('T')[0];
const COMPONENTS = ['Shirt', 'Trouser', 'Dupatta'];

const EMPTY_FORM = {
  allocation_date: TODAY,
  po_number: '',
  component: '',
  stitcher_code: '',
  qty_allocated: '',
  remarks: '',
};

const EMPTY_DELTA = {
  qty_returned_delta: '',
  qty_accepted_delta: '',
  qty_rework_delta:   '',
  qty_rejected_delta: '',
  remarks: '',
};

function validateDelta(df, alloc) {
  const deltaRet  = Number(df.qty_returned_delta  || 0);
  const deltaAcc  = Number(df.qty_accepted_delta  || 0);
  const deltaRwk  = Number(df.qty_rework_delta    || 0);
  const deltaRej  = Number(df.qty_rejected_delta  || 0);
  const existing  = Number(alloc.qty_returned     || 0);
  const allocated = Number(alloc.qty_allocated    || 0);

  if (deltaAcc + deltaRwk + deltaRej !== deltaRet) {
    return 'Accepted + Rework + Rejected must equal Additional Returned.';
  }
  if (existing + deltaRet > allocated) {
    return `Returned quantity would exceed allocated quantity (${allocated - existing} pieces remaining).`;
  }
  return '';
}

function rowBg(status) {
  if (status === 'Complete')   return '#f0fdf4';
  if (status === 'Overdue')    return '#fff7ed';
  return '#eff6ff';
}

function StatusBadge({ status }) {
  const display = status === 'Pending' ? 'In Progress' : status;
  const colors  = { Complete: '#16a34a', Overdue: '#f97316', 'In Progress': '#3b82f6' };
  const bg      = colors[display] || '#3b82f6';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
      fontWeight: '700', textTransform: 'uppercase', background: bg, color: 'white',
    }}>
      {display}
    </span>
  );
}

function SupervisorView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('new');

  // Dropdown data
  const [pos,         setPos]         = useState([]);
  const [approvedSet, setApprovedSet] = useState(new Set());
  const [stitchers,   setStitchers]   = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // New Allocation form
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [submitting,  setSubmitting]  = useState(false);
  const [formMsg,     setFormMsg]     = useState(null);

  // Live Tracker
  const [allocations,    setAllocations]    = useState([]);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [trackerMsg,     setTrackerMsg]     = useState(null);

  // Update modal
  const [updateModal, setUpdateModal] = useState(null);
  const [deltaForm,   setDeltaForm]   = useState(EMPTY_DELTA);
  const [modalError,  setModalError]  = useState('');
  const [saving,      setSaving]      = useState(false);

  // Stitcher Dashboard
  const [sdAllStitchers, setSdAllStitchers] = useState([]);
  const [sdStitcher,     setSdStitcher]     = useState('');
  const [sdDateFrom,     setSdDateFrom]     = useState('');
  const [sdDateTo,       setSdDateTo]       = useState('');
  const [sdLoading,      setSdLoading]      = useState(false);
  const [sdEntries,      setSdEntries]      = useState([]);
  const [sdLoaded,       setSdLoaded]       = useState(false);

  useEffect(() => {
    loadDropdowns();
    loadAllocations();
  }, []);

  const loadDropdowns = async () => {
    setDataLoading(true);
    try {
      const [posRes, ratesRes, stitchersRes] = await Promise.all([
        getPOs(),
        getCMTRates('?status=Approved'),
        getStitchers(true),
      ]);
      if (posRes.success)      setPos(posRes.pos);
      if (ratesRes.success)    setApprovedSet(new Set(ratesRes.rates.map(r => r.po_number)));
      if (stitchersRes.success) setStitchers(stitchersRes.stitchers);
    } catch { /* silently fail */ }
    setDataLoading(false);
  };

  const loadAllocations = async () => {
    setTrackerLoading(true);
    try {
      const res = await getAllocations();
      if (res.success) setAllocations(res.allocations);
    } catch { /* silently fail */ }
    setTrackerLoading(false);
  };

  // Load all stitchers lazily when dashboard tab is first opened
  useEffect(() => {
    if (activeTab === 'dashboard' && sdAllStitchers.length === 0) {
      getStitchers().then(r => { if (r.success) setSdAllStitchers(r.stitchers); }).catch(() => {});
    }
  }, [activeTab]);

  const sdHandleLoad = async () => {
    if (!sdStitcher) return;
    setSdLoading(true);
    setSdLoaded(false);
    try {
      let params = `?stitcher_name=${encodeURIComponent(sdStitcher)}`;
      if (sdDateFrom) params += `&date_from=${sdDateFrom}`;
      if (sdDateTo)   params += `&date_to=${sdDateTo}`;
      const res = await getPaymentEntries(params);
      setSdEntries(res.success ? res.payments.filter(e => e.stitcher_name === sdStitcher) : []);
    } catch {
      setSdEntries([]);
    }
    setSdLoading(false);
    setSdLoaded(true);
  };

  const sdHandleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...sdEntries].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    const totalQty    = sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0);
    const totalAmount = sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const wsData = [
      [`Stitcher: ${sdStitcher}`],
      [`Period: ${sdDateFrom || 'All'} to ${sdDateTo || 'All'}`],
      [`Generated: ${today}`],
      [],
      ['Date', 'PO Number', 'Collection', 'Component', 'Department', 'Operation', 'Qty Claimed', 'Rate (PKR)', 'Amount (PKR)'],
      ...sorted.map(e => {
        const po = pos.find(p => p.po_number === e.po_number);
        return [
          e.entry_date ? String(e.entry_date).slice(0, 10) : '',
          e.po_number,
          po?.collection_name || '—',
          e.component || '',
          e.department || '',
          e.operation  || '',
          Number(e.qty_claimed || 0),
          Number(e.rate        || 0),
          Number(e.amount      || 0),
        ];
      }),
      [],
      [`Total Pieces: ${totalQty}`, '', '', '', '', '', '', `Total Amount: PKR ${totalAmount.toLocaleString()}`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stitcher Performance');
    XLSX.writeFile(wb, `${sdStitcher.replace(/\s+/g, '_')}_Performance_${today}.xlsx`);
  };

  // Only Active POs that have at least one approved CMT rate
  const eligiblePOs = pos.filter(p => p.status === 'Active' && approvedSet.has(p.po_number));

  // ── Form handlers ────────────────────────────────────────────────────────────

  const handleFormChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (formMsg) setFormMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.po_number || !form.component || !form.stitcher_code || !form.qty_allocated) {
      setFormMsg({ type: 'error', text: 'All required fields must be filled.' });
      return;
    }
    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await createAllocation({
        po_number:       form.po_number,
        component:       form.component.toLowerCase(),
        stitcher_code:   form.stitcher_code,
        qty_allocated:   Number(form.qty_allocated),
        allocation_date: form.allocation_date || TODAY,
        ...(form.remarks ? { remarks: form.remarks } : {}),
      });
      if (res.success) {
        setFormMsg({ type: 'success', text: 'Allocation created successfully.' });
        setForm(EMPTY_FORM);
        loadAllocations();
      } else {
        setFormMsg({ type: 'error', text: res.message || 'Failed to create allocation.' });
      }
    } catch {
      setFormMsg({ type: 'error', text: 'Network error. Please try again.' });
    }
    setSubmitting(false);
  };

  // ── Tracker filtering ────────────────────────────────────────────────────────

  const filtered = allocations.filter(a => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (a.po_number     || '').toLowerCase().includes(term) ||
      (a.stitcher_name || '').toLowerCase().includes(term);
    const displayStatus = a.status === 'Pending' ? 'In Progress' : a.status;
    const matchStatus   = statusFilter === 'All' || displayStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Update modal ─────────────────────────────────────────────────────────────

  const openUpdate = (a) => {
    setUpdateModal(a);
    setDeltaForm(EMPTY_DELTA);
    setModalError('');
  };

  const closeModal = () => {
    setUpdateModal(null);
    setModalError('');
  };

  const handleDeltaChange = (e) => {
    const updated = { ...deltaForm, [e.target.name]: e.target.value };
    setDeltaForm(updated);
    if (updateModal) setModalError(validateDelta(updated, updateModal));
  };

  const handleModalSave = async () => {
    const err = validateDelta(deltaForm, updateModal);
    if (err) { setModalError(err); return; }

    setSaving(true);
    try {
      const res = await updateAllocation({
        id:                  updateModal.id,
        qty_returned_delta:  Number(deltaForm.qty_returned_delta  || 0),
        qty_accepted_delta:  Number(deltaForm.qty_accepted_delta  || 0),
        qty_rework_delta:    Number(deltaForm.qty_rework_delta    || 0),
        qty_rejected_delta:  Number(deltaForm.qty_rejected_delta  || 0),
        ...(deltaForm.remarks ? { remarks: deltaForm.remarks } : {}),
      });
      if (res.success) {
        closeModal();
        setTrackerMsg({ type: 'success', text: 'Allocation updated successfully.' });
        loadAllocations();
        setTimeout(() => setTrackerMsg(null), 4000);
      } else {
        setModalError(res.message || 'Failed to update allocation.');
      }
    } catch {
      setModalError('Network error. Please try again.');
    }
    setSaving(false);
  };

  // ── Running totals (based on filtered rows) ──────────────────────────────────

  const totalsMap = {};
  filtered.forEach(a => {
    const key = a.stitcher_name || a.stitcher_code || 'Unknown';
    if (!totalsMap[key]) totalsMap[key] = { stitcher: key, allocated: 0, accepted: 0, rework: 0, rejected: 0, remaining: 0 };
    const rem = a.qty_remaining != null
      ? Number(a.qty_remaining)
      : Number(a.qty_allocated || 0) - Number(a.qty_returned || 0);
    totalsMap[key].allocated += Number(a.qty_allocated || 0);
    totalsMap[key].accepted  += Number(a.qty_accepted  || 0);
    totalsMap[key].rework    += Number(a.qty_rework    || 0);
    totalsMap[key].rejected  += Number(a.qty_rejected  || 0);
    totalsMap[key].remaining += rem;
  });
  const totalsRows = Object.values(totalsMap);

  // ── Tab styles ───────────────────────────────────────────────────────────────

  const tabStyle = (tab) => ({
    padding: '12px 28px',
    border: 'none',
    borderBottom: activeTab === tab ? '3px solid #0f3460' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: activeTab === tab ? '700' : '500',
    color: activeTab === tab ? '#0f3460' : '#888',
    fontSize: '15px',
    transition: 'all 0.15s',
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <ProdFlowLogo height={32} />
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Supervisor</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: '1200px' }}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', background: 'white', borderRadius: '12px 12px 0 0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '2px', padding: '0 8px',
        }}>
          <button style={tabStyle('new')}       onClick={() => setActiveTab('new')}>New Allocation</button>
          <button style={tabStyle('tracker')}   onClick={() => setActiveTab('tracker')}>Live Tracker</button>
          <button style={tabStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>Stitcher Dashboard</button>
        </div>

        {/* ── Tab 1: New Allocation ─────────────────────────────────────────── */}
        {activeTab === 'new' && (
          <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
            <h3>New Allocation</h3>

            {dataLoading ? (
              <div className="loading"><div className="spinner" />Loading dropdowns...</div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-grid">

                  <div className="form-group">
                    <label>Allocation Date *</label>
                    <input
                      type="date"
                      name="allocation_date"
                      value={form.allocation_date}
                      onChange={handleFormChange}
                      max={TODAY}
                    />
                  </div>

                  <div className="form-group">
                    <label>Component *</label>
                    <select name="component" value={form.component} onChange={handleFormChange} required>
                      <option value="">Select component...</option>
                      {COMPONENTS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>PO Number *</label>
                    <select name="po_number" value={form.po_number} onChange={handleFormChange} required>
                      <option value="">Select PO...</option>
                      {eligiblePOs.length === 0
                        ? <option disabled value="">No POs with approved rates available</option>
                        : eligiblePOs.map(p => (
                            <option key={p.po_number} value={p.po_number}>
                              {p.po_number} — {p.collection_name}
                            </option>
                          ))
                      }
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Stitcher *</label>
                    <select name="stitcher_code" value={form.stitcher_code} onChange={handleFormChange} required>
                      <option value="">Select stitcher...</option>
                      {stitchers.map(s => (
                        <option key={s.stitcher_code} value={s.stitcher_code}>
                          {s.stitcher_code} — {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Qty Allocated *</label>
                    <input
                      type="number"
                      name="qty_allocated"
                      value={form.qty_allocated}
                      onChange={handleFormChange}
                      min="1"
                      required
                      placeholder="Enter quantity (pieces)"
                    />
                  </div>

                  <div className="form-group">
                    <label>Remarks</label>
                    <input
                      type="text"
                      name="remarks"
                      value={form.remarks}
                      onChange={handleFormChange}
                      placeholder="Optional notes"
                    />
                  </div>

                </div>

                {formMsg && (
                  <div className={`alert alert-${formMsg.type === 'error' ? 'error' : 'success'}`}
                       style={{ marginTop: '8px' }}>
                    {formMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ marginTop: '8px' }}
                >
                  {submitting ? 'Creating...' : 'Create Allocation'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Tab 2: Live Tracker ───────────────────────────────────────────── */}
        {activeTab === 'tracker' && (
          <>
            <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>

              {/* Controls */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Search by PO or stitcher name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    flex: '1', minWidth: '200px', padding: '10px 14px',
                    border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '14px',
                  }}
                />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '14px' }}
                >
                  <option>All</option>
                  <option>In Progress</option>
                  <option>Complete</option>
                  <option>Overdue</option>
                </select>
                <button
                  className="btn btn-primary btn-small"
                  onClick={loadAllocations}
                  disabled={trackerLoading}
                >
                  {trackerLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {trackerMsg && (
                <div className={`alert alert-${trackerMsg.type === 'error' ? 'error' : 'success'}`}>
                  {trackerMsg.text}
                </div>
              )}

              {trackerLoading ? (
                <div className="loading"><div className="spinner" />Loading allocations...</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>PO</th>
                        <th>Component</th>
                        <th>Stitcher</th>
                        <th>Allocated</th>
                        <th>Returned</th>
                        <th>Accepted</th>
                        <th>Rework</th>
                        <th>Rejected</th>
                        <th>Remaining</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={12} style={{ textAlign: 'center', color: '#888', padding: '32px' }}>
                            No allocations found.
                          </td>
                        </tr>
                      ) : filtered.map(a => {
                        const displayStatus = a.status === 'Pending' ? 'In Progress' : a.status;
                        const remaining = a.qty_remaining != null
                          ? Number(a.qty_remaining)
                          : Number(a.qty_allocated || 0) - Number(a.qty_returned || 0);
                        return (
                          <tr key={a.id} style={{ background: rowBg(displayStatus) }}>
                            <td>{a.allocation_date ? String(a.allocation_date).slice(0, 10) : '—'}</td>
                            <td>{a.po_number}</td>
                            <td style={{ textTransform: 'capitalize' }}>{a.component}</td>
                            <td>{a.stitcher_name || a.stitcher_code}</td>
                            <td>{a.qty_allocated}</td>
                            <td>{a.qty_returned  || 0}</td>
                            <td>{a.qty_accepted  || 0}</td>
                            <td>{a.qty_rework    || 0}</td>
                            <td>{a.qty_rejected  || 0}</td>
                            <td><strong>{remaining}</strong></td>
                            <td><StatusBadge status={a.status} /></td>
                            <td>
                              {displayStatus !== 'Complete' && (
                                <button
                                  className="btn btn-small"
                                  style={{ background: '#0f3460', color: 'white', whiteSpace: 'nowrap' }}
                                  onClick={() => openUpdate(a)}
                                >
                                  Update
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Running Totals */}
            {totalsRows.length > 0 && (
              <div className="card">
                <h3>Running Totals</h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Stitcher</th>
                        <th>Total Allocated</th>
                        <th>Total Accepted</th>
                        <th>Total Rework</th>
                        <th>Total Rejected</th>
                        <th>Total Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totalsRows.map(t => (
                        <tr key={t.stitcher}>
                          <td>{t.stitcher}</td>
                          <td>{t.allocated}</td>
                          <td>{t.accepted}</td>
                          <td>{t.rework}</td>
                          <td>{t.rejected}</td>
                          <td><strong>{t.remaining}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {/* ── Tab 3: Stitcher Dashboard ─────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="stitcher-dashboard-print">
            <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
              <h3>Stitcher Performance Dashboard</h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: '220px' }}>
                  <label>Select Stitcher</label>
                  <select value={sdStitcher} onChange={e => setSdStitcher(e.target.value)}>
                    <option value="">Select stitcher...</option>
                    {sdAllStitchers.map(s => (
                      <option key={s.stitcher_code} value={s.name}>
                        {s.stitcher_code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Date From</label>
                  <input type="date" value={sdDateFrom} onChange={e => setSdDateFrom(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Date To</label>
                  <input type="date" value={sdDateTo} onChange={e => setSdDateTo(e.target.value)} />
                </div>
                <button
                  className="btn btn-primary btn-small"
                  onClick={sdHandleLoad}
                  disabled={!sdStitcher || sdLoading}
                  style={{ minWidth: '80px' }}
                >
                  {sdLoading ? 'Loading...' : 'Load'}
                </button>
              </div>
            </div>

            {!sdStitcher ? (
              <div className="card">
                <p style={{ color: '#888', textAlign: 'center', padding: '32px' }}>
                  Select a stitcher to view their performance
                </p>
              </div>
            ) : sdLoading ? (
              <div className="loading"><div className="spinner" />Loading...</div>
            ) : sdLoaded && sdEntries.length === 0 ? (
              <div className="card">
                <p style={{ color: '#888', textAlign: 'center', padding: '32px' }}>No entries found for this stitcher.</p>
              </div>
            ) : sdLoaded && sdEntries.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Total POs',      value: new Set(sdEntries.map(e => e.po_number)).size,                                         color: '#0f3460' },
                    { label: 'Total Pieces',   value: sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0).toLocaleString(),        color: '#0f3460' },
                    { label: 'Total Earnings', value: `PKR ${sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`,    color: '#16a34a' },
                  ].map(c => (
                    <div key={c.label} className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: '#888', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>{c.label}</p>
                      <p style={{ fontSize: '26px', fontWeight: '700', color: c.color }}>{c.value}</p>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>
                      Breakdown — {sdStitcher}
                      {(sdDateFrom || sdDateTo) && (
                        <span style={{ fontSize: '13px', fontWeight: '400', color: '#888', marginLeft: '8px' }}>
                          {sdDateFrom || 'All'} to {sdDateTo || 'Now'}
                        </span>
                      )}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-small"
                        onClick={sdHandleExport}
                        style={{ width: 'auto', background: '#16a34a', color: 'white' }}
                      >
                        ↓ Excel
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() => window.print()}
                        style={{ width: 'auto', background: '#0f3460', color: 'white' }}
                      >
                        Print
                      </button>
                    </div>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Date</th>
                          <th>PO Number</th>
                          <th>Collection</th>
                          <th>Component</th>
                          <th>Color</th>
                          <th>Department</th>
                          <th>Operation</th>
                          <th>Qty Claimed</th>
                          <th>Rate (PKR)</th>
                          <th>Amount (PKR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...sdEntries].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date)).map(e => {
                          const po = pos.find(p => p.po_number === e.po_number);
                          return (
                            <tr key={e.id}>
                              <td>{e.stitcher_code}</td>
                              <td>{e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}</td>
                              <td>{e.po_number}</td>
                              <td>{po?.collection_name || '—'}</td>
                              <td style={{ textTransform: 'capitalize' }}>{e.component || '—'}</td>
                              <td>{e.color || '—'}</td>
                              <td>{e.department}</td>
                              <td>{e.operation}</td>
                              <td>{Number(e.qty_claimed || 0).toLocaleString()}</td>
                              <td>{Number(e.rate || 0).toLocaleString()}</td>
                              <td>{Number(e.amount || 0).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ fontWeight: '700', background: '#f0f7ff' }}>
                          <td colSpan={8} style={{ textAlign: 'right' }}>TOTAL</td>
                          <td>{sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0).toLocaleString()}</td>
                          <td>—</td>
                          <td>{sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        <PoweredByFintrack />
      </div>

      {/* ── Update Modal ──────────────────────────────────────────────────────── */}
      {updateModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-card">

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f3460' }}>
                Update — {updateModal.stitcher_name} — <span style={{ textTransform: 'capitalize' }}>{updateModal.component}</span>
              </h3>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Read-only summary */}
            <div style={{
              background: '#f8f9ff', borderRadius: '8px', padding: '14px 16px',
              marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '10px', fontSize: '14px',
            }}>
              <div><span style={{ color: '#888', fontWeight: '600' }}>PO: </span>{updateModal.po_number}</div>
              <div><span style={{ color: '#888', fontWeight: '600' }}>Stitcher: </span>{updateModal.stitcher_name}</div>
              <div style={{ textTransform: 'capitalize' }}>
                <span style={{ color: '#888', fontWeight: '600' }}>Component: </span>{updateModal.component}
              </div>
              <div><span style={{ color: '#888', fontWeight: '600' }}>Allocated: </span>{updateModal.qty_allocated}</div>
              <div>
                <span style={{ color: '#888', fontWeight: '600' }}>Total Returned So Far: </span>
                {updateModal.qty_returned || 0}
              </div>
              <div>
                <span style={{ color: '#888', fontWeight: '600' }}>Remaining: </span>
                {updateModal.qty_remaining != null
                  ? Number(updateModal.qty_remaining)
                  : Number(updateModal.qty_allocated) - Number(updateModal.qty_returned || 0)}
              </div>
            </div>

            {/* Delta inputs */}
            <div className="form-grid">
              <div className="form-group">
                <label>Additional Returned (delta)</label>
                <input
                  type="number"
                  name="qty_returned_delta"
                  value={deltaForm.qty_returned_delta}
                  onChange={handleDeltaChange}
                  min="0"
                  placeholder="Pieces returned today"
                />
              </div>
              <div className="form-group">
                <label>Of which Accepted</label>
                <input
                  type="number"
                  name="qty_accepted_delta"
                  value={deltaForm.qty_accepted_delta}
                  onChange={handleDeltaChange}
                  min="0"
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Of which Rework</label>
                <input
                  type="number"
                  name="qty_rework_delta"
                  value={deltaForm.qty_rework_delta}
                  onChange={handleDeltaChange}
                  min="0"
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Of which Rejected</label>
                <input
                  type="number"
                  name="qty_rejected_delta"
                  value={deltaForm.qty_rejected_delta}
                  onChange={handleDeltaChange}
                  min="0"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Remarks</label>
              <input
                type="text"
                name="remarks"
                value={deltaForm.remarks}
                onChange={handleDeltaChange}
                placeholder="Optional notes"
              />
            </div>

            {modalError && (
              <div className="alert alert-error">{modalError}</div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleModalSave}
                disabled={saving || !!modalError}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn btn-small"
                style={{ background: '#e8e8e8', color: '#555', padding: '12px 24px' }}
                onClick={closeModal}
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default SupervisorView;
