export type UserRole = "ADMIN" | "HR" | "MANAGER" | "VIEWER";

export const USER_ROLES: readonly UserRole[] = ["ADMIN", "HR", "MANAGER", "VIEWER"] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  HR: "HR",
  MANAGER: "Manager",
  VIEWER: "Viewer",
};

/** One system account as returned by `GET /api/v1/users`. */
export interface UserAccount {
  userId: string;
  username: string;
  role: UserRole;
  /** Whether the account can log in. Inactive accounts are rejected at login. */
  isActive: boolean;
  /** ISO timestamp of the most recent successful login, or null if never logged in. */
  lastLoginAt: string | null;
  /** ISO timestamp of when the account was created. */
  createdAt: string;
}

/** Body of `POST /api/v1/users`. */
export interface CreateUserRequest {
  username: string;
  password: string;
  confirmPassword: string;
  role?: UserRole;
}

/** Body of `PATCH /api/v1/users/[userId]`. */
export interface UpdateUserRequest {
  newPassword?: string;
  confirmPassword?: string;
  isActive?: boolean;
  role?: UserRole;
}

/** Kept for backwards compatibility */
export type UpdatePasswordRequest = Pick<UpdateUserRequest, "newPassword" | "confirmPassword">;
export type UpdateStatusRequest = Pick<UpdateUserRequest, "isActive">;
