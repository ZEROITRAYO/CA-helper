from flask import jsonify, request

from app import app
from filings import DONE, checklist, filing_name, set_tick
from helpers import (
    as_uuid, current_user, error, iso, my_business, page_of, read_upload, remove_document, role_required,
    save_document, send_document, email_notice, notify
)
from models import CaProfile, ComplianceItem, ComplianceItemDocument, Document, Engagement, EngagementItem, db, DocumentRequest, User, db_now


DOCUMENT_TYPES = ("gst_certificate", "pan_card", "sales_register", "purchase_register", "bank_statement",
                  "invoice", "salary_register", "tds_challan", "acknowledgement", "other")


def document_to_dict(document):
    links = []
   
    for link in ComplianceItemDocument.query.filter_by(document_id=document.id):
        filing = db.session.get(ComplianceItem, link.compliance_item_id)
   
        links.append({"id": str(link.id), "compliance_item_id": str(filing.id), "form_code": filing.form_code,
                      "period_label": filing.period_label, "checklist_key": link.checklist_key})
   
    guess = (document.ocr_fields or {}).get("type_guess")
   
    return {"id": str(document.id), "doc_type": document.doc_type, "original_filename": document.original_filename,
            "mime_type": document.mime_type, "size_bytes": document.size_bytes, "fy": document.fy,
            "period_label": document.period_label, "ocr_status": document.ocr_status,
            "created_at": iso(document.created_at), "links": links,
            "type_warning": guess if guess and guess != document.doc_type else None}


def documents_by_filing(filings):  #files linked to each filing, acknowledgement
    result = {}
    
    for filing in filings:
        rows = []
        
        for link in ComplianceItemDocument.query.filter_by(compliance_item_id=filing.id):
            rows.append((link.checklist_key, db.session.get(Document, link.document_id)))
        
        if filing.acknowledgement_document_id:
            rows.append(("acknowledgement", db.session.get(Document, filing.acknowledgement_document_id)))
        
        documents = []
        
        for key, d in rows:
            documents.append({ "document_id": str(d.id), "original_filename": d.original_filename,
                "doc_type": d.doc_type, "size_bytes": d.size_bytes, "created_at": iso(d.created_at),
                "checklist_key": key})
    
    result[filing.id] = documents 
    
    return result


def link_to_filing(business, document, item_id, key):
    filing = None
    
    if item_id:
        filing = db.session.get(ComplianceItem, item_id)
    
    if filing is None or filing.business_id != business.id:
        return error(404, "FILING_NOT_FOUND", "This filing does not found")

    is_checklist_entry = key != "general"
    
    if is_checklist_entry:
        keys = [entry["key"] for entry in checklist(filing.form_code)]
        
        if key not in keys:
            return error(422, "UNKNOWN_CHECKLIST_KEY", "This checklist entry does not exist")

    link = ComplianceItemDocument.query.filter_by(compliance_item_id=filing.id, document_id=document.id, checklist_key=key).first()

    if link is None:
        link = ComplianceItemDocument(compliance_item_id=filing.id, document_id=document.id,
            checklist_key=key, linked_by_id=current_user().id,)
        
        db.session.add(link)

    if is_checklist_entry:
        set_tick(filing, key, True)
    
    return None


def my_document(document_id):
    business = my_business()
   
    if business is None:
        return None, None, error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    document = db.session.get(Document, document_id) if document_id else None
    
    if document is None or document.owner_id != business.user_id:
        return None, None, error(404, "DOCUMENT_NOT_FOUND", "This document was not found")
    
    return business, document, None


@app.route("/api/v1/documents", methods=["POST"])
@role_required("business")
def upload_document():
    business = my_business()
    
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    doc_type = request.form.get("doc_type")
    
    if doc_type not in DOCUMENT_TYPES:
        return error(422, "VALIDATION_ERROR", "Choose the type of the document")
    
    item_id = request.form.get("compliance_item_id")
    upload, data, problem = read_upload()
    
    if problem:
        return problem
    
    document = save_document(business.user_id, current_user().id, doc_type, upload, data)
    
    if item_id:
        key = request.form.get("checklist_key") or "general"
        
        problem = link_to_filing(business, document, as_uuid(item_id), key)
    
        if problem:
            db.session.rollback() 
            return problem
    
        filing = db.session.get(ComplianceItem, as_uuid(item_id))
    
        document.fy, document.period_label = filing.fy, filing.period_label
    
    db.session.commit()
    
    return jsonify(document_to_dict(document)), 201


@app.route("/api/v1/documents")
@role_required("business")
def list_documents():
    business = my_business()
    
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    query = Document.query.filter_by(owner_id=business.user_id)
    
    item_id = as_uuid(request.args.get("compliance_item_id"))
    
    if item_id:
        filing = db.session.get(ComplianceItem, item_id)
       
        linked = [link.document_id for link in ComplianceItemDocument.query.filter_by(compliance_item_id=item_id)]
       
        if filing and filing.acknowledgement_document_id:
            linked.append(filing.acknowledgement_document_id)
       
        query = query.filter(Document.id.in_(linked))
    
    query = query.order_by(Document.created_at.desc(), Document.id)
    
    return jsonify(page_of(query, document_to_dict))


