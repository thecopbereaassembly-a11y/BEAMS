import { ThemeToggle } from "./theme-toggle";
import { signOut } from "@/modules/auth/actions/auth.actions";
import type { AuthContext } from "@/shared/rbac/can";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export function TopBar({
  ctx,
  userName,
  assemblyName,
}: {
  ctx: AuthContext;
  userName: string;
  assemblyName: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tracking-tight">BEAMS</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          · {assemblyName}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {initials(userName)}
          </span>
          <span className="hidden text-sm sm:inline">{userName}</span>
          {ctx.roleKeys[0] && (
            <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground md:inline">
              {ctx.roleKeys[0].replace(/_/g, " ")}
            </span>
          )}
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="h-9 rounded-md border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
