import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/api";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, linkClass} from "@/components/ui";
import { CA_SPECIALIZATION_LABELS, cn, COMPLIANCE_STATUS_LABELS, label } from "@/lib";
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



export function useObjectUrl(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
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

export function caFacts(ca) {
  const years = ca.years_experience === 1 ? "year" : "years";
  return `${ca.city} · ${ca.years_experience} ${years} of experience · ICAI no. ${ca.membership_no}`;
}


export function SpecializationBadges({ codes }) {
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <Badge key={code} variant="outline">
          {label(CA_SPECIALIZATION_LABELS, code)}
        </Badge>
      ))}
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

export function PageTitle({ title, children }) {
  return (
    <div className="space-y-1">
  
      <h1 className="text-2xl font-semibold">{title}</h1>    
      
      {children && <p className="text-sm text-hint">{children}</p>}
    
    </div>
  );
}



export function VerifiedBadge() {
  return <Badge className="bg-green-100 text-green-700">Verified</Badge>;
}


export function Stars({ stars }) {
  return (
    <span className="text-amber-500" role="img" aria-label={stars + " out of 5 stars"}>
      {"*".repeat(stars)}
    </span>
  );
}



export function RatingSummary({ average, count }) {
  if (!count) {
    return <span className="text-hint">No ratings yet</span>;
  }
  return (
    <span>
      <span className="text-amber-500">★</span> {average} ({count} {count === 1 ? "rating" : "ratings"})
    </span>
  );
}





const STATUS_COLORS = {
  requested: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-700",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};


function Timeline({ status }) {
  const ended = status === "declined" || status === "cancelled";
  const steps = ended ? ["requested", status] : ["requested", "active", "completed"];
  const current = steps.indexOf(status);

  return (
    <ol aria-label="Progress" className="flex flex-wrap items-center gap-1 text-xs">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            index === current && "font-semibold",
            index < current && "text-hint",
            index > current && "text-hint/60",
          )}>
        
          {index > 0 && <span aria-hidden="true">→ </span>}
          {index < current ? "✓ " : index === current ? "● " : "○ "}
          {label(ENGAGEMENT_STATUS_LABELS, step)}
        </li>

      ))}
    </ol>
  );
}



function EngagementCard({ engagement, title, children }) {
  const items = engagement.items;
  const total = items.reduce((sum, item) => sum + Number(item.listed_price), 0);

  return (
    <Card>
      <CardHeader>

        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3>{title}</h3>
          <Badge className={STATUS_COLORS[engagement.status]}>
            {label(ENGAGEMENT_STATUS_LABELS, engagement.status)}
          </Badge>
        </CardTitle>

        <CardDescription>Requested {formatDateTime(engagement.requested_at)}</CardDescription>
        <Timeline status={engagement.status} />
      </CardHeader>


      <CardContent className="space-y-3 text-sm">
        <table className="w-full text-left">
          <thead className="border-b text-hint">
            <tr>
              <th className="py-1 pr-3 font-medium">Filing</th>
              <th className="py-1 pr-3 font-medium">Service</th>
              <th className="py-1 font-medium">Price</th>
            </tr>
          </thead>

          
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-1 pr-3">

                  {item.form_code
                    ? filingFormLabel(item.form_code, item.period_label)
                    : "Removed filing"}{" "}
                  {item.period_label}
                  {item.due_date && (
                    <span className="text-hint"> · due {formatDate(item.due_date)}</span>
                  )}


                </td>
                <td className="py-1 pr-3">{item.service_name}</td>
                <td className="py-1">{formatRupees(item.listed_price)}</td>
              </tr>
            ))}

          </tbody>


          <tfoot className="font-medium">
            <tr>
              <td className="py-1 pr-3" colSpan={2}> Total </td>
              <td className="py-1">{formatRupees(total)}</td>

            </tr>

          </tfoot>
        </table>


        {engagement.rating && (
          <p>
            <span className="font-medium">Rating: </span>
            <Stars stars={engagement.rating.stars} />
            {engagement.rating.review && <span> “{engagement.rating.review}”</span>}
          </p>
        )}

        {children}
      </CardContent>
    </Card>
  );
}


export function EngagementGroups({ engagements, waitingTitle, titleOf, actions }) {
  const groups = [
    [waitingTitle, ["requested"]],
    ["Active", ["active"]],
    ["Finished", ["completed", "declined", "cancelled"]],
  ];


  return groups.map(([title, statuses]) => {
    const inGroup = engagements.filter((engagement) => statuses.includes(engagement.status));
    if (inGroup.length === 0) return null;

    return (
      <section key={title} className="space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>

        {inGroup.map((engagement) => (
          <EngagementCard key={engagement.id} engagement={engagement} title={titleOf(engagement)}> {actions(engagement)} </EngagementCard>
        ))}


      </section>
    );
  });
}
