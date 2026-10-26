import re

from flask import jsonify, request

import ocr
from app import app
from filings import sync_filings, DONE, filing_to_dict, filing_page, checklist, set_tick, NOT_STARTED, record_filed, refresh_status
from helpers import (
    GST_STATES, current_user, error, format_inr, gstin_error, iso, money, my_business, read_amount,
    read_upload, role_required, state_code, now, remove_document, send_document
)
from models import Business, NicCode, RegulatoryProfile, RuleThreshold, db, db_now, ComplianceItem, Document


ENTITY_TYPES = ("individual", "proprietorship", "partnership", "llp", "private_limited")
COMPANY_TYPES = ("llp", "private_limited")
PROFILE_LINES = ("msme_tier", "gst_scheme", "itr_form", "presumptive_eligible", "audit_applicable",
                 "other_audit_applicable", "files_24q", "files_26q")
CODES = {
    "pan": (r"[A-Z]{5}[0-9]{4}[A-Z]", "Enter a valid PAN."),
    "gstin": (r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]", "Enter a valid GSTIN."),
    "tan": (r"[A-Z]{4}[0-9]{5}[A-Z]", "Enter a valid TAN."),
    "udyam_number": (r"UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}", "Enter a valid Udyam number."),
    "cin_llpin": (r".{1,21}", "Enter your CIN or LLPIN."),
}

def read_business_form(data):
    values = {}
    for field, longest in (("legal_name", 200), ("address", 500), ("description", 1000)):
        text = str(data.get(field) or "").strip()
        if not text or len(text) > longest:
            message = f"Fill in {field.replace('_', ' ')} (up to {longest} characters)."
            return None, error(422, "VALIDATION_ERROR", message)
        values[field] = text

    if data.get("entity_type") not in ENTITY_TYPES:
        return None, error(422, "VALIDATION_ERROR", "Choose the type of business.")
    if state_code(data.get("state")) is None:
        return None, error(422, "VALIDATION_ERROR", "Choose your state from the list.")
    
    values["entity_type"], values["state"] = data["entity_type"], data["state"]

    for field in ("annual_turnover", "investment_amount"):
        values[field] = read_amount(data.get(field), 0, 9999999999)
        if values[field] is None:
            return None, error(422, "VALIDATION_ERROR", f"Enter the {field.replace('_', ' ')} in rupees.")
        
    for field in ("gst_registered", "deducts_tds", "pays_salary_above_limit", "gst_composition",
                  "gst_qrmp", "accounts_audited_other_law"):
        values[field] = data.get(field, False)
        if not isinstance(values[field], bool):
            return None, error(422, "VALIDATION_ERROR", f"Answer {field.replace('_', ' ')} with yes or no.")
        
    for field, (pattern, message) in CODES.items():
        code = str(data.get(field) or "").strip().upper() or None
        if code and not re.fullmatch(pattern, code):
            return None, error(422, "VALIDATION_ERROR", message)
        values[field] = code
    phone = data.get("phone")

    if not isinstance(phone, str) or not re.fullmatch(r"[6-9][0-9]{9}", phone):
        return None, error(422, "VALIDATION_ERROR", "Enter a 10-digit mobile number.")
    values["phone"] = phone

    if not values["pan"]:
        return None, error(422, "VALIDATION_ERROR", "Enter a valid PAN.")
    if values["gst_registered"] and not values["gstin"]:
        return None, error(422, "VALIDATION_ERROR", "Enter your GSTIN (you said you are GST registered).")
    if values["gst_registered"]:
        gstin_problem = gstin_error(values["gstin"], values["pan"], values["state"])
        if gstin_problem:
            return None, error(422, "VALIDATION_ERROR", gstin_problem)
    if values["gst_composition"] and not values["gst_registered"]:
        return None, error(422, "VALIDATION_ERROR", "Only a GST-registered business can use composition.")
    if values["deducts_tds"] and not values["tan"]:
        return None, error(422, "VALIDATION_ERROR", "Enter your TAN (you said you deduct TDS).")
    if values["entity_type"] in COMPANY_TYPES and not values["cin_llpin"]:
        return None, error(422, "VALIDATION_ERROR", "Enter your CIN (company) or LLPIN (LLP).")

    if not values["gst_registered"]:
        values["gstin"] = None
    if not values["deducts_tds"]:
        values["tan"] = None
    if not values["gst_registered"] or values["gst_composition"]:
        values["gst_qrmp"] = False
    if values["entity_type"] not in ("partnership", "llp"):
        values["accounts_audited_other_law"] = False
    if values["entity_type"] not in COMPANY_TYPES:
        values["cin_llpin"] = None
    return values, None

