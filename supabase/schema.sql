-- ==========================================================================
--  StudyHub — Supabase schema
--  Run this in the Supabase SQL Editor to create tables and RLS policies.
-- ==========================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Katalog předmětů FIS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fis_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits INT NOT NULL DEFAULT 0,
  "group" TEXT DEFAULT 'povinny',
  available_semesters TEXT[] DEFAULT '{}',
  recommended_semester INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Sdílené předvyplněné předměty ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL,
  semester TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  ai_summary TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by TEXT DEFAULT '',
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT shared_courses_status_check
    CHECK (status IN ('pending', 'validated', 'rejected')),

  CONSTRAINT shared_courses_code_semester_unique
    UNIQUE (code, semester, status)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_shared_courses_lookup
  ON shared_courses (code, semester, status);

-- ── Row Level Security ──────────────────────────────────────────────────────

-- fis_catalog: public read, admin-only write
ALTER TABLE fis_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fis_catalog_select"
  ON fis_catalog FOR SELECT
  USING (true);

-- shared_courses: public read (validated only), public insert, admin-only update/delete
ALTER TABLE shared_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_courses_select_validated"
  ON shared_courses FOR SELECT
  USING (status = 'validated');

CREATE POLICY "shared_courses_insert"
  ON shared_courses FOR INSERT
  WITH CHECK (status = 'pending');

-- ── Grants for anon role ─────────────────────────────────────────────────

GRANT SELECT ON fis_catalog TO anon;
GRANT SELECT, INSERT ON shared_courses TO anon;

-- Admin policies (requires service_role key or Supabase dashboard):
-- UPDATE and DELETE are NOT allowed via anon key.
-- Use the Supabase dashboard or service_role key for admin operations:
--   - Validate: UPDATE shared_courses SET status='validated', validated_at=now() WHERE id=...
--   - Reject:   UPDATE shared_courses SET status='rejected' WHERE id=...
--   - Delete:   DELETE FROM shared_courses WHERE id=...
