const COMPONENTS = ['shirt', 'trouser', 'dupatta'];
const STAGES = ['Cut', 'QC_Packed', 'Dispatched', 'Vendor_Issue', 'Vendor_Return'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS production_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(50) NOT NULL,
  component VARCHAR(20) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(10) NOT NULL,
  vendor_name VARCHAR(100),
  vendor_process VARCHAR(30),
  issue_id UUID,
  worker_code CHAR(4),
  recorded_by VARCHAR(100) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS production_events_po_idx ON production_stage_events (po_number, component, event_type);
CREATE TABLE IF NOT EXISTS article_yield_standards (
  article_name VARCHAR(100) NOT NULL,
  component VARCHAR(20) NOT NULL,
  meters_per_piece NUMERIC(12,4) NOT NULL CHECK (meters_per_piece > 0),
  updated_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_name, component)
);
ALTER TABLE production_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_yield_standards ENABLE ROW LEVEL SECURITY;
`;

async function ensureProductionFlow(pool) { await pool.query(SCHEMA); }

async function readProductionFlow(pool) {
  await ensureProductionFlow(pool);
  const [events, standards] = await Promise.all([
    pool.query('SELECT * FROM production_stage_events ORDER BY occurred_at DESC, created_at DESC'),
    pool.query('SELECT * FROM article_yield_standards ORDER BY article_name, component'),
  ]);
  return { events: events.rows, standards: standards.rows };
}

const bad = message => ({ status: 400, body: { success: false, message } });

async function recordProductionFlow(pool, user, body) {
  await ensureProductionFlow(pool);
  if (body.type === 'Yield_Standard') {
    if (user.role !== 'Admin') return { status: 403, body: { success: false, message: 'Admin access required.' } };
    const article = String(body.article_name || '').trim();
    const component = String(body.component || '').toLowerCase();
    const standard = Number(body.meters_per_piece);
    if (!article || !COMPONENTS.includes(component) || !Number.isFinite(standard) || standard <= 0) return bad('Article, component and positive metres per piece are required.');
    const { rows } = await pool.query(`INSERT INTO article_yield_standards (article_name, component, meters_per_piece, updated_by)
      VALUES ($1,$2,$3,$4) ON CONFLICT (article_name, component) DO UPDATE SET meters_per_piece=EXCLUDED.meters_per_piece, updated_by=EXCLUDED.updated_by, updated_at=NOW() RETURNING *`, [article, component, standard, user.name]);
    return { status: 200, body: { success: true, standard: rows[0] } };
  }
  const type = String(body.type || '');
  const roleMap = { Cut: ['Cutting', 'Admin'], QC_Packed: ['Finishing', 'Admin'], Dispatched: ['PP', 'Admin'], Vendor_Issue: ['PP', 'Admin'], Vendor_Return: ['PP', 'Admin'] };
  if (!STAGES.includes(type)) return bad('Unknown production event.');
  if (!roleMap[type].includes(user.role)) return { status: 403, body: { success: false, message: 'Access denied.' } };
  const po = String(body.po_number || '').trim();
  const component = String(body.component || '').toLowerCase();
  const quantity = Number(body.quantity);
  const vendor = String(body.vendor_name || '').trim();
  const process = String(body.vendor_process || '');
  if (!po || !(type === 'Cut' ? [...COMPONENTS, 'patching'] : COMPONENTS).includes(component) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity * 100)) return bad('PO, component and a positive quantity with at most two decimals are required.');
  if (['Cut', 'QC_Packed', 'Dispatched'].includes(type) && !Number.isInteger(quantity)) return bad('Piece quantities must be whole numbers.');
  if (type.startsWith('Vendor_') && (!vendor || !['Dyeing', 'Embroidery'].includes(process))) return bad('Vendor name and Dyeing or Embroidery are required.');
  if (type === 'Vendor_Return' && !body.issue_id) return bad('Choose the original vendor issue for this receipt.');
  const workerCode = String(body.worker_code || '').trim();
  if (type === 'Cut' && !workerCode) return bad('Cutting master code is required.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pos } = await client.query('SELECT * FROM po_master WHERE po_number=$1 FOR UPDATE', [po]);
    if (!pos.length) { await client.query('ROLLBACK'); return bad('PO not found.'); }
    if (type === 'Cut') {
      const worker = await client.query('SELECT 1 FROM stitchers WHERE stitcher_code=$1', [workerCode]);
      if (!worker.rows.length) { await client.query('ROLLBACK'); return bad('Cutting master code was not found.'); }
    }
    const ordered = component === 'patching'
      ? Math.max(...COMPONENTS.map(key => Number(pos[0][`${key}_qty`] || 0)))
      : Number(pos[0][`${component}_qty`] || 0);
    const issuedMeters = Number(pos[0][`${component}_meters_issued`] || 0);
    const totals = await client.query(`SELECT event_type, COALESCE(SUM(quantity),0) AS total FROM production_stage_events
      WHERE po_number=$1 AND component=$2 GROUP BY event_type`, [po, component]);
    const total = key => Number(totals.rows.find(row => row.event_type === key)?.total || 0);
    let limit;
    if (type === 'Cut') limit = ordered - total('Cut');
    if (type === 'QC_Packed') {
      const terminal = { shirt: 'shirt pressing', trouser: 'trouser patching', dupatta: 'dupatta patching' }[component];
      const accepted = await client.query(`SELECT COALESCE(SUM(qty_accepted),0) AS qty FROM stitcher_allocations WHERE po_number=$1 AND component=$2 AND module_type='Finishing'`, [po, terminal]);
      limit = Math.min(ordered, Number(accepted.rows[0].qty)) - total('QC_Packed');
    }
    if (type === 'Dispatched') limit = total('QC_Packed') - total('Dispatched');
    let issueId = null;
    if (type === 'Vendor_Issue') limit = issuedMeters - (total('Vendor_Issue') - total('Vendor_Return'));
    if (type === 'Vendor_Return') {
      issueId = String(body.issue_id);
      const issue = await client.query(`SELECT quantity, vendor_name, vendor_process FROM production_stage_events WHERE id=$1 AND po_number=$2 AND component=$3 AND event_type='Vendor_Issue'`, [issueId, po, component]);
      if (!issue.rows.length || issue.rows[0].vendor_name !== vendor || issue.rows[0].vendor_process !== process) { await client.query('ROLLBACK'); return bad('Vendor receipt does not match its issue.'); }
      const returned = await client.query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM production_stage_events WHERE issue_id=$1 AND event_type='Vendor_Return'`, [issueId]);
      limit = Number(issue.rows[0].quantity) - Number(returned.rows[0].qty);
    }
    if (quantity > Math.max(0, limit)) { await client.query('ROLLBACK'); return bad(`Only ${Math.max(0, limit)} ${type.startsWith('Vendor_') ? 'metres' : 'pieces'} remain available for this event.`); }
    const { rows } = await client.query(`INSERT INTO production_stage_events
      (po_number, component, event_type, quantity, unit, vendor_name, vendor_process, issue_id, worker_code, recorded_by, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [po, component, type, quantity, type.startsWith('Vendor_') ? 'Meters' : 'Pieces', vendor || null, process || null, issueId, workerCode || null, user.name, body.occurred_at || new Date().toISOString()]);
    await client.query('COMMIT');
    return { status: 200, body: { success: true, event: rows[0] } };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

module.exports = { ensureProductionFlow, readProductionFlow, recordProductionFlow };
