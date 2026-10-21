import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import { DASHBOARD_KEY, filingKey, FILINGS_KEY, tickChecklist, useFiling, useRefresh } from "@/api";
import { BackLink, ErrorText, QueryStatus, Section, StatusBadge, useAction } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui";
import { daysLeftText, filingFormLabel, formatDate } from "@/lib";


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


function Checklist({ page, onUpdated }) 
{
  const item = page.filing;
  const { busy, error, run } = useAction();

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

  return (
    <Section
      title="Documents to have ready"
      description={`Tick what you have. ${requiredTickedCount} of ${requiredCount} required documents ready`}
      contentClassName="space-y-3"
    >
      {page.checklist.map((entry) => (
        <label key={entry.key} className="flex items-start gap-2 text-sm">
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
      ))}

      <ErrorText>{error}</ErrorText>
    </Section>
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
