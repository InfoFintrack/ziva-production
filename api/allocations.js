const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const ALLOWED_ROLES = ['Supervisor', 'Admin'];

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
      if (req.query.stitcher_code) {
        conditions.push(`stitcher_code = $${paramIdx++}`);
        values.push(req.query.stitcher_code);
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0, 'In Progress', $8, $9, NOW())
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

    const { id, qty_returned_delta, qty_accepted_delta, qty_rework_delta, qty_rejected_delta, remarks } = req.body;
    if (!id) {
      return res.json({ success: false, message: 'id is required.' });
    }

    try {
      // Fetch current row
      const { rows: current } = await pool.query(
        `SELECT qty_allocated, qty_returned, qty_accepted, qty_rework, qty_rejected, allocation_date
         FROM stitcher_allocations WHERE id = $1`,
        [id]
      );
      if (!current.length) {
        return res.json({ success: false, message: 'Allocation not found.' });
      }

      const row = current[0];
      const deltaReturned = Number(qty_returned_delta  || 0);
      const deltaAccepted = Number(qty_accepted_delta  || 0);
      const deltaRework   = Number(qty_rework_delta    || 0);
      const deltaRejected = Number(qty_rejected_delta  || 0);

      const newQtyReturned = Number(row.qty_returned || 0) + deltaReturned;

      if (newQtyReturned > Number(row.qty_allocated)) {
        return res.status(400).json({ success: false, message: 'Returned quantity would exceed allocated quantity.' });
      }
      if (deltaAccepted + deltaRework + deltaRejected !== deltaReturned) {
        return res.json({ success: false, message: 'qty_accepted + qty_rework + qty_rejected must equal qty_returned delta.' });
      }

      // Delta update — accumulate into existing values
      const setClauses = [
        `qty_returned = qty_returned + $1`,
        `qty_accepted = qty_accepted + $2`,
        `qty_rework   = qty_rework   + $3`,
        `qty_rejected = qty_rejected + $4`,
        `last_updated_by = $5`,
        `last_updated_at = NOW()`,
      ];
      const values = [deltaReturned, deltaAccepted, deltaRework, deltaRejected, user.name];

      if (remarks !== undefined) {
        values.push(remarks);
        setClauses.push(`remarks = $${values.length}`);
      }

      values.push(id);
      const whereParam = `$${values.length}`;

      await pool.query(
        `UPDATE stitcher_allocations SET ${setClauses.join(', ')} WHERE id = ${whereParam}`,
        values
      );

      // Auto-update status based on new remaining quantity
      const newRemaining = Number(row.qty_allocated) - newQtyReturned;
      let newStatus;
      if (newRemaining === 0) {
        newStatus = 'Complete';
      } else {
        const allocationDate = new Date(row.allocation_date);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        newStatus = allocationDate < twoDaysAgo ? 'Overdue' : 'In Progress';
      }

      await pool.query(
        `UPDATE stitcher_allocations SET status = $1 WHERE id = $2`,
        [newStatus, id]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('Allocations PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
