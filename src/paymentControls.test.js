import handler from '../api/cmt-payments';
import { getPool } from '../api/_lib/db';
import { authenticateToken } from '../api/_lib/auth';

jest.mock('../api/_lib/db', () => ({ getPool: jest.fn() }));
jest.mock('../api/_lib/auth', () => ({ authenticateToken: jest.fn() }));

function response() {
  return { code: 200, body: null, setHeader: jest.fn(), end: jest.fn(), status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

function poolFor(payment) {
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    if (sql.includes('SELECT * FROM cmt_payments WHERE id=')) return { rows: [payment] };
    return { rows: [], rowCount: 0 };
  }) };
  getPool.mockReturnValue({ query: jest.fn().mockResolvedValue({}), connect: jest.fn().mockResolvedValue(client) });
  return client;
}

beforeEach(() => { authenticateToken.mockReturnValue({ role: 'Accounts', name: 'Accounts One' }); });

test('payment cannot skip verification', async () => {
  const client = poolFor({ id: 'p1', payment_status: 'Pending', verified_by: null });
  const res = response();
  await handler({ method: 'PUT', query: {}, body: { action: 'pay', id: 'p1' } }, res);
  expect(res.code).toBe(400);
  expect(res.body.message).toContain('Verified');
  expect(client.query.mock.calls.some(([sql]) => sql.includes("SET payment_status='Paid'"))).toBe(false);
});

test('paid claims cannot be edited', async () => {
  const client = poolFor({ id: 'p1', payment_status: 'Paid' });
  const res = response();
  await handler({ method: 'PUT', query: {}, body: { action: 'edit', id: 'p1', qty_claimed: 100 } }, res);
  expect(res.code).toBe(400);
  expect(res.body.message).toContain('cannot be edited');
  expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE cmt_payments'))).toBe(false);
});
