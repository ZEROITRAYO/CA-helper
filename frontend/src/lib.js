import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod"; 

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const STORAGE_KEY = "ca-helper.session";

export const USER_ROLE_LABELS = {
  business: "Business",
  ca: "Chartered Accountant",
  admin: "Admin",
};

export function label(labels, code) {
  return labels[code] ?? code;
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}

export const ROLE_HOME = {
  business: "/business",
  ca: "/ca",
  admin: "/admin",
};

export const newPasswordSchema = z.string()
  .min(8, "Use at least 8 characters, with at least one letter and one number")
  .regex(/[A-Za-z]/, "Use at least 8 characters, with at least one letter and one number")
  .regex(/[0-9]/, "Use at least 8 characters, with at least one letter and one number");

export const emailSchema = z.email("Enter a valid email address");

export function passwordsMatch(values) {
  return values.password === values.confirm_password;
}

export const PASSWORDS_MATCH_ERROR = {
  message: "The passwords do not match",
  path: ["confirm_password"],
};

export const otpSchema = z.string()
  .trim()
  .regex(/^[0-9]{6}$/, "Enter the 6 digit otp from the email");

