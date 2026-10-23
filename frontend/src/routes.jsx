import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";

import { useAuth } from "@/auth";
import { Button } from "@/components/ui";
import { cn, ROLE_HOME, USER_ROLE_LABELS } from "@/lib";
import { NotFoundPage, TermsPage, LoginPage, HomePage, SignupPage, VerifyEmailPage, ForgotPasswordPage, ResetPasswordPage } from "@/pages/AuthPages";
import { SettingsPage } from "@/pages/SettingsPage";
import { BusinessDashboardPage } from "@/pages/business/DashboardPage";
import { CompliancePage } from "@/pages/business/CalenderPage";
import { OnboardingPage } from "@/pages/business/OnboardingPage";
import { FilingPage } from "@/pages/business/FilingPage";
import { DocumentsPage } from "@/pages/business/DocumentsPage";
import { CaProfilePage } from "@/pages/ca/ProfilePage";



export const NAV = {
  business: [
    { label: "Dashboard", path: "/business" },
    { label: "Business profile", path: "/business/onboarding" },
    { label: "Compliance calendar", path: "/business/compliance" },
    { label: "Document vault", path: "/business/documents" },
    { label: "Find a CA", path: "/business/marketplace" },
    { label: "My engagements", path: "/business/engagements" },
    { label: "Notification settings", path: "/business/settings" },
    
  ],
  ca: [
    { label: "Dashboard", path: "/ca" },
    { label: "Services & prices", path: "/ca/services" },
    { label: "My engagements", path: "/ca/engagements" },
    { label: "My clients", path: "/ca/clients" },
    { label: "Deadline batches", path: "/ca/batches" },
    { label: "Notification settings", path: "/ca/settings" },
    { label: "My profile", path: "/ca/profile" },
  ],
  admin: [
    { label: "Dashboard", path: "/admin" },
    { label: "Users & CAs", path: "/admin/users" },
  ],
};


function roleArea(role, children) {
  return {
    path: ROLE_HOME[role],
    element: (
      <RequireRole role={role}>
        <AppShell role={role} nav={NAV[role]} />
      </RequireRole>
    ),
    children,
  };
}



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
  
  roleArea("business", [
    { path: "settings", element: <SettingsPage /> },
    { path: "onboarding", element: <OnboardingPage /> },
    { index: true, element: <BusinessDashboardPage /> },  
    { path: "compliance", element: <CompliancePage /> },
    { path: "compliance/:itemId", element: <FilingPage /> },
    { path: "documents", element: <DocumentsPage /> },
  ]),

  roleArea("ca", [
  { path: "settings", element: <SettingsPage /> },
  { path: "profile", element: <CaProfilePage /> },
  ]),


  
  roleArea("admin", [
  ]),

  
  { path: "*", element: <NotFoundPage /> },
];



export function AppShell({ role, nav }) {
  const { user, logout } = useAuth();
  const title = USER_ROLE_LABELS[role];
  const home = ROLE_HOME[role];

  return (
    <div className="flex min-h-screen bg-background text-ink">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-soft/40 p-4">

        <div>
          <Link to={home} className="text-lg font-semibold">
            CA Helper
          </Link>
          <p className="text-xs text-hint">{title}</p>
        </div>


        <nav
          className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
          aria-label={`${title} navigation`}
        >

          {nav.map((item) => (

            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === home}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-primary text-white" : "hover:bg-soft",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>


        <div className="space-y-2 border-t pt-4">

          <p className="truncate text-sm">{user?.full_name}</p>

          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            Log out
          </Button>

        </div>


      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>

    </div>
  );
}




export function RequireRole({ role, children }) {

  const { user, clickedLogout } = useAuth();
  const location = useLocation();

  if (!user) {
    const state = clickedLogout ? undefined : { from: location.pathname };
    return <Navigate to="/login" replace state={state} />;
  }


  if (user.role !== role) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return children;
}




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
