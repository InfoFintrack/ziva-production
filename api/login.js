const jwt = require('jsonwebtoken');
const { getPool } = require('./_lib/db');

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const { name, passcode } = req.body;
  if (!name || !passcode) {
    return res.json({ success: false, message: 'Name and passcode are required.' });
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE LOWER(name) = LOWER($1)`,
      [name.trim()]
    );

    if (!rows.length) {
      return res.json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];

    if (user.status === 'Inactive') {
      return res.json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    if (user.failed_attempts >= 3) {
      return res.json({ success: false, message: 'Account locked after too many failed attempts. Contact admin.' });
    }

    if (user.passcode !== passcode.toString()) {
      await pool.query(
        `UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = $1`,
        [user.id]
      );
      const attemptsAfter = user.failed_attempts + 1;
      const remaining = 3 - attemptsAfter;
      const msg = remaining > 0
        ? `Incorrect passcode. ${remaining} attempt(s) remaining.`
        : 'Incorrect passcode. Account is now locked.';
      return res.json({ success: false, message: msg });
    }

    await pool.query(`UPDATE users SET failed_attempts = 0 WHERE id = $1`, [user.id]);

    const token = jwt.sign(
      { userId: user.user_id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ success: true, name: user.name, role: user.role, userId: user.user_id, token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
