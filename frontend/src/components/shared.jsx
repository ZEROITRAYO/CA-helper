import { errorMessage } from "@/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label, 
} from "@/components/ui";
import { cn, label } from "@/lib"; 
import { useState } from "react";



export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    setBusy(true);


    try {
      await action();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}




export function ErrorText({ children, className }) {
  if (!children) return null;
  return (
    <p className={cn("text-sm text-danger", className)}>
      {children}
    </p>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return (
    <p className="text-sm text-hint">
      {children}
    </p>
  );
}

export function QueryStatus({ query }) {
  const queries = [].concat(query);

  if (queries.some((one) => one.isPending)) {
    return <p className="text-sm text-hint">Loading...</p>;
  }

  const failed = queries.find((one) => one.isError);
  return failed ? <ErrorText>{errorMessage(failed.error)}</ErrorText> : null;
}



export function Section({ title, description, contentClassName, children, ...cardProps }) {
  return (
    <Card {...cardProps}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  );
}

export function FormField({ id, label, error, hint, ...inputProps }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={!!error}
        {...inputProps}
      />
      {error ? (
        <p id={id + "-error"} className="text-sm text-danger">
          {error.message}
        </p>
      ) : (
        hint && <p className="text-xs text-hint">{hint}</p>
      )}
    </div>
  );
}

export function field(form, name) {
  return { id: name, error: form.formState.errors[name], ...form.register(name) };
}


export function Pager({ data, onPage }) {

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));

  if (pages === 1) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <Button variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
        Previous
      </Button>

      <span>
        Page {data.page} of {pages}
      </span>

      <Button variant="outline" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
        Next
      </Button>
    </div>
  );
}




export function FormCard({ title, description, children }) {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold">{title}</h1>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function Field({ id, label, error, className = "space-y-2", children }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-danger">{error.message}</p>}
    </div>
  );
}

export function Options({ labels, codes = Object.keys(labels), empty }) {
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {codes.map((code) => (
        <option key={code} value={code}>
          {label(labels, code)}
        </option>
      ))}
    </>
  );
}

export function Choice({ id, type = "checkbox", text, ...inputProps }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type={type} {...inputProps} />
      {text}
    </label>
  );
}