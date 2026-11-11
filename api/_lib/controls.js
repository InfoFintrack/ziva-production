const { withAuditedTransaction } = require('./auditedQuery');
const { ClaimError, validateClaim } = require('./claimPolicy');
const { buildPayroll } = require('./payrollSnapshot');

async function requireControls(pool) {
  try { await pool.query('SELECT id FROM production_control_version WHERE id=1'); }
  catch (error) { if (error.code === '42P01') throw new ClaimError('Production controls need database setup: run db/production_controls.sql in Supabase SQL Editor.'); throw error; }
}
const controlTransaction = (pool, user, work) => withAuditedTransaction(pool, user.name, async client => {
  await client.query("SELECT set_config('app.actor_role',$1,true)", [user.role]);
  return work(client);
});
const quantities = values => Object.fromEntries(['shirt','trouser','dupatta'].map(g => {
  const n = Number(values[`${g}_qty`] || 0);
  if (!Number.isInteger(n) || n < 0) throw new ClaimError('Quantities must be nonnegative whole pieces.');
  return [`${g}_qty`, n];
}));

async function handleControls(pool, user, req) {
  await requireControls(pool);
  if (req.method === 'GET') {
    const finance = ['CEO','Accounts','Admin'].includes(user.role);
    const [requests, payroll, links, legacy] = await Promise.all([
      pool.query('SELECT * FROM po_quantity_requests ORDER BY requested_at DESC LIMIT 200'),
      finance ? pool.query('SELECT * FROM payroll_runs ORDER BY week_ending DESC LIMIT 100') : { rows: [] },
      pool.query('SELECT * FROM patching_links'),
      finance ? pool.query("SELECT p.* FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.department='Stitching' AND lower(trim(p.component))='patching' AND l.payment_id IS NULL") : {rows:[]},
    ]);
    return { success: true, requests: requests.rows, payroll: payroll.rows, patchingLinks: links.rows, legacyPatching: legacy.rows };
  }
  const { action, po_number, reason, id, week_ending, note, payout_reference } = req.body;
  return controlTransaction(pool, user, async client => {
    if (action === 'link_patching') {
      if (!['Admin','CEO'].includes(user.role) || !String(reason || '').trim()) throw new ClaimError('Admin or CEO must provide the verified garment and a reason.');
      await client.query('INSERT INTO patching_links(payment_id,garment,reason,linked_by) VALUES($1,$2,$3,$4)',[id,req.body.garment,reason.trim(),user.name]);
    } else if (action === 'request_quantities') {
      if (!['PP','Admin'].includes(user.role)) throw new ClaimError('PP or Admin must request quantity changes.');
      if (!String(reason || '').trim()) throw new ClaimError('Explain why the quantities need changing.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${po_number}`]);
      const { rows } = await client.query('SELECT * FROM po_master WHERE po_number=$1 FOR UPDATE', [po_number]);
      if (!rows.length) throw new ClaimError('PO not found.');
      await client.query(`INSERT INTO po_quantity_requests(po_number,before_values,proposed_values,reason,requested_by)
        VALUES($1,$2,$3,$4,$5)`, [po_number, quantities(rows[0]), quantities(req.body), reason.trim(), user.name]);
    } else if (['approve_quantities','reject_quantities'].includes(action)) {
      if (user.role !== 'CEO') throw new ClaimError('Only the CEO can review PO quantity changes.');
      const { rows } = await client.query('SELECT * FROM po_quantity_requests WHERE id=$1 FOR UPDATE', [id]);
      const request = rows[0];
      if (!request || request.status !== 'Pending') throw new ClaimError('Request is no longer pending.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${request.po_number}`]);
      const po = await client.query('SELECT * FROM po_master WHERE po_number=$1 FOR UPDATE', [request.po_number]);
      if (action === 'approve_quantities') {
        if (JSON.stringify(quantities(po.rows[0])) !== JSON.stringify(quantities(request.before_values))) throw new ClaimError('PO quantities changed since the request. Reject and submit a fresh request.');
        await client.query("UPDATE po_quantity_requests SET status='Approved',reviewed_by=$1,reviewed_at=NOW(),review_note=$2 WHERE id=$3", [user.name, note || null, id]);
        await client.query("SELECT set_config('app.po_quantity_approval',$1,true)", [id]);
        const q = request.proposed_values;
        await client.query('UPDATE po_master SET shirt_qty=$1,trouser_qty=$2,dupatta_qty=$3 WHERE po_number=$4', [q.shirt_qty,q.trouser_qty,q.dupatta_qty,request.po_number]);
      } else await client.query("UPDATE po_quantity_requests SET status='Rejected',reviewed_by=$1,reviewed_at=NOW(),review_note=$2 WHERE id=$3", [user.name,note || null,id]);
    } else if (['submit_payroll','approve_payroll','reject_payroll','pay_payroll'].includes(action)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week_ending || '') || new Date(`${week_ending}T00:00:00Z`).getUTCDay() !== 6) throw new ClaimError('Select a Saturday week-ending date.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`payroll:${week_ending}`]);
      const { rows } = await client.query('SELECT * FROM payroll_runs WHERE week_ending=$1 FOR UPDATE', [week_ending]);
      const run = rows[0];
      if (action === 'submit_payroll') {
        if (!['Accounts','Admin'].includes(user.role)) throw new ClaimError('Only Accounts or Admin can submit verified payroll.');
        if (run && run.status !== 'Rejected') throw new ClaimError('This payroll has already been submitted.');
        const snapshot = await buildPayroll(client, week_ending);
        await client.query(`INSERT INTO payroll_runs(week_ending,status,snapshot,submitted_by) VALUES($1,'Pending_CEO',$2,$3)
          ON CONFLICT(week_ending) DO UPDATE SET status='Pending_CEO',snapshot=EXCLUDED.snapshot,submitted_by=EXCLUDED.submitted_by,submitted_at=NOW(),review_note=NULL`, [week_ending,snapshot,user.name]);
      } else if (['approve_payroll','reject_payroll'].includes(action)) {
        if (user.role !== 'CEO' || run?.status !== 'Pending_CEO') throw new ClaimError('Only the CEO can review pending payroll.');
        if (action === 'approve_payroll') {
          // Revalidate underlying pieces under production locks before signing off.
          for (const p of run.snapshot.entries) await validateClaim(client,p,p.id);
        }
        await client.query(`UPDATE payroll_runs SET status=$1,approved_by=$2,approved_at=NOW(),review_note=$3 WHERE week_ending=$4`, [action === 'approve_payroll' ? 'Approved' : 'Rejected',user.name,note || null,week_ending]);
      } else {
        if (!['Accounts','Admin'].includes(user.role) || run?.status !== 'Approved') throw new ClaimError('Accounts can pay only CEO-approved payroll.');
        if (!String(payout_reference || '').trim()) throw new ClaimError('Enter the cash voucher or bank payout reference.');
        await client.query("SELECT set_config('app.payroll_payout',$1,true)", [week_ending]);
        for (const worker of run.snapshot.workers) {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`advance:${worker.code}`]);
          let remaining = Number(worker.recovery);
          for (const p of run.snapshot.entries.filter(e => String(e.stitcher_code).trim() === worker.code)) {
            await validateClaim(client,p,p.id);
            const recovery = Number(Math.min(remaining,Number(p.amount)).toFixed(2));
            if (recovery > 0) await client.query(`INSERT INTO advance_recoveries(payment_id,stitcher_code,amount,week_ending,recovered_by) VALUES($1,$2,$3,$4,$5)`, [String(p.id),worker.code,recovery,week_ending,user.name]);
            remaining = Number((remaining-recovery).toFixed(2));
            await client.query("UPDATE cmt_payments SET payment_status='Paid',payment_date=CURRENT_DATE WHERE id=$1 AND payment_status='Verified'", [p.id]);
          }
        }
        await client.query("UPDATE payroll_runs SET status='Paid',paid_by=$1,paid_at=NOW(),payout_reference=$2 WHERE week_ending=$3", [user.name,payout_reference.trim(),week_ending]);
      }
    } else throw new ClaimError('Unknown control action.');
    return { success: true };
  });
}
module.exports = { requireControls, controlTransaction, handleControls };
