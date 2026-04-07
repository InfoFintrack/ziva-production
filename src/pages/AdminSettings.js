import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, addUser, editUser, deactivateUser, getDropdowns, addDropdownValue, removeDropdownValue } from '../api';

const ROLES = ['PP', 'Cutting', 'Admin'];
const DROPDOWN_FIELDS = [
  { key: 'garmentTypes',     label: 'Garment Type',      field: 'Garment_Type' },
  { key: 'units',            label: 'Unit',              field: 'Unit' },
  { key: 'fabricConditions', label: 'Fabric Condition',  field: 'Fabric_Condition' },
  { key: 'receivingVendors', label: 'Receiving Vendor',  field: 'Receiving_Vendor' },
];

const EMPTY_USER_FORM = { name: '', passcode: '', role: 'PP' };

function AdminSettings({ user, onLogout }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('users');

  // ── User Management ──────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userMessage, setUserMessage] = useState(null);
  const [userModal, setUserModal] = useState(null); // null | { mode: 'add'|'edit', data }
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [userSaving, setUserSaving] = useState(false);

  // ── Dropdown Management ───────────────────────────────────────
  const [dropdowns, setDropdowns] = useState({ garmentTypes: [], units: [], fabricConditions: [], receivingVendors: [] });
  const [dropdownsLoading, setDropdownsLoading] = useState(false);
  const [dropdownMessage, setDropdownMessage] = useState(null);
  const [newValues, setNewValues] = useState({ Garment_Type: '', Unit: '', Fabric_Condition: '', Receiving_Vendor: '' });
  const [dropdownWorking, setDropdownWorking] = useState({}); // { 'Garment_Type:Cotton': true }

  useEffect(() => {
    if (tab === 'users') loadUsers();
    if (tab === 'dropdowns') loadDropdowns();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Users ─────────────────────────────────────────────────────

  const loadUsers = async () => {
    setUsersLoading(true);
    setUserMessage(null);
    try {
      const res = await getUsers();
      if (res.success) setUsers(res.users);
      else setUserMessage({ type: 'error', text: res.message || 'Failed to load users.' });
    } catch {
      setUserMessage({ type: 'error', text: 'Failed to load users.' });
    }
    setUsersLoading(false);
  };

  const openAddUser = () => {
    setUserForm(EMPTY_USER_FORM);
    setUserModal({ mode: 'add' });
    setUserMessage(null);
  };

  const openEditUser = (u) => {
    setUserForm({ name: u.Name, passcode: '', role: u.Role, userId: u.User_ID });
    setUserModal({ mode: 'edit', data: u });
    setUserMessage(null);
  };

  const handleUserFormChange = (e) => {
    const { name, value } = e.target;
    setUserForm(prev => ({ ...prev, [name]: value }));
  };

  const passcodeChecks = (p) => ({
    length:    p.length >= 8,
    uppercase: /[A-Z]/.test(p),
    number:    /[0-9]/.test(p),
    special:   /[!@#$%^&*-]/.test(p),
  });

  const isPasscodeValid = (p) => Object.values(passcodeChecks(p)).every(Boolean);

  const submitUserForm = async () => {
    if (!userForm.name.trim() || !userForm.role) {
      setUserMessage({ type: 'error', text: 'Name and role are required.' });
      return;
    }
    if (userModal.mode === 'add') {
      if (!userForm.passcode.trim()) {
        setUserMessage({ type: 'error', text: 'Passcode is required for new users.' });
        return;
      }
      if (!isPasscodeValid(userForm.passcode)) {
        setUserMessage({ type: 'error', text: 'Passcode does not meet the requirements.' });
        return;
      }
    }
    if (userModal.mode === 'edit' && userForm.passcode.trim() && !isPasscodeValid(userForm.passcode)) {
      setUserMessage({ type: 'error', text: 'Passcode does not meet the requirements.' });
      return;
    }
    setUserSaving(true);
    setUserMessage(null);
    try {
      const fn = userModal.mode === 'add' ? addUser : editUser;
      const res = await fn(userForm);
      if (res.success) {
        setUserMessage({ type: 'success', text: userModal.mode === 'add' ? '✓ User added.' : '✓ User updated.' });
        setUserModal(null);
        loadUsers();
      } else {
        setUserMessage({ type: 'error', text: res.message || 'Operation failed.' });
      }
    } catch {
      setUserMessage({ type: 'error', text: 'Operation failed. Please try again.' });
    }
    setUserSaving(false);
  };

  const handleDeactivate = async (u) => {
    setUserMessage(null);
    try {
      const res = await deactivateUser(u.User_ID, u.Status);
      if (res.success) {
        setUserMessage({ type: 'success', text: `✓ User ${u.Status === 'Active' ? 'deactivated' : 'reactivated'}.` });
        loadUsers();
      } else {
        setUserMessage({ type: 'error', text: res.message || 'Operation failed.' });
      }
    } catch {
      setUserMessage({ type: 'error', text: 'Operation failed. Please try again.' });
    }
  };

  // ── Dropdowns ─────────────────────────────────────────────────

  const loadDropdowns = async () => {
    setDropdownsLoading(true);
    setDropdownMessage(null);
    try {
      const res = await getDropdowns();
      if (res.success) {
        setDropdowns({
          garmentTypes: res.garmentTypes || [],
          units: res.units || [],
          fabricConditions: res.fabricConditions || [],
          receivingVendors: res.receivingVendors || [],
        });
      } else {
        setDropdownMessage({ type: 'error', text: 'Failed to load dropdowns.' });
      }
    } catch {
      setDropdownMessage({ type: 'error', text: 'Failed to load dropdowns.' });
    }
    setDropdownsLoading(false);
  };

  const handleAddDropdown = async (fieldDef) => {
    const value = newValues[fieldDef.field].trim();
    if (!value) return;
    const key = `add:${fieldDef.field}`;
    setDropdownWorking(prev => ({ ...prev, [key]: true }));
    setDropdownMessage(null);
    try {
      const res = await addDropdownValue(fieldDef.field, value);
      if (res.success) {
        setNewValues(prev => ({ ...prev, [fieldDef.field]: '' }));
        setDropdownMessage({ type: 'success', text: `✓ "${value}" added to ${fieldDef.label}.` });
        loadDropdowns();
      } else {
        setDropdownMessage({ type: 'error', text: res.message || 'Failed to add value.' });
      }
    } catch {
      setDropdownMessage({ type: 'error', text: 'Failed to add value.' });
    }
    setDropdownWorking(prev => ({ ...prev, [key]: false }));
  };

  const handleRemoveDropdown = async (fieldDef, value) => {
    const key = `remove:${fieldDef.field}:${value}`;
    setDropdownWorking(prev => ({ ...prev, [key]: true }));
    setDropdownMessage(null);
    try {
      const res = await removeDropdownValue(fieldDef.field, value);
      if (res.success) {
        setDropdownMessage({ type: 'success', text: `✓ "${value}" removed from ${fieldDef.label}.` });
        loadDropdowns();
      } else {
        setDropdownMessage({ type: 'error', text: res.message || 'Failed to remove value.' });
      }
    } catch {
      setDropdownMessage({ type: 'error', text: 'Failed to remove value.' });
    }
    setDropdownWorking(prev => ({ ...prev, [key]: false }));
  };

  // ── Render ────────────────────────────────────────────────────

  const tabBtn = (id, label) => (
    <button
      className="btn btn-small"
      onClick={() => setTab(id)}
      style={{
        width: 'auto',
        background: tab === id ? '#0f3460' : '#e0e7ff',
        color: tab === id ? 'white' : '#0f3460'
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="app-container">
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            className="btn btn-small"
            onClick={() => navigate('/admin')}
            style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0 }}>ZIVA — Admin Settings</h2>
        </div>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Admin</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content">
        <div className="card">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            {tabBtn('users', 'User Management')}
            {tabBtn('dropdowns', 'Dropdown Management')}
          </div>

          {/* ── USER MANAGEMENT ── */}
          {tab === 'users' && (
            <>
              {userMessage && <div className={`alert alert-${userMessage.type}`}>{userMessage.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Users</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-small"
                    onClick={loadUsers}
                    style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}
                  >
                    ↻ Refresh
                  </button>
                  <button
                    className="btn btn-small btn-success"
                    onClick={openAddUser}
                    style={{ width: 'auto' }}
                  >
                    + Add User
                  </button>
                </div>
              </div>

              {usersLoading ? (
                <div className="loading"><div className="spinner"></div>Loading users...</div>
              ) : users.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No users found.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u, i) => (
                        <tr key={i}>
                          <td>{u.Name}</td>
                          <td>{u.Role}</td>
                          <td>
                            <span className={`badge ${u.Status === 'Active' ? 'badge-accepted' : 'badge-rejected'}`}>
                              {u.Status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="btn btn-small"
                                onClick={() => openEditUser(u)}
                                style={{ background: '#fff3cd', color: '#856404', width: 'auto' }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-small"
                                onClick={() => handleDeactivate(u)}
                                style={{
                                  background: u.Status === 'Active' ? '#f8d7da' : '#d1e7dd',
                                  color: u.Status === 'Active' ? '#58151c' : '#0a3622',
                                  width: 'auto'
                                }}
                              >
                                {u.Status === 'Active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── DROPDOWN MANAGEMENT ── */}
          {tab === 'dropdowns' && (
            <>
              {dropdownMessage && <div className={`alert alert-${dropdownMessage.type}`}>{dropdownMessage.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Dropdown Values</h3>
                <button
                  className="btn btn-small"
                  onClick={loadDropdowns}
                  style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}
                >
                  ↻ Refresh
                </button>
              </div>

              {dropdownsLoading ? (
                <div className="loading"><div className="spinner"></div>Loading dropdowns...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  {DROPDOWN_FIELDS.map(fieldDef => {
                    const values = dropdowns[fieldDef.key] || [];
                    return (
                      <div key={fieldDef.field} style={{
                        border: '1px solid #e0e7ff',
                        borderRadius: '10px',
                        padding: '16px'
                      }}>
                        <p style={{ fontWeight: '700', color: '#0f3460', marginBottom: '12px', fontSize: '13px', textTransform: 'uppercase' }}>
                          {fieldDef.label}
                        </p>

                        {/* Current values */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', minHeight: '32px' }}>
                          {values.length === 0 ? (
                            <span style={{ color: '#aaa', fontSize: '13px' }}>No values yet</span>
                          ) : values.map(v => (
                            <span key={v} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: '#e0e7ff', color: '#0f3460',
                              borderRadius: '20px', padding: '4px 10px', fontSize: '13px'
                            }}>
                              {v}
                              <button
                                onClick={() => handleRemoveDropdown(fieldDef, v)}
                                disabled={!!dropdownWorking[`remove:${fieldDef.field}:${v}`]}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#e74c3c', fontWeight: '700', padding: '0 2px',
                                  lineHeight: 1, fontSize: '14px'
                                }}
                                title={`Remove "${v}"`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add new value */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            placeholder="Add new value..."
                            value={newValues[fieldDef.field]}
                            onChange={e => setNewValues(prev => ({ ...prev, [fieldDef.field]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddDropdown(fieldDef)}
                            style={{
                              flex: 1, padding: '7px 10px', border: '2px solid #e8e8e8',
                              borderRadius: '7px', fontSize: '13px'
                            }}
                          />
                          <button
                            className="btn btn-small btn-success"
                            onClick={() => handleAddDropdown(fieldDef)}
                            disabled={!newValues[fieldDef.field].trim() || !!dropdownWorking[`add:${fieldDef.field}`]}
                            style={{ width: 'auto', padding: '7px 14px' }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── USER ADD / EDIT MODAL ── */}
      {userModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white', borderRadius: '16px',
            padding: '32px', width: '100%', maxWidth: '420px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#0f3460' }}>
              {userModal.mode === 'add' ? 'Add New User' : 'Edit User'}
            </h3>

            {userMessage && <div className={`alert alert-${userMessage.type}`}>{userMessage.text}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                name="name"
                value={userForm.name}
                onChange={handleUserFormChange}
                placeholder="Full name"
              />
            </div>

            <div className="form-group">
              <label>Role *</label>
              <select name="role" value={userForm.role} onChange={handleUserFormChange}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>{userModal.mode === 'add' ? 'Passcode *' : 'New Passcode (leave blank to keep current)'}</label>
              <input
                type="password"
                name="passcode"
                value={userForm.passcode}
                onChange={handleUserFormChange}
                placeholder="e.g. Fabric@123"
              />
              {userForm.passcode && (() => {
                const checks = passcodeChecks(userForm.passcode);
                const items = [
                  { key: 'length',    label: 'At least 8 characters' },
                  { key: 'uppercase', label: 'One uppercase letter' },
                  { key: 'number',    label: 'One number' },
                  { key: 'special',   label: 'One special character (!@#$%^&*-)' },
                ];
                return (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                    {items.map(({ key, label }) => (
                      <li key={key} style={{ fontSize: '12px', color: checks[key] ? '#1a7a4a' : '#c0392b', marginBottom: '2px' }}>
                        {checks[key] ? '✓' : '✗'} {label}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={submitUserForm}
                disabled={userSaving}
                style={{ flex: 1 }}
              >
                {userSaving ? 'Saving...' : userModal.mode === 'add' ? 'Add User' : 'Save Changes'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => { setUserModal(null); setUserMessage(null); }}
                disabled={userSaving}
                style={{ flex: 1 }}
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

export default AdminSettings;
