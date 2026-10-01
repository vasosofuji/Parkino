import type { PostgresParkingStore } from "./store";
import {
  cleanUsername,
  TERMS_VERSION,
  usernameKey,
  validUsername,
  type Profile,
} from "../../src/domain/account";
export class PostgresAccountStore {
  constructor(private store: PostgresParkingStore) {}

  async profile(token: string): Promise<Profile | null> {
    const session = await this.store.session(token);
    const row = (await this.store.db
      .prepare("SELECT * FROM profiles WHERE session_id=?")
      .get(session.id)) as
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
  async available(username: string) {
    return (
      validUsername(username) &&
      !(await this.store.db
        .prepare("SELECT 1 FROM profiles WHERE username_key=?")
        .get(usernameKey(username)))
    );
  }
  async register(
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
    const existing = await this.profile(token);
    if (existing) {
      if (usernameKey(existing.username) === usernameKey(username))
        return existing;
      throw Object.assign(new Error("This device already has a username."), {
        statusCode: 409,
      });
    }
    const user = await this.store.session(token);
    try {
      await this.store.db
        .prepare("INSERT INTO profiles VALUES (?,?,?,?,?)")
        .run(
          user.id,
          cleanUsername(username),
          usernameKey(username),
          TERMS_VERSION,
          Date.now(),
        );
    } catch (error) {
      if (!(await this.available(username)))
        throw Object.assign(new Error("That username is already taken."), {
          statusCode: 409,
        });
      throw error;
    }
    return (await this.profile(token))!;
  }
}
