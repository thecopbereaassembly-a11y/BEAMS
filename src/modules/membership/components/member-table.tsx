import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { displayName } from "../services/membership.service";
import { STATUS_LABELS, type MEMBER_STATES } from "../schemas/member.schema";
import type { Member } from "../repositories/member.repository";

type Status = (typeof MEMBER_STATES)[number];

const STATUS_TONE: Record<Status, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  member: "success",
  new_convert: "primary",
  visitor: "neutral",
  inactive: "warning",
  transferred_out: "neutral",
  deceased: "neutral",
};

const initials = (m: Member) =>
  `${m.first_name[0] ?? ""}${m.last_name[0] ?? ""}`.toUpperCase();

/** Ghana display format: +233244123456 → 024 412 3456 */
function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const local = phone.startsWith("+233") ? `0${phone.slice(4)}` : phone;
  return local.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
}

export function MemberTable({ members }: { members: Member[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <caption className="sr-only">Members of the assembly</caption>
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Phone</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Email</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Baptism</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const status = member.current_status as Status;
            return (
              <tr key={member.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/members/${member.id}`}
                    className="flex items-center gap-2.5 font-medium text-foreground hover:underline"
                  >
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                    >
                      {initials(member)}
                    </span>
                    {displayName(member)}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={STATUS_TONE[status] ?? "neutral"}>
                    {STATUS_LABELS[status] ?? status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {formatPhone(member.primary_phone)}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                  {member.primary_email ?? "—"}
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <span className="text-muted-foreground">
                    {member.is_water_baptized ? "Water" : "—"}
                    {member.is_holy_spirit_baptized ? " · Holy Spirit" : ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
