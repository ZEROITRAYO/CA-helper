from flask import jsonify, request

from app import app
from filings import DONE, checklist, checklist_with_ticks, filing_name, filing_to_dict, missing_documents, record_filed
from helpers import as_uuid, current_user, email_notice, error, iso, notify, role_required, now
from models import Business, CaProfile, DocumentRequest, Engagement, EngagementItem, User, db, db_now
from routes_business import business_page
from routes_documents import documents_by_filing, request_to_dict


POINTS_PER_OVERDUE_FILING = 40
POINTS_DUE_IN_3_DAYS = 25
POINTS_DUE_IN_7_DAYS = 10
POINTS_PER_MISSING_DOCUMENT = 5
POINTS_PER_OPEN_REQUEST = 3



def no_profile_error():
    return error(404, "CA_PROFILE_NOT_FOUND", "Save your CA profile first.")


def business_not_found_error():
    return error(404, "BUSINESS_NOT_FOUND", "This business was not found.")


def my_work():
    profile = CaProfile.query.filter_by(user_id=current_user().id).first()
    if profile is None:
        return None

    rows = (db.session.query(EngagementItem, Engagement)
            .join(Engagement, EngagementItem.engagement_id == Engagement.id)
            .filter(Engagement.ca_profile_id == profile.id, Engagement.status == "active"))

    work = {}
    for item, engagement in rows:
        if engagement.business_id not in work:
            work[engagement.business_id] = {}
        work[engagement.business_id][item.filing] = engagement
    return work


def find_filing(business_id, item_id):
    work = my_work()
    if work is None:
        return None, None, no_profile_error()
    if business_id not in work:  
        return None, None, business_not_found_error()
    for filing, engagement in work[business_id].items():
        if filing.id == item_id:
            return filing, engagement, None
    return None, None, error(404, "FILING_NOT_FOUND", "This filing is not in your active work.")


def open_requests(engagements, filings):
    return (DocumentRequest.query.filter(DocumentRequest.engagement_id.in_([e.id for e in engagements]),
                                         DocumentRequest.compliance_item_id.in_([f.id for f in filings]),
                                         DocumentRequest.status == "open")
            .order_by(DocumentRequest.created_at).all())


def urgency(filings, open_request_count, today):
    overdue_count = len([f for f in filings if f.due_date < today])
    upcoming = [f.due_date for f in filings if f.due_date >= today]
    next_due = min(upcoming) if upcoming else None
    missing = sum(len(missing_documents(f)) for f in filings)

    reasons = []
    if overdue_count:
        reasons.append({"reason": f"{overdue_count} filing(s) overdue",
                        "points": overdue_count * POINTS_PER_OVERDUE_FILING})
    if next_due is not None:
        days = (next_due - today).days
        if days <= 3:
            reasons.append({"reason": f"Next deadline in {days} day(s)", "points": POINTS_DUE_IN_3_DAYS})
        elif days <= 7:
            reasons.append({"reason": f"Next deadline in {days} days", "points": POINTS_DUE_IN_7_DAYS})
    if missing:
        reasons.append({"reason": f"{missing} required document(s) not ready",
                        "points": missing * POINTS_PER_MISSING_DOCUMENT})
    if open_request_count:
        reasons.append({"reason": f"{open_request_count} document request(s) not answered",
                        "points": open_request_count * POINTS_PER_OPEN_REQUEST})

    return {"score": sum(r["points"] for r in reasons),
            "reasons": reasons,
            "overdue_count": overdue_count,
            "next_deadline": iso(next_due) if next_due is not None else None,
            "missing_documents": missing}


@app.route("/api/v1/ca-workspace/dashboard")
@role_required("ca")
def ca_dashboard():
    return jsonify({"message": f"Welcome, {current_user().full_name}"})


@app.route("/api/v1/ca-workspace/clients")
@role_required("ca")
def list_clients():
    work = my_work()
    if work is None:
        return no_profile_error()

    rows = []
    for business_id, client in work.items():  
        not_filed = [f for f in client if f.status not in DONE]
        client_requests = open_requests(client.values(), client)
        business = db.session.get(Business, business_id)
        row = {"business_id": str(business_id),
               "business_name": business.legal_name,
               "filing_count": len(client),
               "open_filing_count": len(not_filed),
               "open_request_count": len(client_requests)}
        row.update(urgency(not_filed, len(client_requests), now()))
        rows.append(row)

    rows.sort(key=lambda row: (-row["score"], row["business_name"]))
    return jsonify(rows)


@app.route("/api/v1/ca-workspace/clients/<uuid:business_id>")
@role_required("ca")
def get_client(business_id):
    work = my_work()
    if work is None:
        return no_profile_error()
    if business_id not in work: 
        return business_not_found_error()
    client = work[business_id]  

    filings = sorted(client, key=lambda f: f.due_date)
    files = documents_by_filing(filings)
    client_requests = open_requests(client.values(), filings)

    page = business_page(db.session.get(Business, business_id))
    page["filings"] = []
    for filing in filings:
        its_requests = [request_to_dict(r) for r in client_requests if r.compliance_item_id == filing.id]
        page["filings"].append({"filing": filing_to_dict(filing),
                                "checklist": checklist_with_ticks(filing),
                                "documents": files[filing.id],
                                "open_requests": its_requests})
    return jsonify(page)


