import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/shared/types/database.types";
import type { VisitorListQuery } from "../schemas/visitor.schema";

export type Visitor = Tables<"visitor">;
export type VisitorSource = Tables<"visitor_source">;

export async function listVisitors(
  assemblyId: string,
  query: VisitorListQuery,
): Promise<{ rows: Visitor[]; total: number }> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;

  let builder = supabase
    .from("visitor")
    .select("*", { count: "exact" })
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null);

  if (query.q) {
    const term = query.q.replace(/[,()]/g, " ").trim();
    if (term) {
      builder = builder.or(
        [`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`, `phone.ilike.%${term}%`].join(","),
      );
    }
  }
  if (query.converted === "yes") builder = builder.eq("is_converted", true);
  if (query.converted === "no") builder = builder.eq("is_converted", false);

  const { data, error, count } = await builder
    .order("first_visit_on", { ascending: false, nullsFirst: false })
    .range(from, from + query.pageSize - 1);

  if (error) throw new Error(`Failed to list visitors: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function findVisitorById(
  assemblyId: string,
  visitorId: string,
): Promise<Visitor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitor")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", visitorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load visitor: ${error.message}`);
  return data;
}

export async function insertVisitor(values: TablesInsert<"visitor">): Promise<Visitor> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("visitor").insert(values).select("*").single();
  if (error) throw new Error(`Failed to create visitor: ${error.message}`);
  return data;
}

export async function updateVisitorRow(
  assemblyId: string,
  visitorId: string,
  values: TablesUpdate<"visitor">,
): Promise<Visitor> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitor")
    .update(values)
    .eq("assembly_id", assemblyId)
    .eq("id", visitorId)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to update visitor: ${error.message}`);
  return data;
}

export async function recordVisit(values: TablesInsert<"visitor_visit">): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("visitor_visit").insert(values);
  if (error) throw new Error(`Failed to record visit: ${error.message}`);
}

export async function listVisits(
  assemblyId: string,
  visitorId: string,
): Promise<Tables<"visitor_visit">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitor_visit")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("visitor_id", visitorId)
    .order("visited_on", { ascending: false });
  if (error) throw new Error(`Failed to load visits: ${error.message}`);
  return data ?? [];
}

export async function listSources(assemblyId: string): Promise<VisitorSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitor_source")
    .select("*")
    .eq("assembly_id", assemblyId)
    .order("name");
  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return data ?? [];
}

/** Seeds the default "how did you hear about us" options on first use. */
export async function ensureDefaultSources(
  assemblyId: string,
): Promise<VisitorSource[]> {
  const existing = await listSources(assemblyId);
  if (existing.length > 0) return existing;

  const supabase = await createClient();
  const defaults = [
    "Invited by a member",
    "Walk-in",
    "Social media",
    "Evangelism outreach",
    "Family",
    "Other",
  ];
  await supabase
    .from("visitor_source")
    .insert(defaults.map((name) => ({ assembly_id: assemblyId, name })));

  return listSources(assemblyId);
}
