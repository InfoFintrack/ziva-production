const { claimAvailability, validateClaim } = require('../api/_lib/claimPolicy');

const claim = { po_number: 'PO-1', stitcher_code: '0001', department: 'Stitching', operation: 'Shirt', component: 'shirt' };

function client(accepted, earlier, allClaimed, ordered = 200) {
  return { query: jest.fn(async sql => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('FROM po_master')) return { rows: [{ shirt_qty: ordered, trouser_qty: 0, dupatta_qty: 0 }] };
    if (sql.includes('FROM stitcher_allocations')) return { rows: [{ qty: accepted }] };
    if (sql.includes('FROM cmt_payments') && sql.includes('stitcher_code')) return { rows: [{ qty: earlier }] };
    if (sql.includes('FROM cmt_payments')) return { rows: [{ qty: allClaimed }] };
    throw new Error(`Unexpected query: ${sql}`);
  }) };
}

test('claimable output subtracts earlier claims', async () => {
  await expect(validateClaim(client(50, 20, 20), { ...claim, qty_claimed: 30 })).resolves.toBeUndefined();
  await expect(validateClaim(client(50, 20, 20), { ...claim, qty_claimed: 31 })).rejects.toThrow('claimable is 30');
});

test('PO cap applies across workers even when an allocation is oversized', async () => {
  await expect(validateClaim(client(200, 0, 180, 200), { ...claim, qty_claimed: 30 })).rejects.toThrow('exceed the PO quantity');
});

test('rework or rejected pieces never increase claimable quantity', async () => {
  await expect(validateClaim(client(0, 0, 0), { ...claim, qty_claimed: 1 })).rejects.toThrow('claimable is 0');
});

test('patching claims use accepted patching output and a garment-order cap', async () => {
  await expect(validateClaim(client(8, 3, 3), { ...claim, operation: 'Patching', component: 'patching', qty_claimed: 5 })).resolves.toBeUndefined();
  await expect(validateClaim(client(8, 3, 3), { ...claim, operation: 'Patching', component: 'patching', qty_claimed: 6 })).rejects.toThrow('claimable is 5');
});

test('availability preview uses the same accepted, earlier-claim and PO limits as submission', async () => {
  const db = client(28, 5, 80, 100);
  await expect(claimAvailability(db, { ...claim, department: 'Finishing Shirt', operation: 'Clipping', component: 'shirt' }))
    .resolves.toMatchObject([{ part: 'shirt', accepted: 28, claimed: 5, claimable: 20 }]);
  expect(db.query.mock.calls.some(([sql]) => sql.includes('pg_advisory_xact_lock'))).toBe(false);
});
