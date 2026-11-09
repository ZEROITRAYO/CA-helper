import { useState } from "react";
import { Link, useParams } from "react-router";

import {
  CA_WORKSPACE_KEY,
  caMarkFiled,
  cancelDocumentRequest,
  createDocumentRequest,
  downloadDocument,
  useCaBatches,
  useCaClient,
  useCaClients,
  useRefresh,
} from "@/api";

import {
  BackLink,
  ErrorText,
  Field,
  PageTitle,
  QueryStatus,
  Row,
  Section,
  StatusBadge,
  Table,
  useAction,
} from "@/components/shared";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@/components/ui";

import {
  daysLeftText,
  ENTITY_TYPE_LABELS,
  filingFormLabel,
  formatDate,
  formatRupees,
  GST_SCHEME_LABELS,
  ITR_FORM_LABELS,
  label,
  MSME_TIER_LABELS,
} from "@/lib";


// Filing statuses that mean "already filed".
const FILED = ["filed", "filed_verified"];


// Page 1: list of all clients

export function CaWorkspacePage() {
  const clients = useCaClients();

  const loaded = clients.isSuccess;
  const noClients = loaded && clients.data.length === 0;

  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle title="My clients">
        Businesses you are working for, most urgent first. Open a client to see their filings, ask
        for documents and mark filings as filed.
      </PageTitle>

      <QueryStatus query={clients} />

      {noClients && (
        <p className="text-sm text-hint">
          No active clients yet. Accepted requests in{" "}
          <Link to="/ca/engagements" className="underline">
            My engagements
          </Link>{" "}
          appear here.
        </p>
      )}

      {loaded && clients.data.map((row) => <ClientCard key={row.business_id} row={row} />)}
    </div>
  );
}

