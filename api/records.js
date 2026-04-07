const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

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
    }));

    res.json({ success: true, records });
  } catch (err) {
    console.error('Get records error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
