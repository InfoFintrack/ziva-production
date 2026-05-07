/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ProdFlowLogo from '../components/ProdFlowLogo';
import PoweredByFintrack from '../components/PoweredByFintrack';
import {
  submitIssuance, getRecords, getDropdowns, getPOs, createPO, updatePO,
  getPoAccessories, addPoAccessory, deletePoAccessories, getFabricIssuanceLog, logFabricIssuance,
} from '../api';

// ── Constants ────────────────────────────────────────────────────────────────

export const COLOUR_LIST = [
  'Black','White','Red','Maroon','Navy Blue','Teal','Green','Mustard','Peach','Beige',
  'Brown','Purple','Pink','Cream','Off White','Burgundy','Lime Yellow','Sea Green','Blue',
  'Yellow','Orange','Grey','Silver','Gold','Ferozi','Skin','Rust','Mint','Ivory','Coral',
  'Black Karundi','Green Karundi','Brown Karundi','Cream Karundi','Mustard Karundi',
  'Burgundy Karundi','Purple Karundi','Pink Karundi','Blue Karundi','Red Karundi',
  'Maroon Karundi','Navy Karundi',
];

const FABRIC_TYPES = [
  'Lawn','Khaddar','Cotton','Jacquard','Velvet','Raw Silk','Chiffon','Georgette',
  'Grip Silk','Katan Silk','Mixed',
];

const ACCESSORY_UNITS = ['Meters','Yards','Pieces','KG'];

const getEmptyPOForm = () => ({
  batch_number_b:  '',
  batch_number_po: '',
  po_number:      '',
  collection_name:'',
  article_name:   '',
  garment_type:   '',
  po_date:        new Date().toISOString().split('T')[0],
  delivery_date:  '',
  remarks:        '',
  shirt_colour:   '',
  shirt_fabric:   '',
  shirt_qty:      '',
  shirt_remarks:  '',
  trouser_colour: '',
  trouser_fabric: '',
  trouser_qty:    '',
  trouser_remarks:'',
  dupatta_colour: '',
  dupatta_fabric: '',
  dupatta_qty:    '',
  dupatta_remarks:'',
});

// ── ColourInput component ────────────────────────────────────────────────────

export const ColourInput = React.forwardRef(function ColourInput(
  { value, onChange, onValidate, placeholder, required, disabled },
  ref
) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown]  = useState(false);
  const [error, setError] = useState('');

  React.useImperativeHandle(ref, () => ({
    validate: () => {
      if (!value && !required) {
        setError('');
        if (onValidate) onValidate(true);
        return true;
      }
      const inList = COLOUR_LIST.includes(value);
      const valid  = inList || value.length >= 4;
      setError(valid ? '' : 'Please enter full colour name (min 4 characters)');
      if (onValidate) onValidate(valid);
      return valid;
    },
  }), [value, required, onValidate]);

  if (disabled) {
    return (
      <input
        type="text"
        value={value}
        disabled
        className="auto-field"
        style={{ width: '100%', padding: '12px 16px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '15px', background: '#f0f0f0', color: '#999', boxSizing: 'border-box' }}
      />
    );
  }

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    setError('');
    if (v.length > 0) {
      const filtered = COLOUR_LIST.filter(c => c.toLowerCase().includes(v.toLowerCase())).slice(0, 8);
      setSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (colour) => {
    onChange(colour);
    setSuggestions([]);
    setShowDropdown(false);
    setError('');
    if (onValidate) onValidate(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      if (!value && !required) { setError(''); return; }
      const inList = COLOUR_LIST.includes(value);
      const valid  = inList || value.length >= 4;
      setError(valid ? '' : 'Please enter full colour name (min 4 characters)');
      if (onValidate) onValidate(valid);
    }, 150);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: error ? '2px solid #dc2626' : '2px solid #e8e8e8',
          borderRadius: '8px',
          fontSize: '15px',
          background: '#fafafa',
          boxSizing: 'border-box',
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = error ? '#dc2626' : '#0f3460'; e.target.style.background = 'white'; }}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #d1d5db', borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {suggestions.map(s => (
            <div
              key={s}
              onMouseDown={() => handleSelect(s)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '14px', borderBottom: '1px solid #f0f2f5' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f2f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p style={{ color: '#dc2626', fontSize: '12px', margin: '4px 0 0' }}>{error}</p>
      )}
    </div>
  );
});

// ── PPView ────────────────────────────────────────────────────────────────────

