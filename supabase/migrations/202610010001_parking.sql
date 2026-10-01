-- Server-only schema. The mobile app talks to the authenticated API, never this database directly.
CREATE SCHEMA IF NOT EXISTS parkskopje;
SET search_path TO parkskopje;
 
      CREATE TABLE IF NOT EXISTS places(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, created BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), status TEXT NOT NULL, observed BIGINT NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS votes(proposal_id TEXT REFERENCES proposals(id), session_id TEXT REFERENCES sessions(id), PRIMARY KEY(proposal_id,session_id));
      CREATE TABLE IF NOT EXISTS price_reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), first_hour DOUBLE PRECISION NOT NULL, next_hour DOUBLE PRECISION NOT NULL, observed BIGINT NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS location_reports(place_id TEXT REFERENCES places(id), session_id TEXT REFERENCES sessions(id), present BIGINT NOT NULL, observed BIGINT NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE TABLE IF NOT EXISTS observations(place_id TEXT PRIMARY KEY REFERENCES places(id), operator TEXT NOT NULL, free_spaces BIGINT NOT NULL, observed BIGINT NOT NULL);

      CREATE TABLE IF NOT EXISTS contributions(request_id TEXT NOT NULL, session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, place_id TEXT REFERENCES places(id) ON DELETE CASCADE, UNIQUE(request_id,session_id));
      CREATE TABLE IF NOT EXISTS labels(place_id TEXT REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, code TEXT NOT NULL, created BIGINT NOT NULL, PRIMARY KEY(place_id,session_id));
      CREATE INDEX IF NOT EXISTS labels_by_place ON labels(place_id,created DESC);
      CREATE TABLE IF NOT EXISTS boundaries(place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE, geometry TEXT NOT NULL, updated BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS sign_photos(id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE, session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, hash TEXT NOT NULL, mime TEXT NOT NULL, bytes BYTEA NOT NULL, created BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', info TEXT, model TEXT, attempts BIGINT NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0, lease_until BIGINT NOT NULL DEFAULT 0, UNIQUE(place_id,hash));
      CREATE INDEX IF NOT EXISTS photos_by_place ON sign_photos(place_id,created DESC);
      CREATE INDEX IF NOT EXISTS photo_jobs ON sign_photos(status,next_attempt);
    
CREATE TABLE IF NOT EXISTS profiles(
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL,
      terms_version TEXT NOT NULL, accepted_at BIGINT NOT NULL
    );
REVOKE ALL ON SCHEMA parkskopje FROM PUBLIC;
CREATE INDEX IF NOT EXISTS recent_prices ON price_reports(observed DESC);
CREATE INDEX IF NOT EXISTS recent_reports ON reports(observed DESC);
CREATE INDEX IF NOT EXISTS recent_confirmations ON location_reports(observed DESC);

-- The mobile client uses the authenticated server; these tables stay private.
DO $parking_security$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'parkskopje' LOOP
    EXECUTE format('ALTER TABLE parkskopje.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE parkskopje.%I FROM PUBLIC', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA parkskopje FROM anon';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA parkskopje FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA parkskopje FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA parkskopje FROM authenticated';
  END IF;
END
$parking_security$;
