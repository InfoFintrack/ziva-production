/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { getPOs, getCMTRates, getStitchers, logPaymentEntry, getPaymentEntries } from '../api';
import ProdFlowLogo from '../components/ProdFlowLogo';
import PoweredByFintrack from '../components/PoweredByFintrack';

const TODAY = new Date().toISOString().split('T')[0];

const DEPARTMENTS = ['Stitching', 'Finishing Shirt', 'Finishing Trouser', 'Finishing Dupatta'];

const OPERATION_OPTIONS = {
  'Stitching':          ['Shirt', 'Trouser', 'Dupatta', 'Patching'],
  'Finishing Shirt':    ['Clipping', 'Heming', 'Tussling', 'Pressing'],
  'Finishing Trouser':  ['Clipping', 'Heming', 'Pressing', 'Patching'],
  'Finishing Dupatta':  ['Heming', 'Tussling', 'Pressing', 'Patching'],
};

// Maps department|operation → cmt_rates column (client-side mirror of backend)
const DEPT_OP_TO_RATE_FIELD = {
  'Stitching|Shirt':              'shirt',
  'Stitching|Trouser':            'trouser',
  'Stitching|Dupatta':            'dupatta',
  'Stitching|Patching':           'patching',
  'Finishing Shirt|Clipping':     'fs_clipping',
  'Finishing Shirt|Heming':       'fs_heming',
  'Finishing Shirt|Tussling':     'fs_tussling',
  'Finishing Shirt|Pressing':     'fs_pressing',
  'Finishing Trouser|Clipping':   'ft_clipping',
  'Finishing Trouser|Heming':     'ft_heming',
  'Finishing Trouser|Pressing':   'ft_pressing',
  'Finishing Trouser|Patching':   'ft_patching',
  'Finishing Dupatta|Heming':     'fd_heming',
  'Finishing Dupatta|Tussling':   'fd_tussling',
  'Finishing Dupatta|Pressing':   'fd_pressing',
  'Finishing Dupatta|Patching':   'fd_patching',
};


const EMPTY_FORM = {
  entry_date:    TODAY,
  po_number:     '',
  stitcher_code: '',
  department:    '',
  operation:     '',
  qty_claimed:   '',
  remarks:       '',
};

