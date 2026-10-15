import re

from helpers import (error, format_inr, gstin_error, read_amount, state_code, now)
from models import (RuleThreshold, db_now)

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
