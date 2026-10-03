/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  getPOs, getCMTRates, getStitchers,
  getAllocations, createAllocation, updateAllocation,
  getPaymentEntries, logPaymentEntry, updatePayment,
  logFabricIssuance, getFinishingIntakeLog,
  createStitcher, updateStitcher,
} from '../api';
import ProdFlowLogo from '../components/ProdFlowLogo';
import PoweredByFintrack from '../components/PoweredByFintrack';

const TODAY = new Date().toISOString().split('T')[0];
const COMPONENTS = ['Shirt', 'Trouser', 'Dupatta'];
const availableComponentsForPO = (po) =>
  COMPONENTS.filter(component => Number(po?.[`${component.toLowerCase()}_qty`] || 0) > 0);
const hasPOComponentQty = (po, component) =>
  Number(po?.[`${component.toLowerCase()}_qty`] || 0) > 0;

const FINISHING_OPERATIONS = {
  Shirt:   ['Clipping', 'Heming', 'Tussling', 'Pressing'],
  Trouser: ['Clipping', 'Heming', 'Pressing', 'Patching'],
  Dupatta: ['Heming', 'Tussling', 'Pressing', 'Patching'],
};

const FL_DEPARTMENTS = ['Finishing Shirt', 'Finishing Trouser', 'Finishing Dupatta'];

const FL_OPERATION_OPTIONS = {
  'Finishing Shirt':   ['Clipping', 'Heming', 'Tussling', 'Pressing'],
  'Finishing Trouser': ['Clipping', 'Heming', 'Pressing', 'Patching'],
  'Finishing Dupatta': ['Heming', 'Tussling', 'Pressing', 'Patching'],
};

const FL_DEPT_OP_TO_RATE_FIELD = {
  'Finishing Shirt|Clipping':   'fs_clipping',
  'Finishing Shirt|Heming':     'fs_heming',
  'Finishing Shirt|Tussling':   'fs_tussling',
  'Finishing Shirt|Pressing':   'fs_pressing',
  'Finishing Trouser|Clipping': 'ft_clipping',
  'Finishing Trouser|Heming':   'ft_heming',
  'Finishing Trouser|Pressing': 'ft_pressing',
  'Finishing Trouser|Patching': 'ft_patching',
  'Finishing Dupatta|Heming':   'fd_heming',
  'Finishing Dupatta|Tussling': 'fd_tussling',
  'Finishing Dupatta|Pressing': 'fd_pressing',
  'Finishing Dupatta|Patching': 'fd_patching',
};

function finishingComponentToDeptOp(component) {
  const c = (component || '').trim().toLowerCase();
  const garments = ['shirt', 'trouser', 'dupatta'];
  for (const g of garments) {
    if (c.startsWith(g + ' ')) {
      const opRaw = c.slice(g.length + 1);
      const op = opRaw.charAt(0).toUpperCase() + opRaw.slice(1);
      const dept = `Finishing ${g.charAt(0).toUpperCase() + g.slice(1)}`;
      return { dept, op };
    }
  }
  return { dept: '', op: '' };
}

function deriveFinishingColor(pos, po_number, department) {
  const po = pos.find(p => p.po_number === po_number);
  if (!po || !department) return '';
  if (department.includes('Shirt'))   return po.shirt_colour   || '';
  if (department.includes('Trouser')) return po.trouser_colour || '';
  if (department.includes('Dupatta')) return po.dupatta_colour || '';
  return '';
}

const EMPTY_ALLOC_FORM = {
  allocation_date: TODAY,
  po_number: '',
  component: '',
  operation: '',
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

const EMPTY_PL_FORM = {
  entry_date:    TODAY,
  po_number:     '',
  stitcher_code: '',
  department:    '',
  operation:     '',
  qty_claimed:   '',
  color:         '',
  remarks:       '',
};

function validateDelta(df, alloc) {
  const deltaRet  = Number(df.qty_returned_delta  || 0);
  const deltaAcc  = Number(df.qty_accepted_delta  || 0);
  const deltaRwk  = Number(df.qty_rework_delta    || 0);
  const deltaRej  = Number(df.qty_rejected_delta  || 0);
  const existing  = Number(alloc.qty_returned     || 0);
  const allocated = Number(alloc.qty_allocated    || 0);
  if (deltaAcc + deltaRwk + deltaRej !== deltaRet)
    return 'Accepted + Rework + Rejected must equal Additional Returned.';
  if (existing + deltaRet > allocated)
    return `Returned quantity would exceed allocated quantity (${allocated - existing} pieces remaining).`;
  return '';
}

function rowBg(status) {
  if (status === 'Complete') return '#f0fdf4';
  if (status === 'Overdue')  return '#fff7ed';
  return '#eff6ff';
}

function StatusBadge({ status }) {
  const display = status === 'Pending' ? 'In Progress' : status;
  const colors  = { Complete: '#16a34a', Overdue: '#f97316', 'In Progress': '#3b82f6' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
      fontWeight: '700', textTransform: 'uppercase',
      background: colors[display] || '#3b82f6', color: 'white',
    }}>{display}</span>
  );
}

function PaymentStatusBadge({ status }) {
  const cfg = {
    Pending:  { bg: '#fef3c7', color: '#d29922' },
    Verified: { bg: '#dbeafe', color: '#4a7cc9' },
    Paid:     { bg: '#dcfce7', color: '#3fb950' },
  };
  const s = cfg[status] || cfg.Pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
      fontWeight: '700', textTransform: 'uppercase', background: s.bg, color: s.color,
    }}>{status || 'Pending'}</span>
  );
}

