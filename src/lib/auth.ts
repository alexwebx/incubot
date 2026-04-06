export type UserRole = "admin" | "manager";

export type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicUser = Pick<
  AppUser,
  "id" | "email" | "full_name" | "role" | "is_approved" | "approved_at" | "created_at"
>;
