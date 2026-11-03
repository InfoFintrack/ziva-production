const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');
const { readProductionFlow, recordProductionFlow } = require('./_lib/productionFlow');

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && !(req.method === 'POST' && req.query.type === 'production_flow')) {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

  if (req.query.type === 'production_flow') {
    try {
      if (req.method === 'GET') return res.json({ success: true, ...await readProductionFlow(pool) });
      const result = await recordProductionFlow(pool, user, req.body || {});
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('Production flow error:', err.message);
      return res.status(500).json({ success: false, message: 'Production flow is unavailable.' });
    }
  }

  if (req.query.type === 'financial_audit') {
    if (!['CEO', 'Accounts', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, entity, record_id, field, old_value, new_value, status_at_change, actor, changed_at
         FROM financial_audit ORDER BY changed_at DESC, id DESC LIMIT 200`
      );
      return res.json({ success: true, changes: rows });
    } catch (err) {
      console.error('Financial audit GET error:', err.message);
      return res.status(503).json({ success: false, message: err.code === '42P01' ? 'Financial audit is unavailable until its database migration is applied.' : 'Financial audit is currently unavailable.' });
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM fabric_movement ORDER BY created_at DESC`
    );

    const records = rows.map((r) => ({
      Record_ID:          r.record_id,
      Issue_Date:         r.issue_date,
      PO_Number:          r.po_number,
      JO_Number:          r.jo_number,
      Lot_Number:         r.lot_number,
      Receiving_Vendor:   r.receiving_vendor,
      Garment_Type:       r.garment_type,
      Fabric_Name:        r.fabric_name,
      Fabric_Color:       r.fabric_color,
      Qty_Issued:         r.qty_issued,
      Unit:               r.unit,
      No_of_Thaan:        r.no_of_thaan,
      Issue_Status:       r.issue_status,
      Acceptance_Status:  r.acceptance_status,
      Acceptance_Date:    r.acceptance_date,
      Qty_Received:       r.qty_received,
      Discrepancy:        r.discrepancy,
      Fabric_Condition:   r.fabric_condition,
      Issued_By:          r.issued_by,
      Accepted_By:        r.accepted_by,
      Issue_Remarks:      r.issue_remarks,
      Acceptance_Remarks: r.acceptance_remarks,
      Article:            r.article,
      Fabric_Width:       r.fabric_width,
      Accessories:        r.accessories,
      Laces:              r.laces,
    }));

    res.json({ success: true, records });
  } catch (err) {
    console.error('Get records error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
