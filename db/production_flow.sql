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
