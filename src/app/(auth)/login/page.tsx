import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Login screen (stub). Email + password via Supabase Auth lands in M0; the JWT
 * claim-stamping hook + assembly context follow (docs/08 §1-2).
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-card-foreground">BEAMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Berea English Assembly · The Church of Pentecost
        </p>
        <div className="mt-6 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Authentication UI is implemented in milestone M0. This is the scaffold
          placeholder.
        </div>
      </div>
    </main>
  );
}
