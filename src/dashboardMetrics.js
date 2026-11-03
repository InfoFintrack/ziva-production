// Dashboard calculations use recorded units and accepted quantities only.
export const num = value => Number(value) || 0;
export const day = value => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : value ? String(value).slice(0, 10) : '';
export const money = value => `PKR ${num(value).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
export const count = value => num(value).toLocaleString('en-PK', { maximumFractionDigits: 1 });

export const department = payment => {
  if (payment.department === 'Cutting') return 'Cutting';
  if (String(payment.department || '').startsWith('Finishing') || String(payment.worker_type || '').startsWith('Finishing')) return 'Finishing';
  return 'Stitching';
};

export const inPeriod = (value, from, to) => {
  const date = day(value);
  return Boolean(date && (!from || date >= from) && (!to || date <= to));
};

export function poBoard(pos, allocations, payments, rates, today = new Date()) {
  const todayText = day(today);
  return pos.filter(po => po.status !== 'Cancelled').map(po => {
    const own = allocations.filter(a => a.po_number === po.po_number);
    const ownPayments = payments.filter(p => p.po_number === po.po_number);
    const components = ['shirt', 'trouser', 'dupatta'].filter(key => num(po[`${key}_qty`]) > 0);
    const ordered = components.reduce((sum, key) => sum + num(po[`${key}_qty`]), 0);
    const stitching = own.filter(a => a.module_type !== 'Finishing');
    const finishing = own.filter(a => a.module_type === 'Finishing');
    const cut = Math.min(ordered, stitching.reduce((sum, a) => sum + num(a.qty_allocated), 0));
    const stitched = Math.min(ordered, stitching.reduce((sum, a) => sum + num(a.qty_accepted), 0));
    // Finishing allocations are per operation; counting every accepted return
    // would count the same garment several times. Use only the last listed
    // operation for each component as a conservative completion proxy.
    const terminal = { shirt: 'pressing', trouser: 'patching', dupatta: 'patching' };
    const finished = Math.min(ordered, finishing.filter(a => components.some(key =>
      String(a.component || '').toLowerCase() === `${key} ${terminal[key]}`
    )).reduce((sum, a) => sum + num(a.qty_accepted), 0));
    const rejected = own.reduce((sum, a) => sum + num(a.qty_rejected), 0);
    const delivery = day(po.delivery_date);
    const daysLeft = delivery ? Math.ceil((new Date(`${delivery}T00:00:00Z`) - new Date(`${todayText}T00:00:00Z`)) / 86400000) : null;
    const complete = ordered ? Math.min(100, Math.round(finished / ordered * 100)) : 0;
    const expected = po.po_date && delivery && delivery > day(po.po_date)
      ? Math.max(0, Math.min(100, Math.round((today - new Date(po.po_date)) / (new Date(delivery) - new Date(po.po_date)) * 100)))
      : null;
    const risk = po.status !== 'Completed' && daysLeft !== null && ((daysLeft <= 0 && complete < 100) || (expected !== null && complete + 10 < expected));
    const approved = rates.find(rate => rate.po_number === po.po_number && rate.status === 'Approved');
    const actual = ownPayments.reduce((sum, p) => sum + num(p.amount), 0);
    const mappedRates = {
      shirt: ['cutting', 'shirt', 'fs_clipping', 'fs_heming', 'fs_tussling', 'fs_pressing'],
      trouser: ['cutting', 'trouser', 'ft_clipping', 'ft_heming', 'ft_pressing', 'ft_patching'],
      dupatta: ['cutting', 'dupatta', 'fd_heming', 'fd_tussling', 'fd_pressing', 'fd_patching'],
    };
    const approvedPerPiece = approved && ordered ? components.reduce((total, key) =>
      total + num(po[`${key}_qty`]) * mappedRates[key].reduce((rateTotal, field) => rateTotal + num(approved[field]), 0), 0) / ordered : null;
    return { ...po, ordered, cut, stitched, finished, rejected, daysLeft, complete, risk,
      unallocated: Math.max(0, ordered - cut), sewingBalance: Math.max(0, cut - stitched),
      finishingBalance: Math.max(0, stitched - finished), actual,
      actualPerPiece: finished && ownPayments.length ? actual / finished : null,
      approvedRate: approvedPerPiece };
  });
}

export function weeklyTrend(payments, weeks = 8, today = new Date()) {
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  const rows = Array.from({ length: weeks }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index * 7);
    return { week: date.toISOString().slice(0, 10), Stitching: 0, Cutting: 0, Finishing: 0 };
  });
  payments.forEach(payment => {
    const date = day(payment.entry_date);
    if (!date || date < rows[0].week) return;
    const offset = Math.floor((new Date(`${date}T00:00:00Z`) - start) / 604800000);
    if (rows[offset]) rows[offset][department(payment)] += num(payment.amount);
  });
  return rows;
}

export function exceptions(allocations, payments, rates, today = new Date(), audit = []) {
  const issues = [];
  allocations.forEach(a => {
    const age = a.allocation_date ? Math.floor((today - new Date(a.allocation_date)) / 86400000) : 0;
    if (num(a.qty_rejected) > 0 && num(a.qty_returned) > 0 && num(a.qty_rejected) / num(a.qty_returned) >= 0.1)
      issues.push({ severity: 'Quality', text: `${a.po_number} · ${a.stitcher_name || a.stitcher_code}: ${count(a.qty_rejected)} rejected (${Math.round(num(a.qty_rejected) / num(a.qty_returned) * 100)}%)` });
    if (num(a.qty_allocated) > num(a.qty_returned) && age > 14)
      issues.push({ severity: 'Overdue', text: `${a.po_number} · ${a.stitcher_name || a.stitcher_code}: ${count(num(a.qty_allocated) - num(a.qty_returned))} pieces outstanding for ${age} days` });
  });
  const claims = new Map();
  payments.filter(p => department(p) !== 'Cutting').forEach(p => {
    const component = department(p) === 'Finishing' ? `${p.component} ${p.operation}` : p.component;
    const key = [p.po_number, String(p.stitcher_code).trim(), String(component).toLowerCase()].join('|');
    if (!claims.has(key)) claims.set(key, { ...p, component, claimed: 0 });
    claims.get(key).claimed += num(p.qty_claimed);
  });
  claims.forEach(p => {
    const accepted = allocations.filter(a => a.po_number === p.po_number && String(a.stitcher_code).trim() === String(p.stitcher_code).trim() && String(a.component).toLowerCase() === String(p.component).toLowerCase()).reduce((sum, a) => sum + num(a.qty_accepted), 0);
    if (p.claimed > accepted)
      issues.push({ severity: 'Claim', text: `${p.po_number} · ${p.stitcher_name}: ${count(p.claimed)} claimed for ${p.component}, ${count(accepted)} accepted` });
  });
  rates.filter(r => r.status === 'Approved' && (!r.approved_by_ceo || !r.ceo_approved_at || r.ceo_signoff_valid === false)).forEach(r =>
    issues.push({ severity: 'Approval', text: `${r.po_number}: approved rate has no recorded CEO sign-off` }));
  audit.filter(change => change.entity === 'cmt_payments' && change.status_at_change === 'Paid' && ['qty_claimed', 'po_number', 'amount', 'rate'].includes(change.field)).forEach(change =>
    issues.push({ severity: 'Post-pay edit', text: `Payment ${change.record_id}: ${change.field} changed by ${change.actor} after payment` }));
  return issues;
}

export function payrollPack(payments, advances, week) {
  const workers = new Map();
  const get = (code, name) => {
    const key = String(code || name || 'Unknown').trim();
    if (!workers.has(key)) workers.set(key, { code: key, name: name || key, gross: 0, advances: 0, paid: 0, unpaid: 0 });
    return workers.get(key);
  };
  payments.filter(p => day(p.week_ending) === week).forEach(p => {
    const row = get(p.stitcher_code, p.stitcher_name);
    row.gross += num(p.amount);
    row[p.payment_status === 'Paid' ? 'paid' : 'unpaid'] += num(p.amount);
  });
  advances.filter(a => day(a.week_ending) === week).forEach(a => { get(a.stitcher_code, a.stitcher_name).advances += num(a.amount); });
  return [...workers.values()].map(row => ({ ...row, net: row.gross - row.advances })).sort((a, b) => a.name.localeCompare(b.name));
}
