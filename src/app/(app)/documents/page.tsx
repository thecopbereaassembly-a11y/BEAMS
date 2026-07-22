import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { can } from "@/shared/rbac/can";
import { Card, Badge, PageHeader, Alert, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { listDocuments } from "@/modules/documents/documents.module";
import { formatBytes, VISIBILITY_LABELS, type VISIBILITIES } from "@/modules/documents/documents.constants";
import { UploadForm } from "@/modules/documents/upload-form";
import {
  uploadDocumentAction,
  downloadDocumentAction,
  deleteDocumentAction,
} from "@/modules/documents/documents.actions";

export const metadata: Metadata = { title: "Documents" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });

export default async function DocumentsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx, "document.read")) {
    return <Alert>You do not have permission to view documents.</Alert>;
  }

  const result = await listDocuments(ctx);
  if (!result.ok) return <Alert>{result.error.message}</Alert>;
  const documents = result.data;
  const canWrite = can(ctx, "document.write");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Documents"
        description="Constitution, minutes, policies and records — stored privately."
      />

      {canWrite && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold">Upload a document</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Files are private. Downloads use a link that expires after a minute.
          </p>
          <div className="mt-4">
            <UploadForm action={uploadDocumentAction} />
          </div>
        </Card>
      )}

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload the assembly constitution, meeting minutes, or policy documents."
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.category ? `${d.category} · ` : ""}
                    {formatBytes(d.sizeBytes)} · uploaded {formatDate(d.created_at)}
                  </p>
                  {d.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge>
                    {VISIBILITY_LABELS[d.visibility as (typeof VISIBILITIES)[number]] ?? d.visibility}
                  </Badge>
                  <form action={downloadDocumentAction}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Download
                    </Button>
                  </form>
                  {canWrite && (
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="documentId" value={d.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
