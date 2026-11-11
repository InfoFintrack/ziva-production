const { ClaimError, validateClaim } = require('./claimPolicy');
async function buildPayroll(client, week) {
  const { rows: entries } = await client.query("SELECT * FROM cmt_payments WHERE week_ending=$1 AND payment_status<>'Paid' ORDER BY po_number,id FOR UPDATE", [week]);
  if (!entries.length) throw new ClaimError('No unpaid claims in this week.');
  if (entries.some(p => p.payment_status !== 'Verified')) throw new ClaimError('Verify every unpaid claim in this week before submitting payroll to the CEO.');
  const codes = [...new Set(entries.map(p => String(p.stitcher_code).trim()))].sort();
  const workers = [];
  for (const code of codes) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`advance:${code}`]);
    const held = await client.query(`SELECT week_ending FROM payroll_runs WHERE status IN ('Pending_CEO','Approved') AND EXISTS
      (SELECT 1 FROM jsonb_array_elements(snapshot->'workers') w WHERE w->>'code'=$1)`, [code]);
    if (held.rows.length) throw new ClaimError(`Worker ${code} is already reserved by another submitted payroll. Complete or reject that run first.`);
    const { rows } = await client.query(`SELECT
      (SELECT COUNT(*) FROM advances a CROSS JOIN advance_ledger_epoch e WHERE e.id=1 AND a.stitcher_code=$1 AND a.created_at<e.activated_at) old_advances,
      (SELECT COUNT(*) FROM advance_opening WHERE stitcher_code=$1) reconciled,
      COALESCE((SELECT balance FROM advance_opening WHERE stitcher_code=$1),0)
      +COALESCE((SELECT SUM(a.amount) FROM advances a CROSS JOIN advance_ledger_epoch e WHERE e.id=1 AND a.stitcher_code=$1 AND a.created_at>=e.activated_at),0)
      -COALESCE((SELECT SUM(amount) FROM advance_recoveries WHERE stitcher_code=$1),0) balance`, [code]);
    if (Number(rows[0].old_advances)>0 && Number(rows[0].reconciled)===0) throw new ClaimError(`Reconcile opening advances for worker ${code} in Production flow before submitting payroll.`);
    const own = entries.filter(p => String(p.stitcher_code).trim() === code);
    const gross = Number(own.reduce((s,p)=>s+Number(p.amount),0).toFixed(2));
    const advance = Math.max(0,Number(Number(rows[0].balance).toFixed(2)));
    const recovery = Math.min(gross,advance);
    workers.push({ code, name: own[0].stitcher_name, gross, advance, recovery, net: Number((gross-recovery).toFixed(2)) });
  }
  for (const p of entries) await validateClaim(client,p,p.id);
  return { entries, workers, gross: Number(workers.reduce((s,w)=>s+w.gross,0).toFixed(2)), net: Number(workers.reduce((s,w)=>s+w.net,0).toFixed(2)) };
}
module.exports = { buildPayroll };
