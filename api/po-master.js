const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const VALID_COMPONENTS = ['shirt', 'trouser', 'dupatta'];

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
      po_number, collection_name, article_name, garment_type,
      po_date, delivery_date, status, remarks,
      shirt_colour, shirt_fabric, shirt_qty,
      trouser_colour, trouser_fabric, trouser_qty,
      dupatta_colour, dupatta_fabric, dupatta_qty,
    } = req.body;

    if (!po_number || !collection_name) {
      return res.json({ success: false, message: 'po_number and collection_name are required.' });
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
           (po_number, collection_name, article_name, garment_type,
            po_date, delivery_date, status, remarks, created_by, created_at,
            shirt_colour, shirt_fabric, shirt_qty, shirt_meters_issued,
            trouser_colour, trouser_fabric, trouser_qty, trouser_meters_issued,
            dupatta_colour, dupatta_fabric, dupatta_qty, dupatta_meters_issued)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(),
                 $10, $11, $12, 0,
                 $13, $14, $15, 0,
                 $16, $17, $18, 0)
         RETURNING *`,
        [
          po_number,
          collection_name,
          article_name      || null,
          garment_type      || null,
          po_date           || null,
          delivery_date     || null,
          status            || 'Active',
          remarks           || null,
          user.name,
          shirt_colour      || null,
          shirt_fabric      || null,
          shirt_qty         != null ? Number(shirt_qty)   : null,
          trouser_colour    || null,
          trouser_fabric    || null,
          trouser_qty       != null ? Number(trouser_qty) : null,
          dupatta_colour    || null,
          dupatta_fabric    || null,
          dupatta_qty       != null ? Number(dupatta_qty) : null,
        ]
      );

      return res.json({ success: true, po: rows[0] });
    } catch (err) {
      console.error('PO Master POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    const { action } = req.body;

    if (action === 'update_meters') {
      if (user.role !== 'PP') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { po_number, component, meters_delta } = req.body;
      if (!po_number || !component || meters_delta == null) {
        return res.json({ success: false, message: 'po_number, component, and meters_delta are required.' });
      }
      if (!VALID_COMPONENTS.includes(component)) {
        return res.json({ success: false, message: 'Invalid component. Must be shirt, trouser, or dupatta.' });
      }
      const col = `${component}_meters_issued`;
      try {
        const result = await pool.query(
          `UPDATE po_master SET ${col} = ${col} + $1 WHERE po_number = $2`,
          [Number(meters_delta), po_number]
        );
        if (result.rowCount === 0) {
          return res.json({ success: false, message: 'PO not found.' });
        }
        return res.json({ success: true });
      } catch (err) {
        console.error('PO Master PUT update_meters error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }

    } else {
      // Existing: status update — Admin/Accounts only
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
        console.error('PO Master PUT status error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
