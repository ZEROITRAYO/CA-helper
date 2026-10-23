import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  ApiRequestError, CA_PROFILE_KEY, errorMessage, saveCaProfile, uploadCertificate, useCaProfile,} from "@/api";
import { useAuth } from "@/auth";
import {
  caFacts, ErrorText, Field, field, FormField, Notice, QueryStatus, Section, SpecializationBadges, useAction,
} from "@/components/shared";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea,
} from "@/components/ui";
import {
  CA_LANGUAGE_LABELS, CA_SPECIALIZATION_LABELS, CA_VERIFICATION_STATUS_LABELS, label, labelList,
} from "@/lib";


const profileSchema = z.object({
  membership_no: z.string().regex(/^[0-9]{6}$/, "Enter your 6-digit ICAI membership number."),
  cop_number: z.string().trim().min(1, "Enter your Certificate of Practice number.").max(20),
  city: z.string().trim().min(1, "Enter your city.").max(100),
  languages: z.array(z.string()).min(1, "Choose at least one language."),
  specializations: z.array(z.string()).min(1, "Choose at least one specialization."),
  capacity: z.coerce.number().int().min(1, "Enter a number from 1 to 1000.").max(1000),
  years_experience: z.coerce.number().int().min(0, "Enter a number from 0 to 70.").max(70),
  about: z.string().trim().max(500, "Use at most 500 characters."),
});


const EMPTY_FORM = {
  membership_no: "",
  cop_number: "",
  city: "",
  languages: [],
  specializations: [],
  capacity: "",
  years_experience: "",
  about: "",
};



function formValues(profile) {
  if (!profile) return EMPTY_FORM;
  return Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, profile[key]]));
}



const STATUS_COLORS = {
  pending: "bg-red-100 text-red-700",
  verified: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};


const STATUS_TEXT = {
  pending:
    "An admin is checking your membership and CoP numbers. You will appear in the marketplace once verified.",
  verified:
    "Businesses can find you in the marketplace. Changing your membership or CoP number needs a new check.",
  rejected:
    "An admin could not confirm your numbers. Correct your details and save to ask for a new check.",
};


const IDENTITY_FIELDS = ["membership_no", "cop_number"];


export function CaProfilePage() {
  const profile = useCaProfile();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">My profile</h1>
      <QueryStatus query={profile} />
      {profile.isSuccess && (
        <>
          <StatusCard profile={profile.data} />
          <CertificateCard profile={profile.data} />
          <CaProfileForm profile={profile.data} />
          {profile.data && <PreviewCard profile={profile.data} />}
        </>
      )}
    </div>
  );
}


