"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  documentFormSchema,
  uploadDocument,
  getDownloadUrl,
  deleteDocument,
} from "./documents.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function uploadDocumentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = documentFormSchema.safeParse({
    title: str(formData, "title"),
    description: str(formData, "description"),
    category: str(formData, "category"),
    visibility: str(formData, "visibility") || "leaders",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: ["Choose a file to upload"] } };
  }

  try {
    const result = await uploadDocument(ctx, parsed.data, file);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot upload documents." };
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }

  revalidatePath("/documents");
  return { success: "Document uploaded." };
}

/** Signed URLs are short-lived, so they are minted per click rather than stored. */
export async function downloadDocumentAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const documentId = str(formData, "documentId");
  if (!documentId) return;

  const result = await getDownloadUrl(ctx, documentId);
  if (!result.ok) throw new Error(result.error.message);

  redirect(result.data);
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const documentId = str(formData, "documentId");
  if (!documentId) return;

  const result = await deleteDocument(ctx, documentId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/documents");
}
