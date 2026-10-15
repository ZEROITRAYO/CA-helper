import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod"; 

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const STORAGE_KEY = "ca-helper.session";

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

export const PASSWORD_RULE_TEXT =
  "Use at least 8 characters, with at least one letter and one number";

export const ROLE_HOME = {
  business: "/business",
  ca: "/ca",
  admin: "/admin",
};

export const emailSchema = z.email("Enter a valid email address");