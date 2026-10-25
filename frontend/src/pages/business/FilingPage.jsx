import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import { DASHBOARD_KEY, filingKey, FILINGS_KEY, tickChecklist, useFiling, useRefresh, DOCUMENTS_KEY,
        downloadDocument, linkDocument, unlinkDocument, useDocuments, UPLOAD_TYPES, uploadDocument, errorMessage,} from "@/api";

import { BackLink, ErrorText, QueryStatus, Section, StatusBadge, useAction, Field, Options,} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, Button, Input, Select,} from "@/components/ui";
import { daysLeftText, filingFormLabel, formatDate, DOCUMENT_TYPE_LABELS, label, } from "@/lib";


const FILED = ["filed", "filed_verified"];

function Header({ page }) 
{
  const item = page.filing;
  
  return (
    <div className="space-y-1">
      
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
        { filingFormLabel(item.form_code, item.period_label) } · {item.period_label}
        <StatusBadge status={item.status} />
      </h1>
      
      <p className="text-sm text-hint">
        {page.form_name} · due {formatDate(item.due_date)}
        {!FILED.includes(item.status) && ` · ${daysLeftText(item.due_date)}`}
      </p>

    </div>
  );
}

function GuidePage({ page }) {
  return (
    <div className="space-y-4 text-sm">
      
      <h2 className="text-lg font-semibold">{page.title}</h2>
      
      { page.sections.map((section) => (
        <div key={section.heading} className="space-y-2">
          
          <h3 className="font-semibold">{section.heading}</h3>
          
          {(section.text || []).map((text) => <p key={text}>{text}</p>)}
          
          {section.points && (
            <ul className="list-disc pl-5">
              {section.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          )}

          {section.steps && (
            <ol className="list-decimal pl-5">
              {section.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}

          {(section.text_after || []).map((text) => <p key={text}>{text}</p>)}
          
          {section.links && (
            <ul className="list-disc pl-5">
              {section.links.map((link) => (
                <li key={link.url}>
                  {link.label}: <a href={link.url} target="_blank" rel="noreferrer" className="underline">{link.url}</a>
                </li>
              ))}
            </ul>
          )}

        </div>
      ))}

    </div>
  );
}


function Guide({ page }) 
{
  const [tab, setTab] = useState("instructions");
  
  const texts = {
    instructions: ["How to file it yourself", page.instructions],
    explanation: ["What is this form?", page.explanation],
  };

  return (
    <Card>
      <CardHeader>
        
        <div role="tablist" className="flex gap-2">
          {Object.entries(texts).map(([key, [title]]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={
                "rounded-full border px-3 py-1 text-sm " +
                (tab === key ? "border-primary bg-primary text-white" : "hover:bg-soft")
              }
            >
              {title}
            </button>
          ))}
        </div>

        {page.content_status !== "DONE" && (
          <CardDescription>
            This guide is a draft, Follow the official portal when in doubt
          </CardDescription>
        )}

      </CardHeader>
      
      <CardContent>
        <GuidePage page={texts[tab][1]} />
      </CardContent>

    </Card>
  );
}

function linksByKey(documents, itemId) {
  const byKey = {};

  if (!documents) return byKey;

  for (const document of documents.items) 
  {
    for (const link of document.links) 
    {
      if (link.compliance_item_id === itemId) 
      {
        if (!byKey[link.checklist_key]) 
        {
          byKey[link.checklist_key] = [];
        }
        byKey[link.checklist_key].push({ link, document });
      }
    }
  }

  return byKey;
}

function EntryDocuments({ item, entryKey, entryLabel, links, locked, onChanged }) {
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAction();

  function linkButton(text, document, action) {
    return (
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        aria-label={text + " " + document.original_filename}
        onClick={() => run(action)}
      >
        {text}
      </Button>
    );
  }

  return (
    <div className="ml-6 space-y-1 text-sm">
      
      {links.map(({ link, document }) => ( 
        <div key={link.id} className="flex flex-wrap items-center gap-x-2">
          
          <span className="break-all">{document.original_filename}</span>
          
          {linkButton("Open", document, () => downloadDocument(document))}
          
          {!locked &&
            linkButton("Remove", document, async () => {
              await unlinkDocument(link.id);
              onChanged();
            })}

        </div>
      ))}

      {!locked && !adding && (
        <Button
          variant="outline"
          size="sm"
          aria-label={"Add a file for " + entryLabel}
          onClick={() => setAdding(true)}
        >
          Add a file
        </Button>
      )}

      {adding && (
        <AddDocument
          item={item}
          entryKey={entryKey}
          links={links}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Checklist({ page, onUpdated }) 
{
  const item = page.filing;
  const { busy, error, run } = useAction();
  const refresh = useRefresh();
  
  const documents = useDocuments({ compliance_item_id: item.id, page_size: 100 });
  const linked = linksByKey(documents.data, item.id);

  const locked = FILED.includes(item.status);

  let requiredCount = 0;
  let requiredTickedCount = 0;

  for (const entry of page.checklist) {
    if (entry.required) {
      requiredCount++;

      if (entry.ticked) 
        requiredTickedCount++;
    }
  }

  function toggle(entry) {
    run(async () => {
      const updated = await tickChecklist( item.id, entry.key, !entry.ticked);
      onUpdated(updated);
    });
  }

  function onChanged() {
    refresh(DOCUMENTS_KEY, filingKey(item.id), FILINGS_KEY, DASHBOARD_KEY);
  }

  function documentsOf(key, entryLabel) {
    return (
      <EntryDocuments
        item={item}
        entryKey={key}
        entryLabel={entryLabel}
        links={linked[key] ?? []}
        locked={locked}
        onChanged={onChanged}
      />
    );
  }

  return (
    <Section
      title="Documents to have ready"
      description={`Tick what you have or add the file. ${requiredTickedCount} of ${requiredCount} required documents ready`}
      contentClassName="space-y-3"
    >
      {page.checklist.map((entry) => (
        <div key={entry.key} className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={entry.ticked}
            disabled={locked || busy}
            onChange={() => toggle(entry)}
          />

          <span>
            {entry.label}

            {!entry.required && (
              <span className="text-hint"> (if it applies)</span>
            )}

            {entry.help && (
              <span className="block text-xs text-hint">
                {entry.help}
              </span>
            )}
          </span>
        </label>
        
        {documentsOf(entry.key, entry.label)}
        
        </div>
      ))}

      <div className="space-y-1 border-t pt-3">
        
        <p className="text-sm font-medium">Other documents for this filing</p>
        {documentsOf("general", "this filing")}
      
      </div>
      
      <ErrorText>{documents.isError && errorMessage(documents.error)}</ErrorText>
      <ErrorText>{error}</ErrorText>
    </Section>
  );
}

const FILE_TYPES = ".pdf,.jpg,.jpeg,.png";

function VaultSelect({ id, except = [], withType }) {
  const vault = useDocuments({ page_size: 100 });
  const choices = (vault.data?.items ?? []).filter((document) => !except.includes(document.id));
  
  return (
    <Select id={id} name="document_id" defaultValue="">
      
      <option value="">{vault.isPending ? "Loading..." : "Choose a file"}</option>
      
      {choices.map((document) => (
        <option key={document.id} value={document.id}>
          {document.original_filename}
          {withType && ` (${label(DOCUMENT_TYPE_LABELS, document.doc_type)})`}
        </option>
      ))}
    </Select>
  );
}

function AddDocument({ item, entryKey, links, onAdded, onCancel }) {
  const { busy, error, setError, run } = useAction();

  async function add(action) {
    if (await run(action)) onAdded();
  }

  function onUpload(event) {
    event.preventDefault();
    
    const form = new FormData(event.currentTarget);
    
    const file = event.currentTarget.elements.file.files[0];
    
    if (!file) return setError("Choose a file to upload");
    
    const fields = { doc_type: form.get("doc_type"), compliance_item_id: item.id, checklist_key: entryKey };
    
    add(() => uploadDocument(file, fields));
  }

  function onLink(event) {
    event.preventDefault();
    
    const documentId = new FormData(event.currentTarget).get("document_id");
    
    if (!documentId) return setError("Choose a file from your vault.");
    
    add(() => linkDocument(documentId, item.id, entryKey));
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={onUpload}>
      
        <Field id={"file-" + entryKey} label="Upload a new file" className="space-y-1">
          <Input id={"file-" + entryKey} name="file" type="file" accept={FILE_TYPES} />
        </Field>
      
        <Field id={"type-" + entryKey} label="Type" className="space-y-1">
          <Select id={"type-" + entryKey} name="doc_type" defaultValue="other">
            <Options labels={DOCUMENT_TYPE_LABELS} codes={UPLOAD_TYPES} />
          </Select>
        </Field>
      
        <Button type="submit" size="sm" disabled={busy}>
          Upload
        </Button>

      </form>
      
      <form className="flex flex-wrap items-end gap-2" onSubmit={onLink}>
        <Field id={"existing-" + entryKey} label="Or link one from your vault" className="space-y-1">
          <VaultSelect
            id={"existing-" + entryKey}
            except={links.map(({ document }) => document.id)}
            withType
          />
        </Field>
        
        <Button type="submit" size="sm" disabled={busy}>
          Link
        </Button>
        
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        
      </form>
      
      <ErrorText>{error}</ErrorText>
    </div>
  );
}



export function FilingPage() {
  const { itemId } = useParams();
  const filing = useFiling(itemId);
  const queryClient = useQueryClient();
  const refresh = useRefresh();

  function showUpdated(updated) {
    queryClient.setQueryData(filingKey(itemId), updated);
    refresh(FILINGS_KEY, DASHBOARD_KEY);
  }

  return (
    <div className="max-w-3xl space-y-6">
      
      <BackLink to="/business/compliance">Compliance calendar</BackLink>
      
      <QueryStatus query={filing} />
      
      {filing.isSuccess && (
        <>
          <Header page={filing.data} />
          
          <Checklist page={filing.data} onUpdated={showUpdated} />
          
          <Guide page={filing.data} />
        </>
      )}

    </div>
  );
}
