import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

/**
 * In-app notification centre (docs/04 §22). RLS restricts these to the
 * recipient, so no permission check is needed beyond being signed in — a user
 * simply cannot see anyone else's notifications.
 */
async function markAllRead(): Promise<void> {
  "use server";
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", ctx.userId)
    .eq("is_read", false);

  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: notifications, error } = await supabase
    .from("notification")
    .select("*")
    .eq("recipient_user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return <Alert>Could not load notifications: {error.message}</Alert>;

  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You are up to date."}
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />

      {(notifications ?? []).length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Follow-up assignments, birthday reminders and system messages will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {(notifications ?? []).map((n) => (
            <li key={n.id}>
              <Card className={`p-4 ${n.is_read ? "" : "border-primary/40 bg-primary/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("en-GB", {
                        timeZone: "Africa/Accra",
                      })}
                    </p>
                  </div>
                  {!n.is_read && <Badge tone="primary">New</Badge>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
