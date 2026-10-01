SET search_path TO parkskopje;

-- Guest consent is separate from public usernames. Upgrades keep sessions.id.
CREATE TABLE IF NOT EXISTS guest_profiles (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at BIGINT NOT NULL
);
ALTER TABLE guest_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE guest_profiles FROM PUBLIC;
DO $guest_security$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE parkskopje.guest_profiles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE parkskopje.guest_profiles FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='parkino_api') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE parkskopje.guest_profiles TO parkino_api;
    CREATE POLICY api_access ON parkskopje.guest_profiles TO parkino_api USING (true) WITH CHECK (true);
  END IF;
END
$guest_security$;
