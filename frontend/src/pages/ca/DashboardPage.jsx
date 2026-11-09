import { Link } from "react-router";

import { useCaDashboard, useCaProfile, useCaServices } from "@/api";
import { Welcome } from "@/components/shared";
import { buttonClass, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { CA_VERIFICATION_STATUS_LABELS, label } from "@/lib";

// CA home dashboard
export function CaDashboardPage() {
  const dashboard = useCaDashboard();

  return (
    <div className="space-y-6">
      <Welcome query={dashboard} />
      <ProfileReminder />
    </div>
  );
}

// What the CA still has to do before businesses can find them.
const REMINDERS = {
  missing: {
    title: "Complete your profile",
    text: "Add your membership and Certificate of Practice numbers, city, languages and specializations. Businesses can find you once an admin has verified them.",
    action: "Complete profile",
  },
  pending: {
    title: "Your profile is waiting for verification",
    text: "An admin is checking your membership and CoP numbers. You will appear in the marketplace once verified.",
    action: "View profile",
  },
  rejected: {
    title: "Your profile needs changes",
    text: "An admin could not confirm your numbers. Correct your details and save to ask for a new check.",
    action: "Edit profile",
  },
};

function ProfileReminder() {
  const profile = useCaProfile();
  const menu = useCaServices();

  // If profile is still loading or failed then show nothing.
  if (!profile.isSuccess) {
    return null;
  }

  // Which reminder to show. If No profile means "missing".
  let statusKey = "missing";
  if (profile.data && profile.data.verification_status != null) {
    statusKey = profile.data.verification_status;
  }

  const reminder = REMINDERS[statusKey];

  // No reminder for this status (for example if "verified" then show nothing).
  if (!reminder) {
    return null;
  }

  // Has the CA set at least one price?
  let hasPrices = false;
  if (menu.data) {
    hasPrices = menu.data.items.length > 0;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{reminder.title}</CardTitle>
        <CardDescription>{reminder.text}</CardDescription>
        <SetupChecklist profile={profile.data} hasPrices={hasPrices} />
        <div>
          <Link to="/ca/profile" className={buttonClass()}>{reminder.action}</Link>
        </div>
      </CardHeader>
    </Card>
  );
}

// The steps to being listed: profile create, certificate, prices, then the admin's check.
function SetupChecklist({ profile, hasPrices }) {
  let hasProfile = false;
  let hasCertificate = false;
  let status = undefined;
  if (profile) {
    hasProfile = true;
    hasCertificate = Boolean(profile.has_certificate);
    status = profile.verification_status;
  }

  const steps = [
    { name: "Profile", done: hasProfile },
    { name: "Certificate uploaded", done: hasCertificate },
    { name: "Prices set", done: hasPrices },
  ];

  // Text for the verification line.
  let statusText = "not started";
  if (status) {
    statusText = label(CA_VERIFICATION_STATUS_LABELS, status);
  }

  // Show the admin's reason only when the profile was rejected and a reason exists.
  let reasonText = "";
  if (status === "rejected" && profile.rejection_reason) {
    reasonText = " (" + profile.rejection_reason + ")";
  }

  return (
    <ul aria-label="Setup checklist" className="space-y-1 pt-2 text-sm">
      {steps.map((step) => (
        <StepLine key={step.name} step={step} />
      ))}
      <li>
        Verification: {statusText}
        {reasonText}
      </li>
    </ul>
  );
}

function StepLine({ step }) {
  let mark = "✗";
  let screenReaderText = ": to do";
  if (step.done) {
    mark = "✓";
    screenReaderText = ": done";
  }

  return (
    <li>
      <span aria-hidden="true">{mark}</span> {step.name}
      <span className="sr-only">{screenReaderText}</span>
    </li>
  );
}