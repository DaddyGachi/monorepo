-- Migration: Payment disputes need a deal_id to trigger deal_escrow's
-- on-chain challenge_rent_release / resolve_rent_dispute calls. payment_id
-- alone does not resolve to a deal (no such lookup exists in this codebase),
-- so the deal being disputed is now captured explicitly at filing time.

ALTER TABLE payment_disputes ADD COLUMN IF NOT EXISTS deal_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_disputes_deal_id ON payment_disputes(deal_id);

COMMENT ON COLUMN payment_disputes.deal_id IS 'deal_escrow deal ID this dispute is challenging a pending rent release for; nullable for disputes filed before this column existed.';
