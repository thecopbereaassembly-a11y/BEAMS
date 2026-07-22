import type { Metadata } from "next";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
          BEAMS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Berea English Assembly · The Church of Pentecost
        </p>

        <LoginForm next={next} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are created by an administrator.
        </p>
      </div>
    </main>
  );
}
