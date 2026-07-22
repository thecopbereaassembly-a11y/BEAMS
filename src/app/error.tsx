"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary (docs/10 §6). Never shows a stack trace — church
 * officers get a plain explanation and a way forward, while the digest gives
 * support something to correlate with server logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire to Sentry here once DSN is configured (docs/14 §6).
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The problem has been recorded. Nothing you were working on has been
          lost — please try again.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.assign("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground">
            If you report this, quote reference{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
