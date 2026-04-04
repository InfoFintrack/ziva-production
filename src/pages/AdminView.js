import React, { useState, useEffect } from 'react';
import { getRecords, adminOverride } from '../api';

function AdminView({ user, onLogout }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getRecords();
      if (result.success) {
        setRecords(result.records.reverse());
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load records.' });
    }
    setLoading(false);
  };

  const filteredRecords = records.filter(r => {
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'pending' ? (!r.Acceptance_Status || r.Acceptance_Status === '') :
      filter === 'accepted' ? r.Acceptance_Status === 'Accepted' :
      filter === 'partial' ? r.Acceptance_Status === 'Partial' :
      filter === 'rejected' ? r.Acceptance_Status === 'Rejected' : true;

    const matchesSearch = search === '' ? true :
      Object.values(r).some(v =>
        v && v.toString().toLowerCase().includes(search.toLowerCase())
      );

    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: records.length,
    pending: records.filter(r => !r.Acceptance_Status || r.Acceptance_Status === '').length,
    accepted: records.filter(r => r.Acceptance_Status === 'Accepted').length,
    partial: records.filter(r => r.Acceptance_Status === 'Partial').length,
    rejected: records.filter(r => r.Acceptance_Status === 'Rejected').length,
    discrepancies: records.filter(r => Number(r.Discrepancy) > 0).length
  };

  const handleOverride = (record, field) => {
    setOverrideModal({ record, field });
    setOverrideValue(record[field] || '');
    setMessage(null);
  };

  const submitOverride = async () => {
    if (!overrideValue.toString().trim()) {
      setMessage({ type: 'error', text: 'Please enter a value.' });
      return;
    }
    setOverriding(true);
    try {
      const result = await adminOverride(
        overrideModal.record.Record_ID,
        overrideModal.field,
        overrideValue,
        user.name
      );
      if (result.success) {
        setMessage({ type: 'success', text: `✓ Field "${overrideModal.field}" updated successfully. Logged to Audit Trail.` });
        setOverrideModal(null);
        loadData();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Override failed. Please try again.' });
    }
    setOverriding(false);
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
        <h2>ZIVA — Admin Dashboard</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Admin</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">

        {message && (
          <div className={`alert alert-${message.type}`}>{message.text}</div>
        )}

        {/* STATS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {[
            { label: 'Total Records', value: stats.total, color: '#0f3460' },
            { label: 'Pending', value: stats.pending, color: '#856404' },
            { label: 'Accepted', value: stats.accepted, color: '#0a3622' },
            { label: 'Partial', value: stats.partial, color: '#7c3a00' },
            { label: 'Rejected', value: stats.rejected, color: '#58151c' },
            { label: 'Discrepancies', value: stats.discrepancies, color: '#e74c3c' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'center',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: stat.color }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* RECORDS TABLE */}
        <div className="card">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>
              All Fabric Records
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search anything..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #e8e8e8',
                  borderRadius: '8px',
                  fontSize: '14px',
                  width: '200px'
                }}
              />
              <button
                className="btn btn-small"
                onClick={loadData}
                style={{ background: '#f0f2f5', color: '#333', width: 'auto' }}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* FILTER TABS */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {['all', 'pending', 'accepted', 'partial', 'rejected'].map(f => (
              <button
                key={f}
                className="btn btn-small"
                onClick={() => setFilter(f)}
                style={{
                  width: 'auto',
                  background: filter === f ? '#0f3460' : '#e0e7ff',
                  color: filter === f ? 'white' : '#0f3460',
                  textTransform: 'capitalize'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              Loading records...
            </div>
          ) : filteredRecords.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
              No records found.
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
                    <th>Color</th>
                    <th>Qty Issued</th>
                    <th>Qty Received</th>
                    <th>Discrepancy</th>
                    <th>Condition</th>
                    <th>Issued By</th>
                    <th>Accepted By</th>
                    <th>Status</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r, i) => (
                    <tr key={i}>
                      <td>{r.Record_ID}</td>
                      <td>{r.Issue_Date}</td>
                      <td>{r.PO_Number}</td>
                      <td>{r.Lot_Number}</td>
                      <td>{r.Fabric_Name}</td>
                      <td>{r.Fabric_Color}</td>
                      <td>{r.Qty_Issued}</td>
                      <td>{r.Qty_Received || '—'}</td>
                      <td className={Number(r.Discrepancy) > 0 ? 'discrepancy-flag' : ''}>
                        {r.Discrepancy !== '' && r.Discrepancy !== undefined
                          ? Number(r.Discrepancy) > 0
                            ? `⚠ ${r.Discrepancy}`
                            : '✓ 0'
                          : '—'}
                      </td>
                      <td>{r.Fabric_Condition || '—'}</td>
                      <td>{r.Issued_By}</td>
                      <td>{r.Accepted_By || '—'}</td>
                      <td>
                        <span className={getStatusBadge(r.Acceptance_Status || r.Issue_Status)}>
                          {r.Acceptance_Status || r.Issue_Status || 'Issued'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-small"
                          onClick={() => handleOverride(r, 'Issue_Remarks')}
                          style={{ background: '#fff3cd', color: '#856404', width: 'auto' }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* OVERRIDE MODAL */}
      {overrideModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white', borderRadius: '16px',
            padding: '32px', width: '100%', maxWidth: '440px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginBottom: '8px', color: '#0f3460' }}>Admin Override</h3>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>
              Record: <strong>{overrideModal.record.Record_ID}</strong> —
              Field: <strong>{overrideModal.field}</strong>
              <br />
              <span style={{ color: '#e74c3c', fontSize: '12px' }}>
                This action will be logged to the Audit Trail.
              </span>
            </p>

            {message && (
              <div className={`alert alert-${message.type}`}>{message.text}</div>
            )}

            <div className="form-group">
              <label>New Value</label>
              <input
                type="text"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="Enter new value"
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={submitOverride}
                disabled={overriding}
                style={{ flex: 1 }}
              >
                {overriding ? 'Saving...' : 'Save Override'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => { setOverrideModal(null); setMessage(null); }}
                style={{ flex: 1 }}
                disabled={overriding}
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

export default AdminView;