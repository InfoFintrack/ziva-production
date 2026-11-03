import handler from '../api/users';
import { authenticateToken } from '../api/_lib/auth';

jest.mock('../api/_lib/db', () => ({ getPool: jest.fn(() => ({ query: jest.fn() })) }));
jest.mock('../api/_lib/auth', () => ({ authenticateToken: jest.fn() }));

const response = () => ({ code: 200, body: null, setHeader: jest.fn(), status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('Accounts cannot create a CEO user or reset another passcode', async () => {
  authenticateToken.mockReturnValue({ role: 'Accounts', name: 'Accounts One' });
  const add = response();
  await handler({ method: 'POST', query: {}, body: { name: 'New CEO', role: 'CEO', passcode: 'Example1!' } }, add);
  expect(add.code).toBe(403);
  const edit = response();
  await handler({ method: 'PUT', query: { id: 'USR-001' }, body: { passcode: 'Example2!' } }, edit);
  expect(edit.code).toBe(403);
});
