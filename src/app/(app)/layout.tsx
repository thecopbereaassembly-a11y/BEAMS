import type { ReactNode } from "react";

/**
 * Authenticated app shell (scaffold). The full sidebar + top bar + breadcrumbs +
 * command palette are built in M0 (docs/11 §0, docs/12 §2). This placeholder
 * establishes the route group and layout seam.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b px-4">
        <span className="font-semibold">BEAMS</span>
        <span className="ml-2 text-sm text-muted-foreground">
          · Berea English Assembly
        </span>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 border-r p-4 text-sm text-muted-foreground md:block">
          Navigation (M0)
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
