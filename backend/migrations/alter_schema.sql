-- Migration: align schema with backend/frontend expectations
-- Safe, additive changes with backfills where possible.

BEGIN;

-- ===== devices =====
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ===== partners =====
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS objective_beneficiaries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT;

-- backfill status from is_active if present
UPDATE partners
SET status = CASE WHEN is_active = true THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;

-- ===== participants =====
-- New columns expected by backend/import
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS nom TEXT,
  ADD COLUMN IF NOT EXISTS prenom TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS statut TEXT;

-- ===== activities =====
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER;

-- Backfill from legacy columns if present
UPDATE participants
SET
  nom = COALESCE(nom, last_name),
  prenom = COALESCE(prenom, first_name),
  genre = COALESCE(genre, gender),
  telephone = COALESCE(telephone, phone),
  statut = COALESCE(statut, status)
WHERE
  (nom IS NULL OR prenom IS NULL OR genre IS NULL OR telephone IS NULL OR statut IS NULL);

-- ===== activity_participants =====
-- Add unique constraint on (activity_id, participant_id) for ON CONFLICT DO NOTHING
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activity_participants_unique'
  ) THEN
    ALTER TABLE activity_participants
      ADD CONSTRAINT activity_participants_unique UNIQUE (activity_id, participant_id);
  END IF;
END$$;

-- ===== campagnes =====
CREATE TABLE IF NOT EXISTS campagnes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email','sms')),
  message TEXT NOT NULL,
  status TEXT DEFAULT 'programmee',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_unique
  ON password_reset_tokens(token_hash);

COMMIT;
