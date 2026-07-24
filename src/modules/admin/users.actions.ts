"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { createUserSchema, createUser, setUserActive } from "./users.module";

export interface UserFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
  /** Shown ONCE after creating a user, for the admin to pass on. */
  tempPassword?: string;
  createdEmail?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = createUserSchema.safeParse({
    full_name: str(formData, "full_name"),
    email: str(formData, "email"),
    role_key: str(formData, "role_key"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createUser(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/admin/users");
    return {
      success: result.data.reused
        ? "This email already had a login — its role and password were updated."
        : "User created.",
      tempPassword: result.data.tempPassword,
      createdEmail: parsed.data.email,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to manage users." };
    }
    return { error: error instanceof Error ? error.message : "Could not create the user." };
  }
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const appUserId = str(formData, "appUserId");
  const active = str(formData, "active") === "true";
  if (!appUserId) return;

  const result = await setUserActive(ctx, appUserId, active);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/admin/users");
}
