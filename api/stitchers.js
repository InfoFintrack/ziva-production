const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const CNIC_REGEX  = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;
const PHONE_REGEX = /^[0-9]{4}-[0-9]{7}$/;

// Whitelist of fields that may be updated (excludes id and stitcher_code)
const ALLOWED_UPDATE_FIELDS = ['name', 'cnic', 'phone', 'specialization', 'status', 'date_joined', 'group_parent'];

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
      const where = req.query.active === 'true' ? `WHERE status = 'Active'` : '';
      const { rows } = await pool.query(
        `SELECT * FROM stitchers ${where} ORDER BY stitcher_code ASC`
      );
      return res.json({ success: true, stitchers: rows });
    } catch (err) {
      console.error('Stitchers GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!['Cutting', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, cnic, phone, specialization, status, date_joined } = req.body;

    if (!name || !phone || !specialization) {
      return res.json({ success: false, message: 'name, phone, and specialization are required.' });
    }
    if (cnic && !CNIC_REGEX.test(cnic)) {
      return res.json({ success: false, message: 'Invalid CNIC format. Expected: 00000-0000000-0' });
    }
    if (!PHONE_REGEX.test(phone)) {
      return res.json({ success: false, message: 'Invalid phone format. Expected: 0000-0000000' });
    }

    try {
      // Auto-generate stitcher_code: MAX + 1, padded to 4 digits
      const { rows: maxRows } = await pool.query(
        `SELECT MAX(stitcher_code::int) AS max_code FROM stitchers`
      );
      const nextNum = maxRows[0].max_code !== null ? parseInt(maxRows[0].max_code, 10) + 1 : 1;
      const stitcher_code = String(nextNum).padStart(4, '0');

      const { rows } = await pool.query(
        `INSERT INTO stitchers
           (stitcher_code, name, cnic, phone, specialization, status, date_joined, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          stitcher_code,
          name,
          cnic,
          phone,
          specialization,
          status     || 'Active',
          date_joined || null,
        ]
      );

      return res.json({ success: true, stitcher: rows[0] });
    } catch (err) {
      console.error('Stitchers POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    if (!['Cutting', 'Admin', 'Accounts'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { id, ...body } = req.body;
    if (!id) {
      return res.json({ success: false, message: 'id is required.' });
    }

    // Validate format if these fields are being updated
    if (body.cnic && !CNIC_REGEX.test(body.cnic)) {
      return res.json({ success: false, message: 'Invalid CNIC format. Expected: 00000-0000000-0' });
    }
    if (body.phone && !PHONE_REGEX.test(body.phone)) {
      return res.json({ success: false, message: 'Invalid phone format. Expected: 0000-0000000' });
    }

    // Build parameterized update from whitelisted fields only
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

    values.push(id);

    try {
      const result = await pool.query(
        `UPDATE stitchers SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
        values
      );
      if (result.rowCount === 0) {
        return res.json({ success: false, message: 'Stitcher not found.' });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Stitchers PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
