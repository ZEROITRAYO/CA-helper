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
  message: "The password do not match",
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

export const ENTITY_TYPE_LABELS = {
  individual: "Individual (freelancer / gig worker)",
  proprietorship: "Proprietorship",
  partnership: "Partnership firm",
  llp: "LLP",
  private_limited: "Private limited company",
};


export const MSME_TIER_LABELS = {
  micro: "Micro",
  small: "Small",
  medium: "Medium",
  not_msme: "Not an MSME",
};

export const GST_SCHEME_LABELS = {
  not_registered: "Not registered",
  regular_monthly: "Regular (monthly)",
  regular_qrmp: "Regular (quarterly, QRMP)",
  composition: "Composition",
};

export const ITR_FORM_LABELS = {
  itr_3: "ITR-3",
  itr_4: "ITR-4",
  itr_5: "ITR-5",
  itr_6: "ITR-6",
};


export function formatRupees(amount) {
  const number = Number(amount);
  if (Number.isInteger(number)) {
    return "₹" + number.toLocaleString("en-IN");
  }
  return (
    "₹" + number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

const CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";


export function gstinCheckCharacter(first14) {
  let total = 0;
  for (let index = 0; index < first14.length; index++) {
    const product = CHARACTERS.indexOf(first14[index]) * (index % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return CHARACTERS[(36 - (total % 36)) % 36];
}

export function gstinError(gstin, pan, stateName, stateCode) {
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    return "GSTIN not valid: last character does not match. Check for any typo.";
  }
  if (stateCode && gstin.slice(0, 2) !== stateCode) {
    return `GSTIN starts with ${gstin.slice(0, 2)}, but the code of ${stateName} is ${stateCode}.`;
  }
  if (pan && gstin.slice(2, 12) !== pan) {
    return "PAN inside this GSTIN (characters 3 to 12) does not match your PAN.";
  }
  return null;
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