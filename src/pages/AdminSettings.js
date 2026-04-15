import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  getUsers, addUser, editUser, deactivateUser,
  getDropdowns, addDropdownValue, removeDropdownValue,
  getStitchers, updateStitcher,
} from '../api';

const ROLES = ['PP', 'Cutting', 'Admin', 'Accounts', 'CEO', 'Supervisor', 'Stitching'];
const DROPDOWN_FIELDS = [
  { key: 'garmentTypes',     label: 'Garment Type',      field: 'Garment_Type' },
  { key: 'units',            label: 'Unit',              field: 'Unit' },
  { key: 'fabricConditions', label: 'Fabric Condition',  field: 'Fabric_Condition' },
  { key: 'receivingVendors', label: 'Receiving Vendor',  field: 'Receiving_Vendor' },
];
const SPECIALIZATIONS = ['Shirt', 'Trouser', 'Dupatta', 'Mixed'];

const EMPTY_USER_FORM = { name: '', passcode: '', role: 'PP' };
const EMPTY_STITCHER_EDIT = { name: '', phone: '', cnic: '', specialization: '', group_parent: '', status: 'Active' };

const PHONE_REGEX = /^\d{4}-\d{7}$/;
const CNIC_REGEX  = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;

const formatPhone = (val) => {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 4) return d;
  return d.slice(0, 4) + '-' + d.slice(4);
};

const formatCNIC = (val) => {
  const d = val.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return d.slice(0, 5) + '-' + d.slice(5);
  return d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12);
};

