import re
from flask import jsonify, request
from app import app
from helpers import as_uuid, current_user, error, iso, my_business,money, read_amount, read_upload, remove_document, role_required, save_document, send_email, notify
from models import CaProfile, CaService, CatalogService, ComplianceItem, Engagement, EngagementItem, RegulatoryProfile ,Rating, db, db_now
from filings import open_filing_ids



LANGUAGES = ("english", "hindi", "bengali", "gujarati", "kannada", "malayalam", "marathi", "odia",
             "punjabi", "tamil", "telugu", "urdu")

SPECIALIZATIONS = ("itr", "gstr_1", "gstr_3b", "cmp_08", "gstr_4", "tds_24q", "tds_26q", "gst_registration",
                   "tax_audit", "accounting_bookkeeping", "income_tax_notices", "company_llp_compliance",
                   "startup_msme_advisory")

SERVICE_SPECIALIZATIONS = {
    "itr_presumptive": "itr", "itr_business": "itr", "itr_firm_company": "itr", "gstr_1": "gstr_1",
    "gstr_3b": "gstr_3b", "cmp_08": "cmp_08", "gstr_4": "gstr_4", "tds_24q": "tds_24q", "tds_26q": "tds_26q",
    "gst_registration": "gst_registration", "tax_audit": "tax_audit", "bookkeeping": "accounting_bookkeeping",
    "income_tax_notice": "income_tax_notices",
}


FULL_MESSAGE = "This CA is not taking new clients right now: all their client slots are full."
ITR_SERVICES = {"itr_3": "itr_business", "itr_4": "itr_presumptive", "itr_5": "itr_firm_company", "itr_6": "itr_firm_company"}



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


def ratings_of(profile):
    return (Rating.query.join(Engagement, Rating.engagement_id == Engagement.id).filter(Engagement.ca_profile_id == profile.id).order_by(Rating.created_at.desc()).all())



def public_ca(profile):
    stars = [rating.stars for rating in ratings_of(profile)]

    return {"id": str(profile.id), 
            "full_name": profile.user.full_name, 
            "membership_no": profile.membership_no,
            "city": profile.city, 
            "languages": profile.languages, 
            "specializations": profile.specializations,
            "years_experience": profile.years_experience, 
            "about": profile.about,
            "rating_average": round(sum(stars) / len(stars), 1) 
            
            if stars else None, "rating_count": len(stars)}



def catalog():
    services = []
    
    for service in CatalogService.query.order_by(CatalogService.sort_order):
        services.append({"id": str(service.id), "code": service.code, "name": service.name,
                         "description": service.description, "unit": service.unit,
                         "specialization": SERVICE_SPECIALIZATIONS.get(service.code)})
    return services


def is_full(profile, business_id=None):
    clients = {e.business_id for e in Engagement.query.filter_by(ca_profile_id=profile.id, status="active")}
    return business_id not in clients and len(clients) >= profile.capacity


def listed_ca(ca_id):
    profile = db.session.get(CaProfile, ca_id) if ca_id else None
    return profile if profile and profile.verification_status == "verified" else None



def engagement_to_dict(engagement):
    items = [{
            "id": str(item.id),
            "compliance_item_id": str(item.compliance_item_id),
            "form_code": item.filing.form_code,
            "period_label": item.filing.period_label,
            "due_date": iso(item.filing.due_date),
            "service_name": item.service.name,
            "listed_price": money(item.listed_price),
            "agreed_price": money(item.agreed_price)
        }

        for item in EngagementItem.query.filter_by(
            engagement_id=engagement.id
        ).order_by(EngagementItem.created_at)
    ]

    rating = Rating.query.filter_by(engagement_id=engagement.id).first()

    return {
        "id": str(engagement.id),
        "status": engagement.status,
        "ca_profile_id": str(engagement.ca_profile_id),
        "ca_name": engagement.ca.user.full_name,
        "business_name": engagement.business.legal_name,
        "requested_at": iso(engagement.requested_at),
        "responded_at": iso(engagement.responded_at),
        "activated_at": iso(engagement.activated_at),
        "completed_at": iso(engagement.completed_at),
        "items": items,
        "rating": {
            "stars": rating.stars,
            "review": rating.review,
            "created_at": iso(rating.created_at)
        } if rating else None
    }