def limit(key):
    row = (RuleThreshold.query.filter(RuleThreshold.key == key, RuleThreshold.effective_from <= now())
           .order_by(RuleThreshold.effective_from.desc()).first())
    if row is None:
        raise RuntimeError(f"The rule {key} is missing. Run: python seed.py")
    return row.value


def compute_profile(business):
    turnover, entity = business.annual_turnover, business.entity_type

    msme_tier = "not_msme"
    for tier in ("medium", "small", "micro"):
        investment_fits = business.investment_amount <= limit(f"msme.{tier}.max_investment")
        if investment_fits and turnover <= limit(f"msme.{tier}.max_turnover"):
            msme_tier = tier

    registration_limit = limit("gst.registration.min_turnover")
    if not business.gst_registered:
        gst_scheme = "not_registered"
    elif business.gst_composition and turnover <= limit("gst.composition.max_turnover"):
        gst_scheme = "composition"
    elif business.gst_qrmp and turnover <= limit("gst.qrmp.max_turnover"):
        gst_scheme = "regular_qrmp"  
    else:
        gst_scheme = "regular_monthly"

    presumptive = entity not in COMPANY_TYPES and turnover <= limit("itr.presumptive_44ad.max_turnover")
    tax_audit = not presumptive and turnover > limit("itr.audit_44ab.min_turnover")
    other_audit = entity == "private_limited"
    if entity in ("partnership", "llp"):
        other_audit = business.accounts_audited_other_law

    if entity == "private_limited":
        itr_form = "itr_6"
    elif entity == "llp":
        itr_form = "itr_5"
    elif presumptive:
        itr_form = "itr_4"
    elif entity == "partnership":
        itr_form = "itr_5"
    else:
        itr_form = "itr_3"

    suggest_gst = not business.gst_registered and turnover > registration_limit
    explanations = {"gst_scheme": "", "roc_not_tracked": ""}

    if suggest_gst:
        explanations["gst_scheme"] = (f"Not registered, but turnover is above {format_inr(registration_limit)}: "
                                      "you may need GST registration. Ask a CA.")
    if entity in COMPANY_TYPES:
        explanations["roc_not_tracked"] = "LLPs and companies also have ROC/MCA filings, which this app does not track."
    return {"msme_tier": msme_tier, "gst_scheme": gst_scheme, "gst_registration_suggested": suggest_gst,
            "itr_form": itr_form, "presumptive_eligible": presumptive, "audit_applicable": tax_audit,
            "other_audit_applicable": other_audit,
            "files_24q": business.deducts_tds and business.pays_salary_above_limit,
            "files_26q": business.deducts_tds, "roc_not_tracked": entity in COMPANY_TYPES,
            "explanations": explanations, "rule_version": "v2", "computed_at": db_now()}

def business_page(business):
    fields = ("legal_name", "entity_type", "state", "address", "description", "pan", "phone", "gst_registered",
              "gstin", "gst_composition", "gst_qrmp", "accounts_audited_other_law", "deducts_tds", "tan",
              "pays_salary_above_limit", "cin_llpin", "udyam_number")
    info = {"id": str(business.id), "annual_turnover": money(business.annual_turnover),
            "investment_amount": money(business.investment_amount),
            "state_needs_review": state_code(business.state) is None}  
    for field in fields:
        info[field] = getattr(business, field)
    profile = RegulatoryProfile.query.filter_by(business_id=business.id).first()
    profile_info = None
    if profile:
        profile_info = {"gst_registration_suggested": profile.gst_registration_suggested,
                        "roc_not_tracked": profile.roc_not_tracked, "explanations": profile.explanations,
                        "rule_version": profile.rule_version, "computed_at": iso(profile.computed_at)}
        for line in PROFILE_LINES:
            profile_info[line] = getattr(profile, line)
    nic = db.session.get(NicCode, business.nic_code_id) if business.nic_code_id else None
    nic_info = {"code": nic.code, "description": nic.description} if nic else None
    return {"business": info, "profile": profile_info, "nic_code": nic_info}

