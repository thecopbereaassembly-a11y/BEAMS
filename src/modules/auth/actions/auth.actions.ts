"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "../schemas/login.schema";
import { resetPasswordSchema } from "../schemas/reset-password.schema";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  emailSent?: boolean;
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

/** Send a password recovery email without revealing whether the address exists. */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const forwardedHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const requestOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : undefined;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin ?? "http://localhost:3100";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/set-password`,
  });

  return { emailSent: true };
}

/** Sign out and return to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
