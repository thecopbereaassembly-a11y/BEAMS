import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">Page not found</p>
        <h1 className="mt-1 text-lg font-semibold">
          We couldn&apos;t find what you were looking for
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The record may have been removed, or the link may be out of date.
        </p>
        <div className="mt-6">
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
