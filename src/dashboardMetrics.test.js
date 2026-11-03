import { exceptions, payrollPack, poBoard, weeklyTrend } from './dashboardMetrics';

const po = { po_number: 'PO-1', article_name: 'Oxford', status: 'Active', shirt_qty: 100, trouser_qty: 0, dupatta_qty: 0, po_date: '2026-01-01', delivery_date: '2026-02-01' };
const base = { po_number: 'PO-1', stitcher_code: '0001', stitcher_name: 'Ali', qty_rejected: 0 };

test('only the terminal finishing operation counts toward completion', () => {
  const allocations = [
    { ...base, module_type: 'Stitching', component: 'shirt', qty_allocated: 100, qty_accepted: 80 },
    { ...base, module_type: 'Finishing', component: 'shirt clipping', qty_accepted: 70 },
    { ...base, module_type: 'Finishing', component: 'shirt pressing', qty_accepted: 50, qty_rejected: 10 },
  ];
  const board = poBoard([po], allocations, [], [], new Date('2026-01-15T00:00:00Z'))[0];
  expect(board.finished).toBe(50);
  expect(board.complete).toBe(50);
  expect(board.rejected).toBe(10);
  expect(board.unallocated).toBe(0);
  expect(board.finishingBalance).toBe(30);
});

test('approved rate is per ordered component piece, not the sum of every rate field', () => {
  const board = poBoard([po], [], [], [{ po_number: 'PO-1', status: 'Approved', cutting: 2, shirt: 4, fs_pressing: 3, trouser: 100, total: 109 }])[0];
  expect(board.approvedRate).toBe(9);
});

test('claims are summed by operation before comparing to accepted pieces', () => {
  const allocations = [{ ...base, module_type: 'Finishing', component: 'shirt pressing', qty_accepted: 10, qty_allocated: 12, qty_returned: 10, allocation_date: '2026-01-10' }];
  const payments = [6, 6].map(qty_claimed => ({ ...base, component: 'shirt', operation: 'Pressing', department: 'Finishing Shirt', qty_claimed }));
  expect(exceptions(allocations, payments, [], new Date('2026-01-12T00:00:00Z')).some(issue => issue.severity === 'Claim')).toBe(true);
});

test('payroll preserves paid and unpaid amounts and deducts recorded advances', () => {
  const payments = [
    { ...base, week_ending: '2026-01-17', amount: 300, payment_status: 'Paid' },
    { ...base, week_ending: '2026-01-17', amount: 200, payment_status: 'Verified' },
  ];
  const [row] = payrollPack(payments, [{ ...base, week_ending: '2026-01-17', amount: 100 }], '2026-01-17');
  expect(row).toMatchObject({ gross: 500, advances: 100, net: 400, paid: 300, unpaid: 200 });
});

test('weekly trend separates departments using entry dates', () => {
  const trend = weeklyTrend([
    { entry_date: '2026-01-05', department: 'Stitching', amount: 100 },
    { entry_date: '2026-01-06', department: 'Cutting', amount: 50 },
    { entry_date: '2026-01-07', department: 'Finishing Shirt', amount: 25 },
  ], 2, new Date('2026-01-14T00:00:00Z'));
  expect(trend[0]).toMatchObject({ Stitching: 100, Cutting: 50, Finishing: 25 });
});

test('a payment amount changed after Paid appears in exceptions', () => {
  const audit = [{ entity: 'cmt_payments', record_id: 'pay-1', field: 'amount', old_value: 100, new_value: 120, status_at_change: 'Paid', actor: 'Accounts' }];
  expect(exceptions([], [], [], new Date('2026-01-14T00:00:00Z'), audit)).toEqual([
    expect.objectContaining({ severity: 'Post-pay edit' }),
  ]);
});

test('an approved rate signed by a non-CEO is flagged', () => {
  const rates = [{ po_number: 'PO-2', status: 'Approved', approved_by_ceo: 'Accounts', ceo_approved_at: '2026-01-10', ceo_signoff_valid: false }];
  expect(exceptions([], [], rates).some(issue => issue.severity === 'Approval')).toBe(true);
});
