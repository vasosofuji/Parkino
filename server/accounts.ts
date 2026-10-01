import type { ParkingStore } from "./store";
import { eligibleCosmetics, type CosmeticsUpdate } from "../src/domain/cosmetics";
import { checkCosmetics } from "./cosmetics";
import {
  cleanUsername, TERMS_VERSION, usernameKey, validUsername, REWARD_POINTS,
  type Profile, type AuthResult, type Rewards, type RewardKind,
} from "../src/domain/account";
import {
  accountError, AUTH_SESSION_MS, freshToken, hashPassword, tokenHash, verifyPassword,
} from "./account-security";

export const ACCOUNT_TABLES = `
  CREATE TABLE IF NOT EXISTS profiles(
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL,
    terms_version TEXT NOT NULL, accepted_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS guest_profiles(
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL, accepted_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS account_cosmetics(
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    palette TEXT NOT NULL DEFAULT 'default' CHECK(palette IN ('default','ocean','plum')),
    accent TEXT NOT NULL DEFAULT 'default' CHECK(accent IN ('default','gold','violet')));
  CREATE TABLE IF NOT EXISTS account_credentials(
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_sessions(
    hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created INTEGER NOT NULL, expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(session_id);
  CREATE TABLE IF NOT EXISTS reward_events(
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL, kind TEXT NOT NULL, points INTEGER NOT NULL, created INTEGER NOT NULL,
    PRIMARY KEY(session_id,event_key));
  CREATE INDEX IF NOT EXISTS reward_events_recent ON reward_events(session_id,created DESC);
`;
export const PROFILE_QUERY = `SELECT p.*,
  s.palette,s.accent,
  0 AS guest,
  CASE WHEN c.session_id IS NULL THEN 0 ELSE 1 END AS secured,
  COALESCE((SELECT SUM(points) FROM reward_events r WHERE r.session_id=p.session_id),0) AS points
  FROM profiles p LEFT JOIN account_credentials c ON c.session_id=p.session_id
  LEFT JOIN account_cosmetics s ON s.session_id=p.session_id WHERE p.session_id=?`;
export const GUEST_PROFILE_QUERY = `SELECT g.session_id, '' AS username, g.terms_version, g.accepted_at,
  s.palette,s.accent,
  0 AS secured, 1 AS guest, COALESCE((SELECT SUM(points) FROM reward_events r WHERE r.session_id=g.session_id),0) AS points
  FROM guest_profiles g LEFT JOIN account_cosmetics s ON s.session_id=g.session_id WHERE g.session_id=?`;
export type ProfileRow = {
  session_id: string; username: string; terms_version: string; accepted_at: number;
  secured: number; points: number; guest?: number; palette?: string; accent?: string;
};
export function toProfile(row?: ProfileRow): Profile | null {
  return row ? {
    id: row.session_id, username: row.username, termsVersion: row.terms_version,
    acceptedAt: new Date(row.accepted_at).toISOString(), secured: Boolean(row.secured),
    points: Number(row.points), guest: Boolean(row.guest),
    cosmetics: eligibleCosmetics(Number(row.points), row.palette, row.accent),
  } : null;
}
export function checkRegistration(username: string, termsVersion: string, accepted: boolean) {
  if (!validUsername(username) || !accepted || termsVersion !== TERMS_VERSION)
    throw accountError("Choose a valid username and accept the current Terms of Service.");
}

