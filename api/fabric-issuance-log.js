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
        `SELECT * FROM fabric_issuance_log WHERE po_number = $1 ORDER BY issued_at DESC`,
        [po_number]
      );
      return res.json({ success: true, logs: rows });
    } catch (err) {
      console.error('Fabric Issuance Log GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (user.role !== 'PP') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const { po_number, component, meters_issued, issued_by, remarks } = req.body;
    if (!po_number || !component || meters_issued == null || !issued_by) {
      return res.json({ success: false, message: 'po_number, component, meters_issued, and issued_by are required.' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO fabric_issuance_log (po_number, component, meters_issued, issued_by, remarks, issued_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [po_number, component, Number(meters_issued), issued_by, remarks || null]
      );
      return res.json({ success: true, log: rows[0] });
    } catch (err) {
      console.error('Fabric Issuance Log POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
