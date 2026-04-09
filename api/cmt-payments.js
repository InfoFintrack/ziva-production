const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

// Maps the 'operation' field value to the corresponding column in cmt_rates
const OPERATION_TO_RATE_FIELD = {
  'Shirt':          'shirt',
  'Trouser':        'trouser',
  'Dupatta':        'dupatta',
  'Cutting':        'cutting',
  'Patching':       'patching',
  'fs_clipping':    'fs_clipping',
  'fs_heming':      'fs_heming',
  'fs_tussling':    'fs_tussling',
  'fs_pressing':    'fs_pressing',
  'ft_clipping':    'ft_clipping',
  'ft_heming':      'ft_heming',
  'ft_pressing':    'ft_pressing',
  'ft_patching':    'ft_patching',
  'fd_heming':      'fd_heming',
  'fd_tussling':    'fd_tussling',
  'fd_pressing':    'fd_pressing',
  'fd_patching':    'fd_patching',
  'quality_packing':'quality_packing',
};

/**
 * Returns the next Saturday on or after the given date string.
 * If the given date is already Saturday, returns that same date.
 */
function getWeekEnding(dateStr) {
  const d = new Date(dateStr);
  const daysUntilSat = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

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
      if (req.query.payment_status) {
        conditions.push(`payment_status = $${paramIdx++}`);
        values.push(req.query.payment_status);
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
    if (!['Stitching', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const {
      po_number, stitcher_code, component, department,
      operation, qty_claimed, entry_date, remarks,
    } = req.body;

    if (!po_number || !stitcher_code || !component || !department || !operation || !qty_claimed) {
      return res.json({ success: false, message: 'po_number, stitcher_code, component, department, operation, and qty_claimed are required.' });
    }

    const rateField = OPERATION_TO_RATE_FIELD[operation];
    if (!rateField) {
      return res.json({ success: false, message: `Unknown operation: "${operation}".` });
    }

    try {
      // Look up stitcher by stitcher_code
      const { rows: stitcherRows } = await pool.query(
        `SELECT id, name FROM stitchers WHERE stitcher_code = $1`,
        [stitcher_code]
      );
      if (!stitcherRows.length) {
        return res.json({ success: false, message: 'Stitcher not found for the given stitcher_code.' });
      }
      const stitcher = stitcherRows[0];

      // Look up rate from cmt_rates for this po_number
      // rateField is from a fixed whitelist — safe to interpolate into column name
      const { rows: rateRows } = await pool.query(
        `SELECT ${rateField} AS rate FROM cmt_rates WHERE po_number = $1`,
        [po_number]
      );
      if (!rateRows.length) {
        return res.json({ success: false, message: 'CMT rates not found for this PO number.' });
      }

      const rate   = Number(rateRows[0].rate) || 0;
      const amount = Number(qty_claimed) * rate;

      const resolvedEntryDate = entry_date || new Date().toISOString().split('T')[0];
      const week_ending = getWeekEnding(resolvedEntryDate);

      const { rows } = await pool.query(
        `INSERT INTO cmt_payments
           (entry_date, po_number, stitcher_id, stitcher_code, stitcher_name,
            component, department, operation, qty_claimed, rate, amount,
            week_ending, payment_status, remarks, submitted_by, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending',$13,$14,NOW())
         RETURNING *`,
        [
          resolvedEntryDate,
          po_number,
          stitcher.id,
          stitcher_code,
          stitcher.name,
          component,
          department,
          operation,
          qty_claimed,
          rate,
          amount,
          week_ending,
          remarks       || null,
          user.name,
        ]
      );

      return res.json({ success: true, payment: rows[0] });
    } catch (err) {
      console.error('CMT Payments POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (user.role !== 'Accounts') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { id, action, payment_date } = req.body;
    if (!id || !action) {
      return res.json({ success: false, message: 'id and action are required.' });
    }
    if (!['verify', 'pay'].includes(action)) {
      return res.json({ success: false, message: 'action must be "verify" or "pay".' });
    }
    if (action === 'pay' && !payment_date) {
      return res.json({ success: false, message: 'payment_date is required for action "pay".' });
    }

    try {
      let result;
      if (action === 'verify') {
        result = await pool.query(
          `UPDATE cmt_payments
           SET payment_status = 'Verified', verified_by = $1, verified_at = NOW()
           WHERE id = $2`,
          [user.name, id]
        );
      } else {
        result = await pool.query(
          `UPDATE cmt_payments
           SET payment_status = 'Paid', payment_date = $1
           WHERE id = $2`,
          [payment_date, id]
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