@app.route("/api/v1/ca-workspace/clients/<uuid:business_id>/document-requests", methods=["POST"])
@role_required("ca")
def ask_for_document(business_id):
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    key = data.get("checklist_key") or "general"
    if not message or len(message) > 1000:
        return error(422, "VALIDATION_ERROR", "Write what you need (up to 1000 characters).")

    filing, engagement, problem = find_filing(business_id, as_uuid(data.get("compliance_item_id")))
    if problem:
        return problem
    if filing.status in DONE:
        return error(409, "FILING_LOCKED", "This filing is already filed.")
    valid_keys = [entry["key"] for entry in checklist(filing.form_code)]
    if key != "general" and key not in valid_keys:
        return error(422, "UNKNOWN_CHECKLIST_KEY", "This checklist entry does not exist.")

    document_request = DocumentRequest(engagement_id=engagement.id, compliance_item_id=filing.id,
                                       checklist_key=key, message=message)
    db.session.add(document_request)

    user = current_user()
    business = engagement.business
    owner = db.session.get(User, business.user_id)
    title = f"{user.full_name} asked you for a document for {filing_name(filing)}"
    body = (f"From: {user.full_name} (your CA)\nTo: {business.legal_name}\n\n"
            f"Message: {message}\n\nUpload the document from the filing's page.")
    notify(owner, "document_request", title, body, f"/business/compliance/{filing.id}")
    db.session.commit()
    email_notice(owner, title, body)
    return jsonify(request_to_dict(document_request)), 201


@app.route("/api/v1/ca-workspace/document-requests/<uuid:request_id>/cancel", methods=["POST"])
@role_required("ca")
def cancel_document_request(request_id):
    document_request = db.session.get(DocumentRequest, request_id)

    work = my_work() or {}
    my_engagement_ids = set()
    for client in work.values():
        for engagement in client.values():
            my_engagement_ids.add(engagement.id)

    if document_request is None or document_request.engagement_id not in my_engagement_ids:
        return error(404, "REQUEST_NOT_FOUND", "This document request was not found.")
    if document_request.status != "open":
        return error(409, "REQUEST_NOT_OPEN", "This request is no longer open.")

    document_request.status = "cancelled"
    db.session.commit()
    return jsonify(request_to_dict(document_request))


@app.route("/api/v1/ca-workspace/clients/<uuid:business_id>/filings/<uuid:item_id>/mark-filed", methods=["POST"])
@role_required("ca")
def ca_mark_filed(business_id, item_id):
    filing, engagement, problem = find_filing(business_id, item_id)
    if problem:
        return problem
    if filing.status in DONE:
        return error(409, "ALREADY_FILED", "This filing is already marked as filed.")
    if filing.status != "with_ca":
        return error(409, "FILING_NOT_WITH_CA", "This filing is not with you.")

    user = current_user()
    business = engagement.business
    problem = record_filed(filing, business.user_id, user, "ca")
    if problem:
        return problem

    for document_request in open_requests([engagement], [filing]):
        document_request.status = "cancelled"

    owner = db.session.get(User, business.user_id)
    title = f"Your CA filed {filing_name(filing)}"
    if filing.acknowledgement_no:
        body = f"{user.full_name} marked it as filed (acknowledgement number {filing.acknowledgement_no})."
    else:
        body = f"{user.full_name} marked it as filed."
    notify(owner, "engagement_update", title, body, f"/business/compliance/{filing.id}")

    items = EngagementItem.query.filter_by(engagement_id=engagement.id).all()
    completed = all(item.filing.status in DONE for item in items)
    if completed:
        engagement.status = "completed"
        engagement.completed_at = db_now()
        notify(owner, "engagement_update", "Your CA completed the work",
               f'{user.full_name} filed every filing of your request. You can rate the work in "My engagements".',
               "/business/engagements")

    db.session.commit()
    email_notice(owner, title, body)
    return jsonify({"compliance_item_id": str(filing.id), "status": filing.status,
                    "acknowledgement_no": filing.acknowledgement_no, "engagement_completed": completed})


@app.route("/api/v1/ca-workspace/batches")
@role_required("ca")
def list_batches():
    work = my_work()
    if work is None:
        return no_profile_error()

    groups = {}
    for business_id, client in work.items():
        business_name = db.session.get(Business, business_id).legal_name
        for filing in client:
            if filing.status in DONE:
                continue
            required = [entry for entry in checklist(filing.form_code) if entry["required"]]
            missing = missing_documents(filing)
            row = {"business_id": str(business_id),
                   "business_name": business_name,
                   "compliance_item_id": str(filing.id),
                   "period_label": filing.period_label,
                   "status": filing.status,
                   "required_total": len(required),
                   "required_ready": len(required) - len(missing),
                   "missing": missing,
                   "ready": not missing}
            group_key = (filing.due_date, filing.form_code)
            if group_key not in groups:
                groups[group_key] = []
            groups[group_key].append(row)

    batches = []
    for (due, form_code), rows in sorted(groups.items()):
        rows.sort(key=lambda row: row["business_name"])
        ready_count = len([row for row in rows if row["ready"]])
        batches.append({"form_code": form_code, "due_date": iso(due),
                        "filings": rows, "ready_count": ready_count})
    return jsonify(batches)