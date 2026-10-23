import { useQuery, useQueryClient } from "@tanstack/react-query";

export class ApiRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

let accessToken = null;
let logout = () => {};

export function setAuth(token, logoutFunction) {
  accessToken = token;
  logout = logoutFunction;
}

export async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = {};
  const isForm = body instanceof FormData; 
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined || isForm ? body : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  fail(response, data, headers.Authorization);
}

function fail(response, data, hadToken) {
  if (response.status === 401 && hadToken) logout();
  let code = "HTTP_ERROR";
  let message = response.status;
  if (data && data.error) {
    code = data.error.code;
    message = data.error.message;
  }
  throw new ApiRequestError(response.status, code, message);
}

export function errorMessage(error) {
  if (error instanceof ApiRequestError) return error.message;
  return "Cannot reach the server, Check your connection";
}

async function get(path, notFound) {
  try {
    return await apiFetch(path);
  } 
  
  catch (error) {
    if (notFound && error.code === notFound) return null;
    throw error;
  }
}

function useGet(queryKey, path, { notFound, ...options } = {}) {
  return useQuery({ queryKey, queryFn: () => get(path, notFound), ...options });
}

function sendForm(path, fields) {
  const form = new FormData();
  
  for (const [name, value] of Object.entries(fields)) {
    if (value) form.append(name, value);
  }
  
  return apiFetch(path, { method: "POST", body: form });
}

function withQuery(path, params) {
  const query = new URLSearchParams();
  
  for (const [name, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) query.set(name, value);
  }
  
  const text = query.toString();
  
  return text ? path + "?" + text : path;
}

export function useRefresh() {
  const queryClient = useQueryClient();
  
  return function refresh(...keys) {
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function signup({ full_name, email, password, role }) {
  return apiFetch("/api/v1/auth/signup", {
    method: "POST",
    body: { full_name, email, password, role, terms_accepted: true },
  });
}

export function verifyEmail(email, code) {
  return apiFetch("/api/v1/auth/verify-email", { method: "POST", body: { email, code } });
}

export function resendVerificationCode(email) {
  return apiFetch("/api/v1/auth/verify-email/resend", { method: "POST", body: { email } });
}

export function forgotPassword(email) {
  return apiFetch("/api/v1/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(email, code, newPassword) {
  return apiFetch("/api/v1/auth/reset-password", { method: "POST",
    body: { email, code, new_password: newPassword },
  });
}


export const SETTINGS_KEY = ["auth", "settings"];

export function useSettings() {
  return useGet(SETTINGS_KEY, "/api/v1/auth/settings");
}


export function saveSettings(emailNotifications) {

  return apiFetch("/api/v1/auth/settings", {
    method: "PUT",
    body: { email_notifications: emailNotifications },
  });

}


export const MY_BUSINESS_KEY = ["onboarding", "business"];


export function useMyBusiness() {
  return useGet(MY_BUSINESS_KEY, "/api/v1/onboarding/business", { notFound: "BUSINESS_NOT_FOUND" });
}

export function registerBusiness(form) {
  return apiFetch("/api/v1/onboarding/business", { method: "POST", body: form });
}

export function updateBusiness(form) {
  return apiFetch("/api/v1/onboarding/business", { method: "PUT", body: form });
}

export function useNicSearch(query) {
  const text = query.trim();
  const path = "/api/v1/onboarding/nic-codes?q=" + encodeURIComponent(text);
  return useGet(["onboarding", "nic-codes", text], path, { enabled: text.length >= 2 });
}

export function saveNicCode(code) {
  return apiFetch("/api/v1/onboarding/business/nic-code", { method: "PUT", body: { code } });
}

export function useGstStates() {
  return useGet(["onboarding", "states"], "/api/v1/onboarding/states", { staleTime: Infinity });
}

export function readRegistrationDocument(file) {
  return sendForm("/api/v1/onboarding/autofill", { file });
}



export const NOTIFICATIONS_KEY = ["alerts", "notifications"];

export function useNotifications(page) {
  return useGet([...NOTIFICATIONS_KEY, page], `/api/v1/alerts/notifications?page=${page}`);
}

export function markNotificationRead(notificationId) {
  return apiFetch(`/api/v1/alerts/notifications/${notificationId}/read`, { method: "POST" });
}

export const FILINGS_KEY = ["compliance", "items"];
export const DASHBOARD_KEY = ["compliance", "dashboard"];

export function useComplianceDashboard() 
{
  return useGet(DASHBOARD_KEY, "/api/v1/compliance/dashboard");
}

export function useFilings() 
{
  return useGet(FILINGS_KEY, "/api/v1/compliance/items", { notFound: "BUSINESS_NOT_FOUND" });
}


export function filingKey(itemId) 
{
  return ["compliance", "item", itemId];
}

export function useFiling(itemId) 
{
  return useGet(filingKey(itemId), "/api/v1/compliance/items/" + itemId);
}

export function tickChecklist(itemId, key, ticked) 
{
  return apiFetch("/api/v1/compliance/items/" + itemId + "/checklist", { method: "POST", body: { key, ticked },});
}

export async function apiDownload(path) {
  const hasToken = Boolean(accessToken);
  
  const response = await fetch(path, {
    headers: hasToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  
  if (response.ok) return response.blob();
  
  fail(response, await response.json().catch(() => null), hasToken);
}



export const UPLOAD_TYPES = [
  "gst_certificate",
  "pan_card",
  "sales_register",
  "purchase_register",
  "bank_statement",
  "invoice",
  "salary_register",
  "tds_challan",
  "acknowledgement",
  "other",
];

export const DOCUMENTS_KEY = ["documents"];

export function useDocuments(params, enabled = true) {
  return useGet([...DOCUMENTS_KEY, params], withQuery("/api/v1/documents", params), { enabled });
}

export function uploadDocument(file, fields) {
  return sendForm("/api/v1/documents", { file, ...fields });
}

export function deleteDocument(documentId) {
  return apiFetch("/api/v1/documents/" + documentId, { method: "DELETE" });
}

export function linkDocument(documentId, complianceItemId, checklistKey) {
  
  return apiFetch("/api/v1/documents/" + documentId + "/links", {
    method: "POST", body: { compliance_item_id: complianceItemId, checklist_key: checklistKey },});
}


export function unlinkDocument(linkId) {
  return apiFetch("/api/v1/documents/links/" + linkId, { method: "DELETE" });
}


export async function downloadDocument(document) {
  const blob = await apiDownload("/api/v1/documents/" + document.id + "/file");
  
  const href = URL.createObjectURL(blob);
  
  const anchor = window.document.createElement("a");
  
  anchor.href = href;
  
  anchor.download = document.original_filename;
  
  anchor.click();
  
  setTimeout(() => URL.revokeObjectURL(href), 60_000); 
}