@app.route("/api/v1/documents/<uuid:document_id>/file")
@role_required("business", "ca")
def open_document(document_id):
    user = current_user()

    document = db.session.get(Document, document_id)
    
    if document is None:
        return error(404, "DOCUMENT_NOT_FOUND", "This document does not found")
    
    allowed = (document.owner_id == user.id)
    
    profile = CaProfile.query.filter_by(user_id=user.id).first()
    
    if not allowed and profile:
        items = (EngagementItem.query.join(Engagement, EngagementItem.engagement_id == Engagement.id)
                 .filter(Engagement.ca_profile_id == profile.id, Engagement.status == "active"))
        
        for item in items:
            for file in documents_by_filing([item.filing])[item.filing.id]:
                if file["document_id"] == str(document.id):
                    allowed = True
    
    if not allowed:
        return error(404, "DOCUMENT_NOT_FOUND", "This document does not found")
    
    return send_document(document)


@app.route("/api/v1/documents/<uuid:document_id>", methods=["DELETE"])
@role_required("business")
def delete_document(document_id):
    business, document, problem = my_document(document_id)
    
    if problem:
        return problem
    
    ack = ComplianceItem.query.filter_by(acknowledgement_document_id=document.id).first()
    
    if ack:
        return error(409, "DOCUMENT_IN_USE", f"This is the acknowledgement of {filing_name(ack)} "
                     'Undo "mark as filed" on that filing to remove it')
    
    for link in ComplianceItemDocument.query.filter_by(document_id=document.id):
        filing = db.session.get(ComplianceItem, link.compliance_item_id)
        
        if filing.status in DONE:
            return error(409, "DOCUMENT_IN_USE", f"This document is proof for {filing_name(filing)} "
                         "which is filed, so it cannot be deleted")
    
    remove_document(document.id)
    
    db.session.commit()
    
    return "", 204


@app.route("/api/v1/documents/<uuid:document_id>/links", methods=["POST"])
@role_required("business")
def link_document(document_id):
    business, document, problem = my_document(document_id)
    
    if problem:
        return problem
    
    data = request.get_json(silent=True) or {}
    
    problem = link_to_filing(business, document, as_uuid(data.get("compliance_item_id")),
                             data.get("checklist_key") or "general")
    if problem:
        return problem
    
    db.session.commit()
    
    return jsonify(document_to_dict(document))


@app.route("/api/v1/documents/links/<uuid:link_id>", methods=["DELETE"])
@role_required("business")
def unlink_document(link_id):
    business = my_business()
    
    link = db.session.get(ComplianceItemDocument, link_id)

    filing=None

    if link:
        filing = db.session.get(ComplianceItem, link.compliance_item_id) 
    
    if filing is None or business is None or filing.business_id != business.id:
        return error(404, "LINK_NOT_FOUND", "This link was not found")
    
    if filing.status in DONE:
        return error(409, "FILING_LOCKED", "This filing is filed, so its documents can no longer change")
    
    db.session.delete(link)
    
    db.session.commit()
    
    return "", 204


def request_to_dict(document_request):
    filing = document_request.filing
    
    return {"id": str(document_request.id), "compliance_item_id": str(filing.id), "form_code": filing.form_code,
            "period_label": filing.period_label, "checklist_key": document_request.checklist_key,
            "message": document_request.message, "status": document_request.status,
            "created_at": iso(document_request.created_at), "fulfilled_at": iso(document_request.fulfilled_at),
            "document_id": str(document_request.document_id) if document_request.document_id else None}


@app.route("/api/v1/ca-workspace/document-requests")
@role_required("business")
def list_document_requests():
    business = my_business()

    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    requests = (DocumentRequest.query.join(Engagement, DocumentRequest.engagement_id == Engagement.id)
                .filter(Engagement.business_id == business.id, Engagement.status == "active", DocumentRequest.status == "open")
                .order_by(DocumentRequest.created_at))
    
    item_id = as_uuid(request.args.get("compliance_item_id"))
    
    rows = []
    
    for document_request in requests:
        if item_id is None or document_request.compliance_item_id == item_id:
            rows.append({**request_to_dict(document_request), "ca_name": document_request.engagement.ca.user.full_name})
    
    return jsonify(rows)


@app.route("/api/v1/ca-workspace/document-requests/<uuid:request_id>/fulfil", methods=["POST"])
@role_required("business")
def fulfil_document_request(request_id):
    document_request = db.session.get(DocumentRequest, request_id)
    
    business = my_business()
    
    engagement = document_request.engagement if document_request else None
    
    if engagement is None or business is None:
        return error(404, "REQUEST_NOT_FOUND", "This document request was not found")
    
    business, document, problem = my_document(as_uuid((request.get_json(silent=True) or {}).get("document_id")))
    
    if problem:
        return problem
    
    problem = link_to_filing(business, document, document_request.compliance_item_id, document_request.checklist_key)
    
    if problem:
        return problem
    
    document_request.status = "fulfilled"
    
    document_request.fulfilled_at = db_now()
    document_request.document_id =  document.id
    
    ca_user = db.session.get(User, engagement.ca.user_id)
    
    title = f"{business.legal_name} sent you the document you asked for"
    
    body = (f"From: {business.legal_name} (your client)\nTo: {ca_user.full_name}\n\n"
            f"Filing: {filing_name(document_request.filing)}\nYour request: {document_request.message}\n"
            f"Document sent: {document.original_filename}")
    
    notify(ca_user, "document_request", title, body, f"/ca/clients/{business.id}")
    
    db.session.commit()
    
    email_notice(ca_user, title, body)
    
    return jsonify(request_to_dict(document_request))
