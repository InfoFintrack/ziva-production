const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

// Maps department|operation → cmt_rates column name (whitelisted — safe to interpolate)
const DEPT_OP_TO_RATE_FIELD = {
  'Stitching|Shirt':              'shirt',
  'Stitching|Trouser':            'trouser',
  'Stitching|Dupatta':            'dupatta',
  'Stitching|Patching':           'patching',
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
  if (department === 'Stitching') return operation.toLowerCase();
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();
  const { type } = req.query;

  // ── ?type=advance ─────────────────────────────────────────────────────────
  if (type === 'advance') {
    await pool.query(CREATE_ADVANCES_TABLE).catch(() => {});

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
    await pool.query(CREATE_ADVANCES_TABLE).catch(() => {});

    if (req.method === 'GET') {
      const { stitcher_code } = req.query;
      if (!stitcher_code) {
        return res.json({ success: false, message: 'stitcher_code is required.' });
      }
      try {
        const { rows } = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS balance FROM advances WHERE stitcher_code = $1`,
          [stitcher_code]
        );
        return res.json({ success: true, balance: Number(rows[0].balance) });
      } catch (err) {
        console.error('Advance Balance GET error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
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

    const rateField = DEPT_OP_TO_RATE_FIELD[`${department}|${operation}`];
    if (!rateField) {
      return res.json({ success: false, message: `Unknown department/operation combination: "${department} / ${operation}".` });
    }

    const component = deriveComponent(department, operation);

    try {
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
        `SELECT ${rateField} AS rate FROM cmt_rates WHERE po_number = $1 AND status = 'Approved'`,
        [po_number]
      );
      if (!rateRows.length) {
        return res.status(400).json({
          success: false,
          message: `No approved CMT rate found for PO "${po_number}". Rate must be CEO-approved before logging payments.`,
        });
      }

      const rate   = Number(rateRows[0].rate) || 0;
      const amount = Number(qty_claimed) * rate;

      const resolvedEntryDate = entry_date || new Date().toISOString().split('T')[0];
      const week_ending = getWeekEnding(resolvedEntryDate);

      const { rows } = await pool.query(
        `INSERT INTO cmt_payments
           (entry_date, po_number, stitcher_id, stitcher_code, stitcher_name,
            component, department, operation, qty_claimed, rate, amount,
            week_ending, payment_status, color, remarks, submitted_by, submitted_at,
            worker_type, flexible_payment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending',$13,$14,$15,NOW(),$16,$17)
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
        ]
      );

      return res.json({ success: true, payment: rows[0] });
    } catch (err) {
      console.error('CMT Payments POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (!['Accounts', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { id, stitcher_code, week_ending, action, payment_date } = req.body;

    if (!action) {
      return res.json({ success: false, message: 'action is required.' });
    }
    if (!['verify', 'pay', 'mark_paid', 'mark_paid_flexible'].includes(action)) {
      return res.json({ success: false, message: 'action must be "verify", "pay", "mark_paid", or "mark_paid_flexible".' });
    }

    // mark_paid_flexible — marks a single payment record as Paid by id only (no week_ending restriction)
    if (action === 'mark_paid_flexible') {
      if (!id) return res.json({ success: false, message: 'id is required for mark_paid_flexible.' });
      try {
        const result = await pool.query(
          `UPDATE cmt_payments SET payment_status = 'Paid', payment_date = $1 WHERE id = $2`,
          [new Date().toISOString().split('T')[0], id]
        );
        if (result.rowCount === 0) {
          return res.json({ success: false, message: 'Payment record not found.' });
        }
        return res.json({ success: true });
      } catch (err) {
        console.error('CMT Payments mark_paid_flexible error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }

    // Bulk update by stitcher_code + week_ending
    if (stitcher_code && week_ending) {
      try {
        if (action === 'verify') {
          await pool.query(
            `UPDATE cmt_payments
             SET payment_status = 'Verified', verified_by = $1, verified_at = NOW()
             WHERE stitcher_code = $2 AND week_ending = $3`,
            [user.name, stitcher_code, week_ending]
          );
        } else if (action === 'mark_paid') {
          await pool.query(
            `UPDATE cmt_payments
             SET payment_status = 'Paid', payment_date = $1
             WHERE stitcher_code = $2 AND week_ending = $3`,
            [new Date().toISOString().split('T')[0], stitcher_code, week_ending]
          );
        }
        return res.json({ success: true });
      } catch (err) {
        console.error('CMT Payments bulk PUT error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }

    // Single-record update by id (legacy)
    if (!id) {
      return res.json({ success: false, message: 'Either (stitcher_code + week_ending) or id is required.' });
    }
    if (action === 'pay' && !payment_date) {
      return res.json({ success: false, message: 'payment_date is required for action "pay".' });
    }

    try {
      let result;
      if (action === 'verify') {
        result = await pool.query(
          `UPDATE cmt_payments SET payment_status = 'Verified', verified_by = $1, verified_at = NOW() WHERE id = $2`,
          [user.name, id]
        );
      } else {
        result = await pool.query(
          `UPDATE cmt_payments SET payment_status = 'Paid', payment_date = $1 WHERE id = $2`,
          [payment_date || new Date().toISOString().split('T')[0], id]
        );
      }
      if (result.rowCount === 0) {
        return res.json({ success: false, message: 'Payment record not found.' });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('CMT Payments PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
