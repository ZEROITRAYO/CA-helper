import { errorMessage } from "@/api";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, linkClass} from "@/components/ui";
import { cn, COMPLIANCE_STATUS_LABELS, label } from "@/lib";
import { useState } from "react";
import { Link } from "react-router";




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
       
       
export function Welcome({ query }) {
  let title = "Loading...";
  
  if (query.isError) title = "Dashboard";
  
  if (query.isSuccess) title = query.data.message;
  
  return (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      
      {query.isError && (
        <Section title="Could not load the dashboard" description={errorMessage(query.error)} />
      )}

    </>
  );
}


export function NumberCard({ title, value, note, alert, children }) {
  
  return (
    <Card className={alert ? "ring-red-300" : undefined}>
      <CardHeader>
        
        <CardDescription>{title}</CardDescription>
        
        <CardTitle className={cn("text-2xl tabular-nums", alert && "text-red-700")}>{value}</CardTitle>
        
        {note && <p className="text-xs text-hint">{note}</p>}
        
        {children}
      
      </CardHeader>
    </Card>
  );
}

export function RegisterFirst({ children }) {
 
  return (
    <p className="text-sm">
      
      <Link to="/business/onboarding" className="underline">
        Register your business
      </Link>

      {" "}{children}

    </p>
  );
}





export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto">

      <table className="w-full text-left text-sm">

        <thead className="border-b text-hint">
          <tr>
            {headers.map((header, index) => (
              <th key={index} className={cn("py-2 font-medium", index < headers.length - 1 && "pr-4")}>{header}</th>
            ))}
          </tr>
        </thead>

        <tbody>{children}</tbody>

      </table>

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


export function Row({ cells }) {
  return (

    <tr className="border-b align-top">
      {cells.map((cell, index) => (
        <td key={index} className={cn("py-2", index < cells.length - 1 && "pr-4")}> {cell} </td>
      ))}
    </tr>
  );
}



const COLOURS = {
  overdue: "bg-red-100 text-red-900",
  docs_pending: "bg-amber-100 text-amber-900",
  ready: "bg-sky-100 text-sky-900",
  with_ca: "bg-violet-100 text-violet-900",
  filed: "bg-green-100 text-green-900",
  filed_verified: "bg-green-100 text-green-900",
};



export function StatusBadge({ status }) {
  return (
    <Badge variant="secondary" className={COLOURS[status]}>
      {label(COMPLIANCE_STATUS_LABELS, status)}
    </Badge>
  );
}

export function BackLink({ to, children }) 
{
  return ( <Link to={to} className={cn("text-sm", linkClass)}> {children} </Link> );
}


