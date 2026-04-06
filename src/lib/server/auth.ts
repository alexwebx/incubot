import { NextResponse } from "next/server";
import type { AppUser, PublicUser, UserRole } from "@/lib/auth";
import { clearSessionCookie, getSessionPayload, setSessionCookie } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/server/password";
import { sendApprovalEmail, sendRecoveredPasswordEmail } from "@/lib/server/email";

type DbUser = AppUser & {
  password_hash: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toPublicUser(user: AppUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_approved: user.is_approved,
    approved_at: user.approved_at,
    created_at: user.created_at,
  };
}

export async function findUserByEmail(email: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle<DbUser>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function findUserById(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle<DbUser>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getCurrentUser() {
  const session = await getSessionPayload();

  if (!session) {
    return null;
  }

  const user = await findUserById(session.userId);

  if (!user) {
    await clearSessionCookie();
    return null;
  }

  if (user.role === "manager" && !user.is_approved) {
    await clearSessionCookie();
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireRole(role: UserRole) {
  const user = await requireUser();

  if (user.role !== role) {
    throw new Error("Forbidden");
  }

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await findUserByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password");
  }

  if (user.role === "manager" && !user.is_approved) {
    throw new Error("Manager access is pending approval");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ last_login_at: now, updated_at: now })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return toPublicUser(user);
}

export async function registerManager(input: {
  email: string;
  fullName: string;
  password: string;
}) {
  const email = normalizeEmail(input.email);
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new Error("Email already exists");
  }

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .insert({
      email,
      full_name: input.fullName.trim() || null,
      password_hash: hashPassword(input.password),
      role: "manager",
      is_approved: false,
      created_at: now,
      updated_at: now,
    })
    .select("id, email, full_name, role, is_approved, approved_at, created_at")
    .single<PublicUser>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function recoverPassword(email: string) {
  const user = await findUserByEmail(email);

  if (!user) {
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({
      password_hash: hashPassword(temporaryPassword),
      updated_at: now,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  await sendRecoveredPasswordEmail(user.email, temporaryPassword);
}

export async function changeOwnPassword(userId: string, currentPassword: string, nextPassword: string) {
  const user = await findUserById(userId);

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    throw new Error("Current password is incorrect");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({
      password_hash: hashPassword(nextPassword),
      updated_at: now,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listManagers(currentUser: AppUser) {
  let query = getSupabaseAdmin()
    .from("admin_users")
    .select("id, email, full_name, role, is_approved, approved_at, created_at")
    .eq("role", "manager")
    .order("created_at", { ascending: false });

  if (currentUser.role !== "admin") {
    query = query.eq("id", currentUser.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PublicUser[];
}

export async function approveManager(managerId: string, adminUser: AppUser) {
  const manager = await findUserById(managerId);

  if (!manager || manager.role !== "manager") {
    throw new Error("Manager not found");
  }

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({
      is_approved: true,
      approved_at: now,
      approved_by: adminUser.id,
      updated_at: now,
    })
    .eq("id", managerId)
    .select("id, email, full_name, role, is_approved, approved_at, created_at")
    .single<PublicUser>();

  if (error) {
    throw new Error(error.message);
  }

  await sendApprovalEmail(manager.email);

  return data;
}

export async function setManagerPassword(managerId: string, nextPassword: string) {
  const manager = await findUserById(managerId);

  if (!manager || manager.role !== "manager") {
    throw new Error("Manager not found");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({
      password_hash: hashPassword(nextPassword),
      updated_at: now,
    })
    .eq("id", managerId);

  if (error) {
    throw new Error(error.message);
  }
}

export function unauthorizedResponse(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
