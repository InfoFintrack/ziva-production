const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const VALID_DROPDOWN_FIELDS = new Set([
  'garment_type', 'unit', 'fabric_condition', 'receiving_vendor',
]);

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

  // ── GET /api/dropdowns ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        `SELECT category, value FROM dropdowns ORDER BY category, value ASC`
      );
      const group = (cat) => rows.filter((r) => r.category === cat).map((r) => r.value);
      return res.json({
        success:          true,
        garmentTypes:     group('garment_type'),
        units:            group('unit'),
        fabricConditions: group('fabric_condition'),
        receivingVendors: group('receiving_vendor'),
      });
    } catch (err) {
      console.error('Dropdowns GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  // ── POST /api/dropdowns — add a value ──────────────────────────────────────
  if (req.method === 'POST') {
    const { field, value } = req.body;
    if (!VALID_DROPDOWN_FIELDS.has(field) || !value?.trim()) {
      return res.json({ success: false, message: 'Valid field and value are required.' });
    }
    try {
      const exists = await pool.query(
        `SELECT 1 FROM dropdowns WHERE category = $1 AND LOWER(value) = LOWER($2)`,
        [field, value.trim()]
      );
      if (exists.rows.length) {
        return res.json({ success: false, message: 'Value already exists.' });
      }
      await pool.query(
        `INSERT INTO dropdowns (category, value) VALUES ($1, $2)`,
        [field, value.trim()]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('Add dropdown error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  // ── DELETE /api/dropdowns?field=...&value=... — remove a value ─────────────
  if (req.method === 'DELETE') {
    const { field, value } = req.query;
    if (!VALID_DROPDOWN_FIELDS.has(field)) {
      return res.json({ success: false, message: 'Invalid field.' });
    }
    if (!value) {
      return res.json({ success: false, message: 'Value is required.' });
    }
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM dropdowns WHERE category = $1 AND value = $2`,
        [field, decodeURIComponent(value)]
      );
      if (!rowCount) return res.json({ success: false, message: 'Value not found.' });
      return res.json({ success: true });
    } catch (err) {
      console.error('Remove dropdown error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  res.status(405).json({ success: false, message: 'Method not allowed.' });
}
