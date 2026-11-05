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

test.each([
  ['Zain stitching', 'Cutting', 'Stitching', 'Shirt', 5, 375, 'shirt'],
  ['Waqas finishing', 'Finishing', 'Finishing Shirt', 'Clipping', 28, 10, 'shirt clipping'],
])('%s can log accepted pieces without weakening claim controls', async (_label, role, department, operation, quantity, rate, allocationComponent) => {
  authenticateToken.mockReturnValue({ role, name: _label });
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    if (sql.includes('FROM po_master')) return { rows: [{ shirt_qty: 100, trouser_qty: 0, dupatta_qty: 0 }] };
    if (sql.includes('FROM stitcher_allocations')) return { rows: [{ qty: quantity }] };
    if (sql.includes('FROM cmt_payments')) return { rows: [{ qty: 0 }] };
    if (sql.includes('INSERT INTO cmt_payments')) return { rows: [{ id: 'new-payment', qty_claimed: quantity }] };
    return { rows: [] };
  }) };
  getPool.mockReturnValue({ query: jest.fn(async sql => {
    if (sql.includes('FROM stitchers')) return { rows: [{ id: 'worker-id', name: 'Worker' }] };
    if (sql.includes('FROM cmt_rates')) return { rows: [{ rate }] };
    return { rows: [] };
  }), connect: jest.fn().mockResolvedValue(client) });
  const res = response();
  await handler({ method: 'POST', query: {}, body: { po_number: 'PO-1', stitcher_code: '0001', department, operation, qty_claimed: quantity } }, res);
  expect(res.body).toMatchObject({ success: true, payment: { qty_claimed: quantity } });
  const allocationQuery = client.query.mock.calls.find(([sql]) => sql.includes('FROM stitcher_allocations'));
  expect(allocationQuery[0]).toContain('LOWER(BTRIM(component))');
  expect(allocationQuery[1][1]).toBe(allocationComponent);
  expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
});
