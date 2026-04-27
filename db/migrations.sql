-- Run these migrations against the production database before deploying

-- 1. Add batch_number to po_master
ALTER TABLE po_master ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);

-- 2. Allow NULL on po_accessories.unit (unit dropdown removed from UI)
ALTER TABLE po_accessories ALTER COLUMN unit DROP NOT NULL;