function FinishingView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('receive');

  // ── Shared data ──────────────────────────────────────────────────────────────
  const [pos,         setPos]         = useState([]);
  const [approvedSet, setApprovedSet] = useState(new Set());
  const [allStitchers, setAllStitchers] = useState([]);   // combined in-house + out-of-factory
  const [dataLoading, setDataLoading] = useState(false);

  // ── Tab 1: Receive Pieces ────────────────────────────────────────────────────
  const [rcvForm, setRcvForm] = useState({
    rcv_date: TODAY,
    po_number: '',
    component: '',
    operation: '',
    qty_received: '',
    remarks: '',
  });
  const [rcvSubmitting, setRcvSubmitting] = useState(false);
  const [rcvMsg, setRcvMsg] = useState(null);
  const [intakeLogs, setIntakeLogs] = useState([]);
  const [intakeLoading, setIntakeLoading] = useState(false);

  // ── Tab 2: Allocate ──────────────────────────────────────────────────────────
  const [allocTab, setAllocTab] = useState('new');
  const [allocForm, setAllocForm] = useState(EMPTY_ALLOC_FORM);
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocFormMsg, setAllocFormMsg] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocSearch, setAllocSearch] = useState('');
  const [allocStatusFilter, setAllocStatusFilter] = useState('All');
  const [allocTrackerMsg, setAllocTrackerMsg] = useState(null);
  const [updateModal, setUpdateModal] = useState(null);
  const [deltaForm, setDeltaForm] = useState(EMPTY_DELTA);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Tab 3: Payment Log ───────────────────────────────────────────────────────
  const [plSubTab, setPlSubTab] = useState('log');
  const [plEntryMode, setPlEntryMode] = useState('single');
  const [plPos, setPlPos] = useState([]);
  const [plApprovedSet, setPlApprovedSet] = useState(new Set());
  const [plDataLoading, setPlDataLoading] = useState(false);
  const [plPoRateData, setPlPoRateData] = useState(null);
  const [plRateLoading, setPlRateLoading] = useState(false);
  const [plRateError, setPlRateError] = useState('');
  const [plForm, setPlForm] = useState(EMPTY_PL_FORM);
  const [plSubmitting, setPlSubmitting] = useState(false);
  const [plFormMsg, setPlFormMsg] = useState(null);
  const [plEntries, setPlEntries] = useState([]);
  const [plEntriesLoading, setPlEntriesLoading] = useState(false);
  const [plSelectedOps, setPlSelectedOps] = useState([]);
  const [bulkStitcher, setBulkStitcher] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [bulkProgress, setBulkProgress] = useState('');
  const [flexMarking, setFlexMarking] = useState({});

  // ── Tab 4: Stitcher Dashboard ────────────────────────────────────────────────
  const [sdStitcher, setSdStitcher] = useState('');
  const [sdDateFrom, setSdDateFrom] = useState('');
  const [sdDateTo, setSdDateTo] = useState('');
  const [sdLoading, setSdLoading] = useState(false);
  const [sdEntries, setSdEntries] = useState([]);
  const [sdLoaded, setSdLoaded] = useState(false);

  // ── Tab 5: Worker Management ─────────────────────────────────────────────────
  const PHONE_REGEX_FIN = /^\d{4}-\d{7}$/;
  const [wkWorkers, setWkWorkers] = useState([]);
  const [wkLoading, setWkLoading] = useState(false);
  const [wkMsg, setWkMsg] = useState(null);
  const [wkSearch, setWkSearch] = useState('');
  const [wkStatusFilter, setWkStatusFilter] = useState('Active');
  const [wkForm, setWkForm] = useState({ name: '', phone: '', specialization: 'Mixed', worker_type: 'Finishing_InHouse' });
  const [wkSubmitting, setWkSubmitting] = useState(false);
  const [wkPhoneError, setWkPhoneError] = useState('');
  const [wkEditModal, setWkEditModal] = useState(null);
  const [wkEditForm, setWkEditForm] = useState({ name: '', phone: '', specialization: '', status: 'Active', worker_type: '' });
  const [wkEditSaving, setWkEditSaving] = useState(false);
  const [wkEditErr, setWkEditErr] = useState(null);

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSharedData();
    loadAllocations();
    loadIntakeLogs();
    plLoadDropdowns();
    plLoadMyEntries();
  }, []);

  const loadSharedData = async () => {
    setDataLoading(true);
    try {
      const [posRes, ratesRes, inRes, outRes] = await Promise.all([
        getPOs(),
        getCMTRates('?status=Approved'),
        getStitchers('?worker_type=Finishing_InHouse&active=true'),
        getStitchers('?worker_type=Finishing_OutOfFactory&active=true'),
      ]);
      if (posRes.success)   setPos(posRes.pos);
      if (ratesRes.success) setApprovedSet(new Set(ratesRes.rates.map(r => r.po_number)));
      const combined = [
        ...(inRes.success  ? inRes.stitchers  : []).map(s => ({ ...s, _typeLabel: 'In-House' })),
        ...(outRes.success ? outRes.stitchers : []).map(s => ({ ...s, _typeLabel: 'Out-of-Factory' })),
      ];
      setAllStitchers(combined);
    } catch { /* silently fail */ }
    setDataLoading(false);
  };

  const loadWorkers = async () => {
    setWkLoading(true);
    setWkMsg(null);
    try {
      const [r1, r2] = await Promise.all([
        getStitchers('?worker_type=Finishing_InHouse'),
        getStitchers('?worker_type=Finishing_OutOfFactory'),
      ]);
      setWkWorkers([...(r1.success ? r1.stitchers : []), ...(r2.success ? r2.stitchers : [])]);
    } catch {
      setWkMsg({ type: 'error', text: 'Failed to load workers.' });
    }
    setWkLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'workers' && wkWorkers.length === 0 && !wkLoading) {
      loadWorkers();
    }
  }, [activeTab]);

  const eligiblePOs = pos.filter(p => p.status === 'Active' && approvedSet.has(p.po_number));
  const selectedReceivePO = pos.find(p => p.po_number === rcvForm.po_number);
  const receiveComponents = rcvForm.po_number ? availableComponentsForPO(selectedReceivePO) : COMPONENTS;
  const selectedAllocPO = pos.find(p => p.po_number === allocForm.po_number);
  const allocComponents = allocForm.po_number ? availableComponentsForPO(selectedAllocPO) : COMPONENTS;

  // ── Tab 1: Receive Pieces ────────────────────────────────────────────────────

  const loadIntakeLogs = async () => {
    setIntakeLoading(true);
    try {
      const res = await getFinishingIntakeLog(`&issued_by=${encodeURIComponent(user.name)}`);
      if (res.success) setIntakeLogs(res.logs);
    } catch { /* silently fail */ }
    setIntakeLoading(false);
  };

  const handleRcvChange = (e) => {
    const { name, value } = e.target;
    const patch = { [name]: value };
    if (name === 'component') patch.operation = '';
    if (name === 'po_number') {
      const nextPO = pos.find(p => p.po_number === value);
      const nextComponents = availableComponentsForPO(nextPO);
      if (rcvForm.component && !nextComponents.includes(rcvForm.component)) {
        patch.component = '';
        patch.operation = '';
      }
    }
    setRcvForm(prev => ({ ...prev, ...patch }));
    if (rcvMsg) setRcvMsg(null);
  };

  const handleRcvSubmit = async (e) => {
    e.preventDefault();
    if (!rcvForm.po_number || !rcvForm.component || !rcvForm.operation || !rcvForm.qty_received) {
      setRcvMsg({ type: 'error', text: 'All required fields must be filled.' });
      return;
    }
    setRcvSubmitting(true);
    setRcvMsg(null);
    try {
      const componentFull = `${rcvForm.component} ${rcvForm.operation}`;
      const res = await logFabricIssuance({
        po_number:      rcvForm.po_number,
        component:      componentFull,
        meters_issued:  Number(rcvForm.qty_received),
        issued_by:      user.name,
        ...(rcvForm.remarks ? { remarks: rcvForm.remarks } : {}),
      });
      if (res.success) {
        setRcvMsg({ type: 'success', text: 'Pieces received logged successfully.' });
        setRcvForm({ rcv_date: TODAY, po_number: '', component: '', operation: '', qty_received: '', remarks: '' });
        loadIntakeLogs();
      } else {
        setRcvMsg({ type: 'error', text: res.message || 'Failed to log received pieces.' });
      }
    } catch {
      setRcvMsg({ type: 'error', text: 'Network error. Please try again.' });
    }
    setRcvSubmitting(false);
  };

  // ── Tab 2: Allocate ──────────────────────────────────────────────────────────

  const loadAllocations = async () => {
    setAllocLoading(true);
    try {
      const res = await getAllocations('?module_type=Finishing');
      if (res.success) setAllocations(res.allocations);
    } catch { /* silently fail */ }
    setAllocLoading(false);
  };

  const handleAllocFormChange = (e) => {
    const { name, value } = e.target;
    const patch = { [name]: value };
    if (name === 'component') patch.operation = '';
    if (name === 'po_number') {
      const nextPO = pos.find(p => p.po_number === value);
      const nextComponents = availableComponentsForPO(nextPO);
      if (allocForm.component && !nextComponents.includes(allocForm.component)) {
        patch.component = '';
        patch.operation = '';
      }
    }
    setAllocForm(prev => ({ ...prev, ...patch }));
    if (allocFormMsg) setAllocFormMsg(null);
  };

  const handleAllocSubmit = async (e) => {
    e.preventDefault();
    if (!allocForm.po_number || !allocForm.component || !allocForm.operation || !allocForm.stitcher_code || !allocForm.qty_allocated) {
      setAllocFormMsg({ type: 'error', text: 'All required fields must be filled.' });
      return;
    }
    setAllocSubmitting(true);
    setAllocFormMsg(null);
    try {
      const componentFull = `${allocForm.component} ${allocForm.operation}`;
      const res = await createAllocation({
        po_number:       allocForm.po_number,
        component:       componentFull.toLowerCase(),
        stitcher_code:   allocForm.stitcher_code,
        qty_allocated:   Number(allocForm.qty_allocated),
        allocation_date: allocForm.allocation_date || TODAY,
        module_type:     'Finishing',
        ...(allocForm.remarks ? { remarks: allocForm.remarks } : {}),
      });
      if (res.success) {
        setAllocFormMsg({ type: 'success', text: 'Allocation created successfully.' });
        setAllocForm(EMPTY_ALLOC_FORM);
        loadAllocations();
      } else {
        setAllocFormMsg({ type: 'error', text: res.message || 'Failed to create allocation.' });
      }
    } catch {
      setAllocFormMsg({ type: 'error', text: 'Network error. Please try again.' });
    }
    setAllocSubmitting(false);
  };

  const filteredAlloc = allocations.filter(a => {
    const term = allocSearch.toLowerCase();
    const matchSearch = !term ||
      (a.po_number     || '').toLowerCase().includes(term) ||
      (a.stitcher_name || '').toLowerCase().includes(term);
    const displayStatus = a.status === 'Pending' ? 'In Progress' : a.status;
    const matchStatus = allocStatusFilter === 'All' || displayStatus === allocStatusFilter;
    return matchSearch && matchStatus;
  });

  const totalsMap = {};
  filteredAlloc.forEach(a => {
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

  const openUpdate = (a) => { setUpdateModal(a); setDeltaForm(EMPTY_DELTA); setModalError(''); };
  const closeModal = () => { setUpdateModal(null); setModalError(''); };
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
        setAllocTrackerMsg({ type: 'success', text: 'Allocation updated successfully.' });
        loadAllocations();
        setTimeout(() => setAllocTrackerMsg(null), 4000);
      } else {
        setModalError(res.message || 'Failed to update allocation.');
      }
    } catch {
      setModalError('Network error. Please try again.');
    }
    setSaving(false);
  };

  // ── Tab 3: Payment Log ───────────────────────────────────────────────────────

  const plLoadDropdowns = async () => {
    setPlDataLoading(true);
    try {
      const [posRes, ratesRes] = await Promise.all([
        getPOs(),
        getCMTRates('?status=Approved'),
      ]);
      if (posRes.success)   setPlPos(posRes.pos);
      if (ratesRes.success) setPlApprovedSet(new Set(ratesRes.rates.map(r => r.po_number)));
    } catch { /* silently fail */ }
    setPlDataLoading(false);
  };

  const plLoadMyEntries = async () => {
    setPlEntriesLoading(true);
    try {
      const res = await getPaymentEntries(`?submitted_by=${encodeURIComponent(user.name)}`);
      if (res.success) setPlEntries(res.payments);
    } catch { /* silently fail */ }
    setPlEntriesLoading(false);
  };

  useEffect(() => {
    const requestedPO = plForm.po_number;
    if (!requestedPO) {
      setPlPoRateData(null);
      setPlRateError('');
      setPlRateLoading(false);
      return;
    }
    let isCurrentRequest = true;
    setPlRateLoading(true);
    setPlPoRateData(null);
    setPlRateError('');
    getCMTRates(`?status=Approved&po_number=${encodeURIComponent(requestedPO)}`)
      .then(res => {
        if (!isCurrentRequest) return;
        const matchingRate = res.success && Array.isArray(res.rates)
          ? res.rates.find(rate => rate.po_number === requestedPO && rate.status === 'Approved')
          : null;
        if (matchingRate) setPlPoRateData(matchingRate);
        else setPlRateError('No approved rate found for this PO');
      })
      .catch(() => {
        if (isCurrentRequest) setPlRateError('Rate lookup failed');
      })
      .finally(() => {
        if (isCurrentRequest) setPlRateLoading(false);
      });
    return () => { isCurrentRequest = false; };
  }, [plForm.po_number]);

  const plEligiblePOs = plPos.filter(p => p.status === 'Active' && plApprovedSet.has(p.po_number));
  const selectedPaymentPO = plPos.find(p => p.po_number === plForm.po_number);
  const plDepartments = FL_DEPARTMENTS.filter(d =>
    !plForm.po_number ||
    !d.includes('Dupatta') ||
    hasPOComponentQty(selectedPaymentPO, 'dupatta')
  );

  // Multi-op derived values: per-op rates and combined total
  const plOpRates = plSelectedOps.map(op => {
    const rf = plPoRateData ? FL_DEPT_OP_TO_RATE_FIELD[`${plForm.department}|${op}`] : null;
    const rate = rf && plPoRateData ? Number(plPoRateData[rf] || 0) : 0;
    const qty = Number(plForm.qty_claimed) || 0;
    return { op, rate, amount: rate * qty };
  });
  const plCombinedTotal = plOpRates.reduce((s, r) => s + r.amount, 0);

  const plHandleFormChange = (e) => {
    const { name, value } = e.target;
    const patch = { [name]: value };
    if (name === 'department') {
      patch.operation = '';
      setPlSelectedOps([]);
    }
    if (name === 'po_number') {
      const nextPO = plPos.find(p => p.po_number === value);
      if (!hasPOComponentQty(nextPO, 'dupatta') && plForm.department.includes('Dupatta')) {
        patch.department = '';
        patch.operation = '';
        setPlSelectedOps([]);
      }
    }
    if (['po_number', 'department'].includes(name)) {
      const newPO   = name === 'po_number'   ? value : plForm.po_number;
      const newDept = name === 'department'  ? value : plForm.department;
      patch.color   = deriveFinishingColor(plPos, newPO, newDept);
    }
    setPlForm(prev => ({ ...prev, ...patch }));
    if (plFormMsg) setPlFormMsg(null);
  };

  const plToggleOp = (op) => {
    setPlSelectedOps(prev =>
      prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]
    );
    if (plFormMsg) setPlFormMsg(null);
  };

  const plHandleSubmit = async (e) => {
    e.preventDefault();
    if (!plForm.po_number || !plForm.stitcher_code || !plForm.department || !plForm.qty_claimed) {
      setPlFormMsg({ type: 'error', text: 'All required fields must be filled.' });
      return;
    }
    if (plSelectedOps.length === 0) {
      setPlFormMsg({ type: 'error', text: 'Select at least one operation.' });
      return;
    }
    if (plRateError || !plPoRateData) {
      setPlFormMsg({ type: 'error', text: 'Cannot submit — no approved rate found for this PO.' });
      return;
    }
    for (const op of plSelectedOps) {
      const rf = FL_DEPT_OP_TO_RATE_FIELD[`${plForm.department}|${op}`];
      const rate = rf ? Number(plPoRateData[rf] || 0) : 0;
      if (!rate) {
        setPlFormMsg({ type: 'error', text: `No rate found for ${plForm.department} — ${op}. Check CMT rates.` });
        return;
      }
    }
    const selectedStitcher = allStitchers.find(s => s.stitcher_code === plForm.stitcher_code);
    setPlSubmitting(true);
    setPlFormMsg(null);
    let submitted = 0;
    let failed = 0;
    for (const op of plSelectedOps) {
      try {
        const color = deriveFinishingColor(plPos, plForm.po_number, plForm.department);
        const res = await logPaymentEntry({
          entry_date:       plForm.entry_date || TODAY,
          po_number:        plForm.po_number,
          stitcher_code:    plForm.stitcher_code,
          department:       plForm.department,
          operation:        op,
          qty_claimed:      Number(plForm.qty_claimed),
          ...(color            ? { color }            : {}),
          ...(plForm.remarks   ? { remarks: plForm.remarks } : {}),
          worker_type:      selectedStitcher?.worker_type || null,
          flexible_payment: selectedStitcher?.worker_type === 'Finishing_OutOfFactory',
        });
        if (res.success) submitted++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setPlSubmitting(false);
    if (failed === 0) {
      setPlFormMsg({ type: 'success', text: `✓ ${submitted} entr${submitted === 1 ? 'y' : 'ies'} logged successfully.` });
      setPlForm(prev => ({ ...EMPTY_PL_FORM, po_number: prev.po_number }));
      setPlSelectedOps([]);
      plLoadMyEntries();
    } else {
      setPlFormMsg({ type: 'error', text: `${submitted} submitted, ${failed} failed. Please retry.` });
    }
  };

  const loadBulkRows = async (stitcherCode) => {
    setBulkLoading(true);
    setBulkRows([]);
    setBulkMsg(null);
    try {
      const allocRes = await getAllocations(
        `?stitcher_code=${encodeURIComponent(stitcherCode)}&module_type=Finishing&status=In Progress`
      );
      if (!allocRes.success || !allocRes.allocations.length) {
        setBulkMsg({ type: 'warning', text: 'No in-progress finishing allocations found for this stitcher.' });
        setBulkLoading(false);
        return;
      }
      const uniquePOs = [...new Set(allocRes.allocations.map(a => a.po_number))];
      const rateMap = {};
      await Promise.all(uniquePOs.map(async (po) => {
        const r = await getCMTRates(`?status=Approved&po_number=${encodeURIComponent(po)}`);
        const matchingRate = r.success && Array.isArray(r.rates)
          ? r.rates.find(rate => rate.po_number === po && rate.status === 'Approved')
          : null;
        if (matchingRate) rateMap[po] = matchingRate;
      }));
      const loggedSet = new Set(
        plEntries
          .filter(e => e.stitcher_code === stitcherCode)
          .map(e => `${e.po_number}|${(e.component || '').toLowerCase()}`)
      );
      const selectedStitcher = allStitchers.find(s => s.stitcher_code === stitcherCode);
      const rows = allocRes.allocations.map(a => {
        const { dept, op } = finishingComponentToDeptOp(a.component);
        const rateKey   = dept && op ? `${dept}|${op}` : null;
        const rateField = rateKey ? FL_DEPT_OP_TO_RATE_FIELD[rateKey] : null;
        const rateObj   = rateMap[a.po_number] || null;
        const rate      = rateField && rateObj ? Number(rateObj[rateField] || 0) : null;
        const qty       = Number(a.qty_accepted || 0);
        return {
          allocationId:   a.id,
          po_number:      a.po_number,
          component:      a.component,
          stitcher_code:  a.stitcher_code,
          stitcher_name:  a.stitcher_name,
          qty_accepted:   qty,
          department:     dept,
          operation:      op,
          qty_claimed:    String(qty),
          rate,
          rateObj,
          amount:         rate ? qty * rate : 0,
          alreadyLogged:  loggedSet.has(`${a.po_number}|${(a.component || '').toLowerCase()}`),
          worker_type:    selectedStitcher?.worker_type || null,
          flexible_payment: selectedStitcher?.worker_type === 'Finishing_OutOfFactory',
        };
      });
      setBulkRows(rows);
    } catch {
      setBulkMsg({ type: 'error', text: 'Failed to load allocations.' });
    }
    setBulkLoading(false);
  };

  const bulkHandleRowChange = (index, field, value) => {
    setBulkRows(prev => {
      const rows = [...prev];
      const row = { ...rows[index], [field]: value };
      if (field === 'department') { row.operation = ''; row.rate = null; row.amount = 0; }
      if (field === 'operation') {
        const rateKey   = `${row.department}|${value}`;
        const rateField = FL_DEPT_OP_TO_RATE_FIELD[rateKey];
        row.rate   = rateField && row.rateObj ? Number(row.rateObj[rateField] || 0) : null;
        const qty  = Number(row.qty_claimed) || 0;
        row.amount = row.rate ? qty * row.rate : 0;
      }
      if (field === 'qty_claimed') {
        const qty  = Number(value) || 0;
        row.amount = row.rate ? qty * row.rate : 0;
      }
      rows[index] = row;
      return rows;
    });
  };

  const bulkHandleSubmitAll = async () => {
    const toSubmit = bulkRows.filter(r =>
      r.qty_claimed && Number(r.qty_claimed) > 0 && r.department && r.operation && r.rate
    );
    if (!toSubmit.length) {
      setBulkMsg({ type: 'error', text: 'No valid rows to submit.' });
      return;
    }
    setBulkSubmitting(true);
    setBulkMsg(null);
    let submitted = 0, failed = 0;
    for (let i = 0; i < toSubmit.length; i++) {
      setBulkProgress(`${i + 1}/${toSubmit.length}`);
      const row = toSubmit[i];
      try {
        const color = deriveFinishingColor(plPos, row.po_number, row.department);
        const res = await logPaymentEntry({
          entry_date:       TODAY,
          po_number:        row.po_number,
          stitcher_code:    row.stitcher_code,
          department:       row.department,
          operation:        row.operation,
          qty_claimed:      Number(row.qty_claimed),
          ...(color ? { color } : {}),
          worker_type:      row.worker_type,
          flexible_payment: row.flexible_payment,
        });
        if (res.success) submitted++;
        else failed++;
      } catch { failed++; }
    }
    setBulkSubmitting(false);
    setBulkProgress('');
    setBulkMsg({
      type: failed === 0 ? 'success' : 'warning',
      text: `${submitted} entr${submitted === 1 ? 'y' : 'ies'} submitted${failed > 0 ? `, ${failed} failed` : ''}.`,
    });
    if (submitted > 0) { plLoadMyEntries(); loadBulkRows(bulkStitcher); }
  };

  const handleMarkPaidFlexible = async (entry) => {
    setFlexMarking(prev => ({ ...prev, [entry.id]: true }));
    try {
      const res = await updatePayment({ action: 'mark_paid_flexible', id: entry.id });
      if (res.success) plLoadMyEntries();
    } catch { /* silently fail */ }
    setFlexMarking(prev => ({ ...prev, [entry.id]: false }));
  };

  // ── Tab 4: Stitcher Dashboard ────────────────────────────────────────────────

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
    } catch { setSdEntries([]); }
    setSdLoading(false);
    setSdLoaded(true);
  };

  const sdHandleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...sdEntries].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
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
      [`Total Pieces: ${sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0)}`, '', '', '', '', '', '', `Total Amount: PKR ${sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Finishing Performance');
    XLSX.writeFile(wb, `${sdStitcher.replace(/\s+/g, '_')}_Finishing_${today}.xlsx`);
  };

  // ── Tab style helper ─────────────────────────────────────────────────────────

  const tabStyle = (tab) => ({
    padding: '12px 28px', border: 'none',
    borderBottom: activeTab === tab ? '3px solid #0f3460' : '3px solid transparent',
    background: 'none', cursor: 'pointer',
    fontWeight: activeTab === tab ? '700' : '500',
    color: activeTab === tab ? '#0f3460' : '#888',
    fontSize: '15px', transition: 'all 0.15s',
  });

  const subTabStyle = (tab, current) => ({
    padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600',
    color: current === tab ? '#0f3460' : '#888',
    borderBottom: current === tab ? '3px solid #0f3460' : '3px solid transparent',
    marginBottom: '-2px', transition: 'color 0.15s',
  });

  // ── Derived payment log values ───────────────────────────────────────────────

  const regularEntries = plEntries.filter(e => !e.flexible_payment);
  const flexEntries    = plEntries.filter(e => e.flexible_payment);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <ProdFlowLogo height={32} />
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Finishing</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: '1200px' }}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', background: '#161b22', borderRadius: '12px 12px 0 0',
          borderBottom: '1px solid #30363d', marginBottom: '2px', padding: '0 8px',
          flexWrap: 'wrap',
        }}>
          <button style={tabStyle('receive')}   onClick={() => setActiveTab('receive')}>Receive Pieces</button>
          <button style={tabStyle('allocate')}  onClick={() => setActiveTab('allocate')}>Allocate</button>
          <button style={tabStyle('paylog')}    onClick={() => setActiveTab('paylog')}>Payment Log</button>
          <button style={tabStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>Stitcher Dashboard</button>
          <button style={tabStyle('workers')} onClick={() => setActiveTab('workers')}>Workers</button>
        </div>

        {/* ── Tab 1: Receive Pieces ─────────────────────────────────────────── */}
        {activeTab === 'receive' && (
          <>
            <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
              <h3>Receive Pieces</h3>
              <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '20px', marginTop: '-8px' }}>
                Log pieces received from QC to start finishing work.
              </p>

              {dataLoading ? (
                <div className="loading"><div className="spinner" />Loading...</div>
              ) : (
                <form onSubmit={handleRcvSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Date *</label>
                      <input
                        type="date"
                        name="rcv_date"
                        value={rcvForm.rcv_date}
                        onChange={handleRcvChange}
                        max={TODAY}
                      />
                    </div>

                    <div className="form-group">
                      <label>PO Number *</label>
                      <select name="po_number" value={rcvForm.po_number} onChange={handleRcvChange} required>
                        <option value="">Select PO...</option>
                        {eligiblePOs.map(p => (
                          <option key={p.po_number} value={p.po_number}>
                            {p.po_number} — {p.collection_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Component *</label>
                      <select name="component" value={rcvForm.component} onChange={handleRcvChange} required>
                        <option value="">Select component...</option>
                        {receiveComponents.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Operation *</label>
                      <select
                        name="operation"
                        value={rcvForm.operation}
                        onChange={handleRcvChange}
                        required
                        disabled={!rcvForm.component}
                      >
                        <option value="">Select operation...</option>
                        {(FINISHING_OPERATIONS[rcvForm.component] || []).map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Qty Received *</label>
                      <input
                        type="number"
                        name="qty_received"
                        value={rcvForm.qty_received}
                        onChange={handleRcvChange}
                        min="1"
                        required
                        placeholder="Pieces"
                      />
                    </div>

                    <div className="form-group">
                      <label>Remarks</label>
                      <input
                        type="text"
                        name="remarks"
                        value={rcvForm.remarks}
                        onChange={handleRcvChange}
                        placeholder="Optional notes"
                      />
                    </div>
                  </div>

                  {rcvMsg && (
                    <div className={`alert alert-${rcvMsg.type === 'error' ? 'error' : 'success'}`}
                         style={{ marginTop: '8px' }}>
                      {rcvMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={rcvSubmitting}
                    style={{ marginTop: '8px' }}
                  >
                    {rcvSubmitting ? 'Logging...' : 'Log Received Pieces'}
                  </button>
                </form>
              )}
            </div>

            {/* Received Pieces table */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>Received Pieces Log</h3>
                <button
                  className="btn btn-primary btn-small"
                  onClick={loadIntakeLogs}
                  disabled={intakeLoading}
                >
                  {intakeLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {intakeLoading ? (
                <div className="loading"><div className="spinner" />Loading...</div>
              ) : intakeLogs.length === 0 ? (
                <p style={{ color: '#8b949e', textAlign: 'center', padding: '24px' }}>No pieces received yet.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>PO</th>
                        <th>Component &amp; Operation</th>
                        <th>Qty Received</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intakeLogs.map(log => {
                        const po = pos.find(p => p.po_number === log.po_number);
                        return (
                          <tr key={log.id}>
                            <td>{log.issued_at ? String(log.issued_at).slice(0, 10) : '—'}</td>
                            <td>{log.po_number}{po ? ` — ${po.collection_name}` : ''}</td>
                            <td style={{ textTransform: 'capitalize' }}>{log.component}</td>
                            <td>{log.meters_issued}</td>
                            <td>{log.remarks || '—'}</td>
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

        {/* ── Tab 2: Allocate ───────────────────────────────────────────────── */}
        {activeTab === 'allocate' && (
          <>
            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #30363d', background: '#161b22', borderRadius: '0 0 0 0', padding: '0 8px' }}>
              <button style={subTabStyle('new', allocTab)}     onClick={() => setAllocTab('new')}>New Allocation</button>
              <button style={subTabStyle('tracker', allocTab)} onClick={() => setAllocTab('tracker')}>Live Tracker</button>
            </div>

            {/* New Allocation */}
            {allocTab === 'new' && (
              <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
                <h3>New Finishing Allocation</h3>

                {dataLoading ? (
                  <div className="loading"><div className="spinner" />Loading...</div>
                ) : (
                  <form onSubmit={handleAllocSubmit}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Allocation Date *</label>
                        <input
                          type="date"
                          name="allocation_date"
                          value={allocForm.allocation_date}
                          onChange={handleAllocFormChange}
                          max={TODAY}
                        />
                      </div>

                      <div className="form-group">
                        <label>PO Number *</label>
                        <select name="po_number" value={allocForm.po_number} onChange={handleAllocFormChange} required>
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
                        <label>Component *</label>
                        <select name="component" value={allocForm.component} onChange={handleAllocFormChange} required>
                          <option value="">Select component...</option>
                          {allocComponents.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Operation *</label>
                        <select
                          name="operation"
                          value={allocForm.operation}
                          onChange={handleAllocFormChange}
                          required
                          disabled={!allocForm.component}
                        >
                          <option value="">Select operation...</option>
                          {(FINISHING_OPERATIONS[allocForm.component] || []).map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Finishing Worker *</label>
                        <select name="stitcher_code" value={allocForm.stitcher_code} onChange={handleAllocFormChange} required>
                          <option value="">Select worker...</option>
                          {allStitchers.map(s => (
                            <option key={s.stitcher_code} value={s.stitcher_code}>
                              {s.stitcher_code} — {s.name} ({s._typeLabel})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Qty Allocated *</label>
                        <input
                          type="number"
                          name="qty_allocated"
                          value={allocForm.qty_allocated}
                          onChange={handleAllocFormChange}
                          min="1"
                          required
                          placeholder="Pieces"
                        />
                      </div>

                      <div className="form-group">
                        <label>Remarks</label>
                        <input
                          type="text"
                          name="remarks"
                          value={allocForm.remarks}
                          onChange={handleAllocFormChange}
                          placeholder="Optional notes"
                        />
                      </div>
                    </div>

                    {allocFormMsg && (
                      <div className={`alert alert-${allocFormMsg.type === 'error' ? 'error' : 'success'}`}
                           style={{ marginTop: '8px' }}>
                        {allocFormMsg.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={allocSubmitting}
                      style={{ marginTop: '8px' }}
                    >
                      {allocSubmitting ? 'Creating...' : 'Create Allocation'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Live Tracker */}
            {allocTab === 'tracker' && (
              <>
                <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                    <input
                      type="text"
                      placeholder="Search by PO or worker name..."
                      value={allocSearch}
                      onChange={e => setAllocSearch(e.target.value)}
                      style={{ flex: '1', minWidth: '200px', padding: '10px 14px', border: '1px solid #30363d', borderRadius: '8px', fontSize: '14px' }}
                    />
                    <select
                      value={allocStatusFilter}
                      onChange={e => setAllocStatusFilter(e.target.value)}
                      style={{ padding: '10px 14px', border: '1px solid #30363d', borderRadius: '8px', fontSize: '14px' }}
                    >
                      <option>All</option>
                      <option>In Progress</option>
                      <option>Complete</option>
                      <option>Overdue</option>
                    </select>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={loadAllocations}
                      disabled={allocLoading}
                    >
                      {allocLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  {allocTrackerMsg && (
                    <div className={`alert alert-${allocTrackerMsg.type === 'error' ? 'error' : 'success'}`}>
                      {allocTrackerMsg.text}
                    </div>
                  )}

                  {allocLoading ? (
                    <div className="loading"><div className="spinner" />Loading allocations...</div>
                  ) : (
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>PO</th>
                            <th>Component &amp; Operation</th>
                            <th>Worker</th>
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
                          {filteredAlloc.length === 0 ? (
                            <tr>
                              <td colSpan={12} style={{ textAlign: 'center', color: '#8b949e', padding: '32px' }}>
                                No allocations found.
                              </td>
                            </tr>
                          ) : filteredAlloc.map(a => {
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
                                      style={{ background: '#4a7cc9', color: 'white', whiteSpace: 'nowrap' }}
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
                            <th>Worker</th>
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
          </>
        )}

        {/* ── Tab 3: Payment Log ────────────────────────────────────────────── */}
        {activeTab === 'paylog' && (
          <>
            <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '1px solid #30363d' }}>
              <button style={subTabStyle('log',       plSubTab)} onClick={() => setPlSubTab('log')}>Log Entry</button>
              <button style={subTabStyle('entries',   plSubTab)} onClick={() => setPlSubTab('entries')}>My Entries</button>
              <button style={subTabStyle('dashboard', plSubTab)} onClick={() => setPlSubTab('dashboard')}>Stitcher Dashboard</button>
            </div>

            {/* ── Log Entry ─────────────────────────────────────────── */}
            {plSubTab === 'log' && (
              <>
                {/* Single / Bulk toggle */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid #30363d' }}>
                  {[{ key: 'single', label: 'Single Entry' }, { key: 'bulk', label: 'Bulk Entry' }].map(m => (
                    <button
                      key={m.key}
                      onClick={() => setPlEntryMode(m.key)}
                      style={{
                        padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: '14px', fontWeight: '600',
                        color: plEntryMode === m.key ? '#0f3460' : '#888',
                        borderBottom: plEntryMode === m.key ? '3px solid #0f3460' : '3px solid transparent',
                        marginBottom: '-2px',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Single Entry */}
                {plEntryMode === 'single' && (
                  <div className="card">
                    <h3>Log Payment Entry</h3>
                    {plDataLoading ? (
                      <div className="loading"><div className="spinner" />Loading...</div>
                    ) : (
                      <form onSubmit={plHandleSubmit}>
                        <div className="form-grid">
                          <div className="form-group">
                            <label>Entry Date *</label>
                            <input
                              type="date"
                              name="entry_date"
                              value={plForm.entry_date}
                              onChange={plHandleFormChange}
                              max={TODAY}
                            />
                          </div>

                          <div className="form-group">
                            <label>PO Number *</label>
                            <select name="po_number" value={plForm.po_number} onChange={plHandleFormChange} required>
                              <option value="">Select PO...</option>
                              {plEligiblePOs.map(p => (
                                <option key={p.po_number} value={p.po_number}>
                                  {p.po_number} — {p.collection_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Finishing Worker *</label>
                            <select name="stitcher_code" value={plForm.stitcher_code} onChange={plHandleFormChange} required>
                              <option value="">Select worker...</option>
                              {allStitchers.map(s => (
                                <option key={s.stitcher_code} value={s.stitcher_code}>
                                  {s.stitcher_code} — {s.name} ({s._typeLabel})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Department *</label>
                            <select name="department" value={plForm.department} onChange={plHandleFormChange} required>
                              <option value="">Select department...</option>
                              {plDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>

                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Operations * <span style={{ fontWeight: '400', color: '#8b949e', fontSize: '12px' }}>(select all that apply)</span></label>
                            {!plForm.department ? (
                              <p style={{ color: '#8b949e', fontStyle: 'italic', fontSize: '13px', margin: '8px 0 0' }}>Select a department first</p>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                                {(FL_OPERATION_OPTIONS[plForm.department] || []).map(op => {
                                  const isChecked = plSelectedOps.includes(op);
                                  const rf = plPoRateData ? FL_DEPT_OP_TO_RATE_FIELD[`${plForm.department}|${op}`] : null;
                                  const rate = rf && plPoRateData ? Number(plPoRateData[rf] || 0) : null;
                                  return (
                                    <label
                                      key={op}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                                        border: isChecked ? '2px solid #0f3460' : '2px solid #e8e8e8',
                                        background: isChecked ? '#f0f4ff' : '#fafafa',
                                        fontWeight: isChecked ? '700' : '400',
                                        fontSize: '14px', color: '#e6edf3',
                                        transition: 'all 0.15s', userSelect: 'none',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => plToggleOp(op)}
                                        style={{ accentcolor: '#e6edf3', width: '15px', height: '15px' }}
                                      />
                                      {op}
                                      {rate !== null && plPoRateData && (
                                        <span style={{ fontSize: '12px', color: '#8b949e', fontWeight: '400' }}>
                                          &nbsp;@ PKR {rate.toLocaleString()}
                                        </span>
                                      )}
                                      {plRateLoading && <span style={{ fontSize: '11px', color: '#8b949e' }}>…</span>}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="form-group">
                            <label>Qty Claimed *</label>
                            <input
                              type="number"
                              name="qty_claimed"
                              value={plForm.qty_claimed}
                              onChange={plHandleFormChange}
                              min="1"
                              required
                              placeholder="Pieces"
                            />
                          </div>

                          {/* Per-op breakdown + combined total */}
                          {plSelectedOps.length > 0 && plPoRateData && plForm.qty_claimed && (
                            <div style={{ gridColumn: '1 / -1', background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '14px 16px' }}>
                              <p style={{ fontWeight: '700', fontSize: '12px', color: '#e6edf3', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '10px' }}>Breakdown</p>
                              {plOpRates.map(({ op, rate, amount }) => (
                                <div key={op} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px', color: '#e6edf3' }}>
                                  <span>{op} — {plForm.qty_claimed} pcs × PKR {rate.toLocaleString()}</span>
                                  <span style={{ fontWeight: '600' }}>PKR {amount.toLocaleString()}</span>
                                </div>
                              ))}
                              <div style={{ borderTop: '1px solid #30363d', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '15px', color: '#e6edf3' }}>
                                <span>Combined Total</span>
                                <span>PKR {plCombinedTotal.toLocaleString()}</span>
                              </div>
                            </div>
                          )}

                          {plRateError && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <p style={{ color: '#f85149', fontWeight: '600', fontSize: '13px' }}>⚠ No approved CMT rate found for this PO. Cannot log entries.</p>
                            </div>
                          )}

                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Remarks</label>
                            <input
                              type="text"
                              name="remarks"
                              value={plForm.remarks}
                              onChange={plHandleFormChange}
                              placeholder="Optional notes"
                            />
                          </div>
                        </div>

                        {plFormMsg && (
                          <div className={`alert alert-${plFormMsg.type === 'error' ? 'error' : 'success'}`}
                               style={{ marginTop: '8px' }}>
                            {plFormMsg.text}
                          </div>
                        )}

                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={plSubmitting || !!plRateError || plSelectedOps.length === 0}
                            style={{ maxWidth: '220px' }}
                          >
                            {plSubmitting
                              ? 'Submitting...'
                              : plSelectedOps.length > 1
                                ? `Submit ${plSelectedOps.length} Entries`
                                : 'Submit Entry'}
                          </button>
                          {plCombinedTotal > 0 && (
                            <span style={{ fontSize: '15px', fontWeight: '700', color: '#e6edf3' }}>
                              Total: PKR {plCombinedTotal.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Bulk Entry */}
                {plEntryMode === 'bulk' && (
                  <div className="card">
                    <h3>Bulk Entry</h3>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ marginBottom: 0, minWidth: '240px' }}>
                        <label>Select Finishing Worker</label>
                        <select value={bulkStitcher} onChange={e => setBulkStitcher(e.target.value)}>
                          <option value="">Select worker...</option>
                          {allStitchers.map(s => (
                            <option key={s.stitcher_code} value={s.stitcher_code}>
                              {s.stitcher_code} — {s.name} ({s._typeLabel})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() => loadBulkRows(bulkStitcher)}
                        disabled={!bulkStitcher || bulkLoading}
                        style={{ minWidth: '80px' }}
                      >
                        {bulkLoading ? 'Loading...' : 'Load'}
                      </button>
                    </div>

                    {bulkMsg && (
                      <div className={`alert alert-${bulkMsg.type}`} style={{ marginBottom: '16px' }}>
                        {bulkMsg.text}
                      </div>
                    )}

                    {bulkLoading ? (
                      <div className="loading"><div className="spinner" />Loading allocations...</div>
                    ) : bulkRows.length > 0 ? (
                      <>
                        <div className="table-container" style={{ marginBottom: '16px' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>PO</th>
                                <th>Component</th>
                                <th>Department</th>
                                <th>Operation</th>
                                <th>Accepted</th>
                                <th>Qty to Pay</th>
                                <th>Rate (PKR)</th>
                                <th>Amount (PKR)</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkRows.map((row, i) => (
                                <tr key={i} style={row.alreadyLogged ? { background: '#2d2208' } : {}}>
                                  <td>{row.po_number}</td>
                                  <td style={{ textTransform: 'capitalize' }}>{row.component}</td>
                                  <td>
                                    <select
                                      value={row.department}
                                      onChange={e => bulkHandleRowChange(i, 'department', e.target.value)}
                                      style={{ padding: '4px 8px', fontSize: '13px', border: '1px solid #30363d', borderRadius: '6px', minWidth: '160px' }}
                                    >
                                      <option value="">Select...</option>
                                      {FL_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                  </td>
                                  <td>
                                    <select
                                      value={row.operation}
                                      onChange={e => bulkHandleRowChange(i, 'operation', e.target.value)}
                                      disabled={!row.department}
                                      style={{ padding: '4px 8px', fontSize: '13px', border: '1px solid #30363d', borderRadius: '6px', minWidth: '120px' }}
                                    >
                                      <option value="">Select...</option>
                                      {(FL_OPERATION_OPTIONS[row.department] || []).map(op => (
                                        <option key={op} value={op}>{op}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{row.qty_accepted}</td>
                                  <td>
                                    <input
                                      type="number"
                                      value={row.qty_claimed}
                                      onChange={e => bulkHandleRowChange(i, 'qty_claimed', e.target.value)}
                                      min="0"
                                      max={row.qty_accepted}
                                      style={{ width: '80px', padding: '4px 8px', border: '1px solid #30363d', borderRadius: '6px', fontSize: '13px' }}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    {row.rate !== null ? Number(row.rate).toLocaleString() : '—'}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '600' }}>
                                    {row.rate !== null ? Number(row.amount || 0).toLocaleString() : '—'}
                                  </td>
                                  <td>
                                    {row.alreadyLogged ? (
                                      <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#2d2208', color: '#d29922' }}>
                                        Already Logged
                                      </span>
                                    ) : (
                                      <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#0d2818', color: '#3fb950' }}>
                                        Pending
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: '700', background: '#1c2d4a' }}>
                                <td colSpan={5} style={{ textAlign: 'right' }}>TOTAL</td>
                                <td style={{ textAlign: 'right' }}>
                                  {bulkRows.reduce((s, r) => s + (Number(r.qty_claimed) || 0), 0).toLocaleString()}
                                </td>
                                <td>—</td>
                                <td style={{ textAlign: 'right' }}>
                                  {bulkRows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <button
                            className="btn btn-primary"
                            onClick={bulkHandleSubmitAll}
                            disabled={bulkSubmitting}
                            style={{ maxWidth: '180px' }}
                          >
                            {bulkSubmitting ? `Submitting ${bulkProgress}...` : 'Submit All'}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </>
            )}

            {/* ── My Entries ────────────────────────────────────────── */}
            {plSubTab === 'entries' && (
              <>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>My Entries</h3>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={plLoadMyEntries}
                      disabled={plEntriesLoading}
                    >
                      {plEntriesLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  {plEntriesLoading ? (
                    <div className="loading"><div className="spinner" />Loading entries...</div>
                  ) : regularEntries.length === 0 ? (
                    <p style={{ color: '#8b949e', textAlign: 'center', padding: '24px' }}>No in-house entries yet.</p>
                  ) : (
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>PO</th>
                            <th>Worker</th>
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
                          {regularEntries.map(e => {
                            const po = plPos.find(p => p.po_number === e.po_number);
                            return (
                              <tr key={e.id}>
                                <td>{e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}</td>
                                <td>{e.po_number}{po ? ` — ${po.collection_name}` : ''}</td>
                                <td>{e.stitcher_name || e.stitcher_code}</td>
                                <td>{e.department}</td>
                                <td>{e.operation}</td>
                                <td>{e.qty_claimed}</td>
                                <td>PKR {Number(e.rate || 0).toLocaleString()}</td>
                                <td>PKR {Number(e.amount || 0).toLocaleString()}</td>
                                <td>{e.week_ending ? String(e.week_ending).slice(0, 10) : '—'}</td>
                                <td><PaymentStatusBadge status={e.payment_status} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Out-of-Factory Payments */}
                <div className="card">
                  <h3>Out-of-Factory Payments</h3>
                  <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '16px', marginTop: '-8px' }}>
                    Flexible payment — each entry can be marked paid individually.
                  </p>

                  {flexEntries.length === 0 ? (
                    <p style={{ color: '#8b949e', textAlign: 'center', padding: '24px' }}>No out-of-factory entries yet.</p>
                  ) : (
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>PO</th>
                            <th>Worker</th>
                            <th>Department</th>
                            <th>Operation</th>
                            <th>Qty</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Paid Date</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flexEntries.map(e => {
                            const po = plPos.find(p => p.po_number === e.po_number);
                            return (
                              <tr key={e.id}>
                                <td>{e.entry_date ? String(e.entry_date).slice(0, 10) : '—'}</td>
                                <td>{e.po_number}{po ? ` — ${po.collection_name}` : ''}</td>
                                <td>{e.stitcher_name || e.stitcher_code}</td>
                                <td>{e.department}</td>
                                <td>{e.operation}</td>
                                <td>{e.qty_claimed}</td>
                                <td>PKR {Number(e.amount || 0).toLocaleString()}</td>
                                <td>
                                  <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: '#e0f2fe', color: '#0369a1' }}>
                                    Flexible
                                  </span>
                                  {' '}
                                  <PaymentStatusBadge status={e.payment_status} />
                                </td>
                                <td>{e.payment_date ? String(e.payment_date).slice(0, 10) : '—'}</td>
                                <td>
                                  {e.payment_status !== 'Paid' && (
                                    <button
                                      className="btn btn-small"
                                      style={{ background: '#3fb950', color: 'white', whiteSpace: 'nowrap' }}
                                      onClick={() => handleMarkPaidFlexible(e)}
                                      disabled={!!flexMarking[e.id]}
                                    >
                                      {flexMarking[e.id] ? '...' : 'Mark Paid'}
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
              </>
            )}

            {/* ── Stitcher Dashboard ────────────────────────────────── */}
            {plSubTab === 'dashboard' && (
              <div className="stitcher-dashboard-print">
                <div className="card">
                  <h3>Stitcher Performance Dashboard</h3>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: '240px' }}>
                      <label>Select Finishing Worker</label>
                      <select value={sdStitcher} onChange={e => setSdStitcher(e.target.value)}>
                        <option value="">Select worker...</option>
                        {allStitchers.map(s => (
                          <option key={s.stitcher_code} value={s.name}>
                            {s.stitcher_code} — {s.name} ({s._typeLabel})
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
                    <p style={{ color: '#8b949e', textAlign: 'center', padding: '32px' }}>
                      Select a finishing worker to view their performance
                    </p>
                  </div>
                ) : sdLoading ? (
                  <div className="loading"><div className="spinner" />Loading...</div>
                ) : sdLoaded && sdEntries.length === 0 ? (
                  <div className="card">
                    <p style={{ color: '#8b949e', textAlign: 'center', padding: '32px' }}>No entries found for this worker.</p>
                  </div>
                ) : sdLoaded && sdEntries.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                      {[
                        { label: 'Total POs',      value: new Set(sdEntries.map(e => e.po_number)).size,                                       color: '#e6edf3' },
                        { label: 'Total Pieces',   value: sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0).toLocaleString(),      color: '#e6edf3' },
                        { label: 'Total Earnings', value: `PKR ${sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`,  color: '#3fb950' },
                      ].map(c => (
                        <div key={c.label} className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
                          <p style={{ fontSize: '12px', color: '#8b949e', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>{c.label}</p>
                          <p style={{ fontSize: '26px', fontWeight: '700', color: c.color }}>{c.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>
                          Breakdown — {sdStitcher}
                          {(sdDateFrom || sdDateTo) && (
                            <span style={{ fontSize: '13px', fontWeight: '400', color: '#8b949e', marginLeft: '8px' }}>
                              {sdDateFrom || 'All'} to {sdDateTo || 'Now'}
                            </span>
                          )}
                        </h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-small"
                            onClick={sdHandleExport}
                            style={{ width: 'auto', background: '#3fb950', color: 'white' }}
                          >
                            ↓ Excel
                          </button>
                          <button
                            className="btn btn-small"
                            onClick={() => window.print()}
                            style={{ width: 'auto', background: '#4a7cc9', color: 'white' }}
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
                            <tr style={{ fontWeight: '700', background: '#1c2d4a' }}>
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
          </>
        )}

        {/* ── Tab 4: Stitcher Dashboard (top-level) ─────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="stitcher-dashboard-print">
            <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
              <h3>Stitcher Performance Dashboard</h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: '240px' }}>
                  <label>Select Finishing Worker</label>
                  <select value={sdStitcher} onChange={e => setSdStitcher(e.target.value)}>
                    <option value="">Select worker...</option>
                    {allStitchers.map(s => (
                      <option key={s.stitcher_code} value={s.name}>
                        {s.stitcher_code} — {s.name} ({s._typeLabel})
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
                <p style={{ color: '#8b949e', textAlign: 'center', padding: '32px' }}>
                  Select a finishing worker to view their performance
                </p>
              </div>
            ) : sdLoading ? (
              <div className="loading"><div className="spinner" />Loading...</div>
            ) : sdLoaded && sdEntries.length === 0 ? (
              <div className="card">
                <p style={{ color: '#8b949e', textAlign: 'center', padding: '32px' }}>No entries found for this worker.</p>
              </div>
            ) : sdLoaded && sdEntries.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Total POs',      value: new Set(sdEntries.map(e => e.po_number)).size,                                       color: '#e6edf3' },
                    { label: 'Total Pieces',   value: sdEntries.reduce((s, e) => s + Number(e.qty_claimed || 0), 0).toLocaleString(),      color: '#e6edf3' },
                    { label: 'Total Earnings', value: `PKR ${sdEntries.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`,  color: '#3fb950' },
                  ].map(c => (
                    <div key={c.label} className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: '#8b949e', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>{c.label}</p>
                      <p style={{ fontSize: '26px', fontWeight: '700', color: c.color }}>{c.value}</p>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ margin: 0, borderBottom: 'none', padding: 0 }}>
                      Breakdown — {sdStitcher}
                      {(sdDateFrom || sdDateTo) && (
                        <span style={{ fontSize: '13px', fontWeight: '400', color: '#8b949e', marginLeft: '8px' }}>
                          {sdDateFrom || 'All'} to {sdDateTo || 'Now'}
                        </span>
                      )}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-small"
                        onClick={sdHandleExport}
                        style={{ width: 'auto', background: '#3fb950', color: 'white' }}
                      >
                        ↓ Excel
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() => window.print()}
                        style={{ width: 'auto', background: '#4a7cc9', color: 'white' }}
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
                        <tr style={{ fontWeight: '700', background: '#1c2d4a' }}>
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

        {/* ── Tab 5: Worker Management ──────────────────────────────────────── */}
        {activeTab === 'workers' && (() => {
          const fmtPhone = (val) => {
            const d = val.replace(/\D/g, '').slice(0, 11);
            return d.length <= 4 ? d : d.slice(0, 4) + '-' + d.slice(4);
          };

          const handleAdd = async (e) => {
            e.preventDefault();
            if (!wkForm.name.trim()) { setWkMsg({ type: 'error', text: 'Name is required.' }); return; }
            if (!wkForm.phone || !PHONE_REGEX_FIN.test(wkForm.phone)) { setWkPhoneError('Phone required in format XXXX-XXXXXXX'); return; }
            setWkSubmitting(true); setWkMsg(null);
            try {
              const res = await createStitcher({
                name: wkForm.name.trim(), phone: wkForm.phone,
                specialization: wkForm.specialization || 'Mixed',
                worker_type: wkForm.worker_type,
              });
              if (res.success) {
                setWkMsg({ type: 'success', text: `✓ Worker ${res.stitcher.stitcher_code} — ${res.stitcher.name} added.` });
                setWkForm({ name: '', phone: '', specialization: 'Mixed', worker_type: 'Finishing_InHouse' });
                setWkPhoneError('');
                loadWorkers(); loadSharedData();
              } else { setWkMsg({ type: 'error', text: res.message || 'Failed.' }); }
            } catch { setWkMsg({ type: 'error', text: 'Request failed.' }); }
            setWkSubmitting(false);
          };

          const openEdit = (w) => {
            setWkEditForm({ name: w.name || '', phone: w.phone || '', specialization: w.specialization || 'Mixed', status: w.status || 'Active', worker_type: w.worker_type || 'Finishing_InHouse' });
            setWkEditModal(w); setWkEditErr(null);
          };

          const saveEdit = async () => {
            if (!wkEditForm.name.trim()) { setWkEditErr('Name is required.'); return; }
            if (!wkEditForm.phone || !PHONE_REGEX_FIN.test(wkEditForm.phone)) { setWkEditErr('Phone required in format XXXX-XXXXXXX'); return; }
            setWkEditSaving(true); setWkEditErr(null);
            try {
              const res = await updateStitcher({
                id: wkEditModal.id, name: wkEditForm.name.trim(), phone: wkEditForm.phone,
                specialization: wkEditForm.specialization, status: wkEditForm.status, worker_type: wkEditForm.worker_type,
              });
              if (res.success) {
                setWkMsg({ type: 'success', text: `✓ Worker "${wkEditForm.name}" updated.` });
                setWkEditModal(null); loadWorkers(); loadSharedData();
              } else { setWkEditErr(res.message || 'Save failed.'); }
            } catch { setWkEditErr('Request failed.'); }
            setWkEditSaving(false);
          };

          const filtered = wkWorkers.filter(w => {
            const term = wkSearch.toLowerCase();
            const matchSearch = !term.trim() ||
              w.name?.toLowerCase().includes(term) ||
              w.stitcher_code?.toLowerCase().includes(term);
            const matchStatus = wkStatusFilter === 'All' || w.status === wkStatusFilter;
            return matchSearch && matchStatus;
          });

          return (
            <>
              <div className="card" style={{ borderRadius: '0 0 12px 12px', marginTop: 0 }}>
                <h3>Worker Management</h3>
                {wkMsg && <div className={`alert alert-${wkMsg.type}`}>{wkMsg.text}</div>}

                {/* Add Form */}
                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>Add New Finishing Worker</p>
                  <form onSubmit={handleAdd}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Name *</label>
                        <input type="text" value={wkForm.name} onChange={e => setWkForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Worker name" />
                      </div>
                      <div className="form-group">
                        <label>Phone *</label>
                        <input type="text" value={wkForm.phone} onChange={e => { setWkForm(prev => ({ ...prev, phone: fmtPhone(e.target.value) })); if (wkPhoneError) setWkPhoneError(''); }} placeholder="0300-1234567" />
                        {wkPhoneError && <p style={{ fontSize: '12px', color: '#f85149', marginTop: '4px' }}>{wkPhoneError}</p>}
                      </div>
                      <div className="form-group">
                        <label>Specialization</label>
                        <select value={wkForm.specialization} onChange={e => setWkForm(prev => ({ ...prev, specialization: e.target.value }))}>
                          <option value="Mixed">Mixed</option>
                          <option value="Shirt">Shirt</option>
                          <option value="Trouser">Trouser</option>
                          <option value="Dupatta">Dupatta</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Worker Type *</label>
                        <select value={wkForm.worker_type} onChange={e => setWkForm(prev => ({ ...prev, worker_type: e.target.value }))}>
                          <option value="Finishing_InHouse">In-House</option>
                          <option value="Finishing_OutOfFactory">Out of Factory</option>
                        </select>
                      </div>
                    </div>
                    <button className="btn btn-success" type="submit" disabled={wkSubmitting} style={{ marginTop: '8px' }}>
                      {wkSubmitting ? 'Adding...' : 'Add Worker'}
                    </button>
                  </form>
                </div>

                {/* Worker List */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3', textTransform: 'uppercase', margin: 0 }}>Current Workers ({filtered.length})</p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="text" placeholder="Search..." value={wkSearch} onChange={e => setWkSearch(e.target.value)}
                      style={{ padding: '7px 12px', border: '1px solid #30363d', borderRadius: '8px', fontSize: '13px', width: '180px' }} />
                    <select value={wkStatusFilter} onChange={e => setWkStatusFilter(e.target.value)}
                      style={{ padding: '7px 10px', border: '1px solid #30363d', borderRadius: '8px', fontSize: '13px' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="All">All</option>
                    </select>
                    <button className="btn btn-small" onClick={loadWorkers} style={{ width: 'auto', background: '#161b22', color: '#e6edf3' }}>↻ Refresh</button>
                  </div>
                </div>

                {wkLoading ? (
                  <div className="loading"><div className="spinner"></div>Loading workers...</div>
                ) : filtered.length === 0 ? (
                  <p style={{ color: '#8b949e', textAlign: 'center', padding: '20px' }}>
                    {wkWorkers.length === 0 ? 'No finishing workers found. Add one above.' : 'No results match.'}
                  </p>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr><th>Code</th><th>Name</th><th>Phone</th><th>Type</th><th>Specialization</th><th>Status</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {filtered.map(w => (
                          <tr key={w.id}>
                            <td>{w.stitcher_code}</td>
                            <td>{w.name}</td>
                            <td>{w.phone || '—'}</td>
                            <td>{w.worker_type === 'Finishing_OutOfFactory' ? 'Out of Factory' : 'In-House'}</td>
                            <td>{w.specialization || '—'}</td>
                            <td><span className={`badge ${w.status === 'Active' ? 'badge-accepted' : 'badge-rejected'}`}>{w.status}</span></td>
                            <td><button className="btn btn-small" onClick={() => openEdit(w)} style={{ background: '#2d2208', color: '#d29922', width: 'auto' }}>Edit</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Edit Worker Modal */}
              {wkEditModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setWkEditModal(null); }}>
                  <div className="modal-card" style={{ maxWidth: '440px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#e6edf3' }}>Edit Worker — {wkEditModal.stitcher_code}</h3>
                      <button onClick={() => setWkEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#8b949e', lineHeight: 1, padding: '0 4px' }}>✕</button>
                    </div>
                    {wkEditErr && <div className="alert alert-error">{wkEditErr}</div>}
                    <div className="form-group">
                      <label>Name *</label>
                      <input type="text" value={wkEditForm.name} onChange={e => setWkEditForm(prev => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Phone *</label>
                      <input type="text" value={wkEditForm.phone} onChange={e => setWkEditForm(prev => ({ ...prev, phone: fmtPhone(e.target.value) }))} placeholder="0300-1234567" />
                    </div>
                    <div className="form-grid" style={{ marginBottom: 0 }}>
                      <div className="form-group">
                        <label>Specialization</label>
                        <select value={wkEditForm.specialization} onChange={e => setWkEditForm(prev => ({ ...prev, specialization: e.target.value }))}>
                          <option value="Mixed">Mixed</option>
                          <option value="Shirt">Shirt</option>
                          <option value="Trouser">Trouser</option>
                          <option value="Dupatta">Dupatta</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Status</label>
                        <select value={wkEditForm.status} onChange={e => setWkEditForm(prev => ({ ...prev, status: e.target.value }))}>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Worker Type</label>
                      <select value={wkEditForm.worker_type} onChange={e => setWkEditForm(prev => ({ ...prev, worker_type: e.target.value }))}>
                        <option value="Finishing_InHouse">In-House</option>
                        <option value="Finishing_OutOfFactory">Out of Factory</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button className="btn btn-primary" onClick={saveEdit} disabled={wkEditSaving} style={{ flex: 1 }}>{wkEditSaving ? 'Saving...' : 'Save Changes'}</button>
                      <button className="btn btn-danger" onClick={() => setWkEditModal(null)} disabled={wkEditSaving} style={{ flex: 1 }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <PoweredByFintrack />
      </div>

      {/* ── Update Modal ──────────────────────────────────────────────────────── */}
      {updateModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#e6edf3' }}>
                Update — {updateModal.stitcher_name} — <span style={{ textTransform: 'capitalize' }}>{updateModal.component}</span>
              </h3>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#8b949e', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{
              background: '#1c2129', borderRadius: '8px', padding: '14px 16px',
              marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px',
            }}>
              <div><span style={{ color: '#8b949e', fontWeight: '600' }}>PO: </span>{updateModal.po_number}</div>
              <div><span style={{ color: '#8b949e', fontWeight: '600' }}>Worker: </span>{updateModal.stitcher_name}</div>
              <div style={{ textTransform: 'capitalize' }}>
                <span style={{ color: '#8b949e', fontWeight: '600' }}>Component: </span>{updateModal.component}
              </div>
              <div><span style={{ color: '#8b949e', fontWeight: '600' }}>Allocated: </span>{updateModal.qty_allocated}</div>
              <div>
                <span style={{ color: '#8b949e', fontWeight: '600' }}>Total Returned So Far: </span>
                {updateModal.qty_returned || 0}
              </div>
              <div>
                <span style={{ color: '#8b949e', fontWeight: '600' }}>Remaining: </span>
                {updateModal.qty_remaining != null
                  ? Number(updateModal.qty_remaining)
                  : Number(updateModal.qty_allocated) - Number(updateModal.qty_returned || 0)}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Additional Returned (delta)</label>
                <input type="number" name="qty_returned_delta" value={deltaForm.qty_returned_delta}
                  onChange={handleDeltaChange} min="0" placeholder="Pieces returned today" />
              </div>
              <div className="form-group">
                <label>Of which Accepted</label>
                <input type="number" name="qty_accepted_delta" value={deltaForm.qty_accepted_delta}
                  onChange={handleDeltaChange} min="0" placeholder="0" />
              </div>
              <div className="form-group">
                <label>Of which Rework</label>
                <input type="number" name="qty_rework_delta" value={deltaForm.qty_rework_delta}
                  onChange={handleDeltaChange} min="0" placeholder="0" />
              </div>
              <div className="form-group">
                <label>Of which Rejected</label>
                <input type="number" name="qty_rejected_delta" value={deltaForm.qty_rejected_delta}
                  onChange={handleDeltaChange} min="0" placeholder="0" />
              </div>
            </div>

            <div className="form-group">
              <label>Remarks</label>
              <input type="text" name="remarks" value={deltaForm.remarks}
                onChange={handleDeltaChange} placeholder="Optional notes" />
            </div>

            {modalError && <div className="alert alert-error">{modalError}</div>}

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
                style={{ background: '#21262d', color: '#8b949e', padding: '12px 24px' }}
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

export default FinishingView;
