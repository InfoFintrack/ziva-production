import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPOs, getAllocations, getPaymentEntries, getProductionFlow, recordProductionFlow, getStitchers, getAdvanceLedger, setAdvanceOpening, getCMTRates } from '../api';
import {finishedForGarment} from '../controlMetrics';
import { count, day, money, num, poBoard } from '../dashboardMetrics';
import ProdFlowLogo from '../components/ProdFlowLogo';
import '../components/ExecutiveDashboard.css';
import '../components/ProductionFlow.css';

const TYPES = {
  Cutting: ['Cut'], PP: ['Vendor_Issue', 'Vendor_Return', 'Dispatched'],
  Finishing: ['QC_Packed'], Admin: ['Cut', 'Vendor_Issue', 'Vendor_Return', 'QC_Packed', 'Dispatched', 'Yield_Standard'],
};
const eventTotal = (events, po, component, type) => events.filter(e => e.po_number === po && e.component === component && e.event_type === type).reduce((sum, e) => sum + num(e.quantity), 0);


export default function ProductionFlowView({ user, onLogout, home }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [poFilter, setPoFilter] = useState('');
  const [form, setForm] = useState({ type: (TYPES[user.role] || [])[0] || '', po_number: '', component: 'shirt', quantity: '', worker_code: '', vendor_name: '', vendor_process: 'Dyeing', issue_id: '', article_name: '', meters_per_piece: '', fabric_meters: '', occurred_at: '' });
  const [openingForm, setOpeningForm] = useState({ stitcher_code: '', balance: '' });
  const [openingMessage, setOpeningMessage] = useState('');

  const load = async () => {
    setError('');
    try {
      const responses = await Promise.all([getPOs(), getAllocations(), getPaymentEntries(), getProductionFlow(), getStitchers(), getCMTRates('?status=Approved'), ...(user.role === 'Admin' ? [getAdvanceLedger()] : [])]);
      const failed = responses.find(response => !response?.success);
      if (failed) throw new Error(failed.message || 'Could not load production data.');
      setData({ pos: responses[0].pos || [], allocations: responses[1].allocations || [], payments: responses[2].payments || [], events: responses[3].events || [], standards: responses[3].standards || [], workers: responses[4].stitchers || [], rates: responses[5].rates || [], ledger: user.role === 'Admin' ? responses[6] : null });
    } catch (err) { setError(err.message || 'Could not load production data.'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(() => data ? poBoard(data.pos, data.allocations, data.payments, data.rates,new Date(),data.events) : [], [data]);
  const selected = data?.pos.find(p => p.po_number === (poFilter || form.po_number)) || data?.pos[0];
  const components = ['shirt', 'trouser', 'dupatta'].filter(key => num(selected?.[`${key}_qty`]) > 0);
  const stageRows = components.map(component => {
    const key = selected.po_number;
    const stitching = data.allocations.filter(a => a.po_number === key && a.component === component && a.module_type !== 'Finishing');
    const finishing = data.allocations.filter(a => a.po_number === key && a.module_type === 'Finishing' && String(a.component).startsWith(`${component} `));

    const sum = (rows, field) => rows.reduce((total, row) => total + num(row[field]), 0);
    const cut = eventTotal(data.events, key, component, 'Cut');
    const packed = eventTotal(data.events, key, component, 'QC_Packed');
    const dispatched = eventTotal(data.events, key, component, 'Dispatched');
    const stitched = sum(stitching, 'qty_accepted');
    const finished = finishedForGarment(key,component,data.allocations,data.rates);
    return { component, ordered: num(selected[`${component}_qty`]), cut, cutTracked: data.events.some(e => e.po_number === key && e.component === component && e.event_type === 'Cut'), stitchAllocated: sum(stitching, 'qty_allocated'), stitchReturned: sum(stitching, 'qty_returned'), stitched, stitchOpen: Math.max(0, sum(stitching, 'qty_allocated') - sum(stitching, 'qty_returned')), finishOpen: Math.max(0, sum(finishing, 'qty_allocated') - sum(finishing, 'qty_returned')), finished, packed, dispatched,
      cutWaiting: Math.max(0, cut - sum(stitching, 'qty_allocated')), finishWaiting: Math.max(0, stitched - finished), qcWaiting: Math.max(0, finished - packed), dispatchWaiting: Math.max(0, packed - dispatched) };
  });
  const currentPO = board.find(p => p.po_number === selected?.po_number);
  const aged = data ? data.allocations.filter(a => num(a.qty_allocated) > num(a.qty_returned)).map(a => ({ ...a, days: Math.floor((new Date() - new Date(a.allocation_date)) / 86400000) })).filter(a => a.days > 14).sort((a, b) => b.days - a.days) : [];

  const quality = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.allocations.forEach(a => {
      const operation = a.module_type === 'Finishing' ? a.component : `Stitching ${a.component}`;
      const key = `${String(a.stitcher_code).trim()}|${operation}`;
      if (!map.has(key)) map.set(key, { code: String(a.stitcher_code).trim(), name: a.stitcher_name, operation, returned: 0, accepted: 0, rejected: 0, rework: 0 });
      const row = map.get(key);
      ['returned', 'accepted', 'rejected', 'rework'].forEach(field => { row[field] += num(field==='rework' ? (a.qty_rework_total ?? a.qty_rework) : a[`qty_${field}`]); });
    });
    return [...map.values()].filter(row => row.returned > 0).sort((a, b) => (a.rejected + a.rework) / a.returned - (b.rejected + b.rework) / b.returned);
  }, [data]);
  const productivity = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.payments.forEach(p => {
      const key = `${String(p.stitcher_code).trim()}|${day(p.entry_date)}`;
      if (!map.has(key)) map.set(key, { code: String(p.stitcher_code).trim(), name: p.stitcher_name, date: day(p.entry_date), pieces: 0, weighted: 0, earnings: 0 });
      const row = map.get(key);
      row.pieces += num(p.qty_claimed);
      row.weighted += num(p.qty_claimed) * num(p.rate);
      row.earnings += num(p.amount);
    });
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.earnings - a.earnings).slice(0, 100);
  }, [data]);
  const vendorIssues = data ? data.events.filter(e => e.event_type === 'Vendor_Issue').map(issue => {
    const receipts = data.events.filter(e => e.event_type === 'Vendor_Return' && e.issue_id === issue.id);
    const received = receipts.reduce((sum, e) => sum + num(e.quantity), 0);
    const lastReceipt = receipts.length ? receipts.reduce((latest, e) => e.occurred_at > latest ? e.occurred_at : latest, receipts[0].occurred_at) : '';
    return { ...issue, received, balance: Math.max(0, num(issue.quantity) - received), turnaround: lastReceipt ? Math.ceil((new Date(lastReceipt) - new Date(issue.occurred_at)) / 86400000) : null };
  }) : [];
  const openIssues = vendorIssues.filter(issue => issue.balance > 0 && issue.po_number === form.po_number && issue.component === form.component);

  const save = async event => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const result = await recordProductionFlow({ ...form, quantity: Number(form.quantity), meters_per_piece: Number(form.meters_per_piece) });
      if (!result.success) throw new Error(result.message || 'Could not record event.');
      setMessage('Recorded successfully.'); setForm(prev => ({ ...prev, quantity: '', meters_per_piece: '', issue_id: '', fabric_meters: '' }));
      await load();
    } catch (err) { setMessage(err.message || 'Request failed.'); }
    setSaving(false);
  };
  const saveOpening = async event => {
    event.preventDefault(); setOpeningMessage('');
    try {
      const result = await setAdvanceOpening({ stitcher_code: openingForm.stitcher_code, balance: Number(openingForm.balance) });
      if (!result.success) throw new Error(result.message || 'Opening balance was not saved.');
      setOpeningMessage('Opening balance recorded.'); await load();
    } catch (err) { setOpeningMessage(err.message || 'Request failed.'); }
  };

  return <div className="app-container"><nav className="navbar"><ProdFlowLogo height={32} /><div className="user-info"><Link to={home} style={{ color: '#a6c2f5' }}>← My workspace</Link><span>{user.name}</span><button className="btn btn-danger btn-small" onClick={onLogout}>Logout</button></div></nav><div className="main-content executive">
    <header className="executive-hero"><div><span className="executive-eyebrow">PRODFLOW / OPERATIONS</span><h1>Production flow</h1><Link to="/controls">Set balances, reconciliation, approvals & history →</Link><p>Pieces from cutting to dispatch, with quality, yield and vendor balances.</p></div><button onClick={load}>↻ Refresh</button></header>
    {error && <div className="executive-message executive-error" role="alert">{error}</div>}
    {data && <>
      {(TYPES[user.role] || []).length > 0 && <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">RECORD MOVEMENT</span><h2>New stage event</h2></div></div>
        <form className="flow-form" onSubmit={save}>
          <label>Event<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES[user.role].map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></label>
          {form.type === 'Yield_Standard' ? <><label>Article<datalist id="yield-article-names">{[...new Set(data.pos.map(p=>p.article_name).filter(Boolean))].map(a=><option key={a} value={a}/>)}</datalist><input list="yield-article-names" required value={form.article_name} onChange={e => setForm({ ...form, article_name: e.target.value })} /></label><label>Component<select value={form.component} onChange={e => setForm({ ...form, component: e.target.value })}>{['shirt', 'trouser', 'dupatta'].map(c => <option key={c}>{c}</option>)}</select></label><label>Standard metres / piece<input required type="number" min="0.0001" step="0.0001" value={form.meters_per_piece} onChange={e => setForm({ ...form, meters_per_piece: e.target.value })} /></label></> : <><label>PO<select required value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })}><option value="">Choose PO</option>{data.pos.map(p => <option key={p.po_number} value={p.po_number}>{p.po_number} · {p.article_name}</option>)}</select></label><label>Component<select value={form.component} onChange={e => setForm({ ...form, component: e.target.value })}>{['shirt', 'trouser', 'dupatta'].map(c => <option key={c}>{c}</option>)}</select></label><label>Quantity ({form.type.startsWith('Vendor_') ? 'metres' : 'pieces'})<input required type="number" min="0.01" step={form.type.startsWith('Vendor_') ? '0.01' : '1'} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
            {form.type === 'Cut' && <label>Cutting master<select required value={form.worker_code} onChange={e => setForm({ ...form, worker_code: e.target.value })}><option value="">Choose worker</option>{data.workers.map(w => <option key={w.stitcher_code} value={w.stitcher_code}>{w.stitcher_code} · {w.name}</option>)}</select></label>}
            {form.type === 'Cut' && <><label>Metres used by this master (optional)<input type="number" min="0.01" step="0.01" value={form.fabric_meters} onChange={e=>setForm({...form,fabric_meters:e.target.value})}/></label><label>Actual work date (optional)<input type="date" value={form.occurred_at} onChange={e=>setForm({...form,occurred_at:e.target.value})}/></label></>}
            {form.type.startsWith('Vendor_') && <><label>Process<select value={form.vendor_process} onChange={e => setForm({ ...form, vendor_process: e.target.value })}><option>Dyeing</option><option>Embroidery</option></select></label><label>Vendor<input required list="flow-vendors" value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} /><datalist id="flow-vendors"><option value="Yaseen" /><option value="Amna" /><option value="AM Embroidery" /></datalist></label></>}
            {form.type === 'Vendor_Return' && <label>Original issue<select required value={form.issue_id} onChange={e => { const issue = openIssues.find(i => i.id === e.target.value); setForm({ ...form, issue_id: e.target.value, vendor_name: issue?.vendor_name || form.vendor_name, vendor_process: issue?.vendor_process || form.vendor_process }); }}><option value="">Choose open issue</option>{openIssues.map(i => <option key={i.id} value={i.id}>{i.vendor_name} · {count(i.balance)} m open · {day(i.occurred_at)}</option>)}</select></label>}
          </>}
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record event'}</button>
        </form>{message && <p className="executive-note" role="status">{message}</p>}
      </section>}

      <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">01 / PIECE TRACKER</span><h2>Stage balances by PO</h2></div><select aria-label="Select purchase order" value={selected?.po_number || ''} onChange={e => setPoFilter(e.target.value)}>{data.pos.map(p => <option key={p.po_number} value={p.po_number}>{p.po_number} · {p.article_name}</option>)}</select></div>
        {selected && <><p className="executive-note">{selected.article_name || 'Article'} · Delivery {day(selected.delivery_date) || 'not set'} · Projected {currentPO?.projectedDate || 'insufficient completion history'} · {currentPO?.risk ? 'At risk' : 'Monitor'} · Finished requires acceptance of every finishing operation with a positive approved rate.</p><div className="executive-table-wrap"><table><thead><tr><th>Component</th><th>Ordered</th><th>Cut</th><th>Cut waiting</th><th>Stitch allocated / returned / accepted</th><th>Stitch open</th><th>Finishing open ops</th><th>Final accepted</th><th>QC packed</th><th>Waiting QC</th><th>Dispatched</th><th>Packed balance</th></tr></thead><tbody>{stageRows.map(r => <tr key={r.component}><td><b>{r.component}</b></td><td>{count(r.ordered)}</td><td>{r.cutTracked ? count(r.cut) : 'Untracked'}</td><td>{r.cutTracked ? count(r.cutWaiting) : '—'}</td><td>{count(r.stitchAllocated)} / {count(r.stitchReturned)} / {count(r.stitched)}</td><td>{count(r.stitchOpen)}</td><td>{count(r.finishOpen)}</td><td>{count(r.finished)}</td><td>{count(r.packed)}</td><td>{count(r.qcWaiting)}</td><td>{count(r.dispatched)}</td><td>{count(r.dispatchWaiting)}</td></tr>)}</tbody></table></div><p className="executive-note">Finishing open counts operation tasks and can include the same garment more than once. Earlier cutting, QC and dispatch history was not recorded, so blank history is marked untracked.</p></>}
      </section>

      <div className="executive-grid"><section className="executive-panel"><span className="executive-eyebrow">02 / AGING</span><h2>Open allocations</h2><p className="executive-note">Calculated from allocation date every time, including rows never updated. 14+ days is overdue.</p><div className="executive-table-wrap"><table><thead><tr><th>PO</th><th>Worker / operation</th><th>Open</th><th>Days</th></tr></thead><tbody>{aged.slice(0, 20).map(a => <tr key={a.id}><td>{a.po_number}</td><td>{a.stitcher_name}<small>{a.component}</small></td><td>{count(num(a.qty_allocated) - num(a.qty_returned))}</td><td className="executive-strong">{a.days}</td></tr>)}{!aged.length && <tr><td colSpan="4" className="executive-empty">No allocations older than 14 days remain open.</td></tr>}</tbody></table></div></section>
        <section className="executive-panel"><span className="executive-eyebrow">03 / FABRIC YIELD</span><h2>Metres per cut piece</h2><div className="executive-table-wrap"><table><thead><tr><th>PO / component</th><th>Issued m</th><th>Cut pcs</th><th>Actual m/pc</th><th>Standard</th><th>Wastage m / variance %</th><th>Cutting master</th></tr></thead><tbody>{data.pos.flatMap(po => ['shirt', 'trouser', 'dupatta'].filter(c => num(po[`${c}_qty`]) > 0).map(c => { const cuts = data.events.filter(e => e.po_number === po.po_number && e.component === c && e.event_type === 'Cut'); const pieces = cuts.reduce((sum, e) => sum + num(e.quantity), 0); const actual = pieces ? num(po[`${c}_meters_issued`]) / pieces : null; const std = data.standards.find(s => s.article_name === po.article_name && s.component === c); const masters = [...new Set(cuts.map(e => e.worker_code?.trim()).filter(Boolean))]; return <tr key={`${po.po_number}-${c}`}><td><b>{po.po_number}</b><small>{c}</small></td><td>{count(po[`${c}_meters_issued`])}</td><td>{pieces ? count(pieces) : '—'}</td><td>{actual === null ? '—' : actual.toFixed(2)}</td><td>{std ? num(std.meters_per_piece).toFixed(2) : '—'}</td><td>{actual !== null && std ? `${Math.max(0,num(po[`${c}_meters_issued`])-pieces*num(std.meters_per_piece)).toFixed(2)} m · ${((actual/num(std.meters_per_piece)-1)*100).toFixed(1)}% · ${actual > num(std.meters_per_piece) ? 'Above standard' : 'Within standard'}` : '—'}</td><td>{masters.length === 1 ? masters[0] : masters.length > 1 ? 'Shared fabric' : '—'}</td></tr>; }))}</tbody></table></div><p className="executive-note">Issued metres are PO-wide; yield by master is only attributable when one master cut that component. Positive variance indicates above-standard consumption.</p></section></div>

      <div className="executive-grid"><section className="executive-panel"><span className="executive-eyebrow">04 / QUALITY</span><h2>Worker & operation quality</h2><p className="executive-note">Low defect rates identify next-lot and incentive candidates; high rates need deduction review. No monetary adjustment is applied without an approved policy.</p><div className="executive-table-wrap"><table><thead><tr><th>Worker</th><th>Operation</th><th>Accepted</th><th>Reject %</th><th>Rework %</th><th>Signal</th></tr></thead><tbody>{quality.slice(0, 40).map(r => <tr key={`${r.code}-${r.operation}`}><td>{r.name}<small>{r.code}</small></td><td>{r.operation}</td><td>{count(r.accepted)}</td><td>{(r.rejected / r.returned * 100).toFixed(1)}%</td><td>{(r.rework / r.returned * 100).toFixed(1)}%</td><td>{r.returned >= 10 && (r.rejected + r.rework) / r.returned < .05 ? 'Incentive candidate' : (r.rejected + r.rework) / r.returned >= .1 ? 'Deduction review' : 'Monitor'}</td></tr>)}</tbody></table></div></section>
        <section className="executive-panel"><span className="executive-eyebrow">05 / PRODUCTIVITY</span><h2>Rate-weighted work per day</h2><p className="executive-note">100-PKR work units = Σ(pieces × locked payment rate) ÷ 100. Earnings use posted claim amounts.</p><div className="executive-table-wrap"><table><thead><tr><th>Date</th><th>Worker</th><th>Pieces</th><th>Work units</th><th>Earnings</th></tr></thead><tbody>{productivity.map(r => <tr key={`${r.code}-${r.date}`}><td>{r.date}</td><td>{r.name}</td><td>{count(r.pieces)}</td><td className="executive-strong">{count(r.weighted / 100)}</td><td>{money(r.earnings)}</td></tr>)}</tbody></table></div></section></div>

      <section className="executive-panel"><h2>Consumption by cutting master</h2><p>Enter metres against each Cut batch to attribute consumption. Missing batch metres remain unavailable rather than dividing shared PO fabric between masters.</p><div className="executive-table-wrap"><table><thead><tr><th>PO / garment</th><th>Master</th><th>Cut pieces</th><th>Attributed metres</th><th>Actual m/pc</th></tr></thead><tbody>{Object.values(data.events.filter(e=>e.event_type==='Cut').reduce((map,e)=>{const key=[e.po_number,e.component,e.worker_code].join('|');if(!map[key])map[key]={key,po:e.po_number,component:e.component,worker:e.worker_code,qty:0,meters:0,complete:true};const r=map[key];r.qty+=num(e.quantity);r.meters+=num(e.fabric_meters);if(e.fabric_meters===null || e.fabric_meters===undefined)r.complete=false;return map;},{})).map(r=><tr key={r.key}><td>{r.po} · {r.component}</td><td>{r.worker}</td><td>{count(r.qty)}</td><td>{count(r.meters)}</td><td>{r.complete && r.qty ? (r.meters/r.qty).toFixed(3):'Missing batch metres'}</td></tr>)}</tbody></table></div></section>
      <section className="executive-panel"><span className="executive-eyebrow">06 / VENDOR LOOP</span><h2>Fabric at dyeing & embroidery vendors</h2><div className="executive-table-wrap"><table><thead><tr><th>PO / component</th><th>Vendor</th><th>Process</th><th>Issued m</th><th>Received m</th><th>At vendor</th><th>Days open / turnaround</th></tr></thead><tbody>{vendorIssues.map(i => <tr key={i.id}><td>{i.po_number}<small>{i.component}</small></td><td>{i.vendor_name}</td><td>{i.vendor_process}</td><td>{count(i.quantity)}</td><td>{count(i.received)}</td><td className="executive-strong">{count(i.balance)}</td><td>{i.balance ? Math.floor((new Date() - new Date(i.occurred_at)) / 86400000) : i.turnaround}d</td></tr>)}{!vendorIssues.length && <tr><td colSpan="7" className="executive-empty">No vendor issues recorded yet.</td></tr>}</tbody></table></div></section>
      {user.role === 'Admin' && <section className="executive-panel"><span className="executive-eyebrow">07 / FINANCE SETUP</span><h2>Reconcile advance opening balance</h2><p className="executive-note">The new ledger starts {day(data.ledger?.activated_at)}. Historic advances and their recoveries cannot be inferred; enter each worker's outstanding balance as of this date. An opening balance locks after that worker's first recovery.</p><form className="flow-form" onSubmit={saveOpening}><label>Worker<select required value={openingForm.stitcher_code} onChange={e => setOpeningForm({ ...openingForm, stitcher_code: e.target.value })}><option value="">Choose worker</option>{data.workers.map(w => <option key={w.stitcher_code} value={w.stitcher_code}>{w.stitcher_code} · {w.name}</option>)}</select></label><label>Outstanding PKR<input required type="number" min="0" step="0.01" value={openingForm.balance} onChange={e => setOpeningForm({ ...openingForm, balance: e.target.value })} /></label><button type="submit">Save opening</button></form>{openingMessage && <p className="executive-note" role="status">{openingMessage}</p>}</section>}
    </>}
  </div></div>;
}
