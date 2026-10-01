SET search_path TO parkskopje;
CREATE TABLE IF NOT EXISTS contribution_details(place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, details TEXT NOT NULL, created BIGINT NOT NULL);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS free_spaces INTEGER CHECK (free_spaces BETWEEN 0 AND 100000);
CREATE TABLE IF NOT EXISTS capacity_reports(place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 0 AND 100000), updated BIGINT NOT NULL, PRIMARY KEY(place_id,session_id));
CREATE TABLE IF NOT EXISTS account_credentials(
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions(
  hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created BIGINT NOT NULL, expires BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(session_id);
CREATE TABLE IF NOT EXISTS reward_events(
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL, kind TEXT NOT NULL, points INTEGER NOT NULL CHECK (points>0),
  created BIGINT NOT NULL, PRIMARY KEY(session_id,event_key)
);
CREATE INDEX IF NOT EXISTS reward_events_recent ON reward_events(session_id,created DESC);
CREATE TABLE IF NOT EXISTS sign_confirmations(
  photo_id TEXT PRIMARY KEY REFERENCES sign_photos(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  info TEXT NOT NULL, confirmed BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sign_uploaders(
  photo_id TEXT NOT NULL REFERENCES sign_photos(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY(photo_id,session_id)
);
DO $security$
DECLARE name TEXT;
BEGIN
  FOREACH name IN ARRAY ARRAY['account_credentials','auth_sessions','reward_events','sign_confirmations','sign_uploaders','capacity_reports','contribution_details'] LOOP
    EXECUTE format('ALTER TABLE parkskopje.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('REVOKE ALL ON TABLE parkskopje.%I FROM PUBLIC', name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE parkskopje.%I FROM anon', name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE parkskopje.%I FROM authenticated', name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='parkino_api') THEN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE parkskopje.%I TO parkino_api', name);
      EXECUTE format('CREATE POLICY api_access ON parkskopje.%I TO parkino_api USING (true) WITH CHECK (true)', name);
    END IF;
  END LOOP;
END
$security$;