function PPView({ user, onLogout }) {

  // ── Issue Fabric state ─────────────────────────────────────────────────
  const [form, setForm] = useState({
    issueDate:       new Date().toLocaleDateString('en-GB'),
    poNumber:        '',
    joNumber:        '',
    article:         '',
    receivingVendor: '',
    garmentType:     '',
    fabricName:      '',
    fabricColor:     '',
    noOfThaan:       '',
    qtyIssued:       '',
    unit:            '',
    fabricWidth:     '',
    issueRemarks:    '',
  });
  const [accessories, setAccessories] = useState([]);
  const [laces, setLaces] = useState([]);
  const [dropdowns, setDropdowns] = useState({
    garmentTypes: [], units: [], receivingVendors: [], accessoryTypes: [],
  });
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage]   = useState(null);
  const [lotPreview, setLotPreview] = useState('Auto-generated on submit');

  const [issuePOLog, setIssuePOLog]         = useState([]);
  const [rawPOAccessories, setRawPOAccessories] = useState([]);

  // New Issue-Fabric PO-link fields
  const [issuePO, setIssuePO]               = useState('');
  const [issuePODetails, setIssuePODetails] = useState(null);
  const [compQtys, setCompQtys]             = useState({ shirt: '', trouser: '', dupatta: '' });
  const [issueSharedRemarks, setIssueSharedRemarks] = useState('');

  // ── Tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('issue');

  // ── PO Management state ────────────────────────────────────────────────
  const [poForm, setPOForm] = useState(getEmptyPOForm());
  const [poAccessories, setPOAccessories] = useState([{ accessory_type: '', quantity: '' }]);
  const [collapsedCards, setCollapsedCards] = useState({ shirt: false, trouser: false, dupatta: false });
  const [pos, setPos]             = useState([]);
  const [poLoading, setPOLoading] = useState(false);
  const [poSubmitting, setPOSubmitting] = useState(false);
  const [poMessage, setPOMessage] = useState(null);

  // ColourInput refs (PO form)
  const shirtColourRef   = useRef(null);
  const trouserColourRef = useRef(null);
  const dupattaColourRef = useRef(null);

  // ── Edit PO Modal state ────────────────────────────────────────────────
  const [editPOTarget, setEditPOTarget]         = useState(null);
  const [editPOForm, setEditPOForm]             = useState({});
  const [editPOAccessories, setEditPOAccessories] = useState([]);
  const [editPOSubmitting, setEditPOSubmitting] = useState(false);
  const [editPOMessage, setEditPOMessage]       = useState(null);
  const [editCollapsedCards, setEditCollapsedCards] = useState({ shirt: false, trouser: false, dupatta: false });
  const [poHasIssuance, setPoHasIssuance]       = useState(new Set());

  // ColourInput refs (Edit PO form)
  const editShirtColourRef   = useRef(null);
  const editTrouserColourRef = useRef(null);
  const editDupattaColourRef = useRef(null);

  // ── PO Detail Modal state ──────────────────────────────────────────────
  const [selectedPODetail, setSelectedPODetail]     = useState(null);
  const [poDetailAccessories, setPODetailAccessories] = useState([]);
  const [poDetailLog, setPODetailLog]               = useState([]);
  const [detailLoading, setDetailLoading]           = useState(false);

  // ── Data loading ───────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [recordsRes, dropdownsRes] = await Promise.all([getRecords(), getDropdowns()]);
      if (recordsRes.success) {
        setRecords(recordsRes.records.filter(r => r.Issued_By === user.name).reverse());
      }
      if (dropdownsRes.success) {
        setDropdowns({
          garmentTypes:    dropdownsRes.garmentTypes,
          units:           dropdownsRes.units,
          receivingVendors:dropdownsRes.receivingVendors,
          accessoryTypes:  dropdownsRes.accessoryTypes || [],
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load data.' });
    }
    setLoading(false);
  };

  const loadPOs = async () => {
    setPOLoading(true);
    try {
      const res = await getPOs();
      if (res.success) {
        setPos(res.pos);
        const logChecks = await Promise.all(
          res.pos.map(p => getFabricIssuanceLog(p.po_number).catch(() => ({ success: false, logs: [] })))
        );
        const hasIssuance = new Set();
        logChecks.forEach((logRes, idx) => {
          if (logRes.success && logRes.logs && logRes.logs.length > 0) {
            hasIssuance.add(res.pos[idx].po_number);
          }
        });
        setPoHasIssuance(hasIssuance);
      }
    } catch { /* silently fail */ }
    setPOLoading(false);
  };

  useEffect(() => {
    loadData();
    loadPOs();
  }, []);

  // Recompute visible fromPO accessories whenever the issuance log or raw list changes.
  // This is the single source of truth for accessory filtering — never filter accessories
  // directly in submit handlers.
  useEffect(() => {
    if (!issuePO) return;
    setAccessories(prev => {
      const manual = prev.filter(a => !a.fromPO);
      const fromPO = rawPOAccessories
        .filter(a => {
          const issued = issuePOLog
            .filter(l => l.component === a.accessory_type)
            .reduce((sum, l) => sum + Number(l.meters_issued), 0);
          return Number(a.quantity) - issued > 0;
        })
        .map(a => ({
          type: a.accessory_type,
          qty: '',
          unit: '',
          fromPO: true,
          poTotalQty: Number(a.quantity),
        }));
      return [...fromPO, ...manual];
    });
  }, [issuePOLog, rawPOAccessories]);

  // ── Issue Fabric handlers ──────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'joNumber') {
      const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
      setForm(prev => ({ ...prev, joNumber: digits }));
      return;
    }
    if (name === 'poNumber') {
      const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
      setForm(prev => ({ ...prev, poNumber: digits }));
      if (digits) setLotPreview(`LOT-PO${digits}-XXX (auto on submit)`);
      else setLotPreview('Auto-generated on submit');
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const addAccessory = () => {
    if (accessories.length >= 10) return;
    setAccessories(prev => [...prev, { type: '', qty: '', unit: '' }]);
  };
  const removeAccessory = (i) => setAccessories(prev => prev.filter((_, idx) => idx !== i));
  const handleAccessoryChange = (i, field, value) =>
    setAccessories(prev => prev.map((a, idx) => {
      if (idx !== i) return a;
      if (field === 'qty' && a.fromPO) return { ...a, qty: value.replace(/[^0-9]/g, '') };
      return { ...a, [field]: value };
    }));

  const addLace = () => {
    if (laces.length >= 10) return;
    setLaces(prev => [...prev, { laceType: '', qty: '', unit: '' }]);
  };
  const removeLace = (i) => setLaces(prev => prev.filter((_, idx) => idx !== i));
  const handleLaceChange = (i, field, value) =>
    setLaces(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const resetForm = () => {
    setForm({
      issueDate: new Date().toLocaleDateString('en-GB'),
      poNumber: '', joNumber: '', article: '', receivingVendor: '',
      garmentType: '', fabricName: '', fabricColor: '', noOfThaan: '',
      qtyIssued: '', unit: '', fabricWidth: '', issueRemarks: '',
    });
    setAccessories([]);
    setLaces([]);
    setLotPreview('Auto-generated on submit');
  };

  const handleIssuePOSelect = async (e) => {
    const po_number = e.target.value;
    setIssuePO(po_number);
    setCompQtys({ shirt: '', trouser: '', dupatta: '' });
    setIssueSharedRemarks('');
    setIssuePOLog([]);
    if (po_number) {
      const found = pos.find(p => p.po_number === po_number);
      setIssuePODetails(found || null);
      setForm(prev => ({
        ...prev,
        poNumber:    po_number.replace('PO-', ''),
        garmentType: found?.garment_type || '',
        article:     found?.article_name || '',
        fabricColor: '',
        fabricName:  '',
      }));
      try {
        const [accRes, logRes] = await Promise.all([
          getPoAccessories(po_number),
          getFabricIssuanceLog(po_number),
        ]);
        const freshLogs = logRes.success ? logRes.logs : [];
        if (logRes.success) setIssuePOLog(freshLogs);
        // Set raw accessories — useEffect will compute visible filtered list
        setRawPOAccessories(accRes.success ? accRes.accessories : []);
      } catch { /* non-critical */ }
    } else {
      setIssuePODetails(null);
      setRawPOAccessories([]);
      setIssuePOLog([]);
      setAccessories([]);
      setForm(prev => ({
        ...prev,
        poNumber:    '',
        garmentType: '',
        article:     '',
        fabricColor: '',
        fabricName:  '',
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Field validation
    if (!form.issueDate.trim()) {
      setMessage({ type: 'error', text: 'Issue date is required.' });
      return;
    }
    if (!form.joNumber.trim()) {
      setMessage({ type: 'error', text: 'JO Number is required.' });
      return;
    }
    if (!form.receivingVendor.trim()) {
      setMessage({ type: 'error', text: 'Receiving Vendor is required.' });
      return;
    }

    // Multi-component validation
    if (issuePO) {
      const hasAnyQty = ['shirt','trouser','dupatta'].some(c => Number(compQtys[c]) > 0);
      if (!hasAnyQty) {
        setMessage({ type: 'error', text: 'Enter qty to issue for at least one component.' });
        return;
      }
      for (const comp of ['shirt','trouser','dupatta']) {
        const qty       = Number(compQtys[comp]);
        if (!qty) continue;
        const totalQty  = Number(issuePODetails?.[`${comp}_qty`] || 0);
        const issued    = Number(issuePODetails?.[`${comp}_meters_issued`] || 0);
        const remaining = totalQty - issued;
        if (qty > remaining) {
          const label = comp.charAt(0).toUpperCase() + comp.slice(1);
          setMessage({ type: 'error', text: `${label}: qty ${qty} exceeds remaining ${remaining} pcs.` });
          return;
        }
      }
      // Accessory validation
      for (const acc of accessories) {
        if (!acc.fromPO || !acc.qty || Number(acc.qty) === 0) continue;
        const issuedSoFar = issuePOLog.filter(l => l.component === acc.type).reduce((sum, l) => sum + Number(l.meters_issued), 0);
        const remaining   = acc.poTotalQty - issuedSoFar;
        if (Number(acc.qty) > remaining) {
          setMessage({ type: 'error', text: `Cannot issue ${acc.qty} of "${acc.type}" — only ${remaining} remaining.` });
          return;
        }
      }
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitIssuance({
        ...form,
        poNumber:    `PO-${form.poNumber}`,
        joNumber:    form.joNumber ? `JO-${form.joNumber}` : '',
        accessories: accessories.length > 0 ? JSON.stringify(accessories) : null,
        laces:       laces.length > 0       ? JSON.stringify(laces)       : null,
        issuedBy:    user.name,
      });

      if (result.success) {
        // Log multi-component issuances
        if (issuePO) {
          for (const comp of ['shirt','trouser','dupatta']) {
            const qty = Number(compQtys[comp]);
            if (!qty) continue;
            try {
              await logFabricIssuance({
                po_number:    issuePO,
                component:    comp,
                meters_issued:qty,
                issued_by:    user.name,
                remarks:      issueSharedRemarks || undefined,
              });
              await updatePO({
                po_number:   issuePO,
                action:      'update_meters',
                component:   comp,
                meters_delta:qty,
              });
            } catch { /* non-critical */ }
          }

          // Log PO-accessory issuances
          for (const acc of accessories) {
            if (!acc.fromPO || !acc.qty || Number(acc.qty) === 0) continue;
            try {
              await logFabricIssuance({
                po_number:    issuePO,
                component:    acc.type,
                meters_issued:Number(acc.qty),
                issued_by:    user.name,
                remarks:      issueSharedRemarks || undefined,
              });
            } catch { /* non-critical */ }
          }

          // Fetch fresh data; set issuePOLog + rawPOAccessories — useEffect recomputes accessories
          try {
            const [posRes, logRes, accRes2] = await Promise.all([
              getPOs(),
              getFabricIssuanceLog(issuePO),
              getPoAccessories(issuePO),
            ]);
            const freshLogs = logRes.success ? logRes.logs : [];
            const freshPos  = posRes.success ? posRes.pos  : pos;
            const updatedPO = freshPos.find(p => p.po_number === issuePO) || issuePODetails;

            if (posRes.success) setPos(freshPos);
            setIssuePODetails(updatedPO);
            setIssuePOLog(freshLogs);
            if (accRes2.success) setRawPOAccessories(accRes2.accessories);
            setCompQtys({ shirt: '', trouser: '', dupatta: '' });
            setIssueSharedRemarks('');
            resetForm();
            setForm(prev => ({
              ...prev,
              poNumber:    issuePO.replace('PO-', ''),
              garmentType: updatedPO?.garment_type || '',
              article:     updatedPO?.article_name || '',
            }));
          } catch { /* non-critical — state remains; useEffect will still refilter on any partial updates */ }
        } else {
          resetForm();
        }

        setMessage({
          type: 'success',
          text: `✓ Fabric issued successfully! Record ID: ${result.recordId} | Lot: ${result.lotNumber}`,
        });
        loadData();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch {
      setMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setSubmitting(false);
  };

  const getStatusBadge = (status) => {
    const map = { Issued: 'badge-issued', Accepted: 'badge-accepted', Partial: 'badge-partial', Rejected: 'badge-rejected' };
    return `badge ${map[status] || 'badge-pending'}`;
  };

  // ── PO Management handlers ─────────────────────────────────────────────

  const handlePOChange = (e) => {
    const { name, value } = e.target;
    if (name === 'po_number' || name === 'batch_number_b' || name === 'batch_number_po') {
      const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
      setPOForm(prev => ({ ...prev, [name]: digits }));
      return;
    }
    setPOForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePOColourChange = (component, value) =>
    setPOForm(prev => ({ ...prev, [`${component}_colour`]: value }));

  const toggleCard = (key) =>
    setCollapsedCards(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePOAccessoryChange = (i, field, value) =>
    setPOAccessories(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));

  const addPOAccessoryRow = () =>
    setPOAccessories(prev => [...prev, { accessory_type: '', quantity: '' }]);

  const removePOAccessoryRow = (i) =>
    setPOAccessories(prev => prev.filter((_, idx) => idx !== i));

  const handlePOSubmit = async (e) => {
    e.preventDefault();

    if (!poForm.batch_number_b.trim()) {
      setPOMessage({ type: 'error', text: 'Batch Number (B- part) is required.' }); return;
    }
    if (!poForm.batch_number_po.trim()) {
      setPOMessage({ type: 'error', text: 'Batch Number (-PO- part) is required.' }); return;
    }
    if (!poForm.po_number.trim()) {
      setPOMessage({ type: 'error', text: 'PO Number is required.' }); return;
    }
    if (!poForm.collection_name.trim()) {
      setPOMessage({ type: 'error', text: 'Collection Name is required.' }); return;
    }
    if (!poForm.article_name.trim()) {
      setPOMessage({ type: 'error', text: 'Article Name is required.' }); return;
    }
    if (!poForm.garment_type) {
      setPOMessage({ type: 'error', text: 'Garment Type is required.' }); return;
    }

    // Validate component required fields
    const components = [
      { key: 'shirt',   label: 'Shirt' },
      { key: 'trouser', label: 'Trouser' },
      { key: 'dupatta', label: 'Dupatta' },
    ];
    for (const { key, label } of components) {
      if (!poForm[`${key}_colour`].trim()) {
        setPOMessage({ type: 'error', text: `${label} Colour is required.` }); return;
      }
      if (!poForm[`${key}_fabric`]) {
        setPOMessage({ type: 'error', text: `${label} Fabric Type is required.` }); return;
      }
      if (!poForm[`${key}_qty`]) {
        setPOMessage({ type: 'error', text: `${label} Quantity is required.` }); return;
      }
    }

    // Validate colour inputs
    const shirtOk   = shirtColourRef.current?.validate()   ?? true;
    const trouserOk = trouserColourRef.current?.validate() ?? true;
    const dupattaOk = dupattaColourRef.current?.validate() ?? true;
    if (!shirtOk || !trouserOk || !dupattaOk) {
      setPOMessage({ type: 'error', text: 'Please fix all colour fields.' }); return;
    }

    setPOSubmitting(true);
    setPOMessage(null);
    try {
      const res = await createPO({
        batch_number:   `B-${poForm.batch_number_b}-PO-${poForm.batch_number_po}`,
        po_number:      `PO-${poForm.po_number.trim()}`,
        collection_name:poForm.collection_name,
        article_name:   poForm.article_name   || undefined,
        garment_type:   poForm.garment_type   || undefined,
        po_date:        poForm.po_date         || undefined,
        delivery_date:  poForm.delivery_date   || undefined,
        remarks:        poForm.remarks         || undefined,
        shirt_colour:   poForm.shirt_colour    || undefined,
        shirt_fabric:   poForm.shirt_fabric    || undefined,
        shirt_qty:      poForm.shirt_qty ? Number(poForm.shirt_qty) : undefined,
        trouser_colour: poForm.trouser_colour  || undefined,
        trouser_fabric: poForm.trouser_fabric  || undefined,
        trouser_qty:    poForm.trouser_qty ? Number(poForm.trouser_qty) : undefined,
        dupatta_colour: poForm.dupatta_colour  || undefined,
        dupatta_fabric: poForm.dupatta_fabric  || undefined,
        dupatta_qty:    poForm.dupatta_qty ? Number(poForm.dupatta_qty) : undefined,
      });

      if (res.success) {
        // Post filled accessory rows
        const filled = poAccessories.filter(a => a.accessory_type && a.quantity);
        for (const acc of filled) {
          try {
            await addPoAccessory({
              po_number:      res.po.po_number,
              accessory_type: acc.accessory_type,
              quantity:       Number(acc.quantity),
            });
          } catch { /* non-critical */ }
        }
        setPOMessage({ type: 'success', text: `✓ PO ${res.po.po_number} created successfully.` });
        setPOForm(getEmptyPOForm());
        setPOAccessories([{ accessory_type: '', quantity: '' }]);
        setCollapsedCards({ shirt: false, trouser: false, dupatta: false });
        loadPOs();
      } else {
        setPOMessage({ type: 'error', text: res.message || 'Failed to create PO.' });
      }
    } catch {
      setPOMessage({ type: 'error', text: 'Submission failed. Please try again.' });
    }
    setPOSubmitting(false);
  };

  // ── PO Detail Modal ────────────────────────────────────────────────────

  const openPODetail = async (po) => {
    setSelectedPODetail(po);
    setDetailLoading(true);
    try {
      const [accRes, logRes] = await Promise.all([
        getPoAccessories(po.po_number),
        getFabricIssuanceLog(po.po_number),
      ]);
      if (accRes.success) setPODetailAccessories(accRes.accessories);
      if (logRes.success) setPODetailLog(logRes.logs);
    } catch { /* silently fail */ }
    setDetailLoading(false);
  };

  const closePODetail = () => {
    setSelectedPODetail(null);
    setPODetailAccessories([]);
    setPODetailLog([]);
  };

  // ── Edit PO handlers ───────────────────────────────────────────────────

  const openEditPO = async (po) => {
    // Pre-fill edit form from po_master row
    const batchRaw = po.batch_number || '';
    const bMatch   = batchRaw.match(/^B-(\d+)-PO-(\d+)$/);
    setEditPOForm({
      batch_number_b:  bMatch ? bMatch[1] : batchRaw,
      batch_number_po: bMatch ? bMatch[2] : '',
      po_number:        po.po_number,
      collection_name:  po.collection_name || '',
      article_name:     po.article_name    || '',
      garment_type:     po.garment_type    || '',
      po_date:          po.po_date    ? po.po_date.split('T')[0]    : '',
      delivery_date:    po.delivery_date ? po.delivery_date.split('T')[0] : '',
      remarks:          po.remarks        || '',
      shirt_colour:     po.shirt_colour   || '',
      shirt_fabric:     po.shirt_fabric   || '',
      shirt_qty:        po.shirt_qty      != null ? String(po.shirt_qty)   : '',
      trouser_colour:   po.trouser_colour || '',
      trouser_fabric:   po.trouser_fabric || '',
      trouser_qty:      po.trouser_qty    != null ? String(po.trouser_qty) : '',
      dupatta_colour:   po.dupatta_colour || '',
      dupatta_fabric:   po.dupatta_fabric || '',
      dupatta_qty:      po.dupatta_qty    != null ? String(po.dupatta_qty) : '',
    });
    setEditCollapsedCards({ shirt: false, trouser: false, dupatta: false });
    setEditPOMessage(null);
    setEditPOTarget(po);
    try {
      const accRes = await getPoAccessories(po.po_number);
      if (accRes.success) {
        setEditPOAccessories(
          accRes.accessories.length > 0
            ? accRes.accessories.map(a => ({ accessory_type: a.accessory_type, quantity: String(a.quantity) }))
            : [{ accessory_type: '', quantity: '' }]
        );
      } else {
        setEditPOAccessories([{ accessory_type: '', quantity: '' }]);
      }
    } catch {
      setEditPOAccessories([{ accessory_type: '', quantity: '' }]);
    }
  };

  const closeEditPO = () => {
    setEditPOTarget(null);
    setEditPOForm({});
    setEditPOAccessories([]);
    setEditPOMessage(null);
  };

  const handleEditPOChange = (e) => {
    const { name, value } = e.target;
    setEditPOForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEditPOColourChange = (component, value) =>
    setEditPOForm(prev => ({ ...prev, [`${component}_colour`]: value }));

  const toggleEditCard = (key) =>
    setEditCollapsedCards(prev => ({ ...prev, [key]: !prev[key] }));

  const handleEditPOAccessoryChange = (i, field, value) =>
    setEditPOAccessories(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));

  const addEditPOAccessoryRow = () =>
    setEditPOAccessories(prev => [...prev, { accessory_type: '', quantity: '' }]);

  const removeEditPOAccessoryRow = (i) =>
    setEditPOAccessories(prev => prev.filter((_, idx) => idx !== i));

  const handleEditPOSubmit = async (e) => {
    e.preventDefault();
    if (!editPOForm.collection_name?.trim()) {
      setEditPOMessage({ type: 'error', text: 'Collection Name is required.' }); return;
    }

    const shirtOk   = editShirtColourRef.current?.validate()   ?? true;
    const trouserOk = editTrouserColourRef.current?.validate() ?? true;
    const dupattaOk = editDupattaColourRef.current?.validate() ?? true;
    if (!shirtOk || !trouserOk || !dupattaOk) {
      setEditPOMessage({ type: 'error', text: 'Please fix all colour fields.' }); return;
    }

    setEditPOSubmitting(true);
    setEditPOMessage(null);
    try {
      const batchStr = editPOForm.batch_number_b
        ? `B-${editPOForm.batch_number_b}-PO-${editPOForm.batch_number_po || '0'}`
        : (editPOTarget.batch_number || null);

      const detailsRes = await updatePO({
        action:          'update_details',
        po_number:        editPOForm.po_number,
        batch_number:     batchStr,
        collection_name:  editPOForm.collection_name,
        article_name:     editPOForm.article_name    || null,
        garment_type:     editPOForm.garment_type    || null,
        po_date:          editPOForm.po_date         || null,
        delivery_date:    editPOForm.delivery_date   || null,
        remarks:          editPOForm.remarks         || null,
        shirt_colour:     editPOForm.shirt_colour    || null,
        shirt_fabric:     editPOForm.shirt_fabric    || null,
        shirt_qty:        editPOForm.shirt_qty       ? Number(editPOForm.shirt_qty)   : null,
        trouser_colour:   editPOForm.trouser_colour  || null,
        trouser_fabric:   editPOForm.trouser_fabric  || null,
        trouser_qty:      editPOForm.trouser_qty     ? Number(editPOForm.trouser_qty) : null,
        dupatta_colour:   editPOForm.dupatta_colour  || null,
        dupatta_fabric:   editPOForm.dupatta_fabric  || null,
        dupatta_qty:      editPOForm.dupatta_qty     ? Number(editPOForm.dupatta_qty) : null,
      });

      if (!detailsRes.success) {
        setEditPOMessage({ type: 'error', text: detailsRes.message || 'Failed to update PO.' });
        setEditPOSubmitting(false);
        return;
      }

      // Replace accessories: delete all then re-insert filled rows
      await deletePoAccessories(editPOForm.po_number);
      const filled = editPOAccessories.filter(a => a.accessory_type && a.quantity);
      for (const acc of filled) {
        await addPoAccessory({
          po_number:      editPOForm.po_number,
          accessory_type: acc.accessory_type,
          quantity:       Number(acc.quantity),
        });
      }

      setEditPOMessage({ type: 'success', text: `✓ PO ${editPOForm.po_number} updated successfully.` });
      loadPOs();
      setTimeout(closeEditPO, 1200);
    } catch {
      setEditPOMessage({ type: 'error', text: 'Update failed. Please try again.' });
    }
    setEditPOSubmitting(false);
  };

  const getPOStatusBadge = (status) => {
    if (status === 'Active')    return { cls: 'badge badge-accepted', style: undefined };
    if (status === 'Cancelled') return { cls: 'badge badge-rejected', style: undefined };
    return { cls: 'badge', style: { background: '#dbeafe', color: '#1e40af' } };
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  const componentCard = (compKey, compLabel, colourRef) => (
    <div key={compKey} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', marginBottom: '12px', overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', cursor: 'pointer' }}
        onClick={() => toggleCard(compKey)}
      >
        <span style={{ fontWeight: '700', color: '#0f3460', fontSize: '14px' }}>{compLabel} Details</span>
        <span style={{ fontSize: '12px', color: '#888' }}>{collapsedCards[compKey] ? '▼' : '▲'}</span>
      </div>
      {!collapsedCards[compKey] && (
        <div style={{ padding: '16px' }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Colour *</label>
              <ColourInput
                ref={colourRef}
                value={poForm[`${compKey}_colour`]}
                onChange={(v) => handlePOColourChange(compKey, v)}
                placeholder="e.g. Navy Blue"
                required
              />
            </div>
            <div className="form-group">
              <label>Fabric Type *</label>
              <select
                name={`${compKey}_fabric`}
                value={poForm[`${compKey}_fabric`]}
                onChange={handlePOChange}
              >
                <option value="">Select fabric</option>
                {FABRIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity (Pieces) *</label>
              <input
                type="number"
                name={`${compKey}_qty`}
                value={poForm[`${compKey}_qty`]}
                onChange={handlePOChange}
                onWheel={e => e.target.blur()}
                min="1"
                placeholder="e.g. 1000"
              />
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <input
                type="text"
                name={`${compKey}_remarks`}
                value={poForm[`${compKey}_remarks`]}
                onChange={handlePOChange}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const editComponentCard = (compKey, compLabel, colourRef) => (
    <div key={compKey} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', marginBottom: '12px', overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', cursor: 'pointer' }}
        onClick={() => toggleEditCard(compKey)}
      >
        <span style={{ fontWeight: '700', color: '#0f3460', fontSize: '14px' }}>{compLabel} Details</span>
        <span style={{ fontSize: '12px', color: '#888' }}>{editCollapsedCards[compKey] ? '▼' : '▲'}</span>
      </div>
      {!editCollapsedCards[compKey] && (
        <div style={{ padding: '16px' }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Colour</label>
              <ColourInput
                ref={colourRef}
                value={editPOForm[`${compKey}_colour`] || ''}
                onChange={(v) => handleEditPOColourChange(compKey, v)}
                placeholder="e.g. Navy Blue"
              />
            </div>
            <div className="form-group">
              <label>Fabric Type</label>
              <select
                name={`${compKey}_fabric`}
                value={editPOForm[`${compKey}_fabric`] || ''}
                onChange={handleEditPOChange}
              >
                <option value="">Select fabric</option>
                {FABRIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity (Pieces)</label>
              <input
                type="number"
                name={`${compKey}_qty`}
                value={editPOForm[`${compKey}_qty`] || ''}
                onChange={handleEditPOChange}
                onWheel={e => e.target.blur()}
                min="1"
                placeholder="e.g. 1000"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <nav className="navbar">
        <ProdFlowLogo height={32} />
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">PP Department</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div className="main-content">

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e8e8e8' }}>
          {[
            { key: 'issue', label: 'Issue Fabric' },
            { key: 'po',    label: 'PO Management' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: '600',
                color: activeTab === tab.key ? '#0f3460' : '#888',
                borderBottom: activeTab === tab.key ? '3px solid #0f3460' : '3px solid transparent',
                marginBottom: '-2px', transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: ISSUE FABRIC ───────────────────────────────────────── */}
        {activeTab === 'issue' && (
          <>
            <div className="card">
              <h3>Issue Fabric to Cutting Department</h3>

              {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

              <form onSubmit={handleSubmit}>

                {/* NEW: PO link at top */}
                <div className="form-group">
                  <label>Link to PO (optional)</label>
                  <select value={issuePO} onChange={handleIssuePOSelect}>
                    <option value="">— Select Active PO —</option>
                    {pos.filter(p => p.status === 'Active').map(p => (
                      <option key={p.po_number} value={p.po_number}>
                        {p.po_number}{p.collection_name ? ` — ${p.collection_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Multi-component issuance card — shown when PO is linked */}
                {issuePO && issuePODetails && (
                  <div style={{ border: '1px solid #e0e7ff', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>
                    <div style={{ background: '#f0f6ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff' }}>
                      <p style={{ fontWeight: '700', color: '#0f3460', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                        Qty to Issue — {issuePODetails.collection_name || issuePODetails.po_number}
                      </p>
                    </div>
                    <div style={{ padding: '12px 16px' }}>
                      {['shirt','trouser','dupatta'].map(comp => {
                        const totalQty  = Number(issuePODetails[`${comp}_qty`] || 0);
                        const issued    = Number(issuePODetails[`${comp}_meters_issued`] || 0);
                        const remaining = totalQty - issued;
                        const inputVal  = compQtys[comp];
                        const overLimit = inputVal !== '' && Number(inputVal) > remaining;
                        const label     = comp.charAt(0).toUpperCase() + comp.slice(1);
                        return (
                          <div key={comp} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f0f2f5' }}>
                            <div style={{ width: '72px', fontWeight: '700', color: '#0f3460', fontSize: '14px' }}>{label}</div>
                            <div style={{ flex: 1, fontSize: '12px', color: '#666' }}>
                              {issuePODetails[`${comp}_colour`] || '—'} · {issuePODetails[`${comp}_fabric`] || '—'}
                            </div>
                            <div style={{ minWidth: '100px', textAlign: 'right', fontSize: '12px' }}>
                              <span>Total: <strong>{totalQty}</strong></span>
                            </div>
                            <div style={{ minWidth: '110px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: remaining > 0 ? '#16a34a' : '#9ca3af' }}>
                              Remaining: {remaining}
                            </div>
                            <div style={{ width: '140px' }}>
                              <input
                                type="number"
                                value={inputVal}
                                onChange={e => setCompQtys(prev => ({ ...prev, [comp]: e.target.value }))}
                                onWheel={e => e.target.blur()}
                                min="1"
                                placeholder="Qty to issue"
                                disabled={remaining <= 0}
                                style={{
                                  width: '100%', padding: '8px 10px', fontSize: '14px',
                                  border: `1px solid ${overLimit ? '#dc2626' : '#d1d5db'}`,
                                  borderRadius: '6px',
                                  background: remaining <= 0 ? '#f9fafb' : overLimit ? '#fef2f2' : 'white',
                                  color: remaining <= 0 ? '#9ca3af' : 'inherit',
                                  boxSizing: 'border-box',
                                }}
                              />
                              {overLimit && (
                                <p style={{ fontSize: '11px', color: '#dc2626', margin: '3px 0 0', fontWeight: '600' }}>
                                  Exceeds remaining
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
                        <label>Issuance Remarks</label>
                        <input
                          type="text"
                          value={issueSharedRemarks}
                          onChange={e => setIssueSharedRemarks(e.target.value)}
                          placeholder="Optional notes for this issuance"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing form fields — unchanged */}
                <div className="form-grid">
                  <div className="form-group">
                    <label>Issue Date *</label>
                    <input type="text" name="issueDate" value={form.issueDate} onChange={handleChange} />
                  </div>

                  <div className="form-group">
                    <label>PO Number *</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: issuePO ? '2px dashed #0f3460' : '2px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden', background: issuePO ? '#f0f6ff' : '#fafafa' }}>
                      <span style={{ padding: '12px 14px', background: '#f0f2f5', color: '#555', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderRight: issuePO ? '2px dashed #0f3460' : '2px solid #e8e8e8', userSelect: 'none' }}>PO-</span>
                      <input
                        type="text"
                        name="poNumber"
                        placeholder="001"
                        value={form.poNumber}
                        onChange={handleChange}
                        maxLength={4}
                        disabled={!!issuePO}
                        style={{ border: 'none', flex: 1, padding: '12px 10px', outline: 'none', background: 'transparent', fontSize: '15px', color: issuePO ? '#0f3460' : 'inherit', cursor: issuePO ? 'not-allowed' : 'text' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>JO Number *</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                      <span style={{ padding: '12px 14px', background: '#f0f2f5', color: '#555', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderRight: '2px solid #e8e8e8', userSelect: 'none' }}>JO-</span>
                      <input
                        type="text"
                        name="joNumber"
                        placeholder="001"
                        value={form.joNumber}
                        onChange={handleChange}
                        maxLength={4}
                        style={{ border: 'none', flex: 1, padding: '12px 10px', outline: 'none', background: 'transparent', fontSize: '15px' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Article</label>
                    <input
                      type="text"
                      name="article"
                      placeholder={issuePO ? '' : 'e.g. Shalwar Kameez'}
                      value={form.article}
                      onChange={handleChange}
                      disabled={!!issuePO}
                      style={issuePO ? { border: '2px dashed #0f3460', background: '#f0f6ff', color: '#0f3460' } : {}}
                    />
                  </div>

                  <div className="form-group">
                    <label>Receiving Vendor *</label>
                    <select name="receivingVendor" value={form.receivingVendor} onChange={handleChange}>
                      <option value="">Select vendor</option>
                      {dropdowns.receivingVendors.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Lot Number</label>
                    <input type="text" value={lotPreview} className="auto-field" disabled />
                  </div>

                  <div className="form-group">
                    <label>Garment Type *</label>
                    {issuePO ? (
                      <input
                        type="text"
                        value={form.garmentType}
                        disabled
                        style={{ border: '2px dashed #0f3460', background: '#f0f6ff', color: '#0f3460', width: '100%', padding: '12px 16px', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', cursor: 'not-allowed' }}
                      />
                    ) : (
                      <select name="garmentType" value={form.garmentType} onChange={handleChange}>
                        <option value="">Select type</option>
                        {dropdowns.garmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Fabric Name *</label>
                    <input
                      type="text"
                      name="fabricName"
                      placeholder={issuePO ? '' : 'e.g. Lawn, Khaddar'}
                      value={form.fabricName}
                      onChange={handleChange}
                      disabled={!!issuePO}
                      style={issuePO ? { border: '2px dashed #0f3460', background: '#f0f6ff', color: '#0f3460' } : {}}
                    />
                  </div>

                  <div className="form-group">
                    <label>Fabric Color *</label>
                    <input
                      type="text"
                      name="fabricColor"
                      placeholder={issuePO ? '' : 'e.g. Navy Blue'}
                      value={form.fabricColor}
                      onChange={handleChange}
                      disabled={!!issuePO}
                      style={issuePO ? { border: '2px dashed #0f3460', background: '#f0f6ff', color: '#0f3460' } : {}}
                    />
                  </div>

                  <div className="form-group">
                    <label>Remarks</label>
                    <input type="text" name="issueRemarks" placeholder="Optional notes" value={form.issueRemarks} onChange={handleChange} />
                  </div>
                </div>

                {/* Accessories */}
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: '#0f3460' }}>Accessories</h4>
                    {accessories.filter(a => !a.fromPO).length < 10 && (
                      <button type="button" className="btn btn-small" onClick={addAccessory} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>+ Add Accessory</button>
                    )}
                  </div>
                  {accessories.map((acc, i) => {
                    if (acc.fromPO) {
                      const issuedSoFar = issuePOLog.filter(l => l.component === acc.type).reduce((sum, l) => sum + Number(l.meters_issued), 0);
                      const remaining   = acc.poTotalQty - issuedSoFar;
                      if (remaining <= 0) return null;
                      const qtyNum      = Number(acc.qty || 0);
                      const overIssued  = qtyNum > 0 && qtyNum > remaining;
                      return (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'flex-start' }}>
                          <div style={{ flex: 2 }}>
                            <input type="text" value={acc.type} readOnly className="auto-field" style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '6px', boxSizing: 'border-box' }} />
                            <p style={{ fontSize: '11px', margin: '3px 0 0', fontWeight: '600', color: remaining > 0 ? '#16a34a' : '#dc2626' }}>
                              Available: {remaining} &nbsp;·&nbsp; Issued: {issuedSoFar} / {acc.poTotalQty}
                            </p>
                          </div>
                          <div style={{ flex: 1 }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Qty to issue"
                              value={acc.qty}
                              onChange={e => handleAccessoryChange(i, 'qty', e.target.value)}
                              style={{ width: '100%', padding: '8px', border: `1px solid ${overIssued ? '#dc2626' : '#d1d5db'}`, borderRadius: '6px', background: overIssued ? '#fef2f2' : 'white', boxSizing: 'border-box' }}
                            />
                            {overIssued && (
                              <p style={{ fontSize: '11px', color: '#dc2626', margin: '3px 0 0', fontWeight: '600' }}>
                                Exceeds by {qtyNum - remaining}
                              </p>
                            )}
                          </div>
                          <button type="button" onClick={() => removeAccessory(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}>✕</button>
                        </div>
                      );
                    }
                    return (
                      <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <select value={acc.type} onChange={e => handleAccessoryChange(i, 'type', e.target.value)} style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                          <option value="">Select type</option>
                          {dropdowns.accessoryTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input type="number" placeholder="Qty" value={acc.qty} onChange={e => handleAccessoryChange(i, 'qty', e.target.value)} onWheel={e => e.target.blur()} min="0" style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                        <select value={acc.unit} onChange={e => handleAccessoryChange(i, 'unit', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                          <option value="">Unit</option>
                          {ACCESSORY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <button type="button" onClick={() => removeAccessory(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}>✕</button>
                      </div>
                    );
                  })}
                  {accessories.length === 0 && <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0' }}>No accessories added.</p>}
                </div>

                {/* Laces */}
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: '#0f3460' }}>Laces</h4>
                    {laces.length < 10 && (
                      <button type="button" className="btn btn-small" onClick={addLace} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>+ Add Lace</button>
                    )}
                  </div>
                  {laces.map((lace, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input type="text" placeholder="Lace type" value={lace.laceType} onChange={e => handleLaceChange(i, 'laceType', e.target.value)} style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                      <input type="number" placeholder="Qty" value={lace.qty} onChange={e => handleLaceChange(i, 'qty', e.target.value)} onWheel={e => e.target.blur()} min="0" style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                      <input type="text" placeholder="Unit" value={lace.unit} onChange={e => handleLaceChange(i, 'unit', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                      <button type="button" onClick={() => removeLace(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}>✕</button>
                    </div>
                  ))}
                  {laces.length === 0 && <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0' }}>No laces added.</p>}
                </div>

                <div style={{ marginTop: '20px' }}>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Issue Fabric'}
                  </button>
                </div>
              </form>
            </div>

            {/* My Records */}
            <div className="card">
              <h3>My Issuance Records</h3>
              {loading ? (
                <div className="loading"><div className="spinner"></div>Loading records...</div>
              ) : records.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No records yet. Issue fabric above to get started.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Record ID</th><th>Date</th><th>PO</th><th>JO</th><th>Lot</th>
                        <th>Article</th><th>Vendor</th><th>Fabric</th><th>Color</th><th>Qty</th><th>Unit</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={i}>
                          <td>{r.Record_ID}</td>
                          <td>{r.Issue_Date ? new Date(r.Issue_Date).toLocaleDateString('en-GB') : '—'}</td>
                          <td>{r.PO_Number}</td><td>{r.JO_Number}</td><td>{r.Lot_Number}</td>
                          <td>{r.Article || '—'}</td><td>{r.Receiving_Vendor}</td>
                          <td>{r.Fabric_Name}</td><td>{r.Fabric_Color}</td>
                          <td>{r.Qty_Issued}</td><td>{r.Unit}</td>
                          <td><span className={getStatusBadge(r.Acceptance_Status || r.Issue_Status)}>{r.Acceptance_Status || r.Issue_Status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB 2: PO MANAGEMENT ─────────────────────────────────────── */}
        {activeTab === 'po' && (
          <>
            {/* Create PO Form */}
            <div className="card">
              <h3>Create New PO</h3>

              {poMessage && <div className={`alert alert-${poMessage.type}`}>{poMessage.text}</div>}

              <form onSubmit={handlePOSubmit}>

                {/* Section A: Header */}
                <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>A — Header</p>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Batch Number *</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '2px dashed #0f3460', borderRadius: '8px', overflow: 'hidden', background: '#f0f6ff' }}>
                      <span style={{ padding: '12px 12px', background: '#e0e7ff', color: '#0f3460', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderRight: '2px dashed #0f3460', userSelect: 'none' }}>B-</span>
                      <input
                        type="text"
                        name="batch_number_b"
                        placeholder="1"
                        value={poForm.batch_number_b}
                        onChange={handlePOChange}
                        maxLength={4}
                        style={{ border: 'none', width: '48px', padding: '12px 8px', outline: 'none', background: 'transparent', fontSize: '15px', textAlign: 'center' }}
                      />
                      <span style={{ padding: '12px 10px', background: '#e0e7ff', color: '#0f3460', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderLeft: '2px dashed #0f3460', borderRight: '2px dashed #0f3460', userSelect: 'none' }}>-PO-</span>
                      <input
                        type="text"
                        name="batch_number_po"
                        placeholder="001"
                        value={poForm.batch_number_po}
                        onChange={handlePOChange}
                        maxLength={4}
                        style={{ border: 'none', flex: 1, padding: '12px 8px', outline: 'none', background: 'transparent', fontSize: '15px' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>PO Number *</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                      <span style={{ padding: '12px 14px', background: '#f0f2f5', color: '#555', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderRight: '2px solid #e8e8e8', userSelect: 'none' }}>PO-</span>
                      <input
                        type="text"
                        name="po_number"
                        placeholder="001"
                        value={poForm.po_number}
                        onChange={handlePOChange}
                        maxLength={4}
                        style={{ border: 'none', flex: 1, padding: '12px 10px', outline: 'none', background: 'transparent', fontSize: '15px' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Collection Name *</label>
                    <input type="text" name="collection_name" placeholder="e.g. Linen Collection 2026" value={poForm.collection_name} onChange={handlePOChange} />
                  </div>

                  <div className="form-group">
                    <label>Article Name *</label>
                    <input type="text" name="article_name" placeholder="e.g. 3-Piece Suit" value={poForm.article_name} onChange={handlePOChange} />
                  </div>

                  <div className="form-group">
                    <label>Garment Type *</label>
                    <select name="garment_type" value={poForm.garment_type} onChange={handlePOChange}>
                      <option value="">Select type</option>
                      {dropdowns.garmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>PO Date</label>
                    <input type="date" name="po_date" value={poForm.po_date} onChange={handlePOChange} />
                  </div>

                  <div className="form-group">
                    <label>Delivery Date</label>
                    <input type="date" name="delivery_date" value={poForm.delivery_date} onChange={handlePOChange} />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Remarks</label>
                    <textarea name="remarks" placeholder="Optional notes" value={poForm.remarks} onChange={handlePOChange} rows={2} />
                  </div>
                </div>

                {/* Section B: Components */}
                <div style={{ marginTop: '24px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>B — Components</p>
                </div>
                {componentCard('shirt',   'Shirt',   shirtColourRef)}
                {componentCard('trouser', 'Trouser', trouserColourRef)}
                {componentCard('dupatta', 'Dupatta', dupattaColourRef)}

                {/* Section C: Accessories */}
                <div style={{ marginTop: '24px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>C — Accessories</p>
                    <button type="button" className="btn btn-small" onClick={addPOAccessoryRow} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>+ Add Accessory</button>
                  </div>
                </div>
                {poAccessories.map((acc, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="e.g. Lace, Button, Zip"
                      value={acc.accessory_type}
                      onChange={e => handlePOAccessoryChange(i, 'accessory_type', e.target.value)}
                      style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                    <input type="number" placeholder="Qty" value={acc.quantity} onChange={e => handlePOAccessoryChange(i, 'quantity', e.target.value)} onWheel={e => e.target.blur()} min="0" style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                    {poAccessories.length > 1 && (
                      <button type="button" onClick={() => removePOAccessoryRow(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}>✕</button>
                    )}
                  </div>
                ))}
                <p style={{ color: '#aaa', fontSize: '12px', margin: '4px 0 0' }}>Accessories are optional — leave rows blank to skip.</p>

                <div style={{ marginTop: '24px' }}>
                  <button type="submit" className="btn btn-primary" disabled={poSubmitting}>
                    {poSubmitting ? 'Creating...' : 'Create PO'}
                  </button>
                </div>
              </form>
            </div>

            {/* PO List */}
            <div className="card">
              <h3>My POs</h3>
              {poLoading ? (
                <div className="loading"><div className="spinner"></div>Loading POs...</div>
              ) : pos.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No POs created yet.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>PO Number</th><th>Batch No.</th><th>Collection</th><th>Article</th><th>Type</th>
                        <th>Shirt Qty</th><th>Trouser Qty</th><th>Dupatta Qty</th>
                        <th>Status</th><th>View</th><th>Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((p, i) => {
                        const badge = getPOStatusBadge(p.status);
                        return (
                          <tr key={i}>
                            <td>{p.po_number}</td>
                            <td>{p.batch_number || '—'}</td>
                            <td>{p.collection_name || p.buyer_name || '—'}</td>
                            <td>{p.article_name || '—'}</td>
                            <td>{p.garment_type || '—'}</td>
                            <td>{p.shirt_qty ?? '—'}</td>
                            <td>{p.trouser_qty ?? '—'}</td>
                            <td>{p.dupatta_qty ?? '—'}</td>
                            <td><span className={badge.cls} style={badge.style}>{p.status || '—'}</span></td>
                            <td>
                              <button className="btn btn-small" onClick={() => openPODetail(p)} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>
                                View
                              </button>
                            </td>
                            <td>
                              {poHasIssuance.has(p.po_number) ? (
                                <span title="Cannot edit — fabric already issued" style={{ fontSize: '12px', color: '#aaa', cursor: 'not-allowed' }}>Locked</span>
                              ) : (
                                <button className="btn btn-small" onClick={() => openEditPO(p)} style={{ background: '#fef3c7', color: '#92400e', width: 'auto' }}>
                                  Edit
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

        <PoweredByFintrack />
      </div>

      {/* ── Edit PO Modal ─────────────────────────────────────────────── */}
      {editPOTarget && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            zIndex: 1100, overflowY: 'auto', padding: '5vh 16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeEditPO(); }}
        >
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '720px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: '#0f3460', marginBottom: '4px' }}>Edit PO — {editPOTarget.po_number}</h2>
                <p style={{ color: '#666', fontSize: '13px' }}>Changes to Batch No., Collection, components, and accessories only. PO Number cannot change.</p>
              </div>
              <button className="btn btn-small btn-danger" onClick={closeEditPO} style={{ width: 'auto' }}>Close</button>
            </div>

            {editPOMessage && <div className={`alert alert-${editPOMessage.type}`}>{editPOMessage.text}</div>}

            <form onSubmit={handleEditPOSubmit}>
              {/* Section A */}
              <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>A — Header</p>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Batch Number</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '2px dashed #0f3460', borderRadius: '8px', overflow: 'hidden', background: '#f0f6ff' }}>
                    <span style={{ padding: '12px 12px', background: '#e0e7ff', color: '#0f3460', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderRight: '2px dashed #0f3460', userSelect: 'none' }}>B-</span>
                    <input
                      type="text"
                      name="batch_number_b"
                      value={editPOForm.batch_number_b || ''}
                      onChange={handleEditPOChange}
                      maxLength={4}
                      style={{ border: 'none', width: '48px', padding: '12px 8px', outline: 'none', background: 'transparent', fontSize: '15px', textAlign: 'center' }}
                    />
                    <span style={{ padding: '12px 10px', background: '#e0e7ff', color: '#0f3460', fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', borderLeft: '2px dashed #0f3460', borderRight: '2px dashed #0f3460', userSelect: 'none' }}>-PO-</span>
                    <input
                      type="text"
                      name="batch_number_po"
                      value={editPOForm.batch_number_po || ''}
                      onChange={handleEditPOChange}
                      maxLength={4}
                      style={{ border: 'none', flex: 1, padding: '12px 8px', outline: 'none', background: 'transparent', fontSize: '15px' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>PO Number</label>
                  <input type="text" value={editPOForm.po_number || ''} disabled style={{ background: '#f0f0f0', color: '#999', width: '100%', padding: '12px 16px', border: '2px solid #e8e8e8', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>

                <div className="form-group">
                  <label>Collection Name *</label>
                  <input type="text" name="collection_name" value={editPOForm.collection_name || ''} onChange={handleEditPOChange} placeholder="e.g. Linen Collection 2026" />
                </div>

                <div className="form-group">
                  <label>Article Name</label>
                  <input type="text" name="article_name" value={editPOForm.article_name || ''} onChange={handleEditPOChange} placeholder="e.g. 3-Piece Suit" />
                </div>

                <div className="form-group">
                  <label>Garment Type</label>
                  <select name="garment_type" value={editPOForm.garment_type || ''} onChange={handleEditPOChange}>
                    <option value="">Select type</option>
                    {dropdowns.garmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>PO Date</label>
                  <input type="date" name="po_date" value={editPOForm.po_date || ''} onChange={handleEditPOChange} />
                </div>

                <div className="form-group">
                  <label>Delivery Date</label>
                  <input type="date" name="delivery_date" value={editPOForm.delivery_date || ''} onChange={handleEditPOChange} />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Remarks</label>
                  <textarea name="remarks" value={editPOForm.remarks || ''} onChange={handleEditPOChange} rows={2} placeholder="Optional notes" />
                </div>
              </div>

              {/* Section B: Components */}
              <div style={{ marginTop: '24px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>B — Components</p>
              </div>
              {editComponentCard('shirt',   'Shirt',   editShirtColourRef)}
              {editComponentCard('trouser', 'Trouser', editTrouserColourRef)}
              {editComponentCard('dupatta', 'Dupatta', editDupattaColourRef)}

              {/* Section C: Accessories */}
              <div style={{ marginTop: '24px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f2f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>C — Accessories</p>
                  <button type="button" className="btn btn-small" onClick={addEditPOAccessoryRow} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>+ Add</button>
                </div>
              </div>
              {editPOAccessories.map((acc, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="e.g. Lace, Button, Zip"
                    value={acc.accessory_type}
                    onChange={e => handleEditPOAccessoryChange(i, 'accessory_type', e.target.value)}
                    style={{ flex: 2, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={acc.quantity}
                    onChange={e => handleEditPOAccessoryChange(i, 'quantity', e.target.value)}
                    onWheel={e => e.target.blur()}
                    min="0"
                    style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                  {editPOAccessories.length > 1 && (
                    <button type="button" onClick={() => removeEditPOAccessoryRow(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', color: '#dc2626', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }}>✕</button>
                  )}
                </div>
              ))}
              <p style={{ color: '#aaa', fontSize: '12px', margin: '4px 0 16px' }}>Accessories will be replaced entirely on save. Leave rows blank to remove all.</p>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" disabled={editPOSubmitting} style={{ flex: 1 }}>
                  {editPOSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn" onClick={closeEditPO} style={{ flex: 1, background: '#f0f2f5', color: '#333' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── PO Detail Modal (portal — direct child of body for print) ──── */}
      {selectedPODetail && ReactDOM.createPortal(
        <div
          className="po-detail-modal-print"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            zIndex: 1000, overflowY: 'auto', padding: '5vh 16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closePODetail(); }}
        >
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '800px', width: '100%' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: '#0f3460', marginBottom: '4px' }}>{selectedPODetail.po_number}</h2>
                {selectedPODetail.batch_number && (
                  <p style={{ color: '#0f3460', fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>
                    Batch: {selectedPODetail.batch_number}
                  </p>
                )}
                <p style={{ color: '#666', fontSize: '14px' }}>{selectedPODetail.collection_name || selectedPODetail.buyer_name || '—'}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-small" onClick={() => window.print()} style={{ background: '#e0e7ff', color: '#0f3460', width: 'auto' }}>Print</button>
                <button className="btn btn-small btn-danger" onClick={closePODetail} style={{ width: 'auto' }}>Close</button>
              </div>
            </div>

            {/* Section A: Header fields */}
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e8e8e8' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>A — Header</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div><span style={{ color: '#888' }}>Article: </span><strong>{selectedPODetail.article_name || '—'}</strong></div>
                <div><span style={{ color: '#888' }}>Garment Type: </span><strong>{selectedPODetail.garment_type || '—'}</strong></div>
                <div><span style={{ color: '#888' }}>PO Date: </span><strong>{selectedPODetail.po_date ? new Date(selectedPODetail.po_date).toLocaleDateString('en-GB') : '—'}</strong></div>
                <div><span style={{ color: '#888' }}>Delivery Date: </span><strong>{selectedPODetail.delivery_date ? new Date(selectedPODetail.delivery_date).toLocaleDateString('en-GB') : '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#888' }}>Remarks: </span><strong>{selectedPODetail.remarks || '—'}</strong></div>
              </div>
            </div>

            {/* Section B: Component cards */}
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e8e8e8' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>B — Components</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {['shirt','trouser','dupatta'].map(comp => {
                  const qty       = Number(selectedPODetail[`${comp}_qty`] || 0);
                  const issued    = Number(selectedPODetail[`${comp}_meters_issued`] || 0);
                  const remaining = qty - issued;
                  return (
                    <div key={comp} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '12px' }}>
                      <p style={{ fontWeight: '700', color: '#0f3460', marginBottom: '8px', textTransform: 'capitalize', fontSize: '13px' }}>{comp}</p>
                      <p style={{ fontSize: '13px', marginBottom: '4px' }}><span style={{ color: '#888' }}>Colour: </span>{selectedPODetail[`${comp}_colour`] || '—'}</p>
                      <p style={{ fontSize: '13px', marginBottom: '4px' }}><span style={{ color: '#888' }}>Fabric: </span>{selectedPODetail[`${comp}_fabric`] || '—'}</p>
                      <p style={{ fontSize: '13px', marginBottom: '4px' }}><span style={{ color: '#888' }}>Total Qty: </span>{qty} pcs</p>
                      <p style={{ fontSize: '13px', marginBottom: '4px' }}><span style={{ color: '#888' }}>Issued: </span>{issued} pcs</p>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: remaining > 0 ? '#16a34a' : '#dc2626' }}>
                        Remaining: {remaining} pcs
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section C: Accessories */}
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e8e8e8' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>C — Accessories</p>
              {detailLoading ? (
                <p style={{ color: '#888', fontSize: '13px' }}>Loading...</p>
              ) : poDetailAccessories.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '13px' }}>No accessories recorded.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead><tr><th>Type</th><th>Quantity</th></tr></thead>
                    <tbody>
                      {poDetailAccessories.map((a, i) => (
                        <tr key={i}><td>{a.accessory_type}</td><td>{a.quantity}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section D: Issuance History */}
            <div>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f3460', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>D — Issuance History</p>
              {detailLoading ? (
                <p style={{ color: '#888', fontSize: '13px' }}>Loading...</p>
              ) : poDetailLog.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '13px' }}>No issuance history.</p>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Component</th><th>Pieces Issued</th><th>Issued By</th><th>Remarks</th></tr>
                    </thead>
                    <tbody>
                      {poDetailLog.map((l, i) => (
                        <tr key={i}>
                          <td>{l.issued_at ? new Date(l.issued_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td style={{ textTransform: 'capitalize' }}>{l.component}</td>
                          <td>{l.meters_issued} pcs</td>
                          <td>{l.issued_by}</td>
                          <td>{l.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

export default PPView;
