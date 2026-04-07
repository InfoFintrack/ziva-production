const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');

const PASSCODE_RE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*-]).{8,}$/;
const PASSCODE_MSG = 'Passcode must be at least 8 characters and include one uppercase letter, one number, and one special character (!@#$%^&*-).';

async function generateUserId(pool) {
  const { rows } = await pool.query(
    `SELECT user_id FROM users WHERE user_id LIKE 'USR-%' ORDER BY user_id DESC LIMIT 1`
  );
  const seq = rows.length ? parseInt(rows[0].user_id.slice(4)) + 1 : 1;
  return `USR-${String(seq).padStart(3, '0')}`;
}

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authenticateToken(req, res);
  if (!user) return;

  const pool = getPool();

  // ── GET /api/users ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        `SELECT user_id, name, role, status FROM users ORDER BY user_id ASC`
      );
      const users = rows.map((u) => ({
        User_ID: u.user_id,
        Name:    u.name,
        Role:    u.role,
        Status:  u.status,
      }));
      return res.json({ success: true, users });
    } catch (err) {
      console.error('Get users error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  // ── POST /api/users — add user ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name, passcode, role } = req.body;
    if (!name?.trim() || !passcode?.toString().trim() || !role) {
      return res.json({ success: false, message: 'Name, passcode, and role are required.' });
    }
    if (!['PP', 'Cutting', 'Admin'].includes(role)) {
      return res.json({ success: false, message: 'Role must be PP, Cutting, or Admin.' });
    }
    if (!PASSCODE_RE.test(passcode.toString())) {
      return res.json({ success: false, message: PASSCODE_MSG });
    }
    try {
      const duplicate = await pool.query(
        `SELECT 1 FROM users WHERE LOWER(name) = LOWER($1)`,
        [name.trim()]
      );
      if (duplicate.rows.length) {
        return res.json({ success: false, message: 'A user with that name already exists.' });
      }
      const userId = await generateUserId(pool);
      await pool.query(
        `INSERT INTO users (user_id, name, passcode, role, status, failed_attempts)
         VALUES ($1, $2, $3, $4, 'Active', 0)`,
        [userId, name.trim(), passcode.toString(), role]
      );
      return res.json({ success: true, userId });
    } catch (err) {
      console.error('Add user error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  // ── PUT /api/users?id=USR-001 — edit or toggle status ──────────────────────
  if (req.method === 'PUT') {
    const userId = req.query.id;
    if (!userId) {
      return res.json({ success: false, message: 'User ID is required as a query parameter (?id=USR-001).' });
    }

    const { name, role, passcode, currentStatus } = req.body;

    try {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE user_id = $1`,
        [userId]
      );
      if (!rows.length) {
        return res.json({ success: false, message: 'User not found.' });
      }

      // Toggle Active ↔ Inactive
      if (currentStatus !== undefined) {
        const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
        await pool.query(
          `UPDATE users
           SET status = $1, failed_attempts = CASE WHEN $1 = 'Active' THEN 0 ELSE failed_attempts END
           WHERE user_id = $2`,
          [newStatus, userId]
        );
        return res.json({ success: true });
      }

      // Edit details
      if (passcode?.toString().trim() && !PASSCODE_RE.test(passcode.toString())) {
        return res.json({ success: false, message: PASSCODE_MSG });
      }
      const setClauses = [];
      const values = [];
      let i = 1;
      if (name?.trim())                  { setClauses.push(`name = $${i++}`);     values.push(name.trim()); }
      if (role)                          { setClauses.push(`role = $${i++}`);     values.push(role); }
      if (passcode?.toString().trim())   { setClauses.push(`passcode = $${i++}`); values.push(passcode.toString()); }

      if (!setClauses.length) {
        return res.json({ success: false, message: 'No fields to update.' });
      }
      values.push(userId);
      await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $${i}`,
        values
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('Update user error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  res.status(405).json({ success: false, message: 'Method not allowed.' });
}
