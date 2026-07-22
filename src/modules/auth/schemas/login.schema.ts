import { z } from "zod";

/**
 * Shared by client and server — the single source of truth for login input
 * (docs/02 §4). Never validate on only one side.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