function PaymentStatusBadge({ status }) {
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

function StitchingView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('log');

  // Dropdown data
  const [pos,         setPos]         = useState([]);
  const [approvedSet, setApprovedSet] = useState(new Set());
  const [stitchers,   setStitchers]   = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Rate data for selected PO
  const [poRateData,   setPoRateData]   = useState(null);
  const [rateLoading,  setRateLoading]  = useState(false);
  const [rateError,    setRateError]    = useState('');

  // Log Entry form
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg,    setFormMsg]    = useState(null);

  // My Entries
  const [entries,        setEntries]        = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  useEffect(() => {
    loadDropdowns();
    loadMyEntries();
  }, []);

  // Fetch approved rate whenever PO changes
  useEffect(() => {
    if (!form.po_number) {
      setPoRateData(null);
      setRateError('');
      return;
    }
    setRateLoading(true);
    setPoRateData(null);
    setRateError('');
    getCMTRates(`?status=Approved&po_number=${encodeURIComponent(form.po_number)}`)
      .then(res => {
        if (res.success && res.rates.length > 0) {
          setPoRateData(res.rates[0]);
        } else {
          setRateError('No approved rate found for this PO');
        }
      })
      .catch(() => setRateError('Rate lookup failed'))
      .finally(() => setRateLoading(false));
  }, [form.po_number]);

  const loadDropdowns = async () => {
    setDataLoading(true);
    try {
      const [posRes, ratesRes, stitchersRes] = await Promise.all([
        getPOs(),
        getCMTRates('?status=Approved'),
        getStitchers(true),
      ]);
      if (posRes.success)       setPos(posRes.pos);
      if (ratesRes.success)     setApprovedSet(new Set(ratesRes.rates.map(r => r.po_number)));
      if (stitchersRes.success) setStitchers(stitchersRes.stitchers);
    } catch { /* silently fail */ }
    setDataLoading(false);
  };

  const loadMyEntries = async () => {
    setEntriesLoading(true);
    try {
      const res = await getPaymentEntries(`?submitted_by=${encodeURIComponent(user.name)}`);
      if (res.success) setEntries(res.payments);
    } catch { /* silently fail */ }
    setEntriesLoading(false);
  };

  // Only Active POs with at least one approved CMT rate
  const eligiblePOs = pos.filter(p => p.status === 'Active' && approvedSet.has(p.po_number));

  // Derived rate / amount
  const rateField = form.department && form.operation
    ? DEPT_OP_TO_RATE_FIELD[`${form.department}|${form.operation}`]
    : null;

  const currentRate = rateField && poRateData
    ? Number(poRateData[rateField] || 0)
    : null;

  const currentAmount = currentRate !== null && form.qty_claimed
    ? (currentRate * Number(form.qty_claimed)).toFixed(2)
    : '';

  // Rate display text and style
  let rateText = '';
  let rateStyle = { color: '#999', fontStyle: 'italic' };
  if (rateLoading) {
    rateText = 'Loading...';
  } else if (!form.po_number || !form.department || !form.operation) {
    rateText = 'Select PO, Department and Operation to load rate';
  } else if (rateError) {
    rateText = 'No approved rate found';
    rateStyle = { color: '#dc2626', fontWeight: '600' };
  } else if (currentRate !== null) {
    rateText = `PKR ${currentRate.toLocaleString()}`;
    rateStyle = { color: '#0f3460', fontWeight: '600' };
  }

  // ── Form handlers ────────────────────────────────────────────────────────────

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    const patch = { [name]: value };
    // Reset operation when department changes
    if (name === 'department') patch.operation = '';
    setForm(prev => ({ ...prev, ...patch }));
    if (formMsg) setFormMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.po_number || !form.stitcher_code || !form.department || !form.operation || !form.qty_claimed) {
      setFormMsg({ type: 'error', text: 'All required fields must be filled.' });
      return;
    }
    if (rateError || currentRate === null) {
      setFormMsg({ type: 'error', text: 'Cannot submit — no approved rate found for this PO / operation.' });
      return;
    }
    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await logPaymentEntry({
        entry_date:    form.entry_date || TODAY,
        po_number:     form.po_number,
        stitcher_code: form.stitcher_code,
        department:    form.department,
        operation:     form.operation,
        qty_claimed:   Number(form.qty_claimed),
        ...(form.remarks ? { remarks: form.remarks } : {}),
      });
      if (res.success) {
        setFormMsg({ type: 'success', text: 'Entry logged successfully.' });
        // Reset form but keep PO selected
        setForm(prev => ({ ...EMPTY_FORM, po_number: prev.po_number }));
        loadMyEntries();
      } else {
        setFormMsg({ type: 'error', text: res.message || 'Failed to log entry.' });
      }
    } catch {
      setFormMsg({ type: 'error', text: 'Network error. Please try again.' });
    }
    setSubmitting(false);
  };

  // ── Tab styles ───────────────────────────────────────────────────────────────

  const tabStyle = (tab) => ({
    padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
    color: activeTab === tab ? '#0f3460' : '#888',
    borderBottom: activeTab === tab ? '3px solid #0f3460' : '3px solid transparent',
    marginBottom: '-2px', transition: 'color 0.15s',
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <ProdFlowLogo height={32} />
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Stitching</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content">

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e8e8e8' }}>
          <button style={tabStyle('log')}     onClick={() => setActiveTab('log')}>Log Entry</button>
          <button style={tabStyle('entries')} onClick={() => setActiveTab('entries')}>My Entries</button>
        </div>

        {/* ── Tab 1: Log Entry ──────────────────────────────────────────────── */}
        {activeTab === 'log' && (
          <div className="card">
            <h3>Log Payment Entry</h3>

            {dataLoading ? (
              <div className="loading"><div className="spinner" />Loading...</div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-grid">

                  <div className="form-group">
                    <label>Entry Date *</label>
                    <input
                      type="date"
                      name="entry_date"
                      value={form.entry_date}
                      onChange={handleFormChange}
                      max={TODAY}
                    />
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
                    <label>Department *</label>
                    <select name="department" value={form.department} onChange={handleFormChange} required>
                      <option value="">Select department...</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Operation *</label>
                    <select
                      name="operation"
                      value={form.operation}
                      onChange={handleFormChange}
                      required
                      disabled={!form.department}
                    >
                      <option value="">Select operation...</option>
                      {(OPERATION_OPTIONS[form.department] || []).map(op => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Qty Claimed *</label>
                    <input
                      type="number"
                      name="qty_claimed"
                      value={form.qty_claimed}
                      onChange={handleFormChange}
                      min="1"
                      required
                      placeholder="Pieces"
                    />
                  </div>

                  {/* Rate — read-only, auto-fetched */}
                  <div className="form-group">
                    <label>Rate (PKR / piece)</label>
                    <div style={{
                      padding: '12px 16px', border: '2px dashed #e8e8e8', borderRadius: '8px',
                      background: '#fafafa', fontSize: '15px', minHeight: '48px',
                      display: 'flex', alignItems: 'center', ...rateStyle,
                    }}>
                      {rateText || '\u00A0'}
                    </div>
                  </div>

                  {/* Amount — read-only, auto-calculated */}
                  <div className="form-group">
                    <label>Amount (PKR)</label>
                    <input
                      className="auto-field"
                      type="text"
                      readOnly
                      value={currentAmount ? `PKR ${Number(currentAmount).toLocaleString()}` : '—'}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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

                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || !!rateError || currentRate === null}
                    style={{ maxWidth: '200px' }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Entry'}
                  </button>
                  {currentAmount && (
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f3460' }}>
                      Total: PKR {Number(currentAmount).toLocaleString()}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── Tab 2: My Entries ────────────────────────────────────────────── */}
        {activeTab === 'entries' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>My Entries</h3>
              <button
                className="btn btn-primary btn-small"
                onClick={loadMyEntries}
                disabled={entriesLoading}
              >
                {entriesLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {entriesLoading ? (
              <div className="loading"><div className="spinner" />Loading entries...</div>
            ) : entries.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: '24px' }}>No entries yet.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>PO</th>
                      <th>Stitcher</th>
                      <th>Department</th>
                      <th>Operation</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Amount</th>
                      <th>Week Ending</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id}>
                        <td>{e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}</td>
                        <td>{e.po_number}</td>
                        <td>{e.stitcher_name || e.stitcher_code}</td>
                        <td>{e.department}</td>
                        <td>{e.operation}</td>
                        <td>{e.qty_claimed}</td>
                        <td>PKR {Number(e.rate || 0).toLocaleString()}</td>
                        <td>PKR {Number(e.amount || 0).toLocaleString()}</td>
                        <td>{e.week_ending ? String(e.week_ending).slice(0, 10) : '—'}</td>
                        <td><PaymentStatusBadge status={e.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <PoweredByFintrack />
      </div>
    </div>
  );
}

export default StitchingView;