@app.route("/api/v1/onboarding/business", methods=["POST"])
@role_required("business")
def register_business():
    values, problem = read_business_form(request.get_json(silent=True) or {})
    if problem:
        return problem
    if my_business():
        return error(409, "BUSINESS_EXISTS", "Business already registered.")
    business = Business(user_id=current_user().id, **values)
    db.session.add(business)
    db.session.flush()
    profile = RegulatoryProfile(business_id=business.id, **compute_profile(business))
    db.session.add(profile)
    sync_filings(business.id, profile, now()) 
    db.session.commit()
    return jsonify(business_page(business)), 201

@app.route("/api/v1/onboarding/business", methods=["GET"])
@role_required("business")
def get_business():
    business = my_business()
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")
    return jsonify(business_page(business))

@app.route("/api/v1/onboarding/business", methods=["PUT"])
@role_required("business")
def update_business():
    business = my_business()
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")
    values, problem = read_business_form(request.get_json(silent=True) or {})
    if problem:
        return problem
    for field in values:
        setattr(business, field, values[field])
    profile = RegulatoryProfile.query.filter_by(business_id=business.id).first()
    old = {line: getattr(profile, line) for line in PROFILE_LINES}
    new = compute_profile(business)
    for field in new:
        setattr(profile, field, new[field])
    filings = sync_filings(business.id, profile, now())
    db.session.commit()
    changed = []
    for line in PROFILE_LINES:
        if old[line] != new[line]:
            changed.append({"line": line, "old": old[line], "new": new[line]})
    page = business_page(business)
    page["changes"] = {"profile": changed, "filings": filings}
    return jsonify(page)

@app.route("/api/v1/onboarding/states")
@role_required("business")
def list_states():
    return jsonify([{"name": state["name"], "code": state["code"]} for state in GST_STATES])

@app.route("/api/v1/onboarding/nic-codes")
@role_required("business")
def search_nic_codes():
    words = request.args.get("q", "").strip()[:100]
    if len(words) < 2:
        return jsonify([])
    pattern = f"%{words}%"
    codes = (NicCode.query.filter(NicCode.code.ilike(pattern) | NicCode.description.ilike(pattern))
             .order_by(NicCode.code).limit(20))
    return jsonify([{"code": nic.code, "description": nic.description} for nic in codes])

@app.route("/api/v1/onboarding/business/nic-code", methods=["PUT"])
@role_required("business")
def set_nic_code():
    business = my_business()
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")
    code = str((request.get_json(silent=True) or {}).get("code") or "").strip()
    nic = NicCode.query.filter_by(code=code).first()
    if nic is None:
        return error(422, "UNKNOWN_NIC_CODE", "Choose a appropriate code from the given NIC list.")
    business.nic_code_id = nic.id
    db.session.commit()
    return jsonify({"code": nic.code, "description": nic.description})


@app.route("/api/v1/onboarding/autofill", methods=["POST"])
@role_required("business")
def autofill():
    upload, data, problem = read_upload()
    if problem:
        return problem
    try:
        text = ocr.extract_text(data, upload.mimetype)
    except ValueError as reason:
        return error(422, "DOCUMENT_UNREADABLE", f"File Unreadable. {reason}")  
    return jsonify({"found": ocr.read_registration(text)}) 



@app.route("/api/v1/compliance/dashboard")
@role_required("business")
def dashboard():
    business = Business.query.filter_by(user_id=current_user().id).first()
    today = now()
    
    if business is None:
        return jsonify({
            "message": f"Welcome, {current_user().full_name}",
            "registered": False,
            "next_deadline": None,
            "due_this_month": 0,
            "overdue": 0,
            "with_ca": 0
        })

    overdue = 0
    due_this_month = 0
    with_ca = 0
    next_deadline = None

    filings = ComplianceItem.query.filter_by( business_id=business.id).order_by(ComplianceItem.due_date).all()
    
    for filing in filings: 
        
        if filing.status in DONE:
            continue
        
        if filing.due_date < today:
            overdue += 1
        
        else:
            if next_deadline is None:
                next_deadline = filing_to_dict(filing)

            if (filing.due_date.year == today.year and filing.due_date.month == today.month):
                due_this_month += 1
        
        if filing.status == "with_ca":
            with_ca += 1

    return jsonify({
        "message": f"Welcome, {current_user().full_name}",
        "registered": True,
        "next_deadline": next_deadline,
        "due_this_month": due_this_month,
        "overdue": overdue,
        "with_ca": with_ca
    })


