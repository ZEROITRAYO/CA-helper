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


export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}


export function formatDateTime(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export const FORM_LABELS = {
  itr: "Income tax return (ITR)",
  gstr_1: "GSTR-1",
  gstr_3b: "GSTR-3B",
  cmp_08: "CMP-08",
  gstr_4: "GSTR-4",
  tds_24q: "TDS return 24Q (salaries)",
  tds_26q: "TDS return 26Q (other payments)",
};

export function filingFormLabel(formCode) {
  return label(FORM_LABELS, formCode);
}



export const COMPLIANCE_STATUS_LABELS = {
  upcoming: "Upcoming",
  docs_pending: "Docs pending",
  ready: "Ready",
  with_ca: "With CA",
  filed: "Filed",
  filed_verified: "Filed–verified",
  overdue: "Overdue",
};



export function todayDate() {
  const today = new Date();

  const year = today.getFullYear();
  
  const month = String(today.getMonth() + 1).padStart(2, "0");
  
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


export function daysUntil(date) {
  
  const [year, month, day] = date.split("-").map(Number);
  
  const [nowYear, nowMonth, nowDay] = todayDate().split("-").map(Number);
  
  const milliseconds = Date.UTC(year, month - 1, day) - Date.UTC(nowYear, nowMonth - 1, nowDay);
  
  return Math.round(milliseconds / (24 * 60 * 60 * 1000));
}



export function daysLeftText(date) {
  
  const days = daysUntil(date);
  
  if (days === 0) return "Today";
  
  if (days === 1) return "In 1 day";
  
  if (days > 1) return "In " + days + " days";
  
  if (days === -1) return "1 day ago";
  
  return -1 * days + " days ago";
}





export function monthLabel(isoDate) {
  const [year, month] = isoDate.split("-").map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

}