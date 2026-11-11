const { recordProductionFlow } = require('../api/_lib/productionFlow');

function db() {
  const client = { release: jest.fn(), query: jest.fn(async sql => {
    if (sql.includes('set_config') || sql.includes('pg_advisory_xact_lock')) return {rows:[]};
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
    if (sql.includes('FROM po_master')) return { rows: [{ shirt_qty: 20, shirt_meters_issued: 40 }] };
    if (sql.includes('FROM stitchers')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('GROUP BY event_type')) return { rows: [] };
    if (sql.includes('INSERT INTO production_stage_events')) return { rows: [{ id: 'event-1' }] };
    throw new Error(`Unexpected query: ${sql}`);
  }) };
  return { pool: { query: jest.fn().mockResolvedValue({}), connect: jest.fn().mockResolvedValue(client) }, client };
}

test('cutting events cannot exceed ordered pieces', async () => {
  const { pool, client } = db();
  const result = await recordProductionFlow(pool, { role: 'Cutting', name: 'Zain' }, { type: 'Cut', po_number: 'PO-1', component: 'shirt', quantity: 21, worker_code: '0001' });
  expect(result.status).toBe(400);
  expect(client.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  expect(client.release).toHaveBeenCalled();
});

test('a valid cut records its worker and quantity', async () => {
  const { pool, client } = db();
  const result = await recordProductionFlow(pool, { role: 'Cutting', name: 'Zain' }, { type: 'Cut', po_number: 'PO-1', component: 'shirt', quantity: 10, worker_code: '0001' });
  expect(result).toMatchObject({ status: 200, body: { success: true } });
  expect(client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO production_stage_events'))[1]).toContain('0001');
  expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
});
