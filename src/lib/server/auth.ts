import { NextResponse } from "next/server";
import type { AppUser, PublicUser, UserRole } from "@/lib/auth";
import { clearSessionCookie, getSessionPayload, setSessionCookie } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/server/password";

type AuthUserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

type ManagerRow = {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbUser = AppUser & {
  password_hash: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function combineUser(authUser: AuthUserRow, manager: ManagerRow): DbUser {
  return {
    id: manager.user_id,
    email: authUser.email,
    full_name: manager.full_name,
    role: manager.role,
    is_approved: manager.is_approved,
    approved_at: manager.approved_at,
    approved_by: manager.approved_by,
    created_at: manager.created_at,
    updated_at: manager.updated_at,
    password_hash: authUser.password_hash,
  };
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

async function findAuthUserByEmail(email: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("auth_users")
    .select("id, email, password_hash, created_at, updated_at")
    .eq("email", normalizeEmail(email))
    .maybeSingle<AuthUserRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findAuthUserById(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("auth_users")
    .select("id, email, password_hash, created_at, updated_at")
    .eq("id", id)
    .maybeSingle<AuthUserRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findManagerByUserId(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("managers")
    .select(
      "user_id, full_name, role, is_approved, approved_at, approved_by, last_login_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle<ManagerRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function hydrateUsers(managers: ManagerRow[]) {
  if (managers.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("auth_users")
    .select("id, email, password_hash, created_at, updated_at")
    .in(
      "id",
      managers.map((manager) => manager.user_id),
    );

  if (error) {
    throw new Error(error.message);
  }

  const authUsersById = new Map((data ?? []).map((user) => [user.id, user as AuthUserRow]));

  return managers
    .map((manager) => {
      const authUser = authUsersById.get(manager.user_id);
      return authUser ? combineUser(authUser, manager) : null;
    })
    .filter((user): user is DbUser => user !== null);
}

export async function findUserByEmail(email: string) {
  const authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    return null;
  }

  const manager = await findManagerByUserId(authUser.id);

  if (!manager) {
    return null;
  }

  return combineUser(authUser, manager);
}

export async function findUserById(id: string) {
  const [authUser, manager] = await Promise.all([findAuthUserById(id), findManagerByUserId(id)]);

  if (!authUser || !manager) {
    return null;
  }

  return combineUser(authUser, manager);
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
    .from("managers")
    .update({ last_login_at: now, updated_at: now })
    .eq("user_id", user.id);

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
  const existingUser = await findAuthUserByEmail(email);

  if (existingUser) {
    throw new Error("Email already exists");
  }

  const now = new Date().toISOString();
  const { data: createdAuthUser, error: createAuthError } = await getSupabaseAdmin()
    .from("auth_users")
    .insert({
      email,
      password_hash: hashPassword(input.password),
      created_at: now,
      updated_at: now,
    })
    .select("id, email, password_hash, created_at, updated_at")
    .single<AuthUserRow>();

  if (createAuthError) {
    throw new Error(createAuthError.message);
  }

  const { error: createManagerError } = await getSupabaseAdmin().from("managers").insert({
    user_id: createdAuthUser.id,
    full_name: input.fullName.trim() || null,
    role: "manager",
    is_approved: false,
    created_at: now,
    updated_at: now,
  });

  if (createManagerError) {
    await getSupabaseAdmin().from("auth_users").delete().eq("id", createdAuthUser.id);
    throw new Error(createManagerError.message);
  }

  const user = await findUserById(createdAuthUser.id);

  if (!user) {
    throw new Error("Failed to create manager");
  }

  return toPublicUser(user);
}

export async function recoverPassword(email: string) {
  const authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    return null;
  }

  const temporaryPassword = generateTemporaryPassword();
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("auth_users")
    .update({
      password_hash: hashPassword(temporaryPassword),
      updated_at: now,
    })
    .eq("id", authUser.id);

  if (error) {
    throw new Error(error.message);
  }

  return temporaryPassword;
}

export async function changeOwnPassword(userId: string, currentPassword: string, nextPassword: string) {
  const user = await findUserById(userId);

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    throw new Error("Current password is incorrect");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("auth_users")
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
    .from("managers")
    .select(
      "user_id, full_name, role, is_approved, approved_at, approved_by, last_login_at, created_at, updated_at",
    )
    .eq("role", "manager")
    .order("created_at", { ascending: false });

  if (currentUser.role !== "admin") {
    query = query.eq("user_id", currentUser.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const users = await hydrateUsers((data ?? []) as ManagerRow[]);

  return users.map(toPublicUser);
}

export async function listAssignableUsers(currentUser: AppUser) {
  if (currentUser.role !== "admin") {
    return [toPublicUser(currentUser)];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("managers")
    .select(
      "user_id, full_name, role, is_approved, approved_at, approved_by, last_login_at, created_at, updated_at",
    )
    .or(`user_id.eq.${currentUser.id},and(role.eq.manager,is_approved.eq.true)`)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const users = await hydrateUsers((data ?? []) as ManagerRow[]);

  return users.map(toPublicUser);
}

export async function approveManager(managerId: string, adminUser: AppUser) {
  const manager = await findUserById(managerId);

  if (!manager || manager.role !== "manager") {
    throw new Error("Manager not found");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("managers")
    .update({
      is_approved: true,
      approved_at: now,
      approved_by: adminUser.id,
      updated_at: now,
    })
    .eq("user_id", managerId);

  if (error) {
    throw new Error(error.message);
  }

  const updatedUser = await findUserById(managerId);

  if (!updatedUser) {
    throw new Error("Manager not found");
  }

  return toPublicUser(updatedUser);
}

export async function setManagerPassword(managerId: string, nextPassword: string) {
  const manager = await findUserById(managerId);

  if (!manager || manager.role !== "manager") {
    throw new Error("Manager not found");
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("auth_users")
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