@app.route("/api/v1/marketplace/ca-profile", methods=["GET"])
@role_required("ca")
def get_ca_profile():
    profile = my_profile()
    
    if profile is None:
        return error(404, "CA_PROFILE_NOT_FOUND", "You have not completed your profile registrations yet.")
    return jsonify(profile_to_dict(profile))


@app.route("/api/v1/marketplace/ca-profile/certificate", methods=["POST"])
@role_required("ca")
def upload_certificate():
    profile = my_profile()
    if profile is None:
        return error(404, "CA_PROFILE_NOT_FOUND", "You have not completed your profile yet.")
    upload, data, problem = read_upload()
    if problem:
        return problem
    old_file = profile.cop_document_id
    certificate = save_document(profile.user_id, profile.user_id, "certificate_of_practice", upload, data)
    profile.cop_document_id = certificate.id
    if old_file:
        db.session.flush()
        remove_document(old_file)
    profile.verification_status = "pending"
    db.session.commit()
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

@app.route("/api/v1/marketplace/services")
@role_required("ca", "business")
def services():
    return jsonify(catalog())

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





@app.route("/api/v1/marketplace/cas")
@role_required("business")
def list_cas():
    args = request.args

    if args.get("specialization") and args["specialization"] not in SPECIALIZATIONS:
        return error(422, "VALIDATION_ERROR", "Unknown specialization.")
    
    if args.get("language") and args["language"] not in LANGUAGES:
        return error(422, "VALIDATION_ERROR", "Unknown language.")

    
    service = CatalogService.query.filter_by(code=args.get("service")).first() if args.get("service") else None
    rows = []

    for profile in CaProfile.query.filter_by(verification_status="verified"):
        if args.get("specialization") and args["specialization"] not in profile.specializations:
            continue

        if args.get("language") and args["language"] not in profile.languages:
            continue

        if args.get("city", "").strip().lower() not in profile.city.lower():
            continue

        prices = prices_of(profile)
        if args.get("service") and (service is None or str(service.id) not in prices):
            continue

        if is_full(profile):  
            continue


        row = public_ca(profile)
        row["price"] = money(prices[str(service.id)]) if service else None
        rows.append(row)

    rows.sort(key=lambda row: (-(row["rating_average"] or 0), -row["years_experience"], row["full_name"]))
    page = max(args.get("page", 1, type=int), 1)
    page_size = min(max(args.get("page_size", 20, type=int), 1), 100)
    start = (page - 1) * page_size
    return jsonify({"items": rows[start:start + page_size], 
                    "page": page,
                    "page_size": page_size,
                    "total": len(rows)})


@app.route("/api/v1/marketplace/cas/<uuid:ca_id>")
@role_required("business")
def get_ca(ca_id):
    profile = listed_ca(ca_id)
    if profile is None:
        return error(404, "CA_NOT_FOUND", "This CA is not listed on the marketplace.")
    
    prices = prices_of(profile)
    page = public_ca(profile)

    page["services"] = [{**s, "price": money(prices[s["id"]])} for s in catalog() if s["id"] in prices]
    page["reviews"] = [{"stars": r.stars, "review": r.review, "created_at": iso(r.created_at)}
                       for r in ratings_of(profile)[:5]]

    
    return jsonify(page)



def services_for(profile, business, filing):
    regulatory = RegulatoryProfile.query.filter_by(business_id=business.id).first()
    itr_service = ITR_SERVICES.get(regulatory.itr_form if regulatory else None)
    prices = prices_of(profile)

    return [
        {
            "service_id": str(service.id),
            "name": service.name,
            "price": money(prices[str(service.id)])
        }

        for service in CatalogService.query.filter_by(
            form_code=filing.form_code
        ).order_by(CatalogService.sort_order)

        if str(service.id) in prices and (filing.form_code != "itr" or service.code == itr_service)
    ]



