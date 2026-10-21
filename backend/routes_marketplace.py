import re

from flask import jsonify, request

from app import app
from helpers import as_uuid, current_user, error, iso, money, read_amount, role_required
from models import CaProfile, CaService, CatalogService, db




LANGUAGES = ("English", "Hindi", "Bengali", "Gujarati", "Kannada", "Malayalam", "Marathi", "Odia", "Punjabi", "Tamil", "Telugu", "Urdu")
SPECIALIZATIONS = ("itr", "gstr_1", "gstr_3b", "cmp_08", "gstr_4", "tds_24q", "tds_26q", "gst_registration",
                   "tax_audit", "accounting_bookkeeping", "income_tax_notices", "company_llp_compliance",
                   "startup_msme_advisory")
SERVICE_SPECIALIZATIONS = {
    "itr_presumptive": "itr", "itr_business": "itr", "itr_firm_company": "itr", "gstr_1": "gstr_1",
    "gstr_3b": "gstr_3b", "cmp_08": "cmp_08", "gstr_4": "gstr_4", "tds_24q": "tds_24q", "tds_26q": "tds_26q",
    "gst_registration": "gst_registration", "tax_audit": "tax_audit", "bookkeeping": "accounting_bookkeeping",
    "income_tax_notice": "income_tax_notices",
}


def profile_to_dict(profile):
    return {"id": str(profile.id), "membership_no": profile.membership_no, "cop_number": profile.cop_number,
            "city": profile.city, "languages": profile.languages, "specializations": profile.specializations,
            "capacity": profile.capacity, "years_experience": profile.years_experience, "about": profile.about,
            "verification_status": profile.verification_status, "updated_at": iso(profile.updated_at),
            "rejection_reason": profile.rejection_reason, "has_certificate": profile.cop_document_id is not None}


def my_profile():
    return CaProfile.query.filter_by(user_id=current_user().id).first()


def prices_of(profile):
    return {str(row.service_id): row.price for row in CaService.query.filter_by(ca_profile_id=profile.id)}


def catalog():
    services = []
    
    for service in CatalogService.query.order_by(CatalogService.sort_order):
        services.append({"id": str(service.id), "code": service.code, "name": service.name,
                         "description": service.description, "unit": service.unit,
                         "specialization": SERVICE_SPECIALIZATIONS.get(service.code)})
    return services


@app.route("/api/v1/marketplace/ca-profile", methods=["GET"])
@role_required("ca")
def get_ca_profile():
    profile = my_profile()
    
    if profile is None:
        return error(404, "CA_PROFILE_NOT_FOUND", "You have not completed your profile registrations yet.")
    return jsonify(profile_to_dict(profile))



@app.route("/api/v1/marketplace/ca-profile", methods=["PUT"])
@role_required("ca")
def save_ca_profile():

    data = request.get_json(silent=True) or {}
    membership_no = data.get("membership_no")
    if not isinstance(membership_no, str) or not re.fullmatch(r"[0-9]{6}", membership_no):
        return error(422, "VALIDATION_ERROR", "Enter your 6-digit ICAI membership number.")
    
    cop_number = str(data.get("cop_number") or "").strip()
    city = str(data.get("city") or "").strip()
    about = str(data.get("about") or "").strip()
    languages = data.get("languages")
    specializations = data.get("specializations")
    capacity, years = data.get("capacity"), data.get("years_experience")


    if not cop_number or len(cop_number) > 20 or not city or len(city) > 100 or len(about) > 500:
        return error(422, "VALIDATION_ERROR", "Fill in your CoP number, city and about (up to 500 characters).")
    if not isinstance(languages, list) or not languages or any(x not in LANGUAGES for x in languages):
        return error(422, "VALIDATION_ERROR", "Choose at least one language.")
    if not isinstance(specializations, list) or not specializations or \
            any(x not in SPECIALIZATIONS for x in specializations):
        return error(422, "VALIDATION_ERROR", "Choose at least one specialization.")
    if type(capacity) is not int or not 1 <= capacity <= 1000 or type(years) is not int or not 0 <= years <= 70:
        return error(422, "VALIDATION_ERROR", "Enter your capacity (1 to 1000) and years of experience (0 to 70).")
    
    other = CaProfile.query.filter(CaProfile.membership_no == membership_no, CaProfile.user_id != current_user().id)
    
    if other.first():
        return error(409, "DUPLICATE_MEMBERSHIP_NO", "Another CA has already registered this membership number.")
    profile = my_profile()
    
    if profile is None:
        profile = CaProfile(user_id=current_user().id)
        db.session.add(profile)
    
    new_numbers = (profile.membership_no, profile.cop_number) != (membership_no, cop_number)
    
    if profile.verification_status == "rejected" or new_numbers:
        profile.verification_status = "pending"
    profile.membership_no, profile.cop_number, profile.city, profile.about = membership_no, cop_number, city, about
    profile.languages = [x for x in LANGUAGES if x in languages]  
    profile.specializations = [x for x in SPECIALIZATIONS if x in specializations]
    profile.capacity, profile.years_experience = capacity, years
    db.session.commit()
    return jsonify(profile_to_dict(profile))



@app.route("/api/v1/marketplace/ca-services", methods=["GET", "PUT"])
@role_required("ca")
def ca_services():
    profile = my_profile()
    if request.method == "PUT":
        if profile is None:
            return error(404, "CA_PROFILE_NOT_FOUND", "You have not completed your profile yet.")
        items = (request.get_json(silent=True) or {}).get("items")
        
        if not isinstance(items, list):
            return error(422, "VALIDATION_ERROR", "Send the list of services and prices.")
        new_prices = {}
        
        for item in items:
            service_id = as_uuid(item.get("service_id")) if isinstance(item, dict) else None
            price = read_amount(item.get("price"), 1, 1000000) if isinstance(item, dict) else None
            if service_id is None or price is None:
                return error(422, "VALIDATION_ERROR", "Choose a service and enter a price from 1 to 10,00,000.")
            if db.session.get(CatalogService, service_id) is None:
                return error(400, "UNKNOWN_SERVICE", "One of the services is not in the catalog.")
            new_prices[service_id] = price
        
        CaService.query.filter_by(ca_profile_id=profile.id).delete()
        
        for service_id, price in new_prices.items():
            db.session.add(CaService(ca_profile_id=profile.id, service_id=service_id, price=price))
        
        db.session.commit()
    prices = prices_of(profile) if profile else {}
    
    return jsonify({"items": [{"service_id": sid, "price": money(price)} for sid, price in prices.items()]})
