BEGIN;
-- Runtime creates these additive tables on first use. This file documents the
-- schema for database review and can be run ahead of deployment.
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

-- Runtime creates these tables on first ledger/advance use. Set reconciled
-- opening balances for existing workers before relying on closing balances.
CREATE TABLE IF NOT EXISTS advance_ledger_epoch (id SMALLINT PRIMARY KEY CHECK (id=1), activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO advance_ledger_epoch (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS advance_opening (
  stitcher_code CHAR(4) PRIMARY KEY, balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
  set_by VARCHAR(100) NOT NULL, set_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS advance_recoveries (
  payment_id TEXT PRIMARY KEY, stitcher_code CHAR(4) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), week_ending DATE,
  recovered_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE advance_ledger_epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_opening ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_recoveries ENABLE ROW LEVEL SECURITY;

-- Apply before deploying API changes. Requires the same database role used by
-- the API to execute the table triggers and read this log through /api/records.
CREATE TABLE IF NOT EXISTS financial_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('cmt_rates', 'cmt_payments')),
  record_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  status_at_change TEXT,
  actor TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_audit_changed_at_idx ON financial_audit (changed_at DESC);
ALTER TABLE financial_audit ADD COLUMN IF NOT EXISTS status_at_change TEXT;
ALTER TABLE financial_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_audit_service_only ON financial_audit;
CREATE POLICY financial_audit_service_only ON financial_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION log_financial_change() RETURNS trigger AS $$
DECLARE
  actor_name TEXT;
  old_data JSONB;
  new_data JSONB;
  changed_field TEXT;
BEGIN
  actor_name := NULLIF(current_setting('app.audit_actor', true), '');
  IF actor_name IS NULL THEN
    RAISE EXCEPTION 'Financial write is missing an audit actor';
  END IF;
  new_data := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO financial_audit (entity, record_id, field, new_value, actor)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'created', new_data, actor_name);
  ELSE
    old_data := to_jsonb(OLD);
    FOR changed_field IN SELECT jsonb_object_keys(new_data) LOOP
      IF old_data -> changed_field IS DISTINCT FROM new_data -> changed_field THEN
        INSERT INTO financial_audit (entity, record_id, field, old_value, new_value, status_at_change, actor)
        VALUES (TG_TABLE_NAME, NEW.id::text, changed_field,
                old_data -> changed_field, new_data -> changed_field,
                old_data ->> 'payment_status', actor_name);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cmt_rates_financial_audit ON cmt_rates;
CREATE TRIGGER cmt_rates_financial_audit AFTER INSERT OR UPDATE ON cmt_rates
FOR EACH ROW EXECUTE FUNCTION log_financial_change();

DROP TRIGGER IF EXISTS cmt_payments_financial_audit ON cmt_payments;
CREATE TRIGGER cmt_payments_financial_audit AFTER INSERT OR UPDATE ON cmt_payments
FOR EACH ROW EXECUTE FUNCTION log_financial_change();

-- Apply this entire file once in Supabase SQL Editor, as postgres.
-- Existing history is preserved. New writes must satisfy the controls below.
ALTER TABLE cmt_rates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cmt_rates ADD COLUMN IF NOT EXISTS supersedes TEXT;
ALTER TABLE cmt_rates ADD COLUMN IF NOT EXISTS in_app_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmt_payments ADD COLUMN IF NOT EXISTS rate_version_id TEXT;
ALTER TABLE production_stage_events ADD COLUMN IF NOT EXISTS fabric_meters NUMERIC(12,2);
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='cmt_rates'::regclass AND contype='u'
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='cmt_rates'::regclass AND attname='po_number')]::smallint[]
 LOOP EXECUTE format('ALTER TABLE cmt_rates DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cmt_rate_one_pending ON cmt_rates(po_number) WHERE status IN ('Pending_Accounts','Pending_CEO');
CREATE UNIQUE INDEX IF NOT EXISTS cmt_rate_version_unique ON cmt_rates(po_number,version);
CREATE TABLE IF NOT EXISTS po_quantity_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), po_number TEXT NOT NULL, before_values JSONB NOT NULL,
 proposed_values JSONB NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
 requested_by TEXT NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS po_one_pending_quantity ON po_quantity_requests(po_number) WHERE status='Pending';