function ClientCard({ row }) {
  // Text about the next deadline.
  let next = "no upcoming deadline";
  if (row.next_deadline) {
    const daysLeft = daysLeftText(row.next_deadline).toLowerCase();
    next = `next deadline ${formatDate(row.next_deadline)} (${daysLeft})`;
  }

  // Colour of the "Urgency" badge: red if score is above 0, grey otherwise.
  let urgencyClass = "rounded-md px-2 py-0.5 text-sm tabular-nums ";
  if (row.score > 0) {
    urgencyClass = urgencyClass + "bg-red-100 text-red-800";
  } else {
    urgencyClass = urgencyClass + "bg-soft text-hint";
  }

  // What to show in the card body.
  let reasonsContent;
  if (row.reasons.length === 0) {
    reasonsContent = <p className="text-hint">Nothing urgent.</p>;
  } else {
    reasonsContent = (
      <>
        <p className="font-medium">Why flagged</p>
        <ul className="list-disc pl-5">
          {row.reasons.map((reason) => (
            <li key={reason.reason}>
              {reason.reason} <span className="text-hint">(+{reason.points})</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          <Link to={"/ca/clients/" + row.business_id} className="hover:underline">
            {row.business_name}
          </Link>
          <span className={urgencyClass}>Urgency {row.score}</span>
        </CardTitle>
        <CardDescription>
          {row.open_filing_count} of {row.filing_count} filings to do · {next} ·{" "}
          {row.overdue_count} overdue · {row.open_request_count} open document requests
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">{reasonsContent}</CardContent>
    </Card>
  );
}



// Page 2: one client page

export function CaClientPage() {
  const { businessId } = useParams();
  const client = useCaClient(businessId);
  const refresh = useRefresh();

  // Called after any change, so the data on screen is fetched again.
  function onChanged() {
    refresh(CA_WORKSPACE_KEY);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <BackLink to="/ca/clients">My clients</BackLink>
      <QueryStatus query={client} />
      {client.isSuccess && (
        <>
          <h1 className="text-2xl font-semibold">{client.data.business.legal_name}</h1>
          <Profile business={client.data.business} profile={client.data.profile} />
          <h2 className="text-lg font-semibold">Filings you work on</h2>
          {client.data.filings.length === 0 && (
            <p className="text-sm text-hint">No filings in active work.</p>
          )}
          {client.data.filings.map((row) => (
            <FilingCard
              key={row.filing.id}
              businessId={businessId}
              row={row}
              onChanged={onChanged}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Profile({ business, profile }) {
  // Each line is [name, value].
  const lines = [
    ["Entity type", label(ENTITY_TYPE_LABELS, business.entity_type)],
    ["State", business.state],
    ["PAN", business.pan],
    ["GSTIN", business.gstin || "Not registered"],
    ["TAN", business.tan || "—"],
    ["Phone", business.phone],
    ["Annual turnover", formatRupees(business.annual_turnover)],
  ];

  // Extra lines only if the business has a profile.
  if (profile) {
    let auditText = "Does not apply";
    if (profile.audit_applicable) {
      auditText = "Applies";
    }
    lines.push(["MSME tier", label(MSME_TIER_LABELS, profile.msme_tier)]);
    lines.push(["GST scheme", label(GST_SCHEME_LABELS, profile.gst_scheme)]);
    lines.push(["ITR form", label(ITR_FORM_LABELS, profile.itr_form)]);
    lines.push(["Tax audit", auditText]);
  }

  return (
    <Section title="Business profile" description={business.description}>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {lines.map((line) => (
          <div key={line[0]} className="flex gap-2">
            <dt className="text-hint">{line[0]}:</dt>
            <dd>{line[1]}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function FilingCard({ businessId, row, onChanged }) {
  const item = row.filing;
  const filed = FILED.includes(item.status);

  // Map from checklist key -> readable name. Two fixed names, plus one per checklist entry.
  const labels = { general: "Other", acknowledgement: "Acknowledgement" };
  for (const entry of row.checklist) {
    labels[entry.key] = entry.label;
  }

  // Count required documents, and how many of them are ready.
  const required = row.checklist.filter((entry) => entry.required);
  const ready = required.filter((entry) => entry.ticked);

  // Extra text after the due date.
  let daysText = "";
  if (!filed) {
    daysText = " · " + daysLeftText(item.due_date);
  }
  let ackText = "";
  if (item.acknowledgement_no) {
    ackText = " · Acknowledgement number " + item.acknowledgement_no;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {filingFormLabel(item.form_code, item.period_label)} · {item.period_label}
          <StatusBadge status={item.status} />
        </CardTitle>
        <CardDescription>
          Due {formatDate(item.due_date)}
          {daysText}
          {ackText}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-medium">
            Documents: {ready.length} of {required.length} required ready
          </p>
          <ul className="space-y-0.5">
            {row.checklist.map((entry) => (
              <ChecklistLine key={entry.key} entry={entry} />
            ))}
          </ul>
        </div>

        <Files files={row.documents} labels={labels} />
        <Requests requests={row.open_requests} labels={labels} onChanged={onChanged} />

        {!filed && (
          <RequestForm
            businessId={businessId}
            item={item}
            checklist={row.checklist}
            onChanged={onChanged}
          />
        )}

        {item.status === "with_ca" && (
          <MarkFiledForm businessId={businessId} item={item} onChanged={onChanged} />
        )}
      </CardContent>
    </Card>
  );
}

// One line of the document checklist: a tick (✓) if ready, a circle (○) if not.
function ChecklistLine({ entry }) {
  let mark = "○";
  if (entry.ticked) {
    mark = "✓";
  }

  return (
    <li>
      <span aria-hidden="true">{mark}</span> {entry.label}
      {!entry.required && <span className="text-hint"> (if it applies)</span>}
    </li>
  );
}

function Files({ files, labels }) {
  const { error, run } = useAction();

  function open(file) {
    run(() => downloadDocument({ id: file.document_id, original_filename: file.original_filename }));
  }

  let content;
  if (files.length === 0) {
    content = <p className="text-hint">No files yet.</p>;
  } else {
    content = (
      <ul>
        {files.map((file) => (
          <li key={file.document_id + file.checklist_key} className="flex flex-wrap items-center gap-2">
            <span className="break-all">{file.original_filename}</span>
            <span className="text-hint">({label(labels, file.checklist_key)})</span>
            <Button
              variant="link"
              size="sm"
              aria-label={"Open " + file.original_filename}
              onClick={() => open(file)}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <p className="font-medium">Files</p>
      {content}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Requests({ requests, labels, onChanged }) {
  const { error, run } = useAction();

  async function cancel(request) {
    const ok = await run(() => cancelDocumentRequest(request.id));
    if (ok) {
      onChanged();
    }
  }

  // Nothing to show if there are no open requests.
  if (requests.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="font-medium">Waiting for the client</p>
      <ul>
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-2">
            <span>
              {label(labels, request.checklist_key)}: {request.message}
            </span>
            <Button variant="link" size="sm" onClick={() => cancel(request)}>
              Cancel request
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// Which document should be selected first in the dropdown:
// the first one that is not ticked yet, If none then use general.
function firstMissingKey(checklist) {
  for (const entry of checklist) {
    if (!entry.ticked) {
      if (entry.key === null || entry.key === undefined) {
        return "general";
      }
      return entry.key;
    }
  }
  return "general";
}

function RequestForm({ businessId, item, checklist, onChanged }) {
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();

  async function onSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSent(false);

    const checklistKey = form.get("checklist_key");
    const message = form.get("message").trim();

    const ok = await run(() => createDocumentRequest(businessId, item.id, checklistKey, message));
    if (ok) {
      formElement.reset();
      setSent(true);
      onChanged();
    }
  }

  const keyId = "key-" + item.id;
  const messageId = "message-" + item.id;

  return (
    <form className="space-y-2 rounded-lg border p-3" onSubmit={onSubmit}>
      <p className="font-medium">Ask for a document</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field id={keyId} label="Document" className="space-y-1">
          <Select id={keyId} name="checklist_key" defaultValue={firstMissingKey(checklist)}>
            {checklist.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
            <option value="general">Something else</option>
          </Select>
        </Field>
        <Field id={messageId} label="Message" className="space-y-1">
          <Input
            id={messageId}
            name="message"
            required
            maxLength={1000}
            placeholder="What exactly you need"
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          Send request
        </Button>
        {sent && <p className="text-hint">Sent. The client sees it as a to-do.</p>}
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}

function MarkFiledForm({ businessId, item, onChanged }) {
  const [done, setDone] = useState(null);
  const { busy, error, run } = useAction();

  function onSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const arn = new FormData(formElement).get("acknowledgement_no").trim();
    const file = formElement.elements.file.files[0];

    // Note: setDone and onChanged stay in run(), same as before,
    // so they only happen when caMarkFiled succeeds.
    run(async () => {
      const result = await caMarkFiled(businessId, item.id, arn, file);

      if (result.engagement_completed) {
        setDone("Marked as filed. That was the last filing of the engagement, so it is now completed.");
      } else {
        setDone("Marked as filed.");
      }
      onChanged();
    });
  }

  // After success, show only the message instead of the form.
  if (done) {
    return <p className="text-hint">{done}</p>;
  }

  const arnId = "arn-" + item.id;
  const ackId = "ack-" + item.id;

  return (
    <form className="space-y-2 rounded-lg border p-3" onSubmit={onSubmit}>
      <p className="font-medium">Mark as filed</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field id={arnId} label="Acknowledgement number (ARN), optional" className="space-y-1">
          <Input id={arnId} name="acknowledgement_no" maxLength={50} />
        </Field>
        <Field id={ackId} label="Acknowledgement file, optional" className="space-y-1">
          <Input id={ackId} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          Mark as filed
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}


// Page 3: "Deadline batches"

export function CaBatchesPage() {
  const batches = useCaBatches();

  const loaded = batches.isSuccess;
  const noBatches = loaded && batches.data.length === 0;

  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Deadline batches">
        The same filing for several clients, due on the same day: see whose documents are ready.
      </PageTitle>
      <QueryStatus query={batches} />
      {noBatches && <p className="text-sm text-hint">No filings to do in your active work.</p>}
      {loaded &&
        batches.data.map((batch) => (
          <BatchSection key={batch.form_code + batch.due_date} batch={batch} />
        ))}
    </div>
  );
}

// One batch: same form, same due date, many clients.
function BatchSection({ batch }) {
  // Period label of the first filing (if there is one), used for the form name.
  let firstPeriodLabel = undefined;
  const firstFiling = batch.filings[0];
  if (firstFiling) {
    firstPeriodLabel = firstFiling.period_label;
  }

  const formName = filingFormLabel(batch.form_code, firstPeriodLabel);
  const title = `${formName} · due ${formatDate(batch.due_date)}`;
  const description = `${daysLeftText(batch.due_date)} · ${batch.ready_count} of ${batch.filings.length} clients have every required document`;

  return (
    <Section title={title} description={description}>
      <Table headers={["Client", "Period", "Status", "Documents"]}>
        {batch.filings.map((row) => (
          <Row
            key={row.compliance_item_id}
            cells={[
              <Link to={"/ca/clients/" + row.business_id} className="underline">
                {row.business_name}
              </Link>,
              row.period_label,
              <StatusBadge status={row.status} />,
              documentsText(row),
            ]}
          />
        ))}
      </Table>
    </Section>
  );
}

// "Ready", or how many are ready and which ones are missing.
function documentsText(row) {
  if (row.ready) {
    return "Ready";
  }
  return `${row.required_ready} of ${row.required_total} ready · missing: ${row.missing.join(", ")}`;
}
