import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "@workspace/db";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono, type Context } from "hono";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
} from "@workspace/api-zod";
import { getDb } from "@workspace/db";
import { carts, rateLimitAttempts, sessions, users } from "@workspace/db/schema";

const router = new Hono();
const sessionCookie = "boutik_session";
const sessionDurationSeconds = 7 * 24 * 60 * 60;
const hashLength = 64;
const dummyPasswordHash = `scrypt$16384$8$1$${"00".repeat(16)}$${"00".repeat(hashLength)}`;

const normalizedEmail = (email: string) => email.trim().toLocaleLowerCase("en-US");
const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");
const rateLimitKey = (email: string) => createHash("sha256").update(email).digest("hex");

function errorResponse(code: string, message: string) {
  return { error: { code, message } };
}

async function readJson(context: Context) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, hashLength, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, n, r, p, saltHex, keyHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !saltHex || !keyHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== hashLength) return false;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}

async function withinRateLimit(key: string, action: string, limit: number) {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [attempt] = await db
    .insert(rateLimitAttempts)
    .values({ key, action, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitAttempts.key, rateLimitAttempts.action, rateLimitAttempts.windowStart],
      set: { count: sql`${rateLimitAttempts.count} + 1`, updatedAt: now },
    })
    .returning({ count: rateLimitAttempts.count });
  return attempt.count <= limit;
}

function setSessionCookie(context: Context, token: string) {
  setCookie(context, sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: sessionDurationSeconds,
  });
}

export async function getAuthenticatedUser(context: Context) {
  const token = getCookie(context, sessionCookie);
  if (!token) return null;
  const [user] = await getDb()
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, phone: users.phone, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()), eq(users.status, "active")))
    .limit(1);
  if (!user) deleteCookie(context, sessionCookie, { path: "/" });
  return user ?? null;
}

async function createSession(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await tx.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + sessionDurationSeconds * 1000),
  });
  await tx.insert(carts).values({ userId }).onConflictDoNothing({ target: carts.userId });
  return token;
}

router.post("/auth/register", async (context) => {
  const parsed = RegisterBody.safeParse(await readJson(context));
  if (!parsed.success) {
    return context.json(errorResponse("DONNEES_INVALIDES", "Vérifiez les informations du formulaire."), 400);
  }
  const email = normalizedEmail(parsed.data.email);
  const firstName = parsed.data.firstName.trim();
  const lastName = parsed.data.lastName.trim();
  if (!firstName || !lastName) {
    return context.json(errorResponse("DONNEES_INVALIDES", "Le prénom et le nom sont obligatoires."), 400);
  }
  if (!(await withinRateLimit(rateLimitKey(email), "register", 5))) {
    return context.json(errorResponse("TROP_DE_TENTATIVES", "Réessayez dans une minute."), 429);
  }

  const db = getDb();
  try {
    const password = await passwordHash(parsed.data.password);
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: password,
          firstName,
          lastName,
          phone: parsed.data.phone,
          role: "customer",
        })
        .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, phone: users.phone, role: users.role });
      const token = await createSession(tx, user.id);
      return { user, token };
    });
    setSessionCookie(context, result.token);
    return context.json(RegisterResponse.parse({ data: result.user }), 201);
  } catch (error) {
    const wrappedError = error as { code?: unknown; cause?: { code?: unknown } };
    if (wrappedError?.code === "23505" || wrappedError?.cause?.code === "23505") {
      return context.json(errorResponse("EMAIL_DEJA_UTILISE", "Un compte utilise déjà cette adresse e-mail."), 409);
    }
    throw error;
  }
});

router.post("/auth/login", async (context) => {
  const parsed = LoginBody.safeParse(await readJson(context));
  if (!parsed.success) {
    return context.json(errorResponse("DONNEES_INVALIDES", "Adresse e-mail ou mot de passe invalide."), 400);
  }
  const email = normalizedEmail(parsed.data.email);
  if (!(await withinRateLimit(rateLimitKey(email), "login", 10))) {
    return context.json(errorResponse("TROP_DE_TENTATIVES", "Trop de tentatives. Réessayez dans une minute."), 429);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, phone: users.phone, role: users.role, status: users.status, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  const validPassword = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummyPasswordHash);
  if (!user || user.status !== "active" || !validPassword) {
    return context.json(errorResponse("IDENTIFIANTS_INVALIDES", "Adresse e-mail ou mot de passe invalide."), 401);
  }

  const result = await db.transaction(async (tx) => {
    const token = await createSession(tx, user.id);
    await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    return token;
  });
  setSessionCookie(context, result);
  return context.json(LoginResponse.parse({
    data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role },
  }));
});

router.get("/auth/me", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) {
    return context.json(errorResponse("NON_AUTHENTIFIE", "Une connexion est nécessaire."), 401);
  }
  return context.json(GetCurrentUserResponse.parse({ data: user }));
});

// The generated storefront client also uses /me for the profile query.
router.get("/me", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return context.json(errorResponse("NON_AUTHENTIFIE", "Une connexion est nécessaire."), 401);
  return context.json(GetCurrentUserResponse.parse({ data: user }));
});

router.post("/auth/logout", async (context) => {
  const token = getCookie(context, sessionCookie);
  if (token) {
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)));
  }
  deleteCookie(context, sessionCookie, { path: "/" });
  return context.json(LogoutResponse.parse({ data: { success: true, message: "Session terminée." } }));
});

export default router;
