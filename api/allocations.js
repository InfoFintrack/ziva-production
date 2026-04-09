const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const ALLOWED_ROLES = ['Supervisor', 'Admin', 'Accounts'];

// Whitelist of updatable quantity/remark fields
const ALLOWED_UPDATE_FIELDS = ['qty_returned', 'qty_accepted', 'qty_rework', 'qty_rejected', 'remarks'];

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

      if (req.query.po_number) {
        conditions.push(`po_number = $${paramIdx++}`);
        values.push(req.query.po_number);
      }
      if (req.query.status) {
        conditions.push(`status = $${paramIdx++}`);
        values.push(req.query.status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM stitcher_allocations ${where} ORDER BY created_at DESC`,
        values
      );
      return res.json({ success: true, allocations: rows });
    } catch (err) {
      console.error('Allocations GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { po_number, component, stitcher_code, qty_allocated, allocation_date, remarks } = req.body;

    if (!po_number || !component || !stitcher_code || !qty_allocated) {
      return res.json({ success: false, message: 'po_number, component, stitcher_code, and qty_allocated are required.' });
    }

    try {
      // Verify po_number exists in cmt_rates with status='Approved'
      const { rows: rateCheck } = await pool.query(
        `SELECT id FROM cmt_rates WHERE po_number = $1 AND status = 'Approved'`,
        [po_number]
      );
      if (!rateCheck.length) {
        return res.json({ success: false, message: 'No approved CMT rates found for this PO number.' });
      }

      // Look up stitcher by stitcher_code
      const { rows: stitcherRows } = await pool.query(
        `SELECT id, name FROM stitchers WHERE stitcher_code = $1`,
        [stitcher_code]
      );
      if (!stitcherRows.length) {
        return res.json({ success: false, message: 'Stitcher not found for the given stitcher_code.' });
      }
      const stitcher = stitcherRows[0];

      const { rows } = await pool.query(
        `INSERT INTO stitcher_allocations
           (allocation_date, po_number, component, stitcher_id, stitcher_code, stitcher_name,
            qty_allocated, qty_returned, qty_accepted, qty_rework, qty_rejected,
            status, remarks, allocated_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0, 'Pending', $8, $9, NOW())
         RETURNING *`,
        [
          allocation_date || new Date().toISOString().split('T')[0],
          po_number,
          component,
          stitcher.id,
          stitcher_code,
          stitcher.name,
          qty_allocated,
          remarks || null,
          user.name,
        ]
      );

      return res.json({ success: true, allocation: rows[0] });
    } catch (err) {
      console.error('Allocations POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { id, ...body } = req.body;
    if (!id) {
      return res.json({ success: false, message: 'id is required.' });
    }

    try {
      // Fetch current row to validate against qty_allocated
      const { rows: current } = await pool.query(
        `SELECT qty_allocated, qty_returned, qty_accepted, qty_rework, qty_rejected
         FROM stitcher_allocations WHERE id = $1`,
        [id]
      );
      if (!current.length) {
        return res.json({ success: false, message: 'Allocation not found.' });
      }

      const row = current[0];

      // Resolve new values (provided value or current value)
      const newQtyReturned = body.qty_returned  !== undefined ? Number(body.qty_returned)  : Number(row.qty_returned  || 0);
      const newQtyAccepted = body.qty_accepted  !== undefined ? Number(body.qty_accepted)  : Number(row.qty_accepted  || 0);
      const newQtyRework   = body.qty_rework    !== undefined ? Number(body.qty_rework)    : Number(row.qty_rework    || 0);
      const newQtyRejected = body.qty_rejected  !== undefined ? Number(body.qty_rejected)  : Number(row.qty_rejected  || 0);

      if (newQtyReturned > Number(row.qty_allocated)) {
        return res.json({ success: false, message: 'qty_returned cannot exceed qty_allocated.' });
      }
      if (newQtyAccepted + newQtyRework + newQtyRejected !== newQtyReturned) {
        return res.json({ success: false, message: 'qty_accepted + qty_rework + qty_rejected must equal qty_returned.' });
      }

      // Build parameterized update from whitelisted fields
      const setClauses = [];
      const values = [];
      let paramIdx = 1;

      for (const field of ALLOWED_UPDATE_FIELDS) {
        if (body[field] !== undefined) {
          setClauses.push(`${field} = $${paramIdx++}`);
          values.push(body[field]);
        }
      }

      if (setClauses.length === 0) {
        return res.json({ success: false, message: 'No valid fields to update.' });
      }

      setClauses.push(`last_updated_by = $${paramIdx++}`);
      values.push(user.name);
      setClauses.push(`last_updated_at = NOW()`);
      values.push(id);

      const { rows: updated } = await pool.query(
        `UPDATE stitcher_allocations
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx}
         RETURNING qty_remaining`,
        values
      );

      // If qty_remaining is 0 (generated column), mark Complete
      if (updated.length && Number(updated[0].qty_remaining) === 0) {
        await pool.query(
          `UPDATE stitcher_allocations SET status = 'Complete' WHERE id = $1`,
          [id]
        );
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('Allocations PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
