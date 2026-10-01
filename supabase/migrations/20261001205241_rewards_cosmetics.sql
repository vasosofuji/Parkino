-- Stable account ownership preserves earned selections through guest upgrades.
CREATE TABLE parkskopje.account_cosmetics (
  session_id text PRIMARY KEY REFERENCES parkskopje.sessions(id) ON DELETE CASCADE,
  palette text NOT NULL DEFAULT 'default' CHECK (palette IN ('default','ocean','plum')),
  accent text NOT NULL DEFAULT 'default' CHECK (accent IN ('default','gold','violet'))
);
ALTER TABLE parkskopje.account_cosmetics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parkskopje.account_cosmetics FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON parkskopje.account_cosmetics FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON parkskopje.account_cosmetics FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='parkino_api') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON parkskopje.account_cosmetics TO parkino_api;
    CREATE POLICY api_access ON parkskopje.account_cosmetics FOR ALL TO parkino_api USING (true) WITH CHECK (true);
  END IF;
END $$;
