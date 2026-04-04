import React, { useState, useEffect } from 'react';
import { submitAcceptance, getRecords, getDropdowns } from '../api';

function CuttingView({ user, onLogout }) {
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

  useEffect(() => {
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

  const pendingRecords = records.filter(r => r.Issue_Status === 'Issued' && !r.Acceptance_Status);
  const completedRecords = records.filter(r => r.Acceptance_Status);

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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}

export default CuttingView;