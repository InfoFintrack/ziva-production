const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const OVERRIDE_ALLOWED_FIELDS = new Set([
  'issue_remarks', 'acceptance_remarks', 'qty_issued', 'qty_received',
  'acceptance_status', 'fabric_condition', 'receiving_vendor',
  'garment_type', 'fabric_name', 'fabric_color', 'jo_number',
]);

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const user = authenticateToken(req, res);
  if (!user) return;

  if (!['Admin', 'Accounts'].includes(user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const { recordId, field, newValue, adminName } = req.body;

  if (!recordId || !field || newValue === undefined || !adminName) {
    return res.json({ success: false, message: 'recordId, field, newValue, and adminName are required.' });
  }

  // Accept either PascalCase (from frontend) or snake_case
  const col = field
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    .replace(/^_/, '')
    .toLowerCase();

  if (!OVERRIDE_ALLOWED_FIELDS.has(col)) {
    return res.json({ success: false, message: `Field "${field}" is not allowed for override.` });
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT ${col} FROM fabric_movement WHERE record_id = $1`,
      [recordId]
    );

    if (!rows.length) {
      return res.json({ success: false, message: 'Record not found.' });
    }

    const oldValue = rows[0][col];

    await pool.query(
      `UPDATE fabric_movement SET ${col} = $1 WHERE record_id = $2`,
      [newValue, recordId]
    );

    await pool.query(
      `INSERT INTO audit_trail (record_id, action, field, old_value, new_value, performed_by, performed_at)
       VALUES ($1, 'Admin Override', $2, $3, $4, $5, NOW())`,
      [recordId, col, oldValue?.toString() ?? '', newValue.toString(), adminName]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Override error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
