const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

  if (req.method === 'GET') {
    const { po_number } = req.query;
    if (!po_number) {
      return res.json({ success: false, message: 'po_number query parameter is required.' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM po_accessories WHERE po_number = $1 ORDER BY created_at ASC`,
        [po_number]
      );
      return res.json({ success: true, accessories: rows });
    } catch (err) {
      console.error('PO Accessories GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!['PP', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const { po_number, accessory_type, quantity, unit } = req.body;
    if (!po_number || !accessory_type || quantity == null || !unit) {
      return res.json({ success: false, message: 'po_number, accessory_type, quantity, and unit are required.' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO po_accessories (po_number, accessory_type, quantity, unit, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [po_number, accessory_type, Number(quantity), unit]
      );
      return res.json({ success: true, accessory: rows[0] });
    } catch (err) {
      console.error('PO Accessories POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