function AdminSettings({ user, onLogout }) {
  const navigate = useNavigate();
  const isAdmin = user.role === 'Admin';

  // Default tab: stitchers for Accounts, users for Admin
  const [tab, setTab] = useState(isAdmin ? 'users' : 'stitchers');

  // ── User Management ──────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userMessage, setUserMessage] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [userSaving, setUserSaving] = useState(false);

  // ── Dropdown Management ───────────────────────────────────────
  const [dropdowns, setDropdowns] = useState({ garmentTypes: [], units: [], fabricConditions: [], receivingVendors: [] });
  const [dropdownsLoading, setDropdownsLoading] = useState(false);
  const [dropdownMessage, setDropdownMessage] = useState(null);
  const [newValues, setNewValues] = useState({ Garment_Type: '', Unit: '', Fabric_Condition: '', Receiving_Vendor: '' });
  const [dropdownWorking, setDropdownWorking] = useState({});

  // ── Stitcher Management ───────────────────────────────────────
  const [stitchers, setStitchers] = useState([]);
  const [stitchersLoading, setStitchersLoading] = useState(false);
  const [stitcherMessage, setStitcherMessage] = useState(null);
  const [stitcherSearch, setStitcherSearch] = useState('');
  const [stitcherStatusFilter, setStitcherStatusFilter] = useState('All');
  const [editModal, setEditModal] = useState(null); // null | stitcher object
  const [editForm, setEditForm] = useState(EMPTY_STITCHER_EDIT);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  useEffect(() => {
    if (tab === 'users') loadUsers();
    if (tab === 'dropdowns') loadDropdowns();
    if (tab === 'stitchers') loadStitchers();
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

  // ── Stitchers ──────────────────────────────────────────────────

  const loadStitchers = async () => {
    setStitchersLoading(true);
    setStitcherMessage(null);
    try {
      const res = await getStitchers();
      if (res.success) setStitchers(res.stitchers);
      else setStitcherMessage({ type: 'error', text: 'Failed to load stitchers.' });
    } catch {
      setStitcherMessage({ type: 'error', text: 'Failed to load stitchers.' });
    }
    setStitchersLoading(false);
  };

  const topLevelStitchers = stitchers.filter(s => !s.group_parent);

  const filteredStitchers = stitchers.filter(s => {
    const matchSearch = !stitcherSearch.trim() ||
      s.name?.toLowerCase().includes(stitcherSearch.toLowerCase()) ||
      s.stitcher_code?.toLowerCase().includes(stitcherSearch.toLowerCase());
    const matchStatus = stitcherStatusFilter === 'All' || s.status === stitcherStatusFilter;
    return matchSearch && matchStatus;
  });

  const openEditStitcher = (s) => {
    setEditForm({
      name:           s.name || '',
      phone:          s.phone || '',
      cnic:           s.cnic || '',
      specialization: s.specialization || '',
      group_parent:   s.group_parent || '',
      status:         s.status || 'Active',
    });
    setEditErrors({});
    setEditModal(s);
    setStitcherMessage(null);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setEditForm(prev => ({ ...prev, phone: formatPhone(value) }));
      if (editErrors.phone) setEditErrors(prev => ({ ...prev, phone: '' }));
      return;
    }
    if (name === 'cnic') {
      setEditForm(prev => ({ ...prev, cnic: formatCNIC(value) }));
      if (editErrors.cnic) setEditErrors(prev => ({ ...prev, cnic: '' }));
      return;
    }
    setEditForm(prev => ({ ...prev, [name]: value }));
    if (editErrors[name]) setEditErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleEditSave = async () => {
    const errs = {};
    if (!editForm.name.trim()) errs.name = 'Name is required.';
    if (!editForm.phone || !PHONE_REGEX.test(editForm.phone))
      errs.phone = 'Phone number required in format XXXX-XXXXXXX';
    if (!editForm.cnic || !CNIC_REGEX.test(editForm.cnic))
      errs.cnic = 'CNIC required in format XXXXX-XXXXXXX-X';
    if (!editForm.specialization) errs.specialization = 'Specialization is required.';

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      return;
    }

    setEditSaving(true);
    try {
      const res = await updateStitcher({
        id:             editModal.id,
        name:           editForm.name.trim(),
        phone:          editForm.phone,
        cnic:           editForm.cnic,
        specialization: editForm.specialization,
        group_parent:   editForm.group_parent || null,
        status:         editForm.status,
      });
      if (res.success) {
        setStitcherMessage({ type: 'success', text: `✓ Stitcher "${editForm.name}" updated successfully.` });
        setEditModal(null);
        loadStitchers();
      } else {
        setEditErrors({ _server: res.message || 'Save failed.' });
      }
    } catch {
      setEditErrors({ _server: 'Request failed. Please try again.' });
    }
    setEditSaving(false);
  };

  const handleExcelExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = filteredStitchers.map(s => ({
      'Code':           s.stitcher_code,
      'Name':           s.name,
      'Specialization': s.specialization,
      'Group':          s.group_parent || '',
      'Phone':          s.phone,
      'CNIC':           s.cnic || '',
      'Status':         s.status,
      'Date Joined':    s.date_joined ? new Date(s.date_joined).toLocaleDateString('en-GB') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stitchers');
    XLSX.writeFile(wb, `Stitchers_${today}.xlsx`);
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

  const backPath = user.role === 'Accounts' ? '/accounts' : '/admin';

  return (
    <div className="app-container">
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            className="btn btn-small"
            onClick={() => navigate(backPath)}
            style={{ width: 'auto', background: '#e0e7ff', color: '#0f3460' }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0 }}>ZIVA — Settings</h2>
        </div>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">{user.role}</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content">
        <div className="card">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {isAdmin && tabBtn('users', 'User Management')}
            {isAdmin && tabBtn('dropdowns', 'Dropdown Management')}
            {tabBtn('stitchers', 'Stitcher Management')}
          </div>

          {/* ── USER MANAGEMENT ── */}
          {tab === 'users' && isAdmin && (
            <>
              {userMessage && <div className={`alert alert-${userMessage.type}`}>{userMessage.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Users</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-small" onClick={loadUsers} style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}>
                    ↻ Refresh
                  </button>
                  <button className="btn btn-small btn-success" onClick={openAddUser} style={{ width: 'auto' }}>
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
                              <button className="btn btn-small" onClick={() => openEditUser(u)} style={{ background: '#fff3cd', color: '#856404', width: 'auto' }}>
                                Edit
                              </button>
                              <button
                                className="btn btn-small"
                                onClick={() => handleDeactivate(u)}
                                style={{ background: u.Status === 'Active' ? '#f8d7da' : '#d1e7dd', color: u.Status === 'Active' ? '#58151c' : '#0a3622', width: 'auto' }}
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
          {tab === 'dropdowns' && isAdmin && (
            <>
              {dropdownMessage && <div className={`alert alert-${dropdownMessage.type}`}>{dropdownMessage.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Dropdown Values</h3>
                <button className="btn btn-small" onClick={loadDropdowns} style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}>
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
                      <div key={fieldDef.field} style={{ border: '1px solid #e0e7ff', borderRadius: '10px', padding: '16px' }}>
                        <p style={{ fontWeight: '700', color: '#0f3460', marginBottom: '12px', fontSize: '13px', textTransform: 'uppercase' }}>
                          {fieldDef.label}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', minHeight: '32px' }}>
                          {values.length === 0 ? (
                            <span style={{ color: '#aaa', fontSize: '13px' }}>No values yet</span>
                          ) : values.map(v => (
                            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', color: '#0f3460', borderRadius: '20px', padding: '4px 10px', fontSize: '13px' }}>
                              {v}
                              <button
                                onClick={() => handleRemoveDropdown(fieldDef, v)}
                                disabled={!!dropdownWorking[`remove:${fieldDef.field}:${v}`]}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontWeight: '700', padding: '0 2px', lineHeight: 1, fontSize: '14px' }}
                                title={`Remove "${v}"`}
                              >×</button>
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            placeholder="Add new value..."
                            value={newValues[fieldDef.field]}
                            onChange={e => setNewValues(prev => ({ ...prev, [fieldDef.field]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddDropdown(fieldDef)}
                            style={{ flex: 1, padding: '7px 10px', border: '2px solid #e8e8e8', borderRadius: '7px', fontSize: '13px' }}
                          />
                          <button
                            className="btn btn-small btn-success"
                            onClick={() => handleAddDropdown(fieldDef)}
                            disabled={!newValues[fieldDef.field].trim() || !!dropdownWorking[`add:${fieldDef.field}`]}
                            style={{ width: 'auto', padding: '7px 14px' }}
                          >Add</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── STITCHER MANAGEMENT ── */}
          {tab === 'stitchers' && (
            <>
              {stitcherMessage && <div className={`alert alert-${stitcherMessage.type}`}>{stitcherMessage.text}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Stitchers</h3>
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
                    <option value="All">All</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <button className="btn btn-small" onClick={loadStitchers} style={{ width: 'auto', background: '#f0f2f5', color: '#333' }}>
                    ↻ Refresh
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={handleExcelExport}
                    disabled={filteredStitchers.length === 0}
                    style={{ width: 'auto', background: '#16a34a', color: 'white', whiteSpace: 'nowrap' }}
                  >
                    ↓ Excel
                  </button>
                </div>
              </div>

              {stitchersLoading ? (
                <div className="loading"><div className="spinner"></div>Loading stitchers...</div>
              ) : filteredStitchers.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  {stitchers.length === 0 ? 'No stitchers found.' : 'No results match your search.'}
                </p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Specialization</th>
                        <th>Group</th>
                        <th>Phone</th>
                        <th>CNIC</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStitchers.map(s => (
                        <tr key={s.id}>
                          <td>{s.stitcher_code}</td>
                          <td>{s.name}</td>
                          <td>{s.specialization}</td>
                          <td>{s.group_parent || '—'}</td>
                          <td>{s.phone}</td>
                          <td>
                            {s.cnic ? s.cnic : (
                              <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Missing
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${s.status === 'Active' ? 'badge-accepted' : 'badge-rejected'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-small"
                              onClick={() => openEditStitcher(s)}
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
            </>
          )}
        </div>
      </div>

      {/* ── USER ADD / EDIT MODAL ── */}
      {userModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ marginBottom: '20px', color: '#0f3460' }}>
              {userModal.mode === 'add' ? 'Add New User' : 'Edit User'}
            </h3>

            {userMessage && <div className={`alert alert-${userMessage.type}`}>{userMessage.text}</div>}

            <div className="form-group">
              <label>Name *</label>
              <input type="text" name="name" value={userForm.name} onChange={handleUserFormChange} placeholder="Full name" />
            </div>

            <div className="form-group">
              <label>Role *</label>
              <select name="role" value={userForm.role} onChange={handleUserFormChange}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>{userModal.mode === 'add' ? 'Passcode *' : 'New Passcode (leave blank to keep current)'}</label>
              <input type="password" name="passcode" value={userForm.passcode} onChange={handleUserFormChange} placeholder="e.g. Fabric@123" />
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
              <button className="btn btn-primary" onClick={submitUserForm} disabled={userSaving} style={{ flex: 1 }}>
                {userSaving ? 'Saving...' : userModal.mode === 'add' ? 'Add User' : 'Save Changes'}
              </button>
              <button className="btn btn-danger" onClick={() => { setUserModal(null); setUserMessage(null); }} disabled={userSaving} style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STITCHER EDIT MODAL ── */}
      {editModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f3460' }}>
                Edit Stitcher — {editModal.stitcher_code}
              </h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#888', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {editErrors._server && (
              <div className="alert alert-error">{editErrors._server}</div>
            )}

            <div className="form-group">
              <label>Name *</label>
              <input type="text" name="name" value={editForm.name} onChange={handleEditFormChange} placeholder="Full name"
                style={editErrors.name ? { borderColor: '#dc2626' } : {}} />
              {editErrors.name && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>{editErrors.name}</p>}
            </div>

            <div className="form-group">
              <label>Phone *</label>
              <input type="text" name="phone" value={editForm.phone} onChange={handleEditFormChange} placeholder="0300-1234567"
                style={editErrors.phone ? { borderColor: '#dc2626' } : {}} />
              {editErrors.phone && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>{editErrors.phone}</p>}
            </div>

            <div className="form-group">
              <label>CNIC *</label>
              <input type="text" name="cnic" value={editForm.cnic} onChange={handleEditFormChange} placeholder="00000-0000000-0"
                style={editErrors.cnic ? { borderColor: '#dc2626' } : {}} />
              {editErrors.cnic && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>{editErrors.cnic}</p>}
            </div>

            <div className="form-grid" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label>Specialization *</label>
                <select name="specialization" value={editForm.specialization} onChange={handleEditFormChange}
                  style={editErrors.specialization ? { borderColor: '#dc2626' } : {}}>
                  <option value="">Select</option>
                  {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {editErrors.specialization && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>{editErrors.specialization}</p>}
              </div>

              <div className="form-group">
                <label>Status</label>
                <select name="status" value={editForm.status} onChange={handleEditFormChange}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Group Parent</label>
              <select name="group_parent" value={editForm.group_parent} onChange={handleEditFormChange}>
                <option value="">None (top-level)</option>
                {topLevelStitchers
                  .filter(s => s.id !== editModal.id)
                  .map(s => (
                    <option key={s.id} value={s.stitcher_code}>
                      {s.stitcher_code} — {s.name}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving} style={{ flex: 1 }}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-danger" onClick={() => setEditModal(null)} disabled={editSaving} style={{ flex: 1 }}>
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
