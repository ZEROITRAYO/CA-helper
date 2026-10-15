import { Link, Navigate, useLocation  } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiRequestError,errorMessage} from "@/api";
import { useAuth } from "@/auth";
import { field, FormCard, FormField, Notice, Section } from "@/components/shared";
import { Button, linkClass} from "@/components/ui";
import { emailSchema, PASSWORD_RULE_TEXT, ROLE_HOME } from "@/lib";


const SECTIONS = [
  {
    title: "What CA Helper does",
    points: [
      "It tells your business which tax filings apply and when they are due, helps you file them yourself, or connects you with a Chartered Accountant (CA).",
      "It never files a return for you and has no access to the government portals. Filing is done by you or by your CA.",
      "The profile and due dates are a guide. Check anything important with a CA.",
    ],
  },
  {
    title: "What we store",
    points: [
      "Your account: name, email and a hashed password (we never store the password itself).",
      "Your business details: name, type, state, address, turnover, PAN, GSTIN, TAN, phone and the answers you give on the profile form.",
      "Your filings and their status, and the documents you or your CA upload.",
    ],
  },
  {
    title: "How we protect it",
    points: [
      "PAN, GSTIN, TAN and phone numbers are encrypted in our database.",
      "Uploaded documents are encrypted and stored on our server; they are never sent anywhere else.",
      "Nothing you enter is sent to an AI service.",
    ],
  },
  {
    title: "Who sees your data",
    points: [
      "A CA you send a request to sees only a summary (business type, state, size) and the filings in the request, not your PAN, GSTIN, TAN or documents.",
      "Once you and a CA agree, that CA sees your full profile, but only the filings in that engagement and the documents linked to them. When the work ends, their access ends.",
      "Our admins see account and verification details, never the contents of your documents.",
    ],
  },
];

function EmailField({ form }) {
  return <FormField label="Email" type="email" autoComplete="email" {...field(form, "email")} />;
}

function NewPasswordFields({ form, title = "Password" }) {
  return (
    <>
      <FormField
        label={title}
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_RULE_TEXT}
        {...field(form, "password")}
      />
      <FormField
        label={"Confirm " + title.toLowerCase()}
        type="password"
        autoComplete="new-password"
        {...field(form, "confirm_password")}
      />
    </>
  );
}

function SubmitButton({ form, busyText, children }) {
  const busy = form.formState.isSubmitting;
  return (
    <Button type="submit" className="w-full" disabled={busy}>
      {busy ? busyText : children}
    </Button>
  );
}

function FooterLink({ text, to, children }) {
  return (
    <p className="text-sm text-hint">
      {text && text + " "}
      <Link to={to} className={linkClass}>
        {children}
      </Link>
    </p>
  );
}

function useZodForm(schema, defaultValues) {
  return useForm({ resolver: zodResolver(schema), defaultValues });
}


const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

const LOGIN_ERROR_TEXT = {
  INVALID_CREDENTIALS: "Wrong email or password.",
  EMAIL_NOT_VERIFIED: "Your email is not verified yet.",
};

function destination(role, from) {
  const home = ROLE_HOME[role];
  return from && (from === home || from.startsWith(`${home}/`)) ? from : home;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { from, email, notice } = useLocation().state ?? {};
  const [serverError, setServerError] = useState(null);

  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const form = useZodForm(loginSchema, { email: email ?? "" });

  // logged in already then go to the right page
  if (user) return <Navigate to={destination(user.role, from)} replace />;

  async function onSubmit(values) {
    setServerError(null);
    setUnverifiedEmail(null);
    try {
      await login(values.email, values.password);
    } catch (error) {
      const known = error instanceof ApiRequestError && LOGIN_ERROR_TEXT[error.code];
      setServerError(known || errorMessage(error));
      if (error instanceof ApiRequestError && error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(values.email);
      }
    }
  }

  return (
    <FormCard title="Log in" description="Businesses, CAs and admins all log in here">
      <Notice>{notice}</Notice>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <EmailField form={form} />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          {...field(form, "password")}
        />
        {serverError && (
          <p className="text-sm text-danger">
            {serverError}{" "}
            {unverifiedEmail && (
              <Link to="/verify-email" state={{ email: unverifiedEmail }} className={linkClass}>
                Enter your code
              </Link>
            )}
          </p>
        )}
        <SubmitButton form={form} busyText="Logging in...">
          Log in
        </SubmitButton>
      </form>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password" className={linkClass}>
          Forgot password?
        </Link>
        <Link to="/signup" className={linkClass}>
          Create an account
        </Link>
      </div>
    </FormCard>
  );
}

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Terms and Privacy Policy</h1>
      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm underline">
        Back to the home page
      </Link>
    </div>
  );
}
