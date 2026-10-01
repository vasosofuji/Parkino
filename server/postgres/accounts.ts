import type { PostgresParkingStore } from "./store";
import type { CosmeticsUpdate } from "../../src/domain/cosmetics";
import { checkCosmetics } from "../cosmetics";
import {
  cleanUsername, TERMS_VERSION, usernameKey, validUsername, REWARD_POINTS,
  type Profile, type AuthResult, type Rewards, type RewardKind,
} from "../../src/domain/account";
import { checkRegistration, PROFILE_QUERY, GUEST_PROFILE_QUERY, toProfile, type ProfileRow } from "../accounts";
import { accountError, AUTH_SESSION_MS, freshToken, hashPassword, tokenHash, verifyPassword } from "../account-security";

export class PostgresAccountStore {
  constructor(private store: PostgresParkingStore) {}
  async profile(token: string): Promise<Profile | null> {
    return this.byId((await this.store.session(token)).id);
  }
  private async byId(id: string) {
    return toProfile((await this.store.db.prepare(PROFILE_QUERY).get(id) ??
      await this.store.db.prepare(GUEST_PROFILE_QUERY).get(id)) as ProfileRow | undefined);
  }
  async guest(token: string, termsVersion: string, accepted: boolean): Promise<Profile> {
    if (!accepted || termsVersion !== TERMS_VERSION) throw accountError("Accept the current Terms of Service first.");
    const user = await this.store.session(token);
    return this.store.db.transaction(async () => {
      await this.store.db.prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE").get(user.id);
      await this.store.session(token);
      const existing = await this.byId(user.id);
      if (existing && !existing.guest) {
        if (existing.termsVersion !== TERMS_VERSION) await this.store.db.prepare("UPDATE profiles SET terms_version=?,accepted_at=? WHERE session_id=?").run(TERMS_VERSION, Date.now(), user.id);
      } else {
        await this.store.db.prepare(`INSERT INTO guest_profiles VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET
          accepted_at=CASE WHEN guest_profiles.terms_version=excluded.terms_version THEN guest_profiles.accepted_at ELSE excluded.accepted_at END,
          terms_version=excluded.terms_version`).run(user.id, TERMS_VERSION, Date.now());
      }
      return (await this.byId(user.id))!;
    });
  }
  async available(username: string) {
    return validUsername(username) && !(await this.store.db
      .prepare("SELECT 1 FROM profiles WHERE username_key=?").get(usernameKey(username)));
  }
  async cosmetics(token: string, update: CosmeticsUpdate): Promise<Profile> {
    const user = await this.store.session(token);
    return this.store.db.transaction(async () => {
      await this.store.db.prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE").get(user.id);
      await this.store.session(token);
      const next = checkCosmetics(await this.byId(user.id), update);
      await this.store.db.prepare(`INSERT INTO account_cosmetics(session_id,palette,accent) VALUES (?,?,?)
        ON CONFLICT(session_id) DO UPDATE SET palette=excluded.palette,accent=excluded.accent`)
        .run(user.id, next.palette, next.accent);
      return (await this.byId(user.id))!;
    });
  }
  async register(token: string, username: string, termsVersion: string, accepted: boolean, password?: string) {
    checkRegistration(username, termsVersion, accepted);
    const existing = await this.profile(token);
    if (existing && !existing.guest) {
      if (usernameKey(existing.username) === usernameKey(username)) return existing;
      throw accountError("This device already has a username.", 409);
    }
    if (existing?.guest && password === undefined) throw accountError("Add a password to keep your account after reinstalling.");
    const encoded = password === undefined ? null : await hashPassword(password);
    const user = await this.store.session(token);
    try {
      await this.store.db.transaction(async () => {
        await this.store.db.prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE").get(user.id);
        await this.store.session(token);
        const lockedProfile = await this.byId(user.id);
        if (lockedProfile && !lockedProfile.guest) throw accountError("This device already has a username.", 409);
        await this.store.db.prepare("INSERT INTO profiles VALUES (?,?,?,?,?)")
          .run(user.id, cleanUsername(username), usernameKey(username), TERMS_VERSION, Date.now());
        await this.store.db.prepare("DELETE FROM guest_profiles WHERE session_id=?").run(user.id);
        if (encoded) {
          await this.store.db.prepare("INSERT INTO account_credentials VALUES (?,?)").run(user.id, encoded);
          const now = Date.now();
          await this.store.db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)")
            .run(tokenHash(token), user.id, now, now + AUTH_SESSION_MS);
          await this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=?")
            .run(tokenHash(freshToken()), user.id);
        }
      });
    } catch (error) {
      if (!(await this.available(username))) throw accountError("That username is already taken.", 409);
      throw error;
    }
    return (await this.profile(token))!;
  }
  private async issue(id: string) {
    const token = freshToken(), now = Date.now();
    await this.store.db.prepare("DELETE FROM auth_sessions WHERE session_id=? AND expires<=?").run(id, now);
    await this.store.db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)")
      .run(tokenHash(token), id, now, now + AUTH_SESSION_MS);
    return token;
  }
  async secure(token: string, password: string): Promise<AuthResult> {
    const current = await this.profile(token);
    if (!current || current.guest) throw accountError("Choose a username and password to save your guest account.", 403);
    if (current.secured) throw accountError("This account already has a password. Use it to sign in.", 409);
    const encoded = await hashPassword(password);
    const next = await this.store.db.transaction(async () => {
      await this.store.db.prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE").get(current.id);
      await this.store.session(token);
      if ((await this.byId(current.id))?.secured) throw accountError("This account already has a password.", 409);
      await this.store.db.prepare("INSERT INTO account_credentials VALUES (?,?)").run(current.id, encoded);
      await this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=?").run(tokenHash(freshToken()), current.id);
      return this.issue(current.id);
    });
    return { token: next, profile: (await this.byId(current.id))! };
  }
  async login(username: string, password: string, acceptCurrentTerms = false): Promise<AuthResult> {
    const row = await this.store.db.prepare(`SELECT p.session_id,c.password_hash FROM profiles p
      JOIN account_credentials c ON c.session_id=p.session_id WHERE p.username_key=?`)
      .get(usernameKey(username)) as { session_id: string; password_hash: string } | undefined;
    if (!(await verifyPassword(password, row?.password_hash)) || !row)
      throw accountError("Username or password is incorrect.", 401);
    return this.store.db.transaction(async () => {
      const exists = await this.store.db.prepare("SELECT id FROM sessions WHERE id=? FOR UPDATE").get(row.session_id);
      if (acceptCurrentTerms) await this.store.db.prepare("UPDATE profiles SET terms_version=?,accepted_at=? WHERE session_id=? AND terms_version<>?")
        .run(TERMS_VERSION, Date.now(), row.session_id, TERMS_VERSION);
      const profile = await this.byId(row.session_id);
      if (!exists || !profile) throw accountError("Username or password is incorrect.", 401);
      return { token: await this.issue(row.session_id), profile };
    });
  }
  async logout(token: string) {
    const user = await this.store.session(token);
    if (!(await this.byId(user.id))?.secured)
      throw accountError("Save a password before signing out to keep your username.", 409);
    await this.store.db.prepare("DELETE FROM auth_sessions WHERE hash=?").run(tokenHash(token));
    await this.store.db.prepare("UPDATE sessions SET hash=? WHERE id=? AND hash=?")
      .run(tokenHash(freshToken()), user.id, tokenHash(token));
    return { signedOut: true as const };
  }
  async award(token: string, eventKey: string, kind: RewardKind) {
    const user = await this.store.session(token);
    if (!(await this.byId(user.id))) return 0;
    const row = await this.store.db.prepare(`INSERT INTO reward_events VALUES (?,?,?,?,?)
      ON CONFLICT(session_id,event_key) DO NOTHING RETURNING points`)
      .get(user.id, eventKey, kind, REWARD_POINTS[kind], Date.now()) as { points: number } | undefined;
    return Number(row?.points ?? 0);
  }
  async rewards(token: string): Promise<Rewards> {
    const user = await this.store.session(token);
    const events = await this.store.db.prepare(`SELECT event_key,kind,points,created FROM reward_events
      WHERE session_id=? ORDER BY created DESC,event_key LIMIT 30`).all(user.id) as
      { event_key: string; kind: RewardKind; points: number; created: number }[];
    return {
      total: (await this.byId(user.id))?.points ?? 0,
      events: events.map((e) => ({ id: e.event_key, kind: e.kind, points: Number(e.points), createdAt: new Date(e.created).toISOString() })),
    };
  }
}
