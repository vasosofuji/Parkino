import type { ParkingStore } from "./store";
import {
  cleanUsername,
  TERMS_VERSION,
  usernameKey,
  validUsername,
  type Profile,
} from "../src/domain/account";
export class AccountStore {
  constructor(private store: ParkingStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS profiles(
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL,
      terms_version TEXT NOT NULL, accepted_at INTEGER NOT NULL
    );`);
  }
  profile(token: string): Profile | null {
    const session = this.store.session(token);
    const row = this.store.db
      .prepare("SELECT * FROM profiles WHERE session_id=?")
      .get(session.id) as
      | {
          session_id: string;
          username: string;
          terms_version: string;
          accepted_at: number;
        }
      | undefined;
    return row
      ? {
          id: row.session_id,
          username: row.username,
          termsVersion: row.terms_version,
          acceptedAt: new Date(row.accepted_at).toISOString(),
        }
      : null;
  }
  available(username: string) {
    return (
      validUsername(username) &&
      !this.store.db
        .prepare("SELECT 1 FROM profiles WHERE username_key=?")
        .get(usernameKey(username))
    );
  }
  register(
    token: string,
    username: string,
    termsVersion: string,
    accepted: boolean,
  ) {
    if (!validUsername(username) || !accepted || termsVersion !== TERMS_VERSION)
      throw Object.assign(
        new Error(
          "Choose a valid username and accept the current Terms of Service.",
        ),
        { statusCode: 400 },
      );
    const existing = this.profile(token);
    if (existing) {
      if (usernameKey(existing.username) === usernameKey(username))
        return existing;
      throw Object.assign(new Error("This device already has a username."), {
        statusCode: 409,
      });
    }
    const user = this.store.session(token);
    try {
      this.store.db
        .prepare("INSERT INTO profiles VALUES (?,?,?,?,?)")
        .run(
          user.id,
          cleanUsername(username),
          usernameKey(username),
          TERMS_VERSION,
          Date.now(),
        );
    } catch (error) {
      if (!this.available(username))
        throw Object.assign(new Error("That username is already taken."), {
          statusCode: 409,
        });
      throw error;
    }
    return this.profile(token)!;
  }
}
