import { z } from "zod";
import { USER_ROLES, ACCOUNT_TYPES, APPLICATION_CATEGORIES } from "./types.js";

// ─── Auth schemas ───

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    displayName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    institutionName: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ─── User profile schema (admin operations) ───

export const userProfileSchema = z.object({
  displayName: z.string().min(2),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  accountType: z.enum(ACCOUNT_TYPES),
  institutionId: z.string().optional(),
  regionIds: z.array(z.string()).optional(),
  active: z.boolean(),
});

// ─── Application schemas ───

export const applicationDraftSchema = z.object({
  applicationCategory: z.enum(APPLICATION_CATEGORIES),
  institutionName: z.string().min(2, "Institution name is required"),
  institutionCode: z.string().optional(),
  programName: z.string().optional(),
  programLevel: z.string().optional(),
  intakeCapacity: z.coerce.number().int().positive().optional(),
  academicYear: z.string().optional(),
  justification: z.string().optional(),
  additionalInfo: z.string().optional(),
});
