const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

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
      const conditions = [];
      const values = [];
      let paramIdx = 1;

      if (req.query.status) {
        conditions.push(`status = $${paramIdx++}`);
        values.push(req.query.status);
      }
      if (req.query.po_number) {
        conditions.push(`po_number = $${paramIdx++}`);
        values.push(req.query.po_number);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM cmt_rates ${where} ORDER BY created_at DESC`,
        values
      );
      return res.json({ success: true, rates: rows });
    } catch (err) {
      console.error('CMT Rates GET error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'POST') {
    if (!['Cutting', 'Stitching', 'Admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const {
      po_number, color_design, cutting, shirt, trouser, dupatta, patching,
      fs_clipping, fs_heming, fs_tussling, fs_pressing,
      ft_clipping, ft_heming, ft_pressing, ft_patching,
      fd_heming, fd_tussling, fd_pressing, fd_patching,
      quality_packing, remarks,
    } = req.body;

    if (!po_number) {
      return res.json({ success: false, message: 'po_number is required.' });
    }

    try {
      // Verify po_number exists in po_master
      const { rows: poCheck } = await pool.query(
        `SELECT id FROM po_master WHERE po_number = $1`,
        [po_number]
      );
      if (!poCheck.length) {
        return res.json({ success: false, message: 'PO number does not exist in po_master.' });
      }

      // Ensure po_number not already in cmt_rates
      const { rows: existing } = await pool.query(
        `SELECT id FROM cmt_rates WHERE po_number = $1`,
        [po_number]
      );
      if (existing.length) {
        return res.json({ success: false, message: 'CMT rates for this PO number already exist.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO cmt_rates
           (po_number, color_design, cutting, shirt, trouser, dupatta, patching,
            fs_clipping, fs_heming, fs_tussling, fs_pressing,
            ft_clipping, ft_heming, ft_pressing, ft_patching,
            fd_heming, fd_tussling, fd_pressing, fd_patching,
            quality_packing, remarks, status, submitted_by, submitted_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())
         RETURNING *`,
        [
          po_number,
          color_design    || null,
          cutting         || 0,
          shirt           || 0,
          trouser         || 0,
          dupatta         || 0,
          patching        || 0,
          fs_clipping     || 0,
          fs_heming       || 0,
          fs_tussling     || 0,
          fs_pressing     || 0,
          ft_clipping     || 0,
          ft_heming       || 0,
          ft_pressing     || 0,
          ft_patching     || 0,
          fd_heming       || 0,
          fd_tussling     || 0,
          fd_pressing     || 0,
          fd_patching     || 0,
          quality_packing || 0,
          remarks         || null,
          'Pending_Accounts',
          user.name,
        ]
      );

      return res.json({ success: true, rate: rows[0] });
    } catch (err) {
      console.error('CMT Rates POST error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else if (req.method === 'PUT') {
    const { id, action, remarks } = req.body;
    if (!id || !action) {
      return res.json({ success: false, message: 'id and action are required.' });
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.json({ success: false, message: 'action must be "approve" or "reject".' });
    }
    if (!['Accounts', 'CEO'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    try {
      const { rows: current } = await pool.query(
        `SELECT status FROM cmt_rates WHERE id = $1`,
        [id]
      );
      if (!current.length) {
        return res.json({ success: false, message: 'Rate not found.' });
      }

      const currentStatus = current[0].status;

      if (currentStatus === 'Approved') {
        return res.json({ success: false, error: 'Rate is locked and cannot be modified' });
      }

      if (user.role === 'Accounts') {
        if (currentStatus !== 'Pending_Accounts') {
          return res.json({ success: false, message: 'Rate is not pending Accounts review.' });
        }
        if (action === 'approve') {
          await pool.query(
            `UPDATE cmt_rates
             SET status = 'Pending_CEO', approved_by_accounts = $1, accounts_approved_at = NOW()
             WHERE id = $2`,
            [user.name, id]
          );
        } else {
          await pool.query(
            `UPDATE cmt_rates
             SET status = 'Rejected', accounts_remarks = $1
             WHERE id = $2`,
            [remarks || null, id]
          );
        }

      } else if (user.role === 'CEO') {
        if (currentStatus !== 'Pending_CEO') {
          return res.json({ success: false, message: 'Rate is not pending CEO review.' });
        }
        if (action === 'approve') {
          await pool.query(
            `UPDATE cmt_rates
             SET status = 'Approved', approved_by_ceo = $1, ceo_approved_at = NOW()
             WHERE id = $2`,
            [user.name, id]
          );
        } else {
          await pool.query(
            `UPDATE cmt_rates
             SET status = 'Rejected', ceo_remarks = $1
             WHERE id = $2`,
            [remarks || null, id]
          );
        }
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('CMT Rates PUT error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }
}
