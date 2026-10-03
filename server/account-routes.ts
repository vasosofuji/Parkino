import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AccountStore } from "./accounts";
import type { PostgresAccountStore } from "./postgres/accounts";
import { accountError, bearerToken, tokenHash } from "./account-security";
import { TERMS_VERSION, usernameKey } from "../src/domain/account";

// Limits both an IP (Fastify) and a username, including across different IPs.
// Use a shared rate-limit store when deploying multiple API processes.
export class LoginAttemptLimiter {
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor(private clock: () => number = Date.now) {}
  consume(username: string) {
    const now = this.clock(), key = tokenHash(usernameKey(username));
    for (const [id, entry] of this.attempts) {
      if (entry.expires <= now) this.attempts.delete(id);
    }
    const entry = this.attempts.get(key) ?? { count: 0, expires: now + 15 * 60 * 1000 };
    if (entry.count >= 8 || this.attempts.size >= 10000 && !this.attempts.has(key))
      throw accountError("Too many sign-in attempts. Try again in 15 minutes.", 429);
    entry.count++;
    this.attempts.set(key, entry);
  }
}
export function registerAccountRoutes(app: FastifyInstance, accounts: AccountStore | PostgresAccountStore,
  sharedLimiter?: { consume(username: string): void | Promise<void> }) {
  const limiter = sharedLimiter ?? new LoginAttemptLimiter();
  const bearer = bearerToken;
  app.post("/v1/auth/guest", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const body = z.object({ accepted: z.literal(true), termsVersion: z.literal(TERMS_VERSION) }).strict().parse(request.body);
    reply.header("Cache-Control", "no-store");
    return accounts.guest(bearer(request.headers.authorization), body.termsVersion, body.accepted);
  });
  app.post("/v1/auth/login", {
    config: { rateLimit: { max: 12, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const body = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(128), accepted: z.literal(true).optional(), termsVersion: z.literal(TERMS_VERSION).optional() })
      .strict().refine(value => Boolean(value.accepted) === Boolean(value.termsVersion), "Accept the current Terms of Service.").parse(request.body);
    await limiter.consume(body.username);
    reply.header("Cache-Control", "no-store");
    return accounts.login(body.username, body.password, body.accepted === true);
  });
  app.post("/v1/auth/password", {
    config: { rateLimit: { max: 6, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(10).max(128) }).strict().parse(request.body);
    reply.header("Cache-Control", "no-store");
    return accounts.secure(bearer(request.headers.authorization), password);
  });
  app.post("/v1/auth/logout", async (request) => accounts.logout(bearer(request.headers.authorization)));
  app.get("/v1/rewards", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return accounts.rewards(bearer(request.headers.authorization));
  });
  app.put("/v1/profile/cosmetics", async (request, reply) => {
    const update = z.object({ palette: z.enum(["default", "ocean", "plum"]).optional(), accent: z.enum(["default", "gold", "violet"]).optional() })
      .strict().refine(value => value.palette !== undefined || value.accent !== undefined, "Choose a style.").parse(request.body);
    reply.header("Cache-Control", "no-store");
    return accounts.cosmetics(bearer(request.headers.authorization), update);
  });
}
