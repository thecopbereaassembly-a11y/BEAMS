import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/**
 * Documents (docs/04 §17). Files live in a PRIVATE Supabase Storage bucket.
 *
 * All storage access is brokered server-side with the service role AFTER an
 * app-level permission check, and downloads are short-lived signed URLs — a
 * leaked anon key cannot enumerate the church's constitution, minutes or
 * member documents (docs/08 §5).
 */

export type ChurchDocument = Tables<"document">;

export { VISIBILITIES, VISIBILITY_LABELS, formatBytes } from "./documents.constants";
import { VISIBILITIES } from "./documents.constants";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const documentFormSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title").max(200),
  description: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  category: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  visibility: z.enum(VISIBILITIES).default("leaders"),
});

export type DocumentFormValues = z.output<typeof documentFormSchema>;

export interface DocumentEntry extends ChurchDocument {
  fileName: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  versionNo: number | null;
}

export async function listDocuments(ctx: AuthContext): Promise<Result<DocumentEntry[]>> {
  requirePermission(ctx, "document.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  if (!data?.length) return ok([]);

  const { data: versions } = await supabase
    .from("document_version")
    .select("id, document_id, version_no, storage_path, mime_type, size_bytes")
    .in("document_id", data.map((d) => d.id));

  // Latest version per document.
  interface VersionRow {
    id: string;
    document_id: string;
    version_no: number;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
  }
  const latest = new Map<string, VersionRow>();
  for (const v of (versions ?? []) as VersionRow[]) {
    const current = latest.get(v.document_id);
    if (!current || v.version_no > current.version_no) latest.set(v.document_id, v);
  }

  return ok(
    data.map((d) => {
      const version = latest.get(d.id);
      return {
        ...d,
        fileName: version ? (version.storage_path.split("/").pop() ?? null) : null,
        sizeBytes: version?.size_bytes ?? null,
        mimeType: version?.mime_type ?? null,
        versionNo: version?.version_no ?? null,
      };
    }),
  );
}

/**
 * Uploads a file and records it as version 1 (or the next version if the
 * document already exists). The storage path is namespaced by assembly so a
 * path can never be guessed across tenants.
 */
export async function uploadDocument(
  ctx: AuthContext,
  values: DocumentFormValues,
  file: File,
): Promise<Result<string>> {
  requirePermission(ctx, "document.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  if (file.size === 0) return err(new AppError("validation", "The file is empty."));
  if (file.size > MAX_UPLOAD_BYTES) {
    return err(new AppError("validation", "Files must be 50 MB or smaller."));
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const storagePath = `${ctx.assemblyId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: document, error: docErr } = await supabase
    .from("document")
    .insert({
      assembly_id: ctx.assemblyId,
      title: values.title,
      description: values.description ?? null,
      category: values.category ?? null,
      visibility: values.visibility,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (docErr) {
    // Don't leave an orphaned object behind if the row failed to write.
    await admin.storage.from("documents").remove([storagePath]);
    throw new Error(`Failed to save document: ${docErr.message}`);
  }

  const { data: version, error: versionErr } = await supabase
    .from("document_version")
    .insert({
      assembly_id: ctx.assemblyId,
      document_id: document.id,
      version_no: 1,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single();

  if (versionErr) throw new Error(`Failed to record version: ${versionErr.message}`);

  await supabase
    .from("document")
    .update({ current_version_id: version.id })
    .eq("id", document.id);

  return ok(document.id);
}

/**
 * Mints a short-lived signed URL. The permission check happens here, not in
 * storage policies, so the rule lives in one place.
 */
export async function getDownloadUrl(
  ctx: AuthContext,
  documentId: string,
): Promise<Result<string>> {
  requirePermission(ctx, "document.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();

  // RLS confirms the document belongs to this assembly before we touch storage.
  const { data: document } = await supabase
    .from("document")
    .select("id, current_version_id")
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!document) return err(AppError.notFound("Document not found"));

  const { data: version } = await supabase
    .from("document_version")
    .select("storage_path")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) return err(AppError.notFound("No file attached to this document"));

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("documents")
    .createSignedUrl(version.storage_path, 60); // 60 seconds is ample for a click

  if (error || !signed) throw new Error(`Could not prepare download: ${error?.message}`);
  return ok(signed.signedUrl);
}

export async function deleteDocument(
  ctx: AuthContext,
  documentId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "document.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("document")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", documentId);

  if (error) throw new Error(`Failed to delete: ${error.message}`);
  return ok(true);
}
