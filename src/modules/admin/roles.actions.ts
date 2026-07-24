"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { setRoleMatrix } from "./roles.module";

export interface RolesFormState {
  error?: string;
  success?: string;
}

export async function saveRoleMatrixAction(
  roleKey: string,
  _prev: RolesFormState,
  formData: FormData,
): Promise<RolesFormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const grantedKeys = formData.getAll("perm").filter((v): v is string => typeof v === "string");

  try {
    const result = await setRoleMatrix(ctx, roleKey, grantedKeys);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/admin/roles");
    return { success: "Permissions saved. They take effect immediately." };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to manage roles." };
    }
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
}
