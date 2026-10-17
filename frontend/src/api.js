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






export const NOTIFICATIONS_KEY = ["alerts", "notifications"];

export function useNotifications(page) {
  return useGet([...NOTIFICATIONS_KEY, page], `/api/v1/alerts/notifications?page=${page}`);
}

export function markNotificationRead(notificationId) {
  return apiFetch(`/api/v1/alerts/notifications/${notificationId}/read`, { method: "POST" });
}