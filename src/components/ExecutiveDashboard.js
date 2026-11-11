import React, { useEffect, useMemo, useState } from 'react';
import { getPOs, getAllocations, getPaymentEntries, getCMTRates, getAdvanceLedger, getFinancialAudit, getProductionFlow } from '../api';
import { advanceLedger, count, day, exceptions, inPeriod, money, num, payrollPack, poBoard, weeklyTrend } from '../dashboardMetrics';
import './ExecutiveDashboard.css';
import WorkspaceShell,{WorkspacePane,matchesSearch} from './WorkspaceShell';

const today = () => day(new Date());
const firstOfMonth = () => `${today().slice(0, 7)}-01`;
const previousMonthEnd = () => day(new Date(new Date().getFullYear(), new Date().getMonth(), 0));
const upcomingSaturday = () => { const date = new Date(); date.setDate(date.getDate() + (6 - date.getDay() + 7) % 7); return day(date); };
const sum = (rows, field) => rows.reduce((total, row) => total + num(row[field]), 0);
const auditValue = value => value === null || value === undefined ? '—' : typeof value === 'object' ? 'New record' : String(value);

function exportCsv(filename, headers, rows) {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExecutiveDashboard({ finance = false, extraPanes, extraSearchItems = [], onWorkspaceSearch, externalNotice, user, onLogout }) {
  const [workspaceQuery,setWorkspaceQuery]=useState('');
  const changeWorkspaceQuery=value=>{setWorkspaceQuery(value);if(!value)setSearch('');onWorkspaceSearch?.(value);};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState([]);
  const [auditError, setAuditError] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [week, setWeek] = useState(upcomingSaturday());
  const [closeDate, setCloseDate] = useState(previousMonthEnd());
  const [search, setSearch] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all([getPOs(), getAllocations(), getPaymentEntries(), getCMTRates('?history=true'), getProductionFlow(), ...(finance ? [getAdvanceLedger()] : [])]);
      const failed = results.find(result => !result?.success);
      if (failed) throw new Error(failed.message || 'One or more data sources are unavailable.');
      setData({ pos: results[0].pos || [], allocations: results[1].allocations || [], payments: results[2].payments || [], rates: results[3].rates || [], events: results[4].events || [], advances: finance ? results[5].advances || [] : [], ledger: finance ? results[5] : null });
      try {
        const auditResult = await getFinancialAudit();
        if (!auditResult.success) throw new Error(auditResult.message || 'Audit history unavailable.');
        setAudit(auditResult.changes || []);
        setAuditError('');
      } catch (auditFailure) { setAudit([]); setAuditError(auditFailure.message || 'Audit history unavailable.'); }
    } catch (err) { setData(null); setError(err.message || 'Dashboard could not be loaded.'); }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(() => data ? poBoard(data.pos, data.allocations, data.payments, data.rates,new Date(),data.events) : [], [data]);
  const periodPayments = useMemo(() => data ? data.payments.filter(p => inPeriod(p.entry_date, from, to)) : [], [data, from, to]);
  const visibleBoard = board.filter(po => matchesSearch(workspaceQuery,po.po_number,po.article_name,po.collection_name) && `${po.po_number} ${po.article_name || ''} ${po.collection_name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const workspaceSearchItems=[...board.map(po=>({id:'po:'+po.po_number,pane:'orders',label:po.po_number,detail:po.article_name || 'Purchase order',keywords:po.collection_name,onSelect:()=>setSearch(po.po_number)})),...(finance ? advanceLedger(data?.ledger,data?.payments || []).map(w=>({id:'advance:'+w.code,pane:'advances',label:w.code+' · '+w.name,detail:'Worker advance ledger'})) : []),...(finance && data ? [...new Set(data.payments.map(p=>day(p.week_ending)).filter(Boolean))].map(w=>({id:'week:'+w,pane:'reconciliation',label:w,detail:'Weekly reconciliation',onSelect:()=>setWeek(w)})) : [])];
  const trend = data ? weeklyTrend(data.payments) : [];
  const issues = data ? exceptions(data.allocations, data.payments, data.rates, new Date(), audit).filter(issue=>matchesSearch(workspaceQuery,issue)) : [];
  const pack = data ? payrollPack(data.payments, data.advances, week, data.ledger?.recoveries || []) : [];
  const balances = data ? advanceLedger(data.ledger, data.payments) : [];
  const historicWeek = Boolean(data?.ledger?.activated_at && week < day(data.ledger.activated_at));
  const maxTrend = Math.max(1, ...trend.map(row => row.Stitching + row.Cutting + row.Finishing));
  const fabricMeters = data ? data.pos.reduce((total, po) => total + ['shirt', 'trouser', 'dupatta'].reduce((meters, key) => meters + num(po[`${key}_meters_issued`]), 0), 0) : 0;
  const verifiedUnpaid = data ? data.payments.filter(p => day(p.verified_at) && day(p.verified_at) <= closeDate && (!day(p.payment_date) || day(p.payment_date) > closeDate)).reduce((total, p) => total + num(p.amount), 0) : 0;

  return <WorkspaceShell title={finance ? 'Finance' : 'CEO dashboard'} user={user} embedded={finance} query={workspaceQuery} onQueryChange={changeWorkspaceQuery}
    searchItems={[...workspaceSearchItems,...issues.map((issue,index)=>({id:'issue:'+index,pane:'exceptions',label:issue.severity,detail:issue.text})),...extraSearchItems]} links={[{href:'/controls#payroll',label:'Payroll & approvals'},{href:'/controls#balances',label:'PO set balances'},{href:'/flow',label:'Production flow'}]}
    actions={<><button type="button" onClick={reload} disabled={loading}>↻ Refresh</button>{onLogout && <button className="btn-danger" type="button" onClick={onLogout}>Logout</button>}</>}
    toolbar={active=>active==='overview' ? <div className="executive-toolbar">
      <label>From <input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label>To <input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <span>Cost uses selected entry dates; trend shows the latest 8 weeks. Production progress is current.</span>
    </div> : null} notices={<>{loading && <p className="executive-message">Loading operational data…</p>}{error && <div role="alert" className="executive-message executive-error">{error} <button onClick={reload}>Retry</button></div>}{externalNotice}</>}
  >
  <WorkspacePane id="overview" label="Overview" title={finance ? 'Finance overview' : 'Production pulse'} description="A compact view of production, labour spend and the items that need attention.">
    {data && !loading && <><div className="executive-kpis">
        <div className="executive-kpi"><small>ACTIVE PURCHASE ORDERS</small><strong>{count(board.filter(po => po.status === 'Active').length)}</strong><span>in production</span></div>
        <div className="executive-kpi"><small>FABRIC ISSUED</small><strong>{count(fabricMeters)} <em>m</em></strong><span>recorded PO component metres</span></div>
        <div className="executive-kpi"><small>FINISHING ACCEPTED</small><strong>{count(sum(board, 'finished'))} <em>pcs</em></strong><span>rejected pieces excluded</span></div>
        <div className="executive-kpi executive-kpi-accent"><small>LABOUR COST · PERIOD</small><strong>{money(sum(periodPayments, 'amount'))}</strong><span>{from} → {to}</span></div>
      </div><div className="executive-grid">
        <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">{finance ? '02' : '01'} / LABOUR SPEND</span><h2>Weekly cost trend</h2></div><span>Last 8 weeks</span></div>
          <div className="executive-legend"><span>● Stitching</span><span>● Cutting</span><span>● Finishing</span></div>
          <div className="executive-chart">{trend.map(row => <div className="executive-bar-group" key={row.week} title={`${row.week}: ${money(row.Stitching + row.Cutting + row.Finishing)}`}><div className="executive-bar" style={{ height: `${Math.max(3, (row.Stitching + row.Cutting + row.Finishing) / maxTrend * 145)}px` }}><i style={{ flex: row.Stitching, background: '#738bff' }} /><i style={{ flex: row.Cutting, background: '#57d2bb' }} /><i style={{ flex: row.Finishing, background: '#f5b45a' }} /></div><small>{row.week.slice(5)}</small></div>)}</div>
          <p className="executive-note">Entry-date cost, including pending and paid claims. Hover a bar for its total.</p>
        </section>
        <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">{finance ? '03' : '02'} / EXCEPTIONS</span><h2>Needs attention <sup>{issues.length}</sup></h2></div></div>
          <div className="executive-issues">{issues.slice(0, 10).map((issue, index) => <div key={`${issue.text}-${index}`}><b>{issue.severity}</b><span>{issue.text}</span></div>)}{!issues.length && <p className="executive-empty">No exceptions found in the available records.</p>}</div>
          <p className="executive-note">Quality outlier ≥10% rejected; allocation overdue after 14 days. Post-pay edits appear once the financial audit migration is applied. {auditError && `Audit: ${auditError}`}</p>
        </section>
      </div></>}
  </WorkspacePane>
  <WorkspacePane id="exceptions" label="Exceptions" badge={issues.length} description="Search overdue work, claims above accepted pieces, quality outliers and recorded changes.">
    {data && !loading && <section className="executive-panel"><h2>Exceptions</h2><div className="executive-issues">{issues.map((issue,index)=><div key={index}><b>{issue.severity}</b><span>{issue.text}</span></div>)}{!issues.length && <p className="executive-empty">No matching exceptions.</p>}</div><p className="executive-note">Open Controls & payroll for the full change history and reconciliation actions.</p></section>}
  </WorkspacePane>
  <WorkspacePane id="orders" label="Purchase orders" description="Find an order or article and check its progress, balances and delivery risk.">
    {data && !loading && <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">{finance ? '04' : '03'} / PO PIPELINE</span><h2>Order status board</h2></div><input className="executive-search" placeholder="Search PO or article" aria-label="Search PO or article" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <p className="executive-note">Balances use accepted pieces; repeated allocations can still overlap. Completion requires accepted output at every positively rated finishing operation; cutting uses recorded Cut events. “At risk” means over 10 points behind elapsed delivery schedule, or due without completion.</p>
        <div className="executive-table-wrap"><table><thead><tr><th>PO / article</th><th>Ordered</th><th>To stitch</th><th>In stitching</th><th>In finishing</th><th>Final op</th><th>Complete</th><th>Delivery</th><th>Health</th></tr></thead><tbody>{visibleBoard.map(po => <tr key={po.po_number}><td><b>{po.po_number}</b><small>{po.article_name || 'Article unspecified'}</small></td><td>{count(po.ordered)}</td><td>{count(po.unallocated)}</td><td>{count(po.sewingBalance)}</td><td>{count(po.finishingBalance)}</td><td className="executive-strong">{count(po.finished)}</td><td><div className="executive-progress"><i style={{ width: `${po.complete}%` }} /></div><small>{po.complete}%</small></td><td>{po.daysLeft === null ? '—' : `${po.daysLeft}d`}</td><td><span className={`executive-pill ${po.risk ? 'risk' : 'okay'}`}>{po.risk ? 'At risk' : po.status === 'Completed' ? 'Completed' : po.daysLeft === null ? 'No date' : 'On track'}</span></td></tr>)}{!visibleBoard.length && <tr><td colSpan="9" className="executive-empty">No matching orders.</td></tr>}</tbody></table></div>
      </section>}
  </WorkspacePane>
  <WorkspacePane id="costing" label="Labour costing" description="Compare actual labour cost with the approved rate by PO and article.">
    {data && !loading && <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">{finance ? '05' : '04'} / COSTING</span><h2>Actual labour vs approved rate</h2></div><button onClick={() => exportCsv('prodflow-odoo-labour-cost.csv', ['PO', 'Article', 'Final-operation accepted pieces', 'Completion percent', 'Actual labour PKR', 'Actual labour per accepted piece PKR', 'Approved mapped rate per piece PKR'], board.map(po => [po.po_number, po.article_name, po.finished, po.complete, po.actual, po.actualPerPiece ?? '', po.approvedRate ?? '']))}>Export for Odoo</button></div>
        <p className="executive-note">Approved rate is a quantity-weighted per-piece sum of cutting, component stitching and finishing operations. Patching and quality/packing have no reliable component allocation and are excluded. Actual = all posted labour claims ÷ final-operation accepted pieces; variance appears only at 100% completion. Export is for review before updating Odoo.</p>
        <div className="executive-table-wrap"><table><thead><tr><th>PO / article</th><th>Final op pcs</th><th>Actual spend</th><th>Actual / pc</th><th>Approved mapped / pc</th><th>Variance / pc</th></tr></thead><tbody>{board.filter(po=>matchesSearch(workspaceQuery,po.po_number,po.article_name)).map(po => <tr key={po.po_number}><td><b>{po.po_number}</b><small>{po.article_name || '—'}</small></td><td>{count(po.finished)}</td><td>{money(po.actual)}</td><td>{po.actualPerPiece === null ? '—' : money(po.actualPerPiece)}</td><td>{po.approvedRate === null ? '—' : money(po.approvedRate)}</td><td>{po.complete < 100 || po.actualPerPiece === null || po.approvedRate === null ? '—' : money(po.actualPerPiece - po.approvedRate)}</td></tr>)}</tbody></table></div>
      </section>}
  </WorkspacePane>
  {finance && <WorkspacePane id="reconciliation" label="Weekly reconciliation" description="Review gross, advance recoveries and cash paid. Use Controls & payroll for CEO-approved payout sheets.">{data && !loading && <section className="executive-panel">
        <div className="executive-heading"><div><span className="executive-eyebrow">01 / WEEKLY PAYROLL</span><h2>Weekly reconciliation</h2></div><div className="executive-actions"><input aria-label="Week ending" type="date" value={week} onChange={event => setWeek(event.target.value)} /><button onClick={() => exportCsv(`payroll-${week}.csv`, ['Worker code', 'Worker', 'Gross PKR', 'Advances given PKR', 'Recovered PKR', 'Net cash paid PKR', 'Unpaid gross PKR'], pack.map(p => [p.code, p.name, p.gross, p.advances, p.recovered, historicWeek ? '' : p.net, p.unpaid]))}>Export reconciliation CSV</button></div></div>
        <p className="executive-note">Net cash paid = paid gross less recorded recoveries. Advances given are a separate cash outflow. {historicWeek ? 'This week predates the recovery ledger, so net cash paid is unavailable.' : 'Historic opening balances need reconciliation before the ledger is authoritative.'}</p>
        <div className="executive-table-wrap"><table><thead><tr><th>Worker</th><th>Gross</th><th>Advances given</th><th>Recovered</th><th>Net cash paid</th><th>Unpaid gross</th></tr></thead><tbody>{pack.filter(p=>matchesSearch(workspaceQuery,p,week)).map(p => <tr key={p.code}><td><b>{p.name}</b><small>{p.code}</small></td><td>{money(p.gross)}</td><td>{money(p.advances)}</td><td>{money(p.recovered)}</td><td className="executive-strong">{historicWeek ? '—' : money(p.net)}</td><td>{money(p.unpaid)}</td></tr>)}{!pack.length && <tr><td colSpan="6" className="executive-empty">No entries for this week.</td></tr>}</tbody></table></div>
      </section>}</WorkspacePane>}
  {finance && <WorkspacePane id="close" label="Month-end close" description="Review verified unpaid labour and the available stage balances.">{data && !loading && <div className="executive-grid"><section className="executive-panel"><span className="executive-eyebrow">06 / MONTH-END CLOSE</span><h2>Verified, unpaid at close</h2><div className="executive-actions" style={{ marginTop: 16 }}><label className="executive-note">Close date <input type="date" value={closeDate} onChange={event => setCloseDate(event.target.value)} /></label></div><div className="executive-feature-value">{money(verifiedUnpaid)}</div><p className="executive-note">Verified by {closeDate} and paid later or still unpaid. Unclaimed work is excluded because the system has no dated operation-level work snapshot.</p></section><section className="executive-panel"><span className="executive-eyebrow">07 / WORK IN PROCESS</span><h2>Stage balance</h2><div className="executive-feature-value">{count(sum(board, 'sewingBalance') + sum(board, 'finishingBalance'))} pcs</div><p className="executive-note">Current accepted-piece balances. Fabric unit cost and dated stage snapshots are needed before a defensible month-end WIP value can be shown.</p></section></div>}</WorkspacePane>}
  {finance && <WorkspacePane id="advances" label="Worker advances" description="Opening balances, advances given, recoveries and what remains outstanding.">{data && !loading && <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">08 / ADVANCES</span><h2>Worker advance ledger</h2></div><span>From {day(data.ledger?.activated_at)}</span></div><p className="executive-note">Opening balances must be reconciled for existing workers. New advances and payment recoveries carry forward automatically.</p><div className="executive-table-wrap"><table><thead><tr><th>Worker</th><th>Opening</th><th>Given</th><th>Recovered</th><th>Closing</th></tr></thead><tbody>{balances.filter(r=>matchesSearch(workspaceQuery,r)).map(r => <tr key={r.code}><td><b>{r.name}</b><small>{r.code}</small></td><td>{money(r.opening)}</td><td>{money(r.given)}</td><td>{money(r.recovered)}</td><td className="executive-strong">{r.unreconciled ? 'Reconcile opening' : money(r.closing)}</td></tr>)}{!balances.length && <tr><td colSpan="5" className="executive-empty">No advance balances recorded.</td></tr>}</tbody></table></div></section>}</WorkspacePane>}
  {finance && <WorkspacePane id="history" label="Change history" description="Search the recent rate and payment changes recorded by ProdFlow.">{data && !loading && <section className="executive-panel"><div className="executive-heading"><div><span className="executive-eyebrow">08 / CONTROL LOG</span><h2>Rate & payment changes</h2></div><span>Latest 200 changes</span></div>
        {auditError ? <p className="executive-note">{auditError}</p> : <><p className="executive-note">Every new change records the actor, time and old → new value after the database migration. Historic changes cannot be reconstructed.</p><div className="executive-table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Record</th><th>Field</th><th>Old</th><th>New</th></tr></thead><tbody>{audit.filter(change=>matchesSearch(workspaceQuery,change)).map(change => <tr key={change.id}><td>{new Date(change.changed_at).toLocaleString('en-PK')}</td><td>{change.actor}</td><td><b>{change.entity === 'cmt_rates' ? 'Rate' : 'Payment'}</b><small>{change.record_id}</small></td><td>{change.field}</td><td>{auditValue(change.old_value)}</td><td>{auditValue(change.new_value)}</td></tr>)}{!audit.length && <tr><td colSpan="6" className="executive-empty">No audited changes yet.</td></tr>}</tbody></table></div></>}
      </section>}</WorkspacePane>}
  {extraPanes}
</WorkspaceShell>;
}