function StatusCard({ profile }) {
  const status = profile?.verification_status; 
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Verification
          {status && (
            <Badge className={STATUS_COLORS[status]}>
              {label(CA_VERIFICATION_STATUS_LABELS, status)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {status
            ? STATUS_TEXT[status]
            : "Complete your profile. An admin checks your membership and CoP numbers before businesses can see you."}
        </CardDescription>
        {status === "rejected" && profile.rejection_reason && (
          <p className="text-sm">
            <span className="font-medium">The admin's reason: </span>
            {profile.rejection_reason}
          </p>
        )}
      </CardHeader>
    </Card>
  );
}



function CertificateCard({ profile }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();

  async function onUpload(event) {
    event.preventDefault();
    setDone(false);
    await run(async () => {
      queryClient.setQueryData(CA_PROFILE_KEY, await uploadCertificate(file));
      setDone(true);
    });
  }

  let description = "Save your profile first, then upload your certificate.";
  if (profile?.has_certificate) {
    description = "Uploaded. Uploading a new one sends your profile back for verification.";
  } else if (profile) {
    description =
      "Upload your Certificate of Practice (PDF, JPG or PNG, up to 5 MB). An admin checks it before verifying you.";
  }

  return (
    <Section title="Certificate of Practice" description={description}>
      {profile && (
        <>
          <form className="flex flex-wrap items-center gap-3" onSubmit={onUpload}>
            <Label htmlFor="certificate" className="sr-only">
              Certificate file
            </Label>
            <Input
              id="certificate"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="w-auto"
              onChange={(event) => setFile(event.target.files[0] || null)}
            />
            <Button type="submit" disabled={!file || busy}>
              {busy ? "Uploading..." : "Upload certificate"}
            </Button>
          </form>
          <ErrorText className="mt-2">{error}</ErrorText>
          {done && (
            <p className="mt-2 text-sm text-hint">
              Certificate uploaded. An admin will check it.
            </p>
          )}
        </>
      )}
    </Section>
  );
}


function PreviewCard({ profile }) {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <CardDescription>Preview: how businesses see you</CardDescription>
        <CardTitle>{user ? user.full_name : ""}</CardTitle>
        <CardDescription>{caFacts(profile)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <SpecializationBadges codes={profile.specializations} />
        <p>
          <span className="text-hint">Languages: </span>
          {labelList(CA_LANGUAGE_LABELS, profile.languages)}
        </p>
        {profile.about && <p>{profile.about}</p>}
        {profile.verification_status !== "verified" && (
          <p className="text-xs text-hint">
            Businesses see this once an admin has verified you.
          </p>
        )}
      </CardContent>
    </Card>
  );
}


function CaProfileForm({ profile }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState(null);
  const [saved, setSaved] = useState(false);
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: formValues(profile) });
  const { errors, isSubmitting } = form.formState;

  const typed = useWatch({ control: form.control, name: IDENTITY_FIELDS });
  const needsNewCheck =
    profile?.verification_status === "verified" &&
    IDENTITY_FIELDS.some((name, index) => typed[index] !== profile[name]);

  async function onSubmit(values) {
    setServerError(null);
    setSaved(false);
    try {
      queryClient.setQueryData(CA_PROFILE_KEY, await saveCaProfile(values));
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "DUPLICATE_MEMBERSHIP_NO") {

        form.setError("membership_no", { message: error.message }, { shouldFocus: true });
      } else {
        setServerError(errorMessage(error));
      }
    }
  }

  return (
    <Section title="Practice details" description="Businesses see everything here except your CoP number.">
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="ICAI membership number"
            inputMode="numeric"
            {...field(form, "membership_no")}
          />
          <FormField label="Certificate of Practice number" {...field(form, "cop_number")} />
          <FormField label="City" {...field(form, "city")} />
          <FormField
            label="Years of experience"
            type="number"
            min={0}
            {...field(form, "years_experience")}
          />
          <FormField
            label="Capacity (clients at a time)"
            type="number"
            min={1}
            {...field(form, "capacity")}
          />
        </div>
        {needsNewCheck && (
          <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
            You changed your membership or CoP number: after saving, your profile goes back to an
            admin for verification and you leave the marketplace until then.
          </p>
        )}
        <CheckboxGroup
          legend="Specializations"
          labels={CA_SPECIALIZATION_LABELS}
          error={errors.specializations}
          {...form.register("specializations")}
        />
        <CheckboxGroup
          legend="Languages"
          labels={CA_LANGUAGE_LABELS}
          error={errors.languages}
          {...form.register("languages")}
        />
        <Field id="about" label="About your practice (optional)" error={errors.about}>
          <Textarea id="about" rows={3} aria-invalid={!!errors.about} {...form.register("about")} />
        </Field>
        <ErrorText>{serverError}</ErrorText>
        <Notice>{saved && "Profile saved."}</Notice>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save profile"}
        </Button>
      </form>
    </Section>
  );
}


function CheckboxGroup({ legend, labels, error, ...inputProps }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(labels).map(([code, text]) => (
          <label
            key={code}
            htmlFor={inputProps.name + "-" + code}
            className="flex items-center gap-2 text-sm"
          >
            <input id={inputProps.name + "-" + code} type="checkbox" value={code} {...inputProps} />
            {text}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error.message}</p>}
    </fieldset>
  );
}