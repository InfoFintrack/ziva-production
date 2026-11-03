// Keep the actor setting and the write on the same PostgreSQL connection.
// The financial_audit trigger (db/financial_audit.sql) reads this setting.
async function withAuditedTransaction(pool, actor, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.audit_actor', $1, true)", [actor]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const auditedQuery = (pool, actor, sql, parameters) => withAuditedTransaction(pool, actor, client => client.query(sql, parameters));

module.exports = { auditedQuery, withAuditedTransaction };
