const { auditedQuery } = require('../api/_lib/auditedQuery');

test('the financial write and its actor share one committed connection', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }), release: jest.fn() };
  const pool = { connect: jest.fn().mockResolvedValue(client) };
  await auditedQuery(pool, 'Accounts', 'UPDATE cmt_payments SET amount=$1 WHERE id=$2', [150, 'payment-1']);
  expect(client.query.mock.calls).toEqual([
    ['BEGIN'],
    ["SELECT set_config('app.audit_actor', $1, true)", ['Accounts']],
    ['UPDATE cmt_payments SET amount=$1 WHERE id=$2', [150, 'payment-1']],
    ['COMMIT'],
  ]);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test('a failed audited write rolls back', async () => {
  const client = { query: jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce({}), release: jest.fn() };
  await expect(auditedQuery({ connect: async () => client }, 'CEO', 'UPDATE cmt_rates SET status=$1', ['Approved'])).rejects.toThrow('write failed');
  expect(client.query.mock.calls[3]).toEqual(['ROLLBACK']);
  expect(client.release).toHaveBeenCalledTimes(1);
});
