"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "../schemas/login.schema";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Sign in with email + password. Thin controller: validate (Zod) → delegate to
 * Supabase Auth → redirect. Errors come back as typed state for the form
 * (docs/07 §3). Auth errors are intentionally generic — we never reveal whether
 * an email exists.
 */
export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Incorrect email or password. Please try again." };
  }

  const next = formData.get("next");
  revalidatePath("/", "layout");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/dashboard");
}

/** Sign out and return to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
