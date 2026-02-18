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
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'is_active'
  ) THEN
    EXECUTE 'UPDATE partners SET status = CASE WHEN is_active = true THEN ''active'' ELSE ''inactive'' END WHERE status IS NULL';
  END IF;
END$$;

-- ===== participants =====
-- New columns expected by backend/import
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS nom TEXT,
  ADD COLUMN IF NOT EXISTS prenom TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS statut TEXT;

-- ===== activities =====
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER;

-- Backfill from legacy columns if present (safe for different schema states)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'last_name'
  ) THEN
    EXECUTE 'UPDATE participants SET nom = COALESCE(nom, last_name) WHERE nom IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'first_name'
  ) THEN
    EXECUTE 'UPDATE participants SET prenom = COALESCE(prenom, first_name) WHERE prenom IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'gender'
  ) THEN
    EXECUTE 'UPDATE participants SET genre = COALESCE(genre, gender) WHERE genre IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'phone'
  ) THEN
    EXECUTE 'UPDATE participants SET telephone = COALESCE(telephone, phone) WHERE telephone IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participants' AND column_name = 'status'
  ) THEN
    EXECUTE 'UPDATE participants SET statut = COALESCE(statut, status) WHERE statut IS NULL';
  END IF;
END$$;

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

CREATE INDEX IF NOT EXISTS activities_date_partner_device_idx
  ON activities(activity_date, partner_id, device_id);

CREATE INDEX IF NOT EXISTS activity_participants_participant_idx
  ON activity_participants(participant_id);

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

CREATE TABLE IF NOT EXISTS social_media_kpis (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok')),
  month_date DATE NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  engagement BIGINT NOT NULL DEFAULT 0,
  unique_users BIGINT NOT NULL DEFAULT 0,
  results BIGINT NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (platform, month_date)
);

CREATE INDEX IF NOT EXISTS social_media_kpis_month_idx
  ON social_media_kpis(month_date);

COMMIT;
