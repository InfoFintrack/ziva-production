/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { getCMTRates, approveCMTRate } from '../api';

// ── Badge helper (identical to CuttingView.js) ───────────────────────────────
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

function AccountsView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('pending');

  // Pending Rates tab state
  const [pendingRates, setPendingRates] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // All Rates tab state
  const [allRates, setAllRates] = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Action state
  const [actionMessage, setActionMessage] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    loadPending();
    loadAll();
  }, []);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const res = await getCMTRates('?status=Pending_Accounts');
      if (res.success) setPendingRates(res.rates);
    } catch {
      // silently fail — empty table shown
    }
    setPendingLoading(false);
  };

  const loadAll = async () => {
    setAllLoading(true);
    try {
      const res = await getCMTRates();
      if (res.success) setAllRates(res.rates);
    } catch {
      // silently fail
    }
    setAllLoading(false);
  };

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleApprove = async (id) => {
    setActingId(id);
    setActionMessage(null);
    try {
      const res = await approveCMTRate({ id, action: 'approve' });
      if (res.success) {
        setActionMessage({ type: 'success', text: '✓ Rate approved and forwarded to CEO for final sign-off.' });
        loadPending();
        loadAll();
      } else {
        setActionMessage({ type: 'error', text: res.message || res.error || 'Action failed.' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Request failed. Please try again.' });
    }
    setActingId(null);
  };

  const handleRejectClick = (id) => {
    setRejectingId(id);
    setRejectRemarks('');
    setActionMessage(null);
  };

  const handleRejectConfirm = async (id) => {
    if (!rejectRemarks.trim()) {
      setActionMessage({ type: 'error', text: 'Rejection remarks are required.' });
      return;
    }
    setActingId(id);
    setActionMessage(null);
    try {
      const res = await approveCMTRate({ id, action: 'reject', remarks: rejectRemarks.trim() });
      if (res.success) {
        setActionMessage({ type: 'success', text: '✓ Rate rejected. Submitter has been notified.' });
        setRejectingId(null);
        setRejectRemarks('');
        loadPending();
        loadAll();
      } else {
        setActionMessage({ type: 'error', text: res.message || res.error || 'Action failed.' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Request failed. Please try again.' });
    }
    setActingId(null);
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const filteredRates = allRates.filter(r => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.po_number?.toLowerCase().includes(s) ||
      r.submitted_by?.toLowerCase().includes(s)
    );
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <h2>ZIVA — Accounts Dashboard</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Accounts</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">

        {/* TAB SWITCHER — PPView.js pattern exactly */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: '2px solid #e8e8e8',
        }}>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: activeTab === 'pending' ? '#0f3460' : '#888',
              borderBottom: activeTab === 'pending' ? '3px solid #0f3460' : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'color 0.15s',
            }}
          >
            Pending Rates
            {pendingRates.length > 0 && (
              <span style={{
                background: '#dc2626',
                color: 'white',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '700',
                padding: '1px 7px',
                marginLeft: '8px',
                verticalAlign: 'middle',
              }}>
                {pendingRates.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: activeTab === 'all' ? '#0f3460' : '#888',
              borderBottom: activeTab === 'all' ? '3px solid #0f3460' : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'color 0.15s',
            }}
          >
            All Rates
          </button>
        </div>

        {/* ── TAB 1: PENDING RATES ──────────────────────────────────────── */}
        {activeTab === 'pending' && (
          <div className="card">
            <h3>Pending Accounts Review</h3>

            {actionMessage && (
              <div className={`alert alert-${actionMessage.type}`}>
                {actionMessage.text}
              </div>
            )}

            {pendingLoading ? (
              <div className="loading">
                <div className="spinner"></div>
                Loading pending rates...
              </div>
            ) : pendingRates.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                No pending rates. All caught up.
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRates.map((r) => (
                      <tr key={r.id}>
                        <td>{r.po_number}</td>
                        <td>{r.color_design || '—'}</td>
                        <td>{r.total != null ? Number(r.total).toLocaleString() : '—'}</td>
                        <td>{r.submitted_by}</td>
                        <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                        <td>
                          {rejectingId === r.id ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                placeholder="Rejection reason (required)"
                                value={rejectRemarks}
                                onChange={e => setRejectRemarks(e.target.value)}
                                style={{
                                  padding: '6px 10px',
                                  border: '2px solid #e8e8e8',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  minWidth: '200px',
                                }}
                              />
                              <button
                                className="btn btn-danger btn-small"
                                onClick={() => handleRejectConfirm(r.id)}
                                disabled={actingId === r.id}
                                style={{ width: 'auto' }}
                              >
                                {actingId === r.id ? '...' : 'Confirm'}
                              </button>
                              <button
                                className="btn btn-small"
                                onClick={() => { setRejectingId(null); setRejectRemarks(''); }}
                                disabled={actingId === r.id}
                                style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn btn-success btn-small"
                                onClick={() => handleApprove(r.id)}
                                disabled={actingId !== null}
                                style={{ width: 'auto' }}
                              >
                                {actingId === r.id ? '...' : 'Approve'}
                              </button>
                              <button
                                className="btn btn-danger btn-small"
                                onClick={() => handleRejectClick(r.id)}
                                disabled={actingId !== null}
                                style={{ width: 'auto' }}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
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
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}>
              <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>All CMT Rates</h3>
              <input
                type="text"
                placeholder="Search by PO or submitted by..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #e8e8e8',
                  borderRadius: '8px',
                  fontSize: '14px',
                  width: '260px',
                }}
              />
            </div>

            {allLoading ? (
              <div className="loading">
                <div className="spinner"></div>
                Loading rates...
              </div>
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
                        <tr key={r.id}>
                          <td>{r.po_number}</td>
                          <td>{r.color_design || '—'}</td>
                          <td>{r.total != null ? Number(r.total).toLocaleString() : '—'}</td>
                          <td>{r.submitted_by}</td>
                          <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td>
                            <span className={badge.cls} style={badge.style}>
                              {r.status}
                            </span>
                            {r.status === 'Rejected' && r.accounts_remarks && (
                              <p style={{
                                fontSize: '11px',
                                color: '#dc2626',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                whiteSpace: 'normal',
                              }}>
                                {r.accounts_remarks}
                              </p>
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
        )}

      </div>
    </div>
  );
}

export default AccountsView;