CREATE TABLE IF NOT EXISTS allocation_rework_events(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),allocation_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),reason TEXT NOT NULL,accepted_by TEXT NOT NULL,accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE allocation_rework_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS patching_links (
 payment_id TEXT PRIMARY KEY, garment TEXT NOT NULL CHECK(garment IN ('shirt','trouser','dupatta')),
 reason TEXT NOT NULL, linked_by TEXT NOT NULL, linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE patching_links ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS payroll_runs (
 week_ending DATE PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('Pending_CEO','Approved','Rejected','Paid')),
 snapshot JSONB NOT NULL, submitted_by TEXT NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 approved_by TEXT, approved_at TIMESTAMPTZ, review_note TEXT, paid_by TEXT, paid_at TIMESTAMPTZ, payout_reference TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_unique_reference ON payroll_runs(lower(trim(payout_reference))) WHERE payout_reference IS NOT NULL;
ALTER TABLE po_quantity_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_audit DROP CONSTRAINT IF EXISTS financial_audit_entity_check;
-- Append-only audit; ordinary application writes may never rewrite history.
CREATE OR REPLACE FUNCTION protect_audit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Change history is append-only'; END $$;
DROP TRIGGER IF EXISTS audit_history_locked ON financial_audit;
CREATE TRIGGER audit_history_locked BEFORE UPDATE OR DELETE ON financial_audit FOR EACH ROW EXECUTE FUNCTION protect_audit_history();
CREATE OR REPLACE FUNCTION log_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_name TEXT; old_data JSONB; new_data JSONB; f TEXT; rid TEXT;
BEGIN
 actor_name:=NULLIF(current_setting('app.audit_actor',true),'');
 IF actor_name IS NULL THEN RAISE EXCEPTION 'Financial write is missing an audit actor'; END IF;
 old_data:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 new_data:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 rid:=COALESCE(new_data->>'id',old_data->>'id',new_data->>'week_ending',old_data->>'week_ending',new_data->>'po_number',old_data->>'po_number',new_data->>'payment_id',old_data->>'payment_id',(new_data->>'article_name')||':'||(new_data->>'component'),(old_data->>'article_name')||':'||(old_data->>'component'));
 IF TG_OP IN ('INSERT','DELETE') THEN
  INSERT INTO financial_audit(entity,record_id,field,old_value,new_value,actor)
   VALUES(TG_TABLE_NAME,rid,lower(TG_OP),NULLIF(old_data,'{}'::jsonb),NULLIF(new_data,'{}'::jsonb),actor_name);
 ELSE
  FOR f IN SELECT jsonb_object_keys(new_data) LOOP
   IF old_data->f IS DISTINCT FROM new_data->f THEN
    INSERT INTO financial_audit(entity,record_id,field,old_value,new_value,status_at_change,actor)
     VALUES(TG_TABLE_NAME,rid,f,old_data->f,new_data->f,COALESCE(old_data->>'payment_status',old_data->>'status'),actor_name);
   END IF;
  END LOOP;
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['po_master','po_quantity_requests','payroll_runs','production_stage_events','article_yield_standards','patching_links','allocation_rework_events'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS controls_change_history ON %I',t);
  EXECUTE format('CREATE TRIGGER controls_change_history AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_financial_change()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION cut_pieces(po TEXT, garment TEXT) RETURNS NUMERIC LANGUAGE SQL STABLE AS $$
 SELECT COALESCE(SUM(quantity),0) FROM production_stage_events WHERE po_number=po AND component=garment AND event_type='Cut'
$$;
CREATE OR REPLACE FUNCTION guard_po_quantities() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE started BOOLEAN; req po_quantity_requests; g TEXT; v NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PO deletion is disabled; cancel the PO with a recorded status change'; END IF;
 IF NEW.po_number IS DISTINCT FROM OLD.po_number THEN RAISE EXCEPTION 'PO numbers cannot be changed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('production:'||OLD.po_number));
 SELECT EXISTS(SELECT 1 FROM production_stage_events WHERE po_number=OLD.po_number AND event_type='Cut') INTO started;
 FOREACH g IN ARRAY ARRAY['shirt','trouser','dupatta'] LOOP
  v:=COALESCE((to_jsonb(NEW)->>(g||'_qty'))::numeric,0);
  IF v<0 OR v<>trunc(v) THEN RAISE EXCEPTION 'PO quantities must be nonnegative whole pieces'; END IF;
  IF to_jsonb(NEW)->(g||'_qty') IS DISTINCT FROM to_jsonb(OLD)->(g||'_qty') AND started THEN
   SELECT * INTO req FROM po_quantity_requests WHERE id::text=current_setting('app.po_quantity_approval',true) AND po_number=OLD.po_number AND status='Approved';
   IF req.id IS NULL OR current_setting('app.actor_role',true) IS DISTINCT FROM 'CEO' OR
     req.proposed_values->(g||'_qty') IS DISTINCT FROM to_jsonb(NEW)->(g||'_qty') THEN
    RAISE EXCEPTION 'Cutting has started. Submit a PO quantity request in Controls for CEO approval.';
   END IF;
  END IF;
  IF v<cut_pieces(OLD.po_number,g) THEN RAISE EXCEPTION '% quantity cannot be below recorded cuts',g; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lock_po_quantities ON po_master;
CREATE TRIGGER lock_po_quantities BEFORE UPDATE OR DELETE ON po_master FOR EACH ROW EXECUTE FUNCTION guard_po_quantities();
-- Only documented, audited CEO approvals qualify as historical in-app approvals.
DROP TRIGGER IF EXISTS immutable_approved_rate ON cmt_rates;
SELECT set_config('app.audit_actor','Migration: documented CEO approval reconciliation',true);
UPDATE cmt_rates r SET in_app_approved=TRUE WHERE status='Approved' AND NOT in_app_approved
 AND EXISTS(SELECT 1 FROM financial_audit a JOIN users u ON u.name=a.actor AND u.role='CEO'
  WHERE a.entity='cmt_rates' AND a.record_id=r.id::text AND a.field='status' AND a.new_value='"Approved"'::jsonb);
CREATE OR REPLACE FUNCTION guard_rate_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Rate history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status IS DISTINCT FROM 'Pending_Accounts' THEN RAISE EXCEPTION 'New rate versions must begin with Accounts review'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='Approved' THEN RAISE EXCEPTION 'Approved rate version is immutable. Create a revision for fresh approval.'; END IF;
 IF NEW.po_number IS DISTINCT FROM OLD.po_number OR NEW.version IS DISTINCT FROM OLD.version THEN RAISE EXCEPTION 'Rate version identity is immutable'; END IF;
 IF NEW.status='Approved' AND (OLD.status<>'Pending_CEO' OR current_setting('app.actor_role',true) IS DISTINCT FROM 'CEO') THEN RAISE EXCEPTION 'Only the CEO can approve a rate inside ProdFlow'; END IF;
 IF NEW.status='Approved' THEN NEW.in_app_approved:=TRUE; ELSE NEW.in_app_approved:=FALSE; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_approved_rate ON cmt_rates;
CREATE TRIGGER immutable_approved_rate BEFORE INSERT OR UPDATE OR DELETE ON cmt_rates FOR EACH ROW EXECUTE FUNCTION guard_rate_version();
CREATE OR REPLACE FUNCTION guard_allocation_cut_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE garment TEXT; allocated NUMERIC; ceiling NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocation deletion is disabled; retain production history'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('production:'||NEW.po_number));
 NEW.component:=lower(trim(NEW.component));
 NEW.module_type:=COALESCE(NEW.module_type,'Stitching');
 IF NEW.module_type NOT IN ('Stitching','Finishing') OR (NEW.module_type='Stitching' AND NEW.component !~ '^(shirt|trouser|dupatta)( patching)?$') OR (NEW.module_type='Finishing' AND NEW.component !~ '^(shirt|trouser|dupatta) (patching|clipping|heming|tussling|pressing)$') THEN RAISE EXCEPTION 'Choose the correct garment operation and production module'; END IF;
 garment:=split_part(NEW.component,' ',1);
 IF garment NOT IN ('shirt','trouser','dupatta') OR NEW.component !~ '^(shirt|trouser|dupatta)( (patching|clipping|heming|tussling|pressing))?$' THEN
  RAISE EXCEPTION 'Choose a garment and operation. Legacy bare patching must be reconciled.';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.po_number<>OLD.po_number OR NEW.component<>lower(trim(OLD.component)) OR NEW.stitcher_code<>OLD.stitcher_code OR NEW.module_type IS DISTINCT FROM OLD.module_type) THEN RAISE EXCEPTION 'Allocation identity cannot change'; END IF;
 IF TG_OP='UPDATE' AND (NEW.qty_accepted<OLD.qty_accepted OR NEW.qty_returned<OLD.qty_returned OR (NEW.qty_rework<OLD.qty_rework AND NOT(COALESCE(current_setting('app.accept_rework',true),'')=NEW.id::text AND NEW.qty_returned=OLD.qty_returned AND NEW.qty_allocated=OLD.qty_allocated AND NEW.qty_accepted-OLD.qty_accepted=OLD.qty_rework-NEW.qty_rework)) OR NEW.qty_rejected<OLD.qty_rejected) THEN RAISE EXCEPTION 'Production returns are cumulative; historic accepted output cannot be reduced'; END IF;
 IF NEW.qty_allocated IS NULL OR NEW.qty_returned IS NULL OR NEW.qty_accepted IS NULL OR NEW.qty_rework IS NULL OR NEW.qty_rejected IS NULL THEN RAISE EXCEPTION 'Allocation quantities cannot be blank'; END IF;
 IF NEW.qty_allocated<=0 OR NEW.qty_allocated<>trunc(NEW.qty_allocated) OR LEAST(NEW.qty_returned,NEW.qty_accepted,NEW.qty_rework,NEW.qty_rejected)<0 OR
  NEW.qty_returned<>trunc(NEW.qty_returned) OR NEW.qty_accepted<>trunc(NEW.qty_accepted) OR NEW.qty_rework<>trunc(NEW.qty_rework) OR NEW.qty_rejected<>trunc(NEW.qty_rejected) OR
  NEW.qty_returned>NEW.qty_allocated OR NEW.qty_accepted+NEW.qty_rework+NEW.qty_rejected<>NEW.qty_returned THEN RAISE EXCEPTION 'Return whole pieces; accepted + rework + rejected must equal returned and stay within allocation'; END IF;
 ceiling:=cut_pieces(NEW.po_number,garment);
 SELECT COALESCE(SUM(qty_allocated),0) INTO allocated FROM stitcher_allocations
  WHERE po_number=NEW.po_number AND lower(trim(component))=NEW.component AND COALESCE(module_type,'Stitching')=COALESCE(NEW.module_type,'Stitching') AND id IS DISTINCT FROM NEW.id;
 IF allocated+NEW.qty_allocated>ceiling THEN RAISE EXCEPTION 'Only % % pieces were cut; this operation already has % allocated. Record verified cuts in Production flow first.',ceiling,garment,allocated; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS allocation_cut_cap ON stitcher_allocations;
CREATE TRIGGER allocation_cut_cap BEFORE INSERT OR UPDATE OR DELETE ON stitcher_allocations FOR EACH ROW EXECUTE FUNCTION guard_allocation_cut_cap();
CREATE OR REPLACE FUNCTION finished_pieces(po TEXT, garment TEXT) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE r cmt_rates; kv RECORD; op_qty NUMERIC; final_qty NUMERIC; sewn NUMERIC; prefix TEXT;
BEGIN
 SELECT * INTO r FROM cmt_rates WHERE po_number=po AND status='Approved' AND in_app_approved ORDER BY version DESC LIMIT 1;
 IF r.id IS NULL THEN RETURN 0; END IF;
 SELECT COALESCE(SUM(qty_accepted),0) INTO sewn FROM stitcher_allocations WHERE po_number=po AND lower(trim(component))=garment AND COALESCE(module_type,'Stitching')='Stitching';
 final_qty:=LEAST(cut_pieces(po,garment),sewn);
 prefix:=CASE garment WHEN 'shirt' THEN 'fs_' WHEN 'trouser' THEN 'ft_' ELSE 'fd_' END;
 FOR kv IN SELECT key,value FROM jsonb_each(to_jsonb(r)) WHERE key LIKE prefix||'%' LOOP
  IF COALESCE((kv.value#>>'{}')::numeric,0)>0 THEN
   SELECT COALESCE(SUM(qty_accepted),0) INTO op_qty FROM stitcher_allocations WHERE po_number=po AND module_type='Finishing' AND lower(trim(component))=garment||' '||substring(kv.key FROM 4);
   final_qty:=LEAST(final_qty,op_qty);
  END IF;
 END LOOP;
 RETURN final_qty;
END $$;
CREATE OR REPLACE FUNCTION guard_stage_cut_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE done NUMERIC; ceiling NUMERIC; terminal TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stage history is immutable; do not edit or delete recorded output'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('production:'||NEW.po_number));
 IF NEW.component NOT IN ('shirt','trouser','dupatta') THEN RAISE EXCEPTION 'Select shirt, trouser or dupatta; patching is an operation on a garment'; END IF;
 IF NEW.event_type IN ('Cut','QC_Packed','Dispatched') THEN
  IF NEW.quantity<=0 OR NEW.quantity<>trunc(NEW.quantity) THEN RAISE EXCEPTION 'Stage quantities must be positive whole pieces'; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO done FROM production_stage_events WHERE po_number=NEW.po_number AND component=NEW.component AND event_type=NEW.event_type;
  IF NEW.event_type='Cut' THEN
   IF NEW.fabric_meters IS NOT NULL THEN
    IF NEW.fabric_meters<=0 OR NEW.fabric_meters+COALESCE((SELECT SUM(fabric_meters) FROM production_stage_events WHERE po_number=NEW.po_number AND component=NEW.component AND event_type='Cut'),0)>COALESCE((SELECT (to_jsonb(p)->>(NEW.component||'_meters_issued'))::numeric FROM po_master p WHERE po_number=NEW.po_number),0) THEN RAISE EXCEPTION 'Cutting-master fabric attribution must stay within issued metres'; END IF;
   END IF;
   SELECT COALESCE((to_jsonb(p)->>(NEW.component||'_qty'))::numeric,0) INTO ceiling FROM po_master p WHERE po_number=NEW.po_number;
  ELSIF NEW.event_type='QC_Packed' THEN
   ceiling:=finished_pieces(NEW.po_number,NEW.component);
  ELSE
   SELECT LEAST(cut_pieces(NEW.po_number,NEW.component),COALESCE(SUM(quantity),0)) INTO ceiling FROM production_stage_events WHERE po_number=NEW.po_number AND component=NEW.component AND event_type='QC_Packed';
  END IF;
  IF ceiling IS NULL OR done+NEW.quantity>ceiling THEN RAISE EXCEPTION 'Stage output exceeds available upstream pieces (%)',COALESCE(ceiling,0); END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stage_cut_cap ON production_stage_events;
CREATE TRIGGER stage_cut_cap BEFORE INSERT OR UPDATE OR DELETE ON production_stage_events FOR EACH ROW EXECUTE FUNCTION guard_stage_cut_cap();
CREATE OR REPLACE FUNCTION guard_payment_controls() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g TEXT; ceiling NUMERIC; claimed NUMERIC; accepted NUMERIC; worker_claimed NUMERIC; allocation_key TEXT; effective_component TEXT; effective_operation TEXT; mapped TEXT; run payroll_runs; r cmt_rates; rate_field TEXT; expected_rate NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment history cannot be deleted'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('payroll:'||NEW.week_ending::text));
 SELECT * INTO run FROM payroll_runs WHERE week_ending=NEW.week_ending;
 IF TG_OP='UPDATE' THEN
  IF OLD.payment_status='Paid' THEN RAISE EXCEPTION 'Paid entries are immutable'; END IF;
  IF NEW.week_ending IS DISTINCT FROM OLD.week_ending OR NEW.po_number<>OLD.po_number OR NEW.stitcher_code<>OLD.stitcher_code OR NEW.department<>OLD.department OR NEW.operation<>OLD.operation OR NEW.component IS DISTINCT FROM OLD.component OR NEW.rate<>OLD.rate OR NEW.rate_version_id IS DISTINCT FROM OLD.rate_version_id THEN RAISE EXCEPTION 'Claim identity and locked rate cannot change'; END IF;
 END IF;
 IF run.status IN ('Pending_CEO','Approved','Paid') THEN
  IF TG_OP='INSERT' OR current_setting('app.payroll_payout',true) IS DISTINCT FROM NEW.week_ending::text OR run.status<>'Approved' OR NEW.payment_status<>'Paid' OR
    (to_jsonb(NEW)-ARRAY['payment_status','payment_date']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payment_status','payment_date']) THEN
   RAISE EXCEPTION 'This payroll week is frozen for CEO approval or already approved. Put late work in a later open payroll week.';
  END IF;
 END IF;
 IF NEW.payment_status='Paid' AND (TG_OP='INSERT' OR OLD.payment_status<>'Verified' OR run.status IS DISTINCT FROM 'Approved' OR current_setting('app.payroll_payout',true) IS DISTINCT FROM NEW.week_ending::text) THEN RAISE EXCEPTION 'Use the CEO-approved payroll payout in Controls to mark payments paid'; END IF;
 IF TG_OP='INSERT' AND NEW.payment_status<>'Pending' THEN RAISE EXCEPTION 'New claims must start Pending'; END IF;
 IF NEW.qty_claimed IS NULL OR NEW.rate IS NULL OR NEW.amount IS NULL OR NEW.week_ending IS NULL THEN RAISE EXCEPTION 'Claim quantity, rate, amount and payroll week are required'; END IF;
 IF NEW.component IS NULL OR length(trim(NEW.component))=0 THEN RAISE EXCEPTION 'A claim must identify its garment'; END IF;
 IF NEW.qty_claimed<=0 OR NEW.qty_claimed<>trunc(NEW.qty_claimed) OR NEW.rate<=0 OR NEW.amount<0 OR NEW.amount<>round(NEW.qty_claimed*NEW.rate,2) THEN RAISE EXCEPTION 'Whole-piece claim and locked rate must determine the amount'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM cmt_rates WHERE id::text=NEW.rate_version_id AND status='Approved' AND in_app_approved AND po_number=NEW.po_number;
  IF r.id IS NULL THEN RAISE EXCEPTION 'An approved rate version must be attached to each new claim'; END IF;
  rate_field:=CASE WHEN NEW.department='Cutting' THEN 'cutting'
   WHEN NEW.department='Stitching' THEN CASE WHEN lower(NEW.operation) LIKE '%patching' THEN 'patching' ELSE lower(NEW.operation) END
   ELSE CASE NEW.department WHEN 'Finishing Shirt' THEN 'fs_' WHEN 'Finishing Trouser' THEN 'ft_' WHEN 'Finishing Dupatta' THEN 'fd_' ELSE '' END||lower(NEW.operation) END;
  expected_rate:=(to_jsonb(r)->>rate_field)::numeric;
  IF expected_rate IS NULL OR expected_rate<=0 OR expected_rate<>NEW.rate THEN RAISE EXCEPTION 'Claim rate does not match its approved rate version'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('production:'||NEW.po_number));
 effective_component:=lower(trim(NEW.component)); effective_operation:=lower(trim(NEW.operation));
 IF NEW.department='Stitching' AND effective_component='patching' THEN
  SELECT garment INTO mapped FROM patching_links WHERE payment_id=NEW.id::text;
  IF mapped IS NULL THEN RAISE EXCEPTION 'Admin must link historical patching to its garment in Controls before payroll approval'; END IF;
  effective_component:=mapped||' patching'; effective_operation:=mapped||' patching';
 END IF;
 IF NEW.department='Stitching' AND effective_operation LIKE '%patching' AND EXISTS(SELECT 1 FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.po_number=NEW.po_number AND p.department='Stitching' AND lower(trim(p.component))='patching' AND l.payment_id IS NULL) THEN RAISE EXCEPTION 'Unlinked historical patching on this PO needs Admin reconciliation in Controls'; END IF;
 FOR g IN SELECT trim(v) FROM unnest(string_to_array(CASE WHEN NEW.department='Cutting' THEN NEW.component ELSE split_part(effective_component,' ',1) END,',')) v LOOP
  IF g NOT IN ('shirt','trouser','dupatta') OR effective_operation='patching' AND NEW.department IN ('Cutting','Stitching') THEN RAISE EXCEPTION 'Patching must name its garment'; END IF;
  ceiling:=cut_pieces(NEW.po_number,g);
  IF NEW.department='Cutting' THEN
   SELECT COALESCE(SUM(quantity),0) INTO accepted FROM production_stage_events WHERE po_number=NEW.po_number AND component=g AND event_type='Cut' AND worker_code=NEW.stitcher_code;
   SELECT COALESCE(SUM(qty_claimed),0), COALESCE(SUM(qty_claimed) FILTER(WHERE stitcher_code=NEW.stitcher_code),0) INTO claimed,worker_claimed FROM cmt_payments WHERE po_number=NEW.po_number AND department='Cutting' AND lower(operation) LIKE '%'||g||'%' AND id IS DISTINCT FROM NEW.id;
  ELSE
   allocation_key:=CASE WHEN NEW.department LIKE 'Finishing%' THEN g||' '||lower(NEW.operation) ELSE effective_component END;
   SELECT COALESCE(SUM(qty_accepted),0) INTO accepted FROM stitcher_allocations WHERE po_number=NEW.po_number AND stitcher_code=NEW.stitcher_code AND lower(trim(component))=allocation_key AND COALESCE(module_type,'Stitching')=CASE WHEN NEW.department LIKE 'Finishing%' THEN 'Finishing' ELSE 'Stitching' END;
   SELECT COALESCE(SUM(qty_claimed),0), COALESCE(SUM(qty_claimed) FILTER(WHERE stitcher_code=NEW.stitcher_code),0) INTO claimed,worker_claimed FROM cmt_payments p LEFT JOIN patching_links l ON l.payment_id=p.id::text WHERE p.po_number=NEW.po_number AND lower(trim(p.department))=lower(trim(NEW.department)) AND (CASE WHEN p.department='Stitching' AND lower(trim(p.component))='patching' THEN l.garment||' patching' ELSE lower(trim(p.operation)) END)=effective_operation AND p.id IS DISTINCT FROM NEW.id;
  END IF;
  IF claimed+NEW.qty_claimed>ceiling THEN RAISE EXCEPTION '%: all claims for this operation must stay within % actual cut pieces',g,ceiling; END IF;
  IF worker_claimed+NEW.qty_claimed>accepted THEN RAISE EXCEPTION '%: worker has only % unclaimed accepted pieces',g,GREATEST(0,accepted-worker_claimed); END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_controls ON cmt_payments;
CREATE TRIGGER payment_controls BEFORE INSERT OR UPDATE OR DELETE ON cmt_payments FOR EACH ROW EXECUTE FUNCTION guard_payment_controls();
CREATE OR REPLACE FUNCTION guard_payroll_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role_name TEXT:=current_setting('app.actor_role',true);
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payroll history cannot be deleted'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('payroll:'||NEW.week_ending::text));
 IF TG_OP='INSERT' THEN
  IF role_name IS NULL OR role_name NOT IN ('Accounts','Admin') OR NEW.status<>'Pending_CEO' THEN RAISE EXCEPTION 'Accounts must submit verified payroll for CEO approval'; END IF;
 ELSE
  IF OLD.status='Paid' THEN RAISE EXCEPTION 'Paid payroll is immutable'; END IF;
  IF NEW.week_ending<>OLD.week_ending THEN RAISE EXCEPTION 'Payroll week identity is immutable'; END IF;
  IF OLD.status='Rejected' AND (NEW.status<>'Pending_CEO' OR role_name IS NULL OR role_name NOT IN ('Accounts','Admin')) THEN RAISE EXCEPTION 'Only Accounts can resubmit rejected payroll'; END IF;
  IF OLD.status='Approved' AND (to_jsonb(NEW)-ARRAY['status','paid_by','paid_at','payout_reference']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','paid_by','paid_at','payout_reference']) THEN RAISE EXCEPTION 'Approved payroll identity and approval are immutable'; END IF;
  IF OLD.status='Approved' AND NOT(NEW.status='Paid' AND role_name IN ('Accounts','Admin') AND NEW.snapshot=OLD.snapshot) THEN RAISE EXCEPTION 'CEO-approved payroll is locked'; END IF;
  IF OLD.status='Pending_CEO' AND NOT(NEW.status IN ('Approved','Rejected') AND role_name='CEO' AND NEW.snapshot=OLD.snapshot) THEN RAISE EXCEPTION 'Only CEO review can change submitted payroll'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payroll_state ON payroll_runs;
CREATE TRIGGER payroll_state BEFORE INSERT OR UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION guard_payroll_state();
CREATE OR REPLACE FUNCTION guard_advance_payroll_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE code TEXT; held_week TEXT; w DATE;
BEGIN
 IF TG_TABLE_NAME='advances' THEN
  w:=COALESCE(NEW.week_ending,OLD.week_ending);
  PERFORM pg_advisory_xact_lock(hashtext('payroll:'||w::text));
 END IF;
 code:=trim(COALESCE(NEW.stitcher_code,OLD.stitcher_code));
 PERFORM pg_advisory_xact_lock(hashtext('advance:'||code));
 SELECT week_ending::text INTO held_week FROM payroll_runs p WHERE status IN ('Pending_CEO','Approved') AND EXISTS
   (SELECT 1 FROM jsonb_array_elements(p.snapshot->'workers') x WHERE x->>'code'=code) LIMIT 1;
 IF held_week IS NOT NULL AND current_setting('app.payroll_payout',true) IS DISTINCT FROM held_week THEN
  RAISE EXCEPTION 'Worker advance balance is reserved by payroll %. Complete payout or CEO rejection first.',held_week;
 END IF;
 IF TG_TABLE_NAME='advances' THEN
  w:=COALESCE(NEW.week_ending,OLD.week_ending);
  PERFORM pg_advisory_xact_lock(hashtext('payroll:'||w::text));
  IF EXISTS(SELECT 1 FROM payroll_runs WHERE week_ending=w AND status IN ('Pending_CEO','Approved','Paid')) THEN RAISE EXCEPTION 'Advances for a submitted or locked payroll week cannot change'; END IF;
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['advances','advance_opening','advance_recoveries'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS advance_payroll_hold ON %I',t);
  EXECUTE format('CREATE TRIGGER advance_payroll_hold BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_advance_payroll_hold()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION guard_patching_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p cmt_payments;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Historical garment links are immutable'; END IF;
 IF COALESCE(current_setting('app.actor_role',true),'') NOT IN ('Admin','CEO') OR length(trim(NEW.reason))=0 THEN RAISE EXCEPTION 'Admin or CEO must record a reason for a historical patching link'; END IF;
 SELECT * INTO p FROM cmt_payments WHERE id::text=NEW.payment_id;
 IF p.id IS NULL OR p.department<>'Stitching' OR lower(trim(p.component))<>'patching' THEN RAISE EXCEPTION 'Only historical unassigned stitching patching can be linked'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('payroll:'||p.week_ending::text));
 IF p.payment_status<>'Paid' AND EXISTS(SELECT 1 FROM payroll_runs WHERE week_ending=p.week_ending AND status IN ('Pending_CEO','Approved','Paid')) THEN RAISE EXCEPTION 'Unpaid patching can only be linked while its payroll week is open'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS patching_link_control ON patching_links;
CREATE TRIGGER patching_link_control BEFORE INSERT OR UPDATE OR DELETE ON patching_links FOR EACH ROW EXECUTE FUNCTION guard_patching_link();
CREATE INDEX IF NOT EXISTS allocations_control_lookup ON stitcher_allocations(po_number,lower(trim(component)),module_type,stitcher_code);
CREATE INDEX IF NOT EXISTS payments_control_lookup ON cmt_payments(po_number,lower(trim(department)),lower(trim(operation)),stitcher_code);
CREATE INDEX IF NOT EXISTS payments_payroll_week ON cmt_payments(week_ending,payment_status);
CREATE INDEX IF NOT EXISTS audit_entity_record ON financial_audit(entity,record_id,id DESC);
DROP TRIGGER IF EXISTS immutable_rework_event ON allocation_rework_events;
CREATE TRIGGER immutable_rework_event BEFORE UPDATE OR DELETE ON allocation_rework_events FOR EACH ROW EXECUTE FUNCTION protect_audit_history();
CREATE TABLE IF NOT EXISTS production_control_version(id INTEGER PRIMARY KEY);
INSERT INTO production_control_version VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE production_control_version ENABLE ROW LEVEL SECURITY;
COMMIT;
