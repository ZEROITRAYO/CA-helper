import calendar
from datetime import date

from helpers import iso
from models import (ChecklistTick, ComplianceItem, ComplianceItemDocument, DocumentRequest, Engagement, EngagementItem, ObligationTemplate, ReminderLog, db)


DONE = ("filed", "filed_verified")
NOT_STARTED = ("upcoming", "docs_pending", "ready", "overdue")

FORM_FOLDERS = {"itr": "ITR", "gstr_1": "GSTR-1", "gstr_3b": "GSTR-3B", "cmp_08": "CMP-08", "gstr_4": "GSTR-4", "tds_24q": "24Q", "tds_26q": "26Q"}


RENAMED_FORMS = { "tds_24q": ("2026-27", "Form 138 (earlier 24Q)", "TDS return, salary (Form 138, earlier 24Q)"),
    "tds_26q": ("2026-27", "Form 140 (earlier 26Q)", "TDS return, other payments (Form 140, earlier 26Q)"),
}




def form_name(form_code, fy):
    
    if form_code in RENAMED_FORMS and fy >= RENAMED_FORMS[form_code][0]:
        return RENAMED_FORMS[form_code][1]
    
    return FORM_FOLDERS[form_code]



def filing_name(filing):
    return f"{form_name(filing.form_code, filing.fy)} ({filing.period_label})"



def filing_to_dict(filing):
    return {
        "id": str(filing.id),
        "form_code": filing.form_code,
        "fy": filing.fy,
        "period_label": filing.period_label,
        "period_start": iso(filing.period_start),
        "period_end": iso(filing.period_end),
        "due_date": iso(filing.due_date),
        "status": filing.status,
        "filing_path": filing.filing_path,
        "filed_at": iso(filing.filed_at),
        "acknowledgement_no": filing.acknowledgement_no,
    }





def periods_of_year(frequency, fy_start):

    fy = f"{fy_start.year}-{str(fy_start.year + 1)[2:]}"

    if frequency == "yearly":
        return [(f"FY {fy}", fy_start, date(fy_start.year + 1, 3, 31), None)]

    
    months = 1 if frequency == "monthly" else 3
    periods = []
    year,  month  = fy_start.year, 4

    for number in range(1, 12 // months + 1):
        start = date(year, month, 1)
        end_month = month + months - 1

        end = date(year, end_month, calendar.monthrange(year, end_month)[1])
        label = start.strftime("%b %Y") if frequency == "monthly" else f"Q{number} {fy}"

        periods.append((label, start, end, number if frequency == "quarterly" else None))
        month += months

        if month > 12: 
            month, year = month - 12, year + 1

    return periods




def due_date(template, period_end, quarter=None, audit=False, itr_form=None):

    rule = template.due_date_rule

    if template.frequency == "monthly":
        month, day = period_end.month % 12 + 1, rule["day"]
         
        
    elif template.frequency == "quarterly":
        month, day = rule["quarters"][quarter - 1]

    elif audit and "audit_month" in rule:
        month, day  = rule["audit_month"], rule["audit_day"]
        

    elif itr_form in rule.get("by_itr_form", {}):
        month, day = rule["by_itr_form"][itr_form]

    else:
        month, day  = rule["month"], rule["day"]

    due = date(period_end.year, month, day)

    if due <= period_end:  
        due = date(period_end.year + 1, month, day)
    return due






def open_filing_ids(filing_ids):
    
    rows = (db.session.query(EngagementItem.compliance_item_id)
            .join(Engagement, EngagementItem.engagement_id == Engagement.id)
            .filter(EngagementItem.compliance_item_id.in_(filing_ids),
                    Engagement.status.in_(["requested", "active"])))
    
    return {row[0] for row in rows}





def sync_filings(business_id, profile, today):

    fy_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    fy = f"{fy_start.year}-{str(fy_start.year + 1)[2:]}"
    audit = profile.audit_applicable or profile.other_audit_applicable

    wanted = {} 

    for template in ObligationTemplate.query.all():
        if template.effective_from > today or (template.effective_to and template.effective_to <= today):
            continue

        applies = True
        for field, allowed in template.applicability.items(): 
            if getattr(profile, field) not in allowed:
                applies = False

        if applies:
            for label, start, end, quarter in periods_of_year(template.frequency, fy_start):
                due = due_date(template, end, quarter, audit, profile.itr_form)
                wanted[(template.form_code, start)] = (template, label, start, end, due)

    existing = {}
    for filing in ComplianceItem.query.filter_by(business_id=business_id, fy=fy):
        existing[(filing.form_code, filing.period_start)] = filing


    in_engagement = open_filing_ids([filing.id for filing in existing.values()])

    counts = {"added": 0, "removed": 0, "kept_with_ca": 0}


    for key, (template, label, start, end, due) in wanted.items():
        status = "overdue" if due < today else "upcoming"
        filing = existing.get(key)
        
        if filing is None:
            db.session.add(ComplianceItem(business_id=business_id, template_id=template.id, form_code=template.form_code, fy=fy, period_label=label, period_start=start, period_end=end, due_date=due, status=status))
            counts["added"] += 1

        else:
            filing.template_id = template.id
            if filing.status in ("upcoming", "overdue") and (filing.period_end, filing.due_date) != (end, due):
                filing.period_label, filing.period_end, filing.due_date, filing.status= label, end, due, status



    for key, filing in existing.items():
        if key in wanted or filing.status in DONE:
            continue

        if filing.status == "with_ca" or filing.id in in_engagement:
            counts["kept_with_ca"] += 1
            continue


        for table in (ChecklistTick, ComplianceItemDocument, ReminderLog, DocumentRequest, EngagementItem):
            table.query.filter_by(compliance_item_id=filing.id).delete()

        db.session.delete(filing)

        counts["removed"] += 1
    return counts