@app.route("/api/v1/marketplace/cas/<uuid:ca_id>/requestable-filings")
@role_required("business")
def requestable_filings(ca_id):
    business, profile = my_business(), listed_ca(ca_id)

    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")
    
    if profile is None:
        return error(404, "CA_NOT_FOUND", "This CA is not listed on the marketplace.")

    
    filings = ComplianceItem.query.filter_by(business_id=business.id).order_by(ComplianceItem.due_date).all()
    busy = open_filing_ids([filing.id for filing in filings])

    result = []
    for filing in filings:
        options = services_for(profile, business, filing)
        reason = None

        if filing.status in ("filed", "filed_verified"):
            reason = "Already filed."

        elif filing.id in busy:
            reason = "Already requested from a CA or with a CA."

        elif not options and filing.form_code == "itr":
            reason = "This CA has not listed a price for the ITR of your business type."

        elif not options:
            reason = "This CA has not listed a price for this filing."


        result.append({"id": str(filing.id), 
                       "form_code": filing.form_code, 
                       "period_label": filing.period_label,
                       "due_date": iso(filing.due_date), 
                       "status": filing.status, 
                       "options": options,
                       "blocked_reason": reason})
        
    return jsonify(result)




@app.route("/api/v1/marketplace/engagements", methods=["POST"])
@role_required("business")
def send_request():
    data = request.get_json(silent=True) or {}
    business, profile = my_business(), listed_ca(as_uuid(data.get("ca_profile_id")))
    items = data.get("items")

    if not isinstance(items, list) or not items:
        return error(422, "VALIDATION_ERROR", "Choose at least one filing.")
    
    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")

    
    if profile is None:
        return error(404, "CA_NOT_FOUND", "This CA is not listed on the marketplace.")
    
    if is_full(profile, business.id):
        return error(409, "CA_AT_CAPACITY", FULL_MESSAGE)

    chosen = [] 
    for item in items:
        item = item if isinstance(item, dict) else {}
        filing_id = as_uuid(item.get("compliance_item_id"))
        filing = db.session.get(ComplianceItem, filing_id) if filing_id else None

        service_id = item.get("service_id")


        if filing is None or filing.business_id != business.id:
            return error(404, "FILING_NOT_FOUND", "One of the filings was not found.")
        
        if filing in [row[0] for row in chosen]:
            return error(400, "DUPLICATE_FILING", "The same filing is in the request twice.")
        
        if filing.status in ("filed", "filed_verified"):
            return error(409, "FILING_ALREADY_FILED", f"{filing.period_label} is already filed.")
        
        if open_filing_ids([filing.id]):
            message = f"{filing.period_label} is already requested from a CA or with a CA."
            return error(409, "FILING_ALREADY_REQUESTED", message)

        
        option = [o for o in services_for(profile, business, filing) if o["service_id"] == service_id]

        if not option:
            return error(400, "SERVICE_NOT_OFFERED", "This CA does not offer that service for this filing.")

        
        chosen.append((filing, as_uuid(service_id), read_amount(option[0]["price"], 0, 10**9)))

    engagement = Engagement(business_id=business.id, ca_profile_id=profile.id, status="requested", requested_at=db_now())
    db.session.add(engagement)
    db.session.flush()


    for filing, service_id, price in chosen:
        db.session.add(EngagementItem(engagement_id=engagement.id, compliance_item_id=filing.id, service_id=service_id, listed_price=price))


    notify(profile.user,
            "engagement_update", 
            f"New request from {business.legal_name}",
            f"{business.legal_name} asked you to handle {len(chosen)} filing(s). Accept or decline it.",
            "/ca/engagements")

    
    db.session.commit()

    if profile.user.email_notifications:
        send_email(profile.user.email,
                    "New request on CA Helper",
                    "engagement_requested",
                    ca_name=profile.user.full_name, 
                    business_name=business.legal_name, 
                    filing_count=len(chosen))

        
    return jsonify(engagement_to_dict(engagement)), 201




@app.route("/api/v1/marketplace/my-engagements")
@role_required("business")
def my_engagements():
    business = my_business()

    if business is None:
        return error(404, "BUSINESS_NOT_FOUND", "Register your business first.")

    
    engagements = Engagement.query.filter_by(business_id=business.id).order_by(Engagement.requested_at.desc())

    return jsonify([engagement_to_dict(engagement) for engagement in engagements])




@app.route("/api/v1/marketplace/ca-engagements")
@role_required("ca")
def ca_engagements():
    profile = my_profile()

    if profile is None:
        return jsonify([])
    
    engagements = Engagement.query.filter_by(ca_profile_id=profile.id).order_by(Engagement.requested_at.desc())
    return jsonify([engagement_to_dict(engagement) for engagement in engagements])