import type { Metadata } from "next";
import Image from "next/image";
import { SetPasswordForm } from "@/modules/auth/components/set-password-form";

export const metadata: Metadata = { title: "Set new password" };

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <Image
          src="/logo.png"
          alt="The Church of Pentecost · Berea English Assembly"
          width={96}
          height={96}
          priority
          className="mx-auto h-24 w-24"
        />
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight text-card-foreground">
          Choose a new password
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Your new password must be at least 8 characters.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}