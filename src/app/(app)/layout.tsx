import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";

/**
 * Authenticated app shell. Resolves the AuthContext once (React `cache`
 * de-dupes it for the whole render) and uses it to filter navigation.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const [{ data: profile }, { data: assembly }] = await Promise.all([
    supabase.from("app_user").select("full_name").eq("id", ctx.userId).maybeSingle(),
    ctx.assemblyId
      ? supabase.from("assembly").select("name").eq("id", ctx.assemblyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        ctx={ctx}
        userName={profile?.full_name ?? "User"}
        assemblyName={assembly?.name ?? "No assembly"}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar ctx={ctx} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
