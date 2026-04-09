/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { submitIssuance, getRecords, getDropdowns, getPOs, createPO } from '../api';

const ACCESSORY_UNITS = ['Meters', 'Yards', 'Pieces', 'KG'];

function PPView({ user, onLogout }) {
const [form, setForm] = useState({
    issueDate: new Date().toLocaleDateString('en-GB'),
    poNumber: '',
    joNumber: '',
    article: '',
    receivingVendor: '',
    garmentType: '',
    fabricName: '',
    fabricColor: '',
    noOfThaan: '',
    qtyIssued: '',
    unit: '',
    fabricWidth: '',
    issueRemarks: ''
  });

  const [accessories, setAccessories] = useState([]);
  const [laces, setLaces] = useState([]);

const [dropdowns, setDropdowns] = useState({
    garmentTypes: [],
    units: [],
    receivingVendors: [],
    accessoryTypes: [],
  });

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [lotPreview, setLotPreview] = useState('Auto-generated on submit');

  // Tab state
  const [activeTab, setActiveTab] = useState('issue');

  // PO Management state
  const [poForm, setPOForm] = useState({
    po_number: '',
    buyer_name: '',
    garment_type: '',
    color_design: '',
    po_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    total_qty: '',
    remarks: '',
  });
  const [pos, setPos] = useState([]);
  const [poLoading, setPOLoading] = useState(false);
  const [poSubmitting, setPOSubmitting] = useState(false);
  const [poMessage, setPOMessage] = useState(null);
  const [poDuplicateError, setPODuplicateError] = useState('');
  const [poCheckLoading, setPOCheckLoading] = useState(false);

const loadData = async () => {
    setLoading(true);
    try {
      const [recordsRes, dropdownsRes] = await Promise.all([
        getRecords(),
        getDropdowns()
      ]);
      if (recordsRes.success) {
        const myRecords = recordsRes.records.filter(
          r => r.Issued_By === user.name
        );
        setRecords(myRecords.reverse());
      }
      if (dropdownsRes.success) {
        setDropdowns({
          garmentTypes: dropdownsRes.garmentTypes,
          units: dropdownsRes.units,
          receivingVendors: dropdownsRes.receivingVendors,
          accessoryTypes: dropdownsRes.accessoryTypes || [],
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load data.' });
    }
    setLoading(false);
  };

  const loadPOs = async () => {
    setPOLoading(true);
    try {
      const res = await getPOs();
      if (res.success) setPos(res.pos);
    } catch {
      // silently fail — PO list is non-critical on load
    }
    setPOLoading(false);
  };

  useEffect(() => {
    loadData();
    loadPOs();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'poNumber' && value) {
      const cleanPO = value.replace(/[^a-zA-Z0-9]/g, '');
      setLotPreview(`LOT-${cleanPO}-XXX (auto on submit)`);
    }
  };

  // Accessories handlers
  const addAccessory = () => {
    if (accessories.length >= 10) return;
    setAccessories(prev => [...prev, { type: '', qty: '', unit: '' }]);
  };

  const removeAccessory = (index) => {
    setAccessories(prev => prev.filter((_, i) => i !== index));
  };

  const handleAccessoryChange = (index, field, value) => {
    setAccessories(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  // Laces handlers
  const addLace = () => {
    if (laces.length >= 10) return;
    setLaces(prev => [...prev, { laceType: '', qty: '', unit: '' }]);
  };

  const removeLace = (index) => {
    setLaces(prev => prev.filter((_, i) => i !== index));
  };

  const handleLaceChange = (index, field, value) => {
    setLaces(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const resetForm = () => {
    setForm({
      issueDate: new Date().toLocaleDateString('en-GB'),
      poNumber: '',
      joNumber: '',
      article: '',
      receivingVendor: '',
      garmentType: '',
      fabricName: '',
      fabricColor: '',
      noOfThaan: '',
      qtyIssued: '',
      unit: '',
      fabricWidth: '',
      issueRemarks: ''
    });
    setAccessories([]);
    setLaces([]);
    setLotPreview('Auto-generated on submit');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const required = ['poNumber', 'joNumber', 'receivingVendor', 'garmentType', 'fabricName', 'fabricColor', 'noOfThaan', 'qtyIssued', 'unit'];
    for (let field of required) {
      if (!form[field].toString().trim()) {
        setMessage({ type: 'error', text: 'Please fill all required fields.' });
        return;
      }
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitIssuance({
        ...form,
        accessories: accessories.length > 0 ? JSON.stringify(accessories) : null,
        laces: laces.length > 0 ? JSON.stringify(laces) : null,
        issuedBy: user.name
      });
      if (result.success) {
        setMessage({
          type: 'success',
          text: `✓ Fabric issued successfully! Record ID: ${result.recordId} | Lot: ${result.lotNumber}`
        });
        resetForm();
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

  // ── PO Management handlers ───────────────────────────────────────────────

  const handlePOChange = (e) => {
    const { name, value } = e.target;
    setPOForm(prev => ({ ...prev, [name]: value }));
    if (name === 'po_number') setPODuplicateError('');
  };

  const handlePONumberBlur = async () => {
    const val = poForm.po_number.trim();
    if (!val) return;
    setPOCheckLoading(true);
    try {
      const res = await getPOs();
      if (res.success) {
        setPos(res.pos);
        const exists = res.pos.some(
          p => p.po_number.toLowerCase() === val.toLowerCase()
        );
        setPODuplicateError(exists ? 'PO already exists' : '');
      }
    } catch {
      // silently fail — don't block the form
    }
    setPOCheckLoading(false);
  };

  const handlePOSubmit = async (e) => {
    e.preventDefault();
    if (!poForm.po_number.trim()) {
      setPOMessage({ type: 'error', text: 'PO Number is required.' });
      return;
    }
    if (poDuplicateError) return;

    setPOSubmitting(true);
    setPOMessage(null);
    try {
      const res = await createPO({
        po_number:     poForm.po_number.trim(),
        buyer_name:    poForm.buyer_name    || undefined,
        garment_type:  poForm.garment_type  || undefined,
        color_design:  poForm.color_design  || undefined,
        po_date:       poForm.po_date       || undefined,
        delivery_date: poForm.delivery_date || undefined,
        total_qty:     poForm.total_qty ? Number(poForm.total_qty) : undefined,
        remarks:       poForm.remarks       || undefined,
      });
      if (res.success) {
        setPOMessage({
          type: 'success',
          text: `✓ PO ${res.po.po_number} created successfully.`,
        });
        setPOForm({
          po_number: '',
          buyer_name: '',
          garment_type: '',
          color_design: '',
          po_date: new Date().toISOString().split('T')[0],
          delivery_date: '',
          total_qty: '',
          remarks: '',
        });
        setPODuplicateError('');
        loadPOs();
      } else {
        setPOMessage({ type: 'error', text: res.message || 'Failed to create PO.' });
      }
    } catch {
      setPOMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setPOSubmitting(false);
  };

  const getPOStatusBadge = (status) => {
    if (status === 'Active')    return { cls: 'badge badge-accepted', style: undefined };
    if (status === 'Cancelled') return { cls: 'badge badge-rejected', style: undefined };
    // Completed → blue
    return { cls: 'badge', style: { background: '#dbeafe', color: '#1e40af' } };
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <h2>ZIVA — Fabric Issuance</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">PP Department</span>
          <button
            className="btn btn-danger btn-small"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">

        {/* TAB SWITCHER */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: '2px solid #e8e8e8',
        }}>
          {[
            { key: 'issue', label: 'Issue Fabric' },
            { key: 'po',    label: 'PO Management' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 24px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: activeTab === tab.key ? '#0f3460' : '#888',
                borderBottom: activeTab === tab.key
                  ? '3px solid #0f3460'
                  : '3px solid transparent',
                marginBottom: '-2px',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: ISSUE FABRIC ─────────────────────────────────────── */}
        {activeTab === 'issue' && (
          <>
            {/* ISSUANCE FORM */}
            <div className="card">
              <h3>Issue Fabric to Cutting Department</h3>

              {message && (
                <div className={`alert alert-${message.type}`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Issue Date *</label>
                    <input
                      type="text"
                      name="issueDate"
                      value={form.issueDate}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>PO Number *</label>
                    <input
                      type="text"
                      name="poNumber"
                      placeholder="e.g. PO-001"
                      value={form.poNumber}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>JO Number *</label>
                    <input
                      type="text"
                      name="joNumber"
                      placeholder="e.g. JO-001"
                      value={form.joNumber}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Article</label>
                    <input
                      type="text"
                      name="article"
                      placeholder="e.g. Shalwar Kameez"
                      value={form.article}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Receiving Vendor *</label>
                    <select
                      name="receivingVendor"
                      value={form.receivingVendor}
                      onChange={handleChange}
                    >
                      <option value="">Select vendor</option>
                      {dropdowns.receivingVendors.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Lot Number</label>
                    <input
                      type="text"
                      value={lotPreview}
                      className="auto-field"
                      disabled
                    />
                  </div>

                  <div className="form-group">
                    <label>Garment Type *</label>
                    <select
                      name="garmentType"
                      value={form.garmentType}
                      onChange={handleChange}
                    >
                      <option value="">Select type</option>
                      {dropdowns.garmentTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Fabric Name *</label>
                    <input
                      type="text"
                      name="fabricName"
                      placeholder="e.g. Lawn, Khaddar"
                      value={form.fabricName}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Fabric Color *</label>
                    <input
                      type="text"
                      name="fabricColor"
                      placeholder="e.g. Navy Blue"
                      value={form.fabricColor}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>No. of Thaan *</label>
                    <input
                      type="number"
                      name="noOfThaan"
                      placeholder="e.g. 5"
                      value={form.noOfThaan}
                      onChange={handleChange}
                      min="1"
                    />
                  </div>

                  <div className="form-group">
                    <label>Quantity Issued *</label>
                    <input
                      type="number"
                      name="qtyIssued"
                      placeholder="e.g. 250"
                      value={form.qtyIssued}
                      onChange={handleChange}
                      min="1"
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit *</label>
                    <select
                      name="unit"
                      value={form.unit}
                      onChange={handleChange}
                    >
                      <option value="">Select unit</option>
                      {dropdowns.units.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Fabric Width</label>
                    <input
                      type="text"
                      name="fabricWidth"
                      placeholder='e.g. 40, 50, 40+50'
                      value={form.fabricWidth}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Remarks</label>
                    <input
                      type="text"
                      name="issueRemarks"
                      placeholder="Optional notes"
                      value={form.issueRemarks}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* ACCESSORIES SECTION */}
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: '#0f3460' }}>Accessories</h4>
                    {accessories.length < 10 && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={addAccessory}
                        style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}
                      >
                        + Add Accessory
                      </button>
                    )}
                  </div>
                  {accessories.map((acc, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <select
                        value={acc.type}
                        onChange={e => handleAccessoryChange(i, 'type', e.target.value)}
                        style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      >
                        <option value="">Select type</option>
                        {dropdowns.accessoryTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Qty"
                        value={acc.qty}
                        onChange={e => handleAccessoryChange(i, 'qty', e.target.value)}
                        min="0"
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                      <select
                        value={acc.unit}
                        onChange={e => handleAccessoryChange(i, 'unit', e.target.value)}
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      >
                        <option value="">Unit</option>
                        {ACCESSORY_UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeAccessory(i)}
                        style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {accessories.length === 0 && (
                    <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0' }}>No accessories added.</p>
                  )}
                </div>

                {/* LACES SECTION */}
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: '#0f3460' }}>Laces</h4>
                    {laces.length < 10 && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={addLace}
                        style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}
                      >
                        + Add Lace
                      </button>
                    )}
                  </div>
                  {laces.map((lace, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Lace type"
                        value={lace.laceType}
                        onChange={e => handleLaceChange(i, 'laceType', e.target.value)}
                        style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={lace.qty}
                        onChange={e => handleLaceChange(i, 'qty', e.target.value)}
                        min="0"
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        value={lace.unit}
                        onChange={e => handleLaceChange(i, 'unit', e.target.value)}
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeLace(i)}
                        style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {laces.length === 0 && (
                    <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0' }}>No laces added.</p>
                  )}
                </div>

                <div style={{ marginTop: '20px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : 'Issue Fabric'}
                  </button>
                </div>
              </form>
            </div>

            {/* MY RECORDS */}
            <div className="card">
              <h3>My Issuance Records</h3>
              {loading ? (
                <div className="loading">
                  <div className="spinner"></div>
                  Loading records...
                </div>
              ) : records.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  No records yet. Issue fabric above to get started.
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Record ID</th>
<th>Date</th>
<th>PO</th>
<th>JO</th>
<th>Lot</th>
<th>Article</th>
<th>Vendor</th>
<th>Fabric</th>
<th>Color</th>
<th>Qty</th>
<th>Unit</th>
<th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={i}>
                          <td>{r.Record_ID}</td>
<td>{r.Issue_Date ? new Date(r.Issue_Date).toLocaleDateString('en-GB') : '—'}</td>
<td>{r.PO_Number}</td>
<td>{r.JO_Number}</td>
<td>{r.Lot_Number}</td>
<td>{r.Article || '—'}</td>
<td>{r.Receiving_Vendor}</td>
<td>{r.Fabric_Name}</td>
<td>{r.Fabric_Color}</td>
<td>{r.Qty_Issued}</td>
<td>{r.Unit}</td>
                          <td>
                            <span className={getStatusBadge(r.Acceptance_Status || r.Issue_Status)}>
                              {r.Acceptance_Status || r.Issue_Status}
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

        {/* ── TAB 2: PO MANAGEMENT ────────────────────────────────────── */}
        {activeTab === 'po' && (
          <>
            {/* CREATE PO FORM */}
            <div className="card">
              <h3>Create New PO</h3>

              {poMessage && (
                <div className={`alert alert-${poMessage.type}`}>
                  {poMessage.text}
                </div>
              )}

              <form onSubmit={handlePOSubmit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>PO Number *</label>
                    <input
                      type="text"
                      name="po_number"
                      placeholder="e.g. PO-001"
                      value={poForm.po_number}
                      onChange={handlePOChange}
                      onBlur={handlePONumberBlur}
                    />
                    {poCheckLoading && (
                      <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Checking...
                      </p>
                    )}
                    {poDuplicateError && !poCheckLoading && (
                      <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>
                        {poDuplicateError}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Buyer Name</label>
                    <input
                      type="text"
                      name="buyer_name"
                      placeholder="e.g. Al-Karam"
                      value={poForm.buyer_name}
                      onChange={handlePOChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Garment Type</label>
                    <select
                      name="garment_type"
                      value={poForm.garment_type}
                      onChange={handlePOChange}
                    >
                      <option value="">Select type</option>
                      {dropdowns.garmentTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Color / Design</label>
                    <input
                      type="text"
                      name="color_design"
                      placeholder="e.g. Black Karundi"
                      value={poForm.color_design}
                      onChange={handlePOChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>PO Date</label>
                    <input
                      type="date"
                      name="po_date"
                      value={poForm.po_date}
                      onChange={handlePOChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Delivery Date</label>
                    <input
                      type="date"
                      name="delivery_date"
                      value={poForm.delivery_date}
                      onChange={handlePOChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Total Qty</label>
                    <input
                      type="number"
                      name="total_qty"
                      placeholder="e.g. 5000"
                      value={poForm.total_qty}
                      onChange={handlePOChange}
                      min="1"
                    />
                  </div>

                  <div className="form-group">
                    <label>Remarks</label>
                    <input
                      type="text"
                      name="remarks"
                      placeholder="Optional notes"
                      value={poForm.remarks}
                      onChange={handlePOChange}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={poSubmitting || !!poDuplicateError}
                  >
                    {poSubmitting ? 'Creating...' : 'Create PO'}
                  </button>
                </div>
              </form>
            </div>

            {/* MY POs TABLE */}
            <div className="card">
              <h3>My POs</h3>
              {poLoading ? (
                <div className="loading">
                  <div className="spinner"></div>
                  Loading POs...
                </div>
              ) : pos.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  No POs created yet.
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>PO Number</th>
                        <th>Buyer</th>
                        <th>Garment Type</th>
                        <th>Color / Design</th>
                        <th>Date</th>
                        <th>Total Qty</th>
                        <th>Status</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((p, i) => {
                        const badge = getPOStatusBadge(p.status);
                        return (
                          <tr key={i}>
                            <td>{p.po_number}</td>
                            <td>{p.buyer_name || '—'}</td>
                            <td>{p.garment_type || '—'}</td>
                            <td>{p.color_design || '—'}</td>
                            <td>{p.po_date ? new Date(p.po_date).toLocaleDateString('en-GB') : '—'}</td>
                            <td>{p.total_qty ?? '—'}</td>
                            <td>
                              <span className={badge.cls} style={badge.style}>
                                {p.status || '—'}
                              </span>
                            </td>
                            <td>{p.remarks || '—'}</td>
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

      </div>
    </div>
  );
}

export default PPView;