@app.route("/api/v1/compliance/items")
@role_required("business")
def list_filings():
    business = Business.query.filter_by(user_id=current_user().id).first()

    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    filings = ComplianceItem.query.filter_by(business_id=business.id).order_by(ComplianceItem.due_date).all()

    result = []
    
    for filing in filings:
        result.append(filing_to_dict(filing))

    return jsonify(result)


def find_filing(item_id):
    business = my_business()

    if business is None:
        return None, error(404, "BUSINESS_NOT_FOUND", "Register your business first")
    
    filing = db.session.get(ComplianceItem, item_id)
    
    if filing is None or filing.business_id != business.id:
        return None, error(404, "FILING_NOT_FOUND", "This filing was not found")
    
    return filing, None


@app.route("/api/v1/compliance/items/<uuid:item_id>")
@role_required("business")
def get_filing(item_id):
    filing, problem = find_filing(item_id)

    if problem:
        return problem

    result = filing_page(filing)
    
    return jsonify(result)


@app.route("/api/v1/compliance/items/<uuid:item_id>/checklist", methods=["POST"])
@role_required("business")
def tick_checklist(item_id):
    filing, problem = find_filing(item_id)

    if problem:
        return problem

    data = request.get_json(silent=True)

    if data is None:
        data = {}

    key = data.get("key")
    entries = checklist(filing.form_code)
    key_exists = False

    for entry in entries:
        if entry["key"] == key:
            key_exists = True
            break

    if not key_exists:
        return error(
            422,
            "UNKNOWN_CHECKLIST_KEY",
            "This checklist entry does not exist"
        )

    set_tick(filing, key, data["ticked"])

    db.session.commit()

    result = filing_page(filing)
    return jsonify(result)



@app.route("/api/v1/compliance/items/<uuid:item_id>/path", methods=["POST"])
@role_required("business")
def choose_path(item_id):
    filing, problem = find_filing(item_id)
    
    if problem:
        return problem
    
    path = (request.get_json(silent=True) or {}).get("path")
    
    if path not in ("self", "ca"):
        return error(422, "VALIDATION_ERROR", "Choose self or ca")
    
    if filing.status not in NOT_STARTED:
        return error(409, "FILING_LOCKED", "This filing is already with a CA or filed")
    
    filing.filing_path = path
    
    db.session.commit()
    
    return jsonify(filing_page(filing))



@app.route("/api/v1/compliance/items/<uuid:item_id>/mark-filed", methods=["POST"])
@role_required("business")
def mark_filed(item_id):
    filing, problem = find_filing(item_id)
    
    if problem:
        return problem
    
    if filing.status == "with_ca":
        return error(409, "FILING_WITH_CA", "Your CA is handling this filing")
    
    if filing.status not in NOT_STARTED:
        return error(409, "ALREADY_FILED", "This filing is already marked as filed")
    
    user = current_user()
    
    problem = record_filed(filing, user.id, user, "self")
    
    if problem:
        return problem
    
    db.session.commit()
    
    return jsonify(filing_page(filing))


@app.route("/api/v1/compliance/items/<uuid:item_id>/unmark-filed", methods=["POST"])
@role_required("business")
def unmark_filed(item_id):
    filing, problem = find_filing(item_id)
    
    if problem:
        return problem
    
    if filing.status not in DONE or filing.filing_path != "self":
        return error(409, "NOT_SELF_FILED", "Only a filing you marked as filed can be undone")
    
    old_file = filing.acknowledgement_document_id
    
    filing.acknowledgement_document_id = filing.acknowledgement_no = filing.filed_at = filing.verified_at = None
    
    filing.status = "upcoming"
    
    if old_file:
        db.session.flush()
        remove_document(old_file)
    
    refresh_status(filing)
    
    db.session.commit()
    
    return jsonify(filing_page(filing))


@app.route("/api/v1/compliance/items/<uuid:item_id>/acknowledgement")
@role_required("business")
def download_acknowledgement(item_id):
    filing, problem = find_filing(item_id)
    
    if problem:
        return problem
    
    if filing.acknowledgement_document_id is None:
        return error(404, "ACKNOWLEDGEMENT_MISSING", "No acknowledgement was uploaded")
    
    return send_document(db.session.get(Document, filing.acknowledgement_document_id))