export class AccountStore {
  constructor(private store: ParkingStore) {
    store.db.exec(ACCOUNT_TABLES);
  }
  profile(token: string): Profile | null {
    return this.byId(this.store.session(token).id);
  }
  private byId(id: string) {
    return toProfile((this.store.db.prepare(PROFILE_QUERY).get(id) ??
      this.store.db.prepare(GUEST_PROFILE_QUERY).get(id)) as ProfileRow | undefined);
  }
  guest(token: string, termsVersion: string, accepted: boolean): Profile {
    if (!accepted || termsVersion !== TERMS_VERSION) throw accountError("Accept the current Terms of Service first.");
    const user = this.store.session(token);
    const existing = this.byId(user.id);
    if (existing && !existing.guest) {
      if (existing.termsVersion !== TERMS_VERSION) this.store.db.prepare("UPDATE profiles SET terms_version=?,accepted_at=? WHERE session_id=?").run(TERMS_VERSION, Date.now(), user.id);
      return this.byId(user.id)!;
    }
    this.store.db.prepare(`INSERT INTO guest_profiles VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET
      accepted_at=CASE WHEN guest_profiles.terms_version=excluded.terms_version THEN guest_profiles.accepted_at ELSE excluded.accepted_at END,
      terms_version=excluded.terms_version`).run(user.id, TERMS_VERSION, Date.now());
    return this.byId(user.id)!;
  }
  available(username: string) {
    return validUsername(username) && !this.store.db
      .prepare("SELECT 1 FROM profiles WHERE username_key=?").get(usernameKey(username));
  }
  cosmetics(token: string, update: CosmeticsUpdate): Profile {
    const user = this.store.session(token);
    const next = checkCosmetics(this.byId(user.id), update);
    this.store.db.prepare(`INSERT INTO account_cosmetics(session_id,palette,accent) VALUES (?,?,?)
      ON CONFLICT(session_id) DO UPDATE SET palette=excluded.palette,accent=excluded.accent`)
      .run(user.id, next.palette, next.accent);
    return this.byId(user.id)!;
  }
  async register(token: string, username: string, termsVersion: string, accepted: boolean, password?: string) {
    checkRegistration(username, termsVersion, accepted);
    const existing = this.profile(token);
    if (existing && !existing.guest) {
      if (usernameKey(existing.username) === usernameKey(username)) return existing;
      throw accountError("This device already has a username.", 409);
    }
    if (existing?.guest && password === undefined) throw accountError("Add a password to keep your account after reinstalling.");
    const encoded = password === undefined ? null : await hashPassword(password);
    // Revalidate after the asynchronous password hash in case this token was revoked.
    const user = this.store.session(token);
    this.store.db.exec("BEGIN");
    try {
      const lockedProfile = this.byId(user.id);
      if (lockedProfile && !lockedProfile.guest) throw accountError("This device already has a username.", 409);
      this.store.db.prepare("INSERT INTO profiles VALUES (?,?,?,?,?)")
        .run(user.id, cleanUsername(username), usernameKey(username), TERMS_VERSION, Date.now());
      this.store.db.prepare("DELETE FROM guest_profiles WHERE session_id=?").run(user.id);
      if (encoded) {
        this.store.db.prepare("INSERT INTO account_credentials VALUES (?,?)").run(user.id, encoded);
        const now = Date.now();
        this.store.db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)")
          .run(tokenHash(token), user.id, now, now + AUTH_SESSION_MS);
        this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=?")
          .run(tokenHash(freshToken()), user.id);
      }
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      if (!this.available(username)) throw accountError("That username is already taken.", 409);
      throw error;
    }
    return this.profile(token)!;
  }
  private issue(id: string) {
    const token = freshToken(), now = Date.now();
    this.store.db.prepare("DELETE FROM auth_sessions WHERE session_id=? AND expires<=?").run(id, now);
    this.store.db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)")
      .run(tokenHash(token), id, now, now + AUTH_SESSION_MS);
    return token;
  }
  async secure(token: string, password: string): Promise<AuthResult> {
    const current = this.profile(token);
    if (!current || current.guest) throw accountError("Choose a username and password to save your guest account.", 403);
    if (current.secured) throw accountError("This account already has a password. Use it to sign in.", 409);
    const encoded = await hashPassword(password);
    this.store.session(token);
    this.store.db.exec("BEGIN");
    let next: string;
    try {
      if (this.byId(current.id)?.secured) throw accountError("This account already has a password.", 409);
      this.store.db.prepare("INSERT INTO account_credentials VALUES (?,?)").run(current.id, encoded);
      this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=?").run(tokenHash(freshToken()), current.id);
      next = this.issue(current.id);
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
    return { token: next, profile: this.byId(current.id)! };
  }
  async login(username: string, password: string, acceptCurrentTerms = false): Promise<AuthResult> {
    const row = this.store.db.prepare(`SELECT p.session_id,c.password_hash FROM profiles p
      JOIN account_credentials c ON c.session_id=p.session_id WHERE p.username_key=?`)
      .get(usernameKey(username)) as { session_id: string; password_hash: string } | undefined;
    if (!(await verifyPassword(password, row?.password_hash)) || !row)
      throw accountError("Username or password is incorrect.", 401);
    if (acceptCurrentTerms) this.store.db.prepare("UPDATE profiles SET terms_version=?,accepted_at=? WHERE session_id=? AND terms_version<>?")
      .run(TERMS_VERSION, Date.now(), row.session_id, TERMS_VERSION);
    const profile = this.byId(row.session_id);
    if (!profile) throw accountError("Username or password is incorrect.", 401);
    return { token: this.issue(row.session_id), profile };
  }
  logout(token: string) {
    const user = this.store.session(token);
    if (!this.byId(user.id)?.secured)
      throw accountError("Save a password before signing out to keep your username.", 409);
    this.store.db.prepare("DELETE FROM auth_sessions WHERE hash=?").run(tokenHash(token));
    this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=? AND hash=?")
      .run(tokenHash(freshToken()), user.id, tokenHash(token));
    return { signedOut: true as const };
  }
  award(token: string, eventKey: string, kind: RewardKind) {
    const user = this.store.session(token);
    if (!this.byId(user.id)) return 0;
    const row = this.store.db.prepare(`INSERT INTO reward_events VALUES (?,?,?,?,?)
      ON CONFLICT(session_id,event_key) DO NOTHING RETURNING points`)
      .get(user.id, eventKey, kind, REWARD_POINTS[kind], Date.now()) as { points: number } | undefined;
    return row?.points ?? 0;
  }
  rewards(token: string): Rewards {
    const user = this.store.session(token);
    const events = this.store.db.prepare(`SELECT event_key,kind,points,created FROM reward_events
      WHERE session_id=? ORDER BY created DESC,event_key LIMIT 30`).all(user.id) as
      { event_key: string; kind: RewardKind; points: number; created: number }[];
    return {
      total: this.byId(user.id)?.points ?? 0,
      events: events.map((e) => ({ id: e.event_key, kind: e.kind, points: Number(e.points), createdAt: new Date(e.created).toISOString() })),
    };
  }
}
