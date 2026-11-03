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
