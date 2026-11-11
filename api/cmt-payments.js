const { getPool } = require('./_lib/db');
const { withAuditedTransaction } = require('./_lib/auditedQuery');
const { ClaimError, claimAvailability, validateClaim } = require('./_lib/claimPolicy');
const { requireControls } = require('./_lib/controls');
const { ensureProductionFlow } = require('./_lib/productionFlow');
const { authenticateToken } = require('./_lib/auth');

// Maps department|operation → cmt_rates column name (whitelisted — safe to interpolate)
const DEPT_OP_TO_RATE_FIELD = {
  'Stitching|Shirt':              'shirt',
  'Stitching|Trouser':            'trouser',
  'Stitching|Dupatta':            'dupatta',
  'Stitching|Shirt Patching': 'patching',
  'Stitching|Trouser Patching': 'patching',
  'Stitching|Dupatta Patching': 'patching',
  'Cutting|Shirt':                'cutting',
  'Cutting|Trouser':              'cutting',
  'Cutting|Dupatta':              'cutting',
  'Finishing Shirt|Clipping':     'fs_clipping',
  'Finishing Shirt|Heming':       'fs_heming',
  'Finishing Shirt|Tussling':     'fs_tussling',
  'Finishing Shirt|Pressing':     'fs_pressing',
  'Finishing Trouser|Clipping':   'ft_clipping',
  'Finishing Trouser|Heming':     'ft_heming',
  'Finishing Trouser|Pressing':   'ft_pressing',
  'Finishing Trouser|Patching':   'ft_patching',
  'Finishing Dupatta|Heming':     'fd_heming',
  'Finishing Dupatta|Tussling':   'fd_tussling',
  'Finishing Dupatta|Pressing':   'fd_pressing',
  'Finishing Dupatta|Patching':   'fd_patching',
};

// Auto-derive component from department + operation
function deriveComponent(department, operation) {
  if (department === 'Stitching' || department === 'Cutting') return operation.toLowerCase();
  if (department.includes('Shirt'))   return 'shirt';
  if (department.includes('Trouser')) return 'trouser';
  if (department.includes('Dupatta')) return 'dupatta';
  return null;
}

// Returns the next Saturday on or after dateStr; if dateStr is Saturday, returns that date.
function getWeekEnding(dateStr) {
  const d = new Date(dateStr);
  const daysUntilSat = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d.toISOString().split('T')[0];
}

const CREATE_ADVANCES_TABLE = `
  CREATE TABLE IF NOT EXISTS advances (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitcher_code CHAR(4),
    stitcher_name VARCHAR(100),
    amount        DECIMAL(10,2),
    week_ending   DATE,
    added_by      VARCHAR(100),
    note          TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
  )
`;

const CREATE_ADVANCE_LEDGER = `
  CREATE TABLE IF NOT EXISTS advance_ledger_epoch (id SMALLINT PRIMARY KEY CHECK (id=1), activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  INSERT INTO advance_ledger_epoch (id) VALUES (1) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS advance_opening (
    stitcher_code CHAR(4) PRIMARY KEY, balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
    set_by VARCHAR(100) NOT NULL, set_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS advance_recoveries (
    payment_id TEXT PRIMARY KEY, stitcher_code CHAR(4) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), week_ending DATE,
    recovered_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  ALTER TABLE advance_ledger_epoch ENABLE ROW LEVEL SECURITY;
  ALTER TABLE advance_opening ENABLE ROW LEVEL SECURITY;
  ALTER TABLE advance_recoveries ENABLE ROW LEVEL SECURITY;
`;

async function ensureAdvanceLedger(pool) { await pool.query(CREATE_ADVANCES_TABLE); await pool.query(CREATE_ADVANCE_LEDGER); }

async function advanceBalance(client, code) {
  const { rows } = await client.query(`SELECT
    COALESCE((SELECT balance FROM advance_opening WHERE stitcher_code=$1),0)
    + COALESCE((SELECT SUM(a.amount) FROM advances a CROSS JOIN advance_ledger_epoch e WHERE e.id=1 AND a.stitcher_code=$1 AND a.created_at>=e.activated_at),0)
    - COALESCE((SELECT SUM(amount) FROM advance_recoveries WHERE stitcher_code=$1),0) AS balance`, [code]);
  return Math.max(0, Number(rows[0].balance));
}

