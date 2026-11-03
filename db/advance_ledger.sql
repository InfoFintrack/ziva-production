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
