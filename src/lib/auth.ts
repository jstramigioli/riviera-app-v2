import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type SessionData = {
  user?: SessionUser;
};

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "dev-only-insecure-secret-min-32-chars!!",
  cookieName: "riviera_pms_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 14,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (roles && !roles.includes(session.user.role)) {
    redirect("/calendario?error=forbidden");
  }
  return session.user;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const session = await getSession();
  session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  await session.save();
  return session.user;
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
