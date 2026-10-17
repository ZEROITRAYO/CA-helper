import { Link, Outlet } from "react-router";

import {
  NotFoundPage,
  TermsPage,
  LoginPage, 
  HomePage,   
  SignupPage,
  VerifyEmailPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from "@/pages/AuthPages";

export const appRoutes = [
  {
    path: "/",
    element: <PublicLayout />,
    
    children: [
      { path: "terms", element: <TermsPage /> },
      { path: "login", element: <LoginPage /> },
      { index: true, element: <HomePage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "verify-email", element: <VerifyEmailPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <header className="border-b px-8 py-4">
        <Link to="/" className="text-lg font-semibold">
          CA Helper
        </Link>
      </header>
      <main className="mx-auto max-w-5xl p-8">
        <Outlet />
      </main>
    </div>
  );
}
