"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordReset, type AuthFormState } from "../actions/auth.actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Sending link…" : "Send reset link"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.emailSent) {
    return (
      <>
        <p role="status" className="mt-6 rounded-md bg-primary/10 p-3 text-sm text-foreground">
          If an account uses that email, a password reset link is on its way.
        </p>
        <a href="/login" className="mt-4 block text-center text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {state.fieldErrors?.email && (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>
      <SubmitButton />
      <a href="/login" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
        Back to sign in
      </a>
    </form>
  );
}