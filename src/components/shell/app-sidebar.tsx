import Image from "next/image";
import Link from "next/link";
import { NAV_SECTIONS } from "@/config/navigation";
import { can, type AuthContext } from "@/shared/rbac/can";

/**
 * Permission-filtered sidebar. Sections with no visible items disappear
 * entirely, so a Home Cell Leader simply never sees "Finance".
 */
export function AppSidebar({ ctx }: { ctx: AuthContext }) {
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || can(ctx, item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <nav
      aria-label="Main navigation"
      className="hidden w-60 shrink-0 overflow-y-auto border-r bg-card/50 p-3 md:block"
    >
      <Link href="/dashboard" className="mb-5 flex items-center gap-2.5 px-2">
        <Image
          src="/logo.png"
          alt="Berea English Assembly"
          width={36}
          height={36}
          priority
          className="h-9 w-9"
        />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">BEAMS</span>
          <span className="text-[10px] text-muted-foreground">Berea English Assembly</span>
        </span>
      </Link>

      {sections.map((section) => (
        <div key={section.title} className="mb-5">
          <p className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                {item.planned ? (
                  <span
                    className="flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                    title="Coming in a later milestone"
                  >
                    {item.label}
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="block rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
