import React, { useState, useEffect } from 'react';
import { submitIssuance, getRecords, getDropdowns } from '../api';

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
    issueRemarks: ''
  });

const [dropdowns, setDropdowns] = useState({
    garmentTypes: [],
    units: [],
    receivingVendors: []
  });

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [lotPreview, setLotPreview] = useState('Auto-generated on submit');

useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadData();
  }, []);

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
          receivingVendors: dropdownsRes.receivingVendors
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load data.' });
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'poNumber' && value) {
      const cleanPO = value.replace(/[^a-zA-Z0-9]/g, '');
      setLotPreview(`LOT-${cleanPO}-XXX (auto on submit)`);
    }
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
        issuedBy: user.name
      });
      if (result.success) {
        setMessage({
          type: 'success',
          text: `✓ Fabric issued successfully! Record ID: ${result.recordId} | Lot: ${result.lotNumber}`
        });
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
          issueRemarks: ''
        });
        setLotPreview('Auto-generated on submit');
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

            <div style={{ marginTop: '8px' }}>
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
      </div>
    </div>
  );
}

export default PPView;