import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label, 
} from "@/components/ui";
import { cn } from "@/lib"; 

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
