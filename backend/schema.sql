-- Schema de reference pour Inside ODC (PostgreSQL)
-- Objectif: aligner les colonnes avec le backend/frontend existant.

CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  objective_beneficiaries INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  color TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','partner','viewer')),
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  activity_date DATE NOT NULL,
  duration_hours INTEGER,
  location TEXT,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  genre TEXT,
  age_range TEXT,
  email TEXT,
  telephone TEXT,
  statut TEXT,
  structure TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Deduplication: email unique si present
CREATE UNIQUE INDEX IF NOT EXISTS participants_email_unique
  ON participants(email)
  WHERE email IS NOT NULL;

-- Deduplication: telephone unique si present
CREATE UNIQUE INDEX IF NOT EXISTS participants_telephone_unique
  ON participants(telephone)
  WHERE telephone IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_participants (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, participant_id)
);

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
