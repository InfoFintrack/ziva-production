const n = value => Number(value) || 0;
const norm = value => String(value || '').trim().toLowerCase();
export const GARMENTS = ['shirt','trouser','dupatta'];
export function finishedForGarment(po,garment,allocations,rates) {
 const rate=rates.filter(r=>r.po_number===po && r.status==='Approved' && r.in_app_approved!==false).sort((a,b)=>n(b.version)-n(a.version))[0];
 if(!rate)return 0;
 const sum=(component,module)=>allocations.filter(a=>a.po_number===po && norm(a.component)===component && (a.module_type || 'Stitching')===module).reduce((s,a)=>s+n(a.qty_accepted),0);
 const prefix={shirt:'fs_',trouser:'ft_',dupatta:'fd_'}[garment];
 const ops=Object.keys(rate).filter(k=>k.startsWith(prefix) && n(rate[k])>0);
 return Math.min(sum(garment,'Stitching'),...ops.map(k=>sum(`${garment} ${k.slice(3)}`,'Finishing')));
}
export function mismatchedStages(balances) {
 const own=balances.filter(b=>b.ordered>0);
 return ['cut','stitched','finished','packed','dispatched','paid'].filter(stage=>own.some(b=>b[stage]*own[0].ordered!==own[0][stage]*b.ordered));
}
export function setBalance(po, events, allocations, payments, rates = []) {
  return GARMENTS.map(garment => {
    const own = allocations.filter(a=>a.po_number===po.po_number);
    const total = (type) => events.filter(e=>e.po_number===po.po_number && e.component===garment && e.event_type===type).reduce((s,e)=>s+n(e.quantity),0);
    const accepted = (component,module) => own.filter(a=>norm(a.component)===component && (a.module_type || 'Stitching')===module).reduce((s,a)=>s+n(a.qty_accepted),0);
    const operations = new Map();
    payments.filter(p=>p.po_number===po.po_number && norm(p.component).split(',').some(c=>c.trim().split(' ')[0]===garment)).forEach(p=>{
      const key=`${p.department} / ${p.operation}`;
      if(!operations.has(key)) operations.set(key,{name:key,claimed:0,paid:0});
      const row=operations.get(key);row.claimed+=n(p.qty_claimed);if(p.payment_status==='Paid') row.paid+=n(p.qty_claimed);
    });
    const cut=total('Cut'), stitched=accepted(garment,'Stitching'), finished=finishedForGarment(po.po_number,garment,allocations,rates);
    const packed=total('QC_Packed'),dispatched=total('Dispatched');
    const ops=[...operations.values()];
    const paid=Math.max(0,...ops.map(o=>o.paid));
    const issues=[];
    if(n(po[`${garment}_qty`])>0 && payments.some(p=>p.po_number===po.po_number && !GARMENTS.some(g=>norm(p.component).split(',').some(c=>c.trim().split(' ')[0]===g)))) issues.push('Unassigned historical payment garment needs review');
    if(cut>n(po[`${garment}_qty`])) issues.push('Cuts exceed PO');
    if([stitched,finished,packed,dispatched,paid,...ops.map(o=>o.claimed)].some(q=>q>cut)) issues.push('Output or claims exceed cuts');
    if(packed>finished) issues.push('Packed exceeds finishing');
    if(dispatched>packed) issues.push('Dispatch exceeds packed');
    if(!cut && (own.some(a=>norm(a.component).startsWith(garment)) || ops.length)) issues.push('Record verified historical cuts');
    return {garment,ordered:n(po[`${garment}_qty`]),cut,stitched,finished,packed,dispatched,paid,operations:ops,issues};
  });
}
export function payrollHtml(run) {
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!['Approved','Paid'].includes(run.status)) throw new Error('Only CEO-approved payroll may be downloaded for payout.');
  const rows=run.snapshot.workers.map(w=>`<tr><td>${escape(w.code)}</td><td>${escape(w.name)}</td><td>${Number(w.gross).toFixed(2)}</td><td>${Number(w.recovery).toFixed(2)}</td><td>${Number(w.net).toFixed(2)}</td><td></td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Approved payroll ${escape(run.week_ending)}</title><style>body{font:14px Arial;margin:32px;color:#17243b}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #ccc;text-align:right}td:nth-child(-n+2){text-align:left}th{background:#17243b;color:white}@media print{button{display:none}}</style></head><body><h1>ProdFlow · CEO-approved payroll</h1><p>Week ending ${escape(String(run.week_ending).slice(0,10))} · ${escape(run.status)}</p><p>Approved by ${escape(run.approved_by)} at ${escape(run.approved_at)} · Payout reference ${escape(run.payout_reference || 'not paid yet')}</p><table><thead><tr><th>Code</th><th>Worker</th><th>Gross PKR</th><th>Advance recovered</th><th>Cash payable PKR</th><th>Worker signature</th></tr></thead><tbody>${rows}</tbody></table><h2>Total cash payable: PKR ${Number(run.snapshot.net).toFixed(2)}</h2><p>Advance balances are reserved from submission until rejection or payout. This sheet is the approved snapshot; use its week and payout reference to avoid duplicate disbursement.</p><button onclick="window.print()">Print / Save as PDF</button></body></html>`;
}
