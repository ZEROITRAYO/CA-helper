import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiRequestError, errorMessage, signup} from "@/api";
import { useAuth } from "@/auth";
import { field, FormCard, FormField, Notice, Section, ErrorText } from "@/components/shared";
import { Button, buttonClass, Card, CardDescription, CardHeader, CardTitle, linkClass } from "@/components/ui";
import { emailSchema, newPasswordSchema, PASSWORDS_MATCH_ERROR, passwordsMatch, ROLE_HOME} from "@/lib";

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
        hint={"Use at least 8 characters, with at least one letter and one number"}
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
  password: z.string().min(1, "Enter your password"),
});

const LOGIN_ERROR_TEXT = {
  INVALID_CREDENTIALS: "Wrong email or password",
  EMAIL_NOT_VERIFIED: "Your email is not verified yet",
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
    } 
    catch (error) {
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

const SIGNUP_ROLES = ["business", "ca"];

const signupSchema = z
  .object({
    full_name: z.string().trim().min(1, "Enter your name").max(200, "Use at most 200 characters"),
    email: emailSchema,
    role: z.enum(SIGNUP_ROLES, { error: "Choose how you will use CA Helper" }),
    password: newPasswordSchema,
    confirm_password: z.string(),
    terms_accepted: z.boolean(),
  })
  .refine(passwordsMatch, PASSWORDS_MATCH_ERROR)
  .refine((values) => values.terms_accepted, {
    message: "Agree to the Terms and Privacy Policy to sign up",
    path: ["terms_accepted"],
  });


export function SignupPage() {
  const { user } = useAuth();
  
  const navigate = useNavigate();

  const askedRole = useLocation().state?.role;
  
  const [serverError, setServerError] = useState(null);
  
  const form = useZodForm(signupSchema, {
    role: SIGNUP_ROLES.includes(askedRole) ? askedRole : "business",
    terms_accepted: false,
  });

  const errors = form.formState.errors;

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  async function onSubmit(values) {
    setServerError(null);
   
    try {
      await signup(values);
      navigate("/verify-email", { state: { email: values.email } });
    } 
    catch (error) {
      setServerError(errorMessage(error));
    }
  }

  return (
    <FormCard
      title="Create an account"
      description="For businesses, freelancers and Chartered Accountants">
        
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        
        <FormField label="Full name" autoComplete="name" {...field(form, "full_name")} />
        <EmailField form={form} />
        
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">I am signing up as</legend>
          
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="business" {...form.register("role")} />
            Business
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="ca" {...form.register("role")} />
            Chartered Accountant
          </label>

          {errors.role && <p className="text-sm text-danger">{errors.role.message}</p>}
        </fieldset>
        
        <NewPasswordFields form={form} />
        
        <div className="space-y-1">
          <label htmlFor="terms_accepted" className="flex items-center gap-2 text-sm">
            <input id="terms_accepted" type="checkbox" {...form.register("terms_accepted")} />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" className={linkClass}>
                Terms and Privacy Policy
              </Link>
            </span>
          </label>
          
          {errors.terms_accepted && (
            <p className="text-sm text-danger">{errors.terms_accepted.message}</p>
          )}

        </div>
        <ErrorText>{serverError}</ErrorText>
        <SubmitButton form={form} busyText="Creating account...">
          Create account
        </SubmitButton>
      </form>
      
      <FooterLink text="Already have an account?" to="/login">
        Log in
      </FooterLink>

    </FormCard>
  );
}

const AUDIENCES = [
  {
    title: "Businesses",
    text: "Profile, compliance calendar, documents, find a CA",
    action: "Create a business account",
    to: "/signup",
    state: { role: "business" },
  },
  {
    title: "Chartered Accountants",
    text: "Clients, deadlines and requests",
    action: "Join as a CA",
    to: "/signup",
    state: { role: "ca" },
  },
  { title: "Admins", text: "Users, CA verification and configuration", action: "Log in", to: "/login" },
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        
        <h1 className="text-3xl font-semibold">CA Helper</h1>
        <p className="text-hint">
          Know which filings apply to your business and when. File yourself or work with a fairly
          priced CA
        </p>
        
        {user ? (
          <Link to={ROLE_HOME[user.role]} className={buttonClass()}>Go to your dashboard</Link>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className={buttonClass()}>Log in</Link>
          </div>
        )}
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        {
        AUDIENCES.map((audience) => (
          <Link
            key={audience.title}
            to={audience.to}
            state={audience.state}
            className="rounded-xl focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:outline-none"
          >
            
            <Card className="h-full transition-colors hover:bg-soft/50">
              <CardHeader>
                <CardTitle>{audience.title}</CardTitle>
                <CardDescription>{audience.text}</CardDescription>
                <span className="text-sm font-medium text-primary">{audience.action} </span>
              </CardHeader>
            </Card>

          </Link>
        ))
        }
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Terms and Privacy Policy</h1>
      
      {
      SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Section>
      ))
      }

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
