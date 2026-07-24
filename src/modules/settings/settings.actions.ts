"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  assemblyProfileSchema,
  serviceTypeSchema,
  updateAssemblyProfile,
  addFund,
  setFundActive,
  addContributionType,
  setContributionTypeActive,
  saveServiceType,
} from "./settings.module";

export interface SettingsState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const wrap = async (fn: () => Promise<SettingsState>): Promise<SettingsState> => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You do not have permission for that." };
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
};

export async function saveAssemblyProfileAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };
  const parsed = assemblyProfileSchema.safeParse({
    name: str(fd, "name"), short_name: str(fd, "short_name"), address_line: str(fd, "address_line"),
    city: str(fd, "city"), phone: str(fd, "phone"), email: str(fd, "email"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  return wrap(async () => {
    const r = await updateAssemblyProfile(ctx, parsed.data);
    if (!r.ok) return { error: r.error.message };
    revalidatePath("/settings");
    return { success: "Assembly profile saved." };
  });
}

export async function addFundAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };
  return wrap(async () => {
    const r = await addFund(ctx, str(fd, "name"));
    if (!r.ok) return { error: r.error.message };
    revalidatePath("/settings");
    return { success: "Fund added." };
  });
}

export async function toggleFundAction(fd: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  await setFundActive(ctx, str(fd, "id"), str(fd, "active") === "true");
  revalidatePath("/settings");
}

export async function addContributionTypeAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };
  return wrap(async () => {
    const r = await addContributionType(ctx, str(fd, "name"));
    if (!r.ok) return { error: r.error.message };
    revalidatePath("/settings");
    return { success: "Giving type added." };
  });
}

export async function toggleContributionTypeAction(fd: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  await setContributionTypeActive(ctx, str(fd, "id"), str(fd, "active") === "true");
  revalidatePath("/settings");
}

export async function saveServiceTypeAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };
  const parsed = serviceTypeSchema.safeParse({
    name: str(fd, "name"), default_day: str(fd, "default_day"), default_time: str(fd, "default_time"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const id = str(fd, "id") || undefined;
  return wrap(async () => {
    const r = await saveServiceType(ctx, parsed.data, id);
    if (!r.ok) return { error: r.error.message };
    revalidatePath("/settings");
    return { success: id ? "Service updated." : "Service added." };
  });
}
