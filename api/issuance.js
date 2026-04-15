const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

async function generateRecordId(pool) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `REC-${dd}${mm}${yy}-`;
  const { rows } = await pool.query(
    `SELECT record_id FROM fabric_movement WHERE record_id LIKE $1 ORDER BY record_id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].record_id.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

async function generateLotNumber(pool, poNumber) {
  const prefix = `LOT-${poNumber}-`;
  const { rows } = await pool.query(
    `SELECT lot_number FROM fabric_movement WHERE lot_number LIKE $1 ORDER BY lot_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].lot_number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

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

  if (!['PP', 'Admin'].includes(user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const {
    poNumber, joNumber, receivingVendor, garmentType,
    fabricName, fabricColor, qtyIssued, unit,
    noOfThaan, issuedBy, issueRemarks, article,
    fabricWidth, accessories, laces,
  } = req.body;

  if (!poNumber || !fabricName || !qtyIssued || !issuedBy) {
    return res.json({ success: false, message: 'PO number, fabric name, quantity, and issuer are required.' });
  }

  const pool = getPool();

  try {
    const recordId  = await generateRecordId(pool);
    const lotNumber = await generateLotNumber(pool, poNumber);

    await pool.query(
      `INSERT INTO fabric_movement
         (record_id, issue_date, po_number, jo_number, lot_number, receiving_vendor,
          garment_type, fabric_name, fabric_color, qty_issued, unit, no_of_thaan,
          issued_by, issue_remarks, article, fabric_width, accessories, laces,
          issue_status, created_at)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'Issued', NOW())`,
      [recordId, poNumber, joNumber, lotNumber, receivingVendor,
       garmentType, fabricName, fabricColor, qtyIssued, unit,
       noOfThaan, issuedBy, issueRemarks, article,
       fabricWidth || null, accessories || null, laces || null]
    );

    await pool.query(
      `INSERT INTO audit_trail (record_id, action, new_value, performed_by, performed_at)
       VALUES ($1, 'Fabric Issued', $2, $3, NOW())`,
      [recordId, `Lot: ${lotNumber}, Qty: ${qtyIssued} ${unit}`, issuedBy]
    );

    res.json({ success: true, recordId, lotNumber });
  } catch (err) {
    console.error('Issuance error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
