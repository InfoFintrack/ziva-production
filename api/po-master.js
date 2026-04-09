const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

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
      const { rows } = await pool.query(
        `SELECT * FROM po_master ORDER BY created_at DESC`
      );
      return res.json({ success: true, pos: rows });
    } catch (err) {
      console.error('PO Master GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!['PP', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const {
      po_number, buyer_name, garment_type, color_design,
      po_date, delivery_date, total_qty, status, remarks,
    } = req.body;

    if (!po_number || !garment_type) {
      return res.json({ success: false, message: 'po_number and garment_type are required.' });
    }

    try {
      const { rows: existing } = await pool.query(
        `SELECT id FROM po_master WHERE po_number = $1`,
        [po_number]
      );
      if (existing.length) {
        return res.json({ success: false, message: 'PO number already exists.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO po_master
           (po_number, buyer_name, garment_type, color_design, po_date, delivery_date,
            total_qty, status, remarks, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          po_number,
          buyer_name    || null,
          garment_type,
          color_design  || null,
          po_date       || null,
          delivery_date || null,
          total_qty     || null,
          status        || 'Active',
          remarks       || null,
          user.name,
        ]
      );

      return res.json({ success: true, po: rows[0] });
    } catch (err) {
      console.error('PO Master POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (!['Admin', 'Accounts'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { id, status: newStatus } = req.body;
    if (!id || !newStatus) {
      return res.json({ success: false, message: 'id and status are required.' });
    }

    try {
      const result = await pool.query(
        `UPDATE po_master SET status = $1 WHERE id = $2`,
        [newStatus, id]
      );
      if (result.rowCount === 0) {
        return res.json({ success: false, message: 'PO not found.' });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('PO Master PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
