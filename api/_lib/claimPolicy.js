class ClaimError extends Error { constructor(message) { super(message); this.status = 400; } }
const positivePieces = value => Number.isInteger(Number(value)) && Number(value) > 0;
const parts = (department, operation, component) => department === 'Cutting'
  ? String(operation).split(',').map(value => value.trim().toLowerCase())
  : [String(component).trim().toLowerCase().split(' ')[0]];

async function claimAvailability(client, claim, excludeId = null) {
  let { po_number, stitcher_code, department, operation, component } = claim;
  if (department === 'Stitching' && String(operation).toLowerCase().endsWith('patching')) {
    const links = await client.query(`SELECT p.id,l.garment FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.po_number=$1 AND p.department='Stitching' AND lower(trim(p.component))='patching'`,[po_number]);
    if (links.rows.some(p=>!p.garment)) throw new ClaimError('Admin must link historical patching to its garment in Controls before further patching claims.');
    if (String(component).toLowerCase()==='patching') {
      const linked=links.rows.find(p=>String(p.id)===String(claim.id));
      if(!linked) throw new ClaimError('Patching must name its garment.');
      component=`${linked.garment} patching`;operation=`${linked.garment} Patching`;
    }
  }
  const { rows: pos } = await client.query('SELECT shirt_qty, trouser_qty, dupatta_qty FROM po_master WHERE po_number=$1', [po_number]);
  if (!pos.length) throw new ClaimError('PO was not found.');
  const availability = [];
  for (const part of parts(department, operation, component)) {
    if (!['shirt', 'trouser', 'dupatta'].includes(part)) throw new ClaimError('This operation needs a matching accepted allocation before it can be claimed.');
    const poOrdered = Number(pos[0][`${part}_qty`] || 0);
    if (!poOrdered) throw new ClaimError(`${part} is not ordered on this PO.`);
    const cutResult = await client.query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM production_stage_events WHERE po_number=$1 AND component=$2 AND event_type='Cut'`, [po_number,part]);
    const ordered = Number(cutResult.rows[0].qty);
    let source;
    if (department === 'Cutting') {
      source = await client.query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM production_stage_events
        WHERE po_number=$1 AND component=$2 AND event_type='Cut' AND worker_code=$3`, [po_number, part, stitcher_code]);
    } else {
      const allocationComponent = department.startsWith('Finishing') ? `${part} ${String(operation).toLowerCase()}` : String(operation).toLowerCase().endsWith('patching') ? String(component).toLowerCase() : part;
      const moduleType = department.startsWith('Finishing') ? 'Finishing' : 'Stitching';
      source = await client.query(`SELECT COALESCE(SUM(qty_accepted),0) AS qty FROM stitcher_allocations
        WHERE po_number=$1 AND LOWER(BTRIM(component))=$2 AND stitcher_code=$3
          AND COALESCE(LOWER(BTRIM(module_type)),'stitching')=LOWER($4)`,
      [po_number, allocationComponent, stitcher_code, moduleType]);
    }
    const accepted = Number(source.rows[0].qty);
    const earlier = department === 'Cutting'
      ? await client.query(`SELECT COALESCE(SUM(qty_claimed),0) AS qty FROM cmt_payments p WHERE po_number=$1 AND stitcher_code=$2 AND department='Cutting' AND LOWER(operation) LIKE $3 AND ($4::text IS NULL OR p.id::text<>$4::text)`, [po_number, stitcher_code, `%${part}%`, excludeId])
      : await client.query(`SELECT COALESCE(SUM(qty_claimed),0) AS qty FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.po_number=$1 AND p.stitcher_code=$2 AND LOWER(BTRIM(p.department))=LOWER(BTRIM($3)) AND (CASE WHEN p.department='Stitching' AND lower(trim(p.component))='patching' THEN l.garment||' patching' ELSE LOWER(BTRIM(p.operation)) END)=LOWER(BTRIM($4)) AND ($5::text IS NULL OR p.id::text<>$5::text)`, [po_number, stitcher_code, department, operation, excludeId]);
    const claimed = Number(earlier.rows[0].qty);
    const total = department === 'Cutting'
      ? await client.query(`SELECT COALESCE(SUM(qty_claimed),0) AS qty FROM cmt_payments p WHERE po_number=$1 AND department='Cutting' AND LOWER(operation) LIKE $2 AND ($3::text IS NULL OR id::text<>$3::text)`, [po_number, `%${part}%`, excludeId])
      : await client.query(`SELECT COALESCE(SUM(qty_claimed),0) AS qty FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.po_number=$1 AND LOWER(BTRIM(p.department))=LOWER(BTRIM($2)) AND (CASE WHEN p.department='Stitching' AND lower(trim(p.component))='patching' THEN l.garment||' patching' ELSE LOWER(BTRIM(p.operation)) END)=LOWER(BTRIM($3)) AND ($4::text IS NULL OR p.id::text<>$4::text)`, [po_number, department, operation, excludeId]);
    const poClaimed = Number(total.rows[0].qty);
    availability.push({ part, accepted, claimed, ordered, poClaimed,
      claimable: Math.max(0, Math.min(accepted - claimed, ordered - poClaimed)) });
  }
  return availability;
}

async function validateClaim(client, claim, excludeId = null) {
  if (!positivePieces(claim.qty_claimed)) throw new ClaimError('Claimed pieces must be a positive whole number.');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${claim.po_number}`]);
  const availability = await claimAvailability(client, claim, excludeId);
  for (const row of availability) {
    if (Number(claim.qty_claimed) > row.accepted - row.claimed) throw new ClaimError(`${row.part}: claimable is ${Math.max(0, row.accepted - row.claimed)} accepted pieces after earlier claims. Check the matching allocation's accepted return.`);
    if (Number(claim.qty_claimed) > row.ordered - row.poClaimed) throw new ClaimError(`${row.part}: claims for this operation would exceed the actual cut quantity of ${row.ordered}.`);
  }
}

module.exports = { ClaimError, claimAvailability, validateClaim };
