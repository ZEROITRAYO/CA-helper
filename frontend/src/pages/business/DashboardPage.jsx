import { Link } from "react-router";

import { useComplianceDashboard, useFilings, useMyDocumentRequests } from "@/api";
import { NumberCard, RegisterFirst, Welcome } from "@/components/shared";
import { daysLeftText, daysUntil, filingFormLabel, formatDate } from "@/lib";

const DONE = ["filed", "filed_verified"];

export function BusinessDashboardPage() {
  const dashboard = useComplianceDashboard();
  const filings = useFilings();
  
  return (
    <div className="space-y-6">
      
      <Welcome query={dashboard} />

      {filings.data === null && <RegisterFirst>to see your filings and deadlines here</RegisterFirst>}
      
      {dashboard.data?.registered && <Numbers numbers={dashboard.data} />}

      {filings.data && <ToDo filings={filings.data} />}
    
    </div>
  );
}

function Numbers({ numbers }) {
  const next = numbers.next_deadline;

  let deadline = "None";
  let note = "Nothing due";

  if (next) 
  {
    deadline = filingFormLabel(next.form_code);
    note = next.period_label + " - " + formatDate(next.due_date) + " - " + daysLeftText(next.due_date);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <NumberCard
        title="Next deadline"
        value={deadline}
        note={note}
      />

      <NumberCard
        title="Due this month"
        value={numbers.due_this_month}
        note="not filed yet"
      />

      <NumberCard
        title="Overdue"
        value={numbers.overdue}
        note={numbers.overdue > 0
          ? "due date passed, not marked filed"
          : "all on time"}
        alert={numbers.overdue > 0}
      />

      <NumberCard
        title="With a CA"
        value={numbers.with_ca}
        note="a CA is working on them"
      />
    </div>
  );
}

function ToDo({ filings }) {
  const tasks = [];
  const requests = useMyDocumentRequests();

  for (const request of requests.data ?? []) {
    tasks.push({
      key: request.id,
      
      text: `${request.ca_name} asked for a document for ${filingFormLabel(request.form_code, request.period_label)} ${request.period_label}: ${request.message}`,
      
      to: `/business/compliance/${request.compliance_item_id}`,
    });
  }
  
  const overdue = filings.filter((item) => {
    return !DONE.includes(item.status) &&
      daysUntil(item.due_date) < 0;
  });

  //Overdue tasks
  if (overdue.length > 0) {
    tasks.push({
      key: "overdue",
      
      text: "Check " + overdue.length + " overdue filings",
      
      to: "/business/compliance"
    });
  }

  // Filings due in the next 30 days with no way of filing chosen yet
  const undecided = filings.filter((item) => {
    const days = daysUntil(item.due_date);

    return item.filing_path === null &&
      item.status !== "with_ca" &&
      !DONE.includes(item.status) &&
      days >= 0 &&
      days <= 30;
  });

  for (const item of undecided.slice(0, 5)) {
    
    tasks.push({
      key: item.id,
      
      text: "Decide how to file " + filingFormLabel(item.form_code) + " " +
        item.period_label + " (" + daysLeftText(item.due_date).toLowerCase() + "): yourself or with a CA",
      
        to: "/business/compliance/" + item.id
    });

  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">To do</h2>

      {tasks.length === 0 ? (
        <p className="text-sm text-hint">
          Nothing to do right now.
        </p>
      ) : (
        
        <ul className="space-y-1 text-sm">
          
          {tasks.map((task) => (
            
            <li key={task.key}>
              
              <Link
                to={task.to}
                className="underline-offset-4 hover:underline"
              >
                {task.text}
              </Link>

            </li>
          ))}

        </ul>

      )}
    </section>
  );
}