async function recoverAdvance(client, payment, actor) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`advance:${payment.stitcher_code}`]);
  const historic = await client.query(`SELECT
    (SELECT COUNT(*) FROM advances a CROSS JOIN advance_ledger_epoch e WHERE e.id=1 AND a.stitcher_code=$1 AND a.created_at<e.activated_at) AS old_advances,
    (SELECT COUNT(*) FROM advance_opening WHERE stitcher_code=$1) AS reconciled`, [payment.stitcher_code]);
  if (Number(historic.rows[0].old_advances) > 0 && Number(historic.rows[0].reconciled) === 0)
    throw new ClaimError(`Reconcile opening advances for worker ${String(payment.stitcher_code).trim()} before payment.`);
  const balance = await advanceBalance(client, payment.stitcher_code);
  const recovery = Math.min(balance, Number(payment.amount));
  if (recovery > 0) await client.query(`INSERT INTO advance_recoveries
    (payment_id, stitcher_code, amount, week_ending, recovered_by) VALUES ($1,$2,$3,$4,$5)`,
    [String(payment.id), payment.stitcher_code, recovery, payment.week_ending, actor]);
  return recovery;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();
  const { type } = req.query;

  if (type === 'advance_ledger') {
    if (!['Admin', 'Accounts', 'CEO'].includes(user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
    try {
      await ensureAdvanceLedger(pool);
      if (req.method === 'GET') {
        const [epoch, opening, recoveries, advances] = await Promise.all([
          pool.query('SELECT activated_at FROM advance_ledger_epoch WHERE id=1'),
          pool.query('SELECT * FROM advance_opening'),
          pool.query('SELECT * FROM advance_recoveries ORDER BY created_at DESC'),
          pool.query('SELECT * FROM advances ORDER BY created_at DESC'),
        ]);
        return res.json({ success: true, activated_at: epoch.rows[0].activated_at, opening: opening.rows, recoveries: recoveries.rows, advances: advances.rows });
      }
      if (req.method === 'POST') {
        if (user.role !== 'Admin') return res.status(403).json({ success: false, message: 'Only Admin can set reconciled opening balances.' });
        const code = String(req.body.stitcher_code || '').trim();
        const balance = Number(req.body.balance);
        if (!code || !Number.isFinite(balance) || balance < 0) return res.status(400).json({ success: false, message: 'Worker and nonnegative opening balance are required.' });
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`advance:${code}`]);
          const worker = await client.query('SELECT 1 FROM stitchers WHERE stitcher_code=$1', [code]);
          if (!worker.rows.length) throw new ClaimError('Worker not found.');
          const result = await client.query('SELECT 1 FROM advance_recoveries WHERE stitcher_code=$1 LIMIT 1', [code]);
          if (result.rows.length) throw new ClaimError('Opening balance is locked after recovery starts.');
          await client.query(`INSERT INTO advance_opening (stitcher_code,balance,set_by) VALUES ($1,$2,$3)
            ON CONFLICT (stitcher_code) DO UPDATE SET balance=EXCLUDED.balance,set_by=EXCLUDED.set_by,set_at=NOW()`, [code, balance, user.name]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
        return res.json({ success: true });
      }
      return res.status(405).json({ success: false, message: 'Method not allowed.' });
    } catch (err) { if (!(err instanceof ClaimError)) console.error('Advance ledger error:', err.message); return res.status(err instanceof ClaimError || err.code === 'P0001' ? 400 : 500).json({ success: false, message: err instanceof ClaimError ? err.message : 'Advance ledger unavailable.' }); }
  }

  // ── ?type=advance ─────────────────────────────────────────────────────────
  if (type === 'advance') {
    await ensureAdvanceLedger(pool);

    if (req.method === 'GET') {
      try {
        const conditions = [];
        const values = [];
        let paramIdx = 1;

        if (req.query.week_ending) {
          conditions.push(`week_ending = $${paramIdx++}`);
          values.push(req.query.week_ending);
        }
        if (req.query.stitcher_code) {
          conditions.push(`stitcher_code = $${paramIdx++}`);
          values.push(req.query.stitcher_code);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const { rows } = await pool.query(
          `SELECT * FROM advances ${where} ORDER BY created_at DESC`,
          values
        );
        return res.json({ success: true, advances: rows });
      } catch (err) {
        console.error('Advances GET error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }

    if (req.method === 'POST') {
      if (!['Accounts', 'Admin'].includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { stitcher_code, amount, week_ending: weParam, note } = req.body;
      if (!stitcher_code || amount == null) {
        return res.json({ success: false, message: 'stitcher_code and amount are required.' });
      }
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ success: false, message: 'Advance amount must be positive.' });
      try {
        const { rows: stitcherRows } = await pool.query(
          `SELECT name FROM stitchers WHERE stitcher_code = $1`,
          [stitcher_code]
        );
        const stitcherName = stitcherRows.length ? stitcherRows[0].name : '';
        const week_ending  = weParam || getWeekEnding(new Date().toISOString().split('T')[0]);

        const { rows } = await pool.query(
          `INSERT INTO advances (stitcher_code, stitcher_name, amount, week_ending, added_by, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
          [stitcher_code, stitcherName, Number(amount), week_ending, user.name, note || null]
        );
        return res.json({ success: true, advance: rows[0] });
      } catch (err) {
        console.error('Advances POST error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }

    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  // ── ?type=advance_balance ─────────────────────────────────────────────────
  if (type === 'advance_balance') {
    await ensureAdvanceLedger(pool);

    if (req.method === 'GET') {
      const { stitcher_code } = req.query;
      if (!stitcher_code) {
        return res.json({ success: false, message: 'stitcher_code is required.' });
      }
      try {
        const historic = await pool.query(`SELECT
          (SELECT COUNT(*) FROM advances a CROSS JOIN advance_ledger_epoch e WHERE e.id=1 AND a.stitcher_code=$1 AND a.created_at<e.activated_at) AS old_advances,
          (SELECT COUNT(*) FROM advance_opening WHERE stitcher_code=$1) AS reconciled`, [stitcher_code]);
        const requiresReconciliation = Number(historic.rows[0].old_advances) > 0 && Number(historic.rows[0].reconciled) === 0;
        return res.json({ success: true, balance: requiresReconciliation ? null : await advanceBalance(pool, stitcher_code), requires_reconciliation: requiresReconciliation });
      } catch (err) {
        console.error('Advance Balance GET error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  if (type === 'claimable') {
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed.' });
    if (!['Stitching', 'Cutting', 'Finishing', 'Admin'].includes(user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
    const { po_number, stitcher_code, department, operation } = req.query;
    if (!po_number || !stitcher_code || !DEPT_OP_TO_RATE_FIELD[`${department}|${operation}`])
      return res.status(400).json({ success: false, message: 'Choose a PO, worker and valid operation.' });
    try {
      await requireControls(pool);
      if (department === 'Cutting') await ensureProductionFlow(pool);
      const operations = await claimAvailability(pool, { po_number, stitcher_code, department, operation,
        component: deriveComponent(department, operation) });
      return res.json({ success: true, operations });
    } catch (err) {
      if (!(err instanceof ClaimError)) console.error('CMT claimable GET error:', err.message);
      return res.status(err instanceof ClaimError || err.code === 'P0001' ? 400 : 500).json({ success: false, message: err instanceof ClaimError ? err.message : 'Claimable quantity unavailable.' });
    }
  }

  // ── Default: cmt_payments GET / POST / PUT ────────────────────────────────

  // Idempotent column migrations
  await pool.query(`ALTER TABLE cmt_payments ADD COLUMN IF NOT EXISTS color VARCHAR(100)`).catch(() => {});
  await pool.query(`ALTER TABLE cmt_payments ADD COLUMN IF NOT EXISTS worker_type VARCHAR(50)`).catch(() => {});
  await pool.query(`ALTER TABLE cmt_payments ADD COLUMN IF NOT EXISTS flexible_payment BOOLEAN DEFAULT FALSE`).catch(() => {});

  if (req.method === 'GET') {
    try {
      const conditions = [];
      const values = [];
      let paramIdx = 1;

      if (req.query.week_ending) {
        conditions.push(`week_ending = $${paramIdx++}`);
        values.push(req.query.week_ending);
      }
      if (req.query.submitted_by) {
        conditions.push(`submitted_by = $${paramIdx++}`);
        values.push(req.query.submitted_by);
      }
      if (req.query.stitcher_code) {
        conditions.push(`stitcher_code = $${paramIdx++}`);
        values.push(req.query.stitcher_code);
      }
      if (req.query.stitcher_name) {
        conditions.push(`stitcher_name = $${paramIdx++}`);
        values.push(req.query.stitcher_name);
      }
      if (req.query.payment_status) {
        conditions.push(`payment_status = $${paramIdx++}`);
        values.push(req.query.payment_status);
      }
      if (req.query.date_from) {
        conditions.push(`entry_date >= $${paramIdx++}`);
        values.push(req.query.date_from);
      }
      if (req.query.date_to) {
        conditions.push(`entry_date <= $${paramIdx++}`);
        values.push(req.query.date_to);
      }
      if (req.query.worker_type) {
        conditions.push(`worker_type = $${paramIdx++}`);
        values.push(req.query.worker_type);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM cmt_payments ${where} ORDER BY entry_date DESC`,
        values
      );
      return res.json({ success: true, payments: rows });
    } catch (err) {
      console.error('CMT Payments GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!['Stitching', 'Cutting', 'Admin', 'Finishing'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { po_number, stitcher_code, department, operation, qty_claimed, entry_date, remarks, color, worker_type, flexible_payment } = req.body;

    if (!po_number || !stitcher_code || !department || !operation || !qty_claimed) {
      return res.json({ success: false, message: 'po_number, stitcher_code, department, operation, and qty_claimed are required.' });
    }
    if (!Number.isInteger(Number(qty_claimed)) || Number(qty_claimed) <= 0) {
      return res.status(400).json({ success: false, message: 'Claimed pieces must be a positive whole number.' });
    }
    // For Cutting dept, operation may be combined like "Shirt, Trouser" since they share the same rate
    let rateField;
    let component;
    if (department === 'Cutting' && operation.includes(',')) {
      const firstOp = operation.split(',')[0].trim();
      rateField = DEPT_OP_TO_RATE_FIELD[`${department}|${firstOp}`];
      component = operation.split(',').map(o => o.trim().toLowerCase()).join(', ');
    } else {
      rateField = DEPT_OP_TO_RATE_FIELD[`${department}|${operation}`];
      component = deriveComponent(department, operation);
    }
    if (!rateField) {
      return res.json({ success: false, message: `Unknown department/operation combination: "${department} / ${operation}".` });
    }

    try {
      await requireControls(pool);
      // Look up stitcher
      const { rows: stitcherRows } = await pool.query(
        `SELECT id, name FROM stitchers WHERE stitcher_code = $1`,
        [stitcher_code]
      );
      if (!stitcherRows.length) {
        return res.json({ success: false, message: 'Stitcher not found for the given stitcher_code.' });
      }
      const stitcher = stitcherRows[0];

      // Look up approved rate — rateField is from a fixed whitelist, safe to interpolate
      const { rows: rateRows } = await pool.query(
        `SELECT id, ${rateField} AS rate FROM cmt_rates WHERE po_number = $1 AND status = 'Approved' AND in_app_approved=TRUE ORDER BY version DESC LIMIT 1`,
        [po_number]
      );
      if (!rateRows.length) {
        return res.status(400).json({
          success: false,
          message: `No approved CMT rate found for PO "${po_number}". Rate must be CEO-approved before logging payments.`,
        });
      }

      const rate   = Number(rateRows[0].rate) || 0;
      if (rate <= 0) throw new ClaimError('No positive approved rate exists for this operation.');
      const amount = Number((Number(qty_claimed) * rate).toFixed(2));

      const resolvedEntryDate = entry_date || new Date().toISOString().split('T')[0];
      const week_ending = req.body.payroll_week || getWeekEnding(resolvedEntryDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week_ending) || new Date(`${week_ending}T00:00:00Z`).getUTCDay() !== 6 || week_ending < getWeekEnding(resolvedEntryDate)) throw new ClaimError('Payroll week must be a Saturday on or after the work week. Choose a later open week for late claims.');

      await ensureProductionFlow(pool);
      const { rows } = await withAuditedTransaction(pool, user.name, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payroll:${week_ending}`]);
        await validateClaim(client, { po_number, stitcher_code, department, operation, component, qty_claimed });
        return client.query(
        `INSERT INTO cmt_payments
           (entry_date, po_number, stitcher_id, stitcher_code, stitcher_name,
            component, department, operation, qty_claimed, rate, amount,
            week_ending, payment_status, color, remarks, submitted_by, submitted_at,
            worker_type, flexible_payment, rate_version_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending',$13,$14,$15,NOW(),$16,$17,$18)
         RETURNING *`,
        [
          resolvedEntryDate, po_number,
          stitcher.id, stitcher_code, stitcher.name,
          component, department, operation,
          qty_claimed, rate, amount,
          week_ending,
          color || null, remarks || null, user.name,
          worker_type || null,
          flexible_payment === true || flexible_payment === 'true' ? true : false,
          String(rateRows[0].id),
        ]
        );
      });

      return res.json({ success: true, payment: rows[0] });
    } catch (err) {
      if (!(err instanceof ClaimError)) console.error('CMT Payments POST error:', err.message);
      return res.status(err instanceof ClaimError || err.code === 'P0001' ? 400 : 500).json({ success: false, message: err instanceof ClaimError || err.code === 'P0001' ? err.message : 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (!['Accounts', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    try { await requireControls(pool); } catch(error) { return res.status(503).json({success:false,message:error.message}); }
    const { id, stitcher_code, week_ending, action, payment_date, qty_claimed, po_number } = req.body;

    if (!action) {
      return res.json({ success: false, message: 'action is required.' });
    }
    if (!['verify', 'pay', 'mark_paid', 'mark_paid_flexible', 'edit'].includes(action)) {
      return res.json({ success: false, message: 'action must be "verify", "pay", "mark_paid", "mark_paid_flexible", or "edit".' });
    }

    if (action === 'edit') {
      if (!id) return res.status(400).json({ success: false, message: 'Payment ID is required.' });
      try {
        await ensureProductionFlow(pool);
        const updated = await withAuditedTransaction(pool, user.name, async client => {
          const week = await client.query('SELECT week_ending::text FROM cmt_payments WHERE id=$1',[id]);
          if (week.rows.length) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payroll:${week.rows[0].week_ending}`]);
          const { rows } = await client.query('SELECT * FROM cmt_payments WHERE id=$1 FOR UPDATE', [id]);
          if (!rows.length) throw new ClaimError('Payment record not found.');
          const original = rows[0];
          if (original.payment_status === 'Paid') throw new ClaimError('Paid entries cannot be edited. Record a separate correction.');
          if (po_number && po_number !== original.po_number) throw new ClaimError('PO cannot be changed on a claim. Enter a new claim instead.');
          const quantity = qty_claimed === undefined ? Number(original.qty_claimed) : Number(qty_claimed);
          await validateClaim(client, { ...original, qty_claimed: quantity }, id);
          const result = await client.query(`UPDATE cmt_payments SET qty_claimed=$1, amount=$2,
            payment_status='Pending', verified_by=NULL, verified_at=NULL WHERE id=$3 RETURNING *`,
            [quantity, quantity * Number(original.rate), id]);
          return result.rows[0];
        });
        return res.json({ success: true, payment: updated });
      } catch (err) {
        if (!(err instanceof ClaimError)) console.error('CMT Payments EDIT error:', err.message);
        return res.status(err instanceof ClaimError || err.code === 'P0001' ? 400 : 500).json({ success: false, message: err instanceof ClaimError || err.code === 'P0001' ? err.message : 'Server error.' });
      }
    }

    if (!id && !(stitcher_code && week_ending)) return res.status(400).json({ success: false, message: 'Payment ID or worker and week are required.' });
    if (action === 'mark_paid_flexible' && !id) return res.status(400).json({ success: false, message: 'Payment ID is required.' });
    const verifying = action === 'verify';
    const expected = verifying ? 'Pending' : 'Verified';
    const paidDate = payment_date || new Date().toISOString().split('T')[0];
    try {
      if (!verifying) await ensureAdvanceLedger(pool);
      const changed = await withAuditedTransaction(pool, user.name, async client => {
        const selectedWeek = id ? await client.query('SELECT week_ending::text FROM cmt_payments WHERE id=$1',[id]) : {rows:[{week_ending}]};
        if (selectedWeek.rows.length) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payroll:${selectedWeek.rows[0].week_ending}`]);
        const result = id
          ? await client.query('SELECT * FROM cmt_payments WHERE id=$1 FOR UPDATE', [id])
          : await client.query("SELECT * FROM cmt_payments WHERE stitcher_code=$1 AND week_ending=$2 AND payment_status='Pending' ORDER BY id FOR UPDATE", [stitcher_code, week_ending]);
        if (!result.rows.length) throw new ClaimError('No matching payment entries.');
        if (result.rows.some(row => row.payment_status !== expected)) throw new ClaimError(`Every selected entry must be ${expected} before ${verifying ? 'verification' : 'payment'}.`);
        if (action === 'mark_paid_flexible' && result.rows.some(row => !row.flexible_payment)) throw new ClaimError('Flexible payment action requires a flexible entry.');
        if (!verifying && result.rows.some(row => row.verified_by === user.name)) throw new ClaimError('A different Accounts or Admin user must mark verified entries paid.');
        for (const row of result.rows) {
          if (verifying) await client.query(`UPDATE cmt_payments SET payment_status='Verified', verified_by=$1, verified_at=NOW() WHERE id=$2`, [user.name, row.id]);
          else {
            await recoverAdvance(client, row, user.name);
            await client.query(`UPDATE cmt_payments SET payment_status='Paid', payment_date=$1 WHERE id=$2`, [paidDate, row.id]);
          }
        }
        return result.rows.length;
      });
      return res.json({ success: true, changed });
    } catch (err) {
      if (!(err instanceof ClaimError)) console.error('CMT Payments status change error:', err.message);
      return res.status(err instanceof ClaimError || err.code === 'P0001' ? 400 : 500).json({ success: false, message: err instanceof ClaimError || err.code === 'P0001' ? err.message : 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
