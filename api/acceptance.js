const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

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

  const { recordId, qtyReceived, fabricCondition, acceptanceRemarks, acceptedBy } = req.body;

  if (!recordId || qtyReceived === undefined || !acceptedBy) {
    return res.json({ success: false, message: 'Record ID, quantity received, and acceptor are required.' });
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT qty_issued, acceptance_status FROM fabric_movement WHERE record_id = $1`,
      [recordId]
    );

    if (!rows.length) {
      return res.json({ success: false, message: 'Record not found.' });
    }
    if (rows[0].acceptance_status) {
      return res.json({ success: false, message: 'This record has already been accepted.' });
    }

    const qtyIssued   = parseFloat(rows[0].qty_issued);
    const received    = parseFloat(qtyReceived);
    const discrepancy = parseFloat((qtyIssued - received).toFixed(4));

    const acceptanceStatus =
      received === 0   ? 'Rejected' :
      discrepancy <= 0 ? 'Accepted' : 'Partial';

    await pool.query(
      `UPDATE fabric_movement
       SET qty_received       = $1,
           discrepancy        = $2,
           fabric_condition   = $3,
           acceptance_remarks = $4,
           accepted_by        = $5,
           acceptance_status  = $6,
           acceptance_date    = NOW()
       WHERE record_id = $7`,
      [received, discrepancy, fabricCondition, acceptanceRemarks, acceptedBy, acceptanceStatus, recordId]
    );

    await pool.query(
      `INSERT INTO audit_trail (record_id, action, new_value, performed_by, performed_at)
       VALUES ($1, 'Fabric Accepted', $2, $3, NOW())`,
      [recordId, `${acceptanceStatus} — Received: ${received}, Discrepancy: ${discrepancy}`, acceptedBy]
    );

    res.json({ success: true, discrepancy, acceptanceStatus });
  } catch (err) {
    console.error('Acceptance error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
