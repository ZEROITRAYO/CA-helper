import uuid
from datetime import datetime, timezone

from cryptography.fernet import Fernet
from flask import current_app
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

db = SQLAlchemy()


def db_now():
    return datetime.now(timezone.utc)


class EncryptedText(db.TypeDecorator):
    impl = db.Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return Fernet(current_app.config["FIELD_ENCRYPTION_KEY"]).encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return Fernet(current_app.config["FIELD_ENCRYPTION_KEY"]).decrypt(value.encode()).decode()




class Table(db.Model):
    __abstract__ = True
    id = db.Column(db.Uuid, primary_key=True, default=uuid.uuid4)
    created_at = db.Column(db.DateTime(timezone=True), default=db_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=db_now, onupdate=db_now)


class User(Table):
    __tablename__ = "users"
    email = db.Column(db.String(254), unique=True)  
    password_hash = db.Column(db.String(255))
    full_name = db.Column(db.String(200))
    role = db.Column(db.String(50))
    email_verified = db.Column(db.Boolean, default=False) 
    email_notifications = db.Column(db.Boolean, default=True)


class EmailOtp(Table):
    __tablename__ = "email_otps"
    user_id = db.Column(db.Uuid, db.ForeignKey("users.id"))
    purpose = db.Column(db.String(50))  
    code_hash = db.Column(db.String(255))
    expires_at = db.Column(db.DateTime(timezone=True))
    used_at = db.Column(db.DateTime(timezone=True))



class NicCode(Table):
    __tablename__ = "nic_codes"
    code = db.Column(db.String(10), unique=True)
    description = db.Column(db.String(500))


class Business(Table):
    __tablename__ = "businesses"
    user_id = db.Column(db.Uuid, db.ForeignKey("users.id"), unique=True)
    legal_name = db.Column(db.String(200))
    entity_type = db.Column(db.String(50))  
    state = db.Column(db.String(50))
    address = db.Column(db.String(500))
    description = db.Column(db.String(1000))
    annual_turnover = db.Column(db.Numeric(12, 2))
    investment_amount = db.Column(db.Numeric(12, 2))
    pan = db.Column(EncryptedText)
    phone = db.Column(EncryptedText)
    gst_registered = db.Column(db.Boolean)
    gstin = db.Column(EncryptedText)
    gst_composition = db.Column(db.Boolean, default=False)
    gst_qrmp = db.Column(db.Boolean, default=False)  #
    accounts_audited_other_law = db.Column(db.Boolean, default=False)
    deducts_tds = db.Column(db.Boolean)
    tan = db.Column(EncryptedText)
    pays_salary_above_limit = db.Column(db.Boolean)
    cin_llpin = db.Column(db.String(21))
    udyam_number = db.Column(db.String(19))
    nic_code_id = db.Column(db.Uuid, db.ForeignKey("nic_codes.id"))


class RegulatoryProfile(Table):
    __tablename__ = "regulatory_profiles"
    business_id = db.Column(db.Uuid, db.ForeignKey("businesses.id"), unique=True)
    msme_tier = db.Column(db.String(50))
    gst_scheme = db.Column(db.String(50))
    gst_registration_suggested = db.Column(db.Boolean)
    itr_form = db.Column(db.String(50))
    presumptive_eligible = db.Column(db.Boolean)
    audit_applicable = db.Column(db.Boolean)
    other_audit_applicable = db.Column(db.Boolean, default=False)
    files_24q = db.Column(db.Boolean)
    files_26q = db.Column(db.Boolean)
    roc_not_tracked = db.Column(db.Boolean)
    explanations = db.Column(JSONB)
    rule_version = db.Column(db.String(50))
    computed_at = db.Column(db.DateTime(timezone=True))


class RuleThreshold(Table):
    __tablename__ = "rule_thresholds"
    key = db.Column(db.String(100))
    value = db.Column(db.Numeric(18, 4))
    unit = db.Column(db.String(20))
    description = db.Column(db.String(500))
    source_reference = db.Column(db.String(500))
    effective_from = db.Column(db.Date)
    effective_to = db.Column(db.Date)


class ObligationTemplate(Table):
    __tablename__ = "obligation_templates"
    form_code = db.Column(db.String(50))
    name = db.Column(db.String(100))
    frequency = db.Column(db.String(50)) 
    applicability = db.Column(JSONB)  
    due_date_rule = db.Column(JSONB)  
    source_reference = db.Column(db.String(500))
    effective_from = db.Column(db.Date)
    effective_to = db.Column(db.Date)


class ComplianceItem(Table):
    __tablename__ = "compliance_items"
    business_id = db.Column(db.Uuid, db.ForeignKey("businesses.id"))
    template_id = db.Column(db.Uuid, db.ForeignKey("obligation_templates.id"))
    form_code = db.Column(db.String(50))
    fy = db.Column(db.String(7))  
    period_label = db.Column(db.String(30))  
    period_start = db.Column(db.Date)
    period_end = db.Column(db.Date)
    due_date = db.Column(db.Date)
    status = db.Column(db.String(50), default="upcoming")
    filing_path = db.Column(db.String(50)) 
    filed_at = db.Column(db.DateTime(timezone=True))
    acknowledgement_no = db.Column(db.String(50))
    verified_at = db.Column(db.DateTime(timezone=True))
    acknowledgement_document_id = db.Column(db.Uuid, db.ForeignKey("documents.id"))


class ChecklistTick(Table):
    __tablename__ = "checklist_ticks"
    compliance_item_id = db.Column(db.Uuid, db.ForeignKey("compliance_items.id"))
    checklist_key = db.Column(db.String(50))


class PenaltyRule(Table):
    __tablename__ = "penalty_rules"
    form_code = db.Column(db.String(50))
    late_fee_per_day = db.Column(db.Numeric(12, 2))
    max_late_fee = db.Column(db.Numeric(12, 2))
    flat_late_fee = db.Column(db.Numeric(12, 2))
    annual_interest_rate = db.Column(db.Numeric(5, 2))
    source_reference = db.Column(db.String(500))
    effective_from = db.Column(db.Date)
    effective_to = db.Column(db.Date)


class ReminderLog(Table):
    __tablename__ = "reminder_log"
    compliance_item_id = db.Column(db.Uuid, db.ForeignKey("compliance_items.id"))
    kind = db.Column(db.String(50))  
    sent_at = db.Column(db.DateTime(timezone=True))

class Notification(Table):
    __tablename__ = "notifications"
    user_id = db.Column(db.Uuid, db.ForeignKey("users.id"))
    type = db.Column(db.String(50))
    title = db.Column(db.String(200))
    body = db.Column(db.String(2000))
    link = db.Column(db.String(300))
    read_at = db.Column(db.DateTime(timezone=True))


class Document(Table):
    __tablename__ = "documents"
    owner_id = db.Column(db.Uuid, db.ForeignKey("users.id"))
    uploaded_by_id = db.Column(db.Uuid, db.ForeignKey("users.id"))
    doc_type = db.Column(db.String(50))
    original_filename = db.Column(db.String(255))
    content = db.deferred(db.Column(db.LargeBinary)) 
    mime_type = db.Column(db.String(100))
    size_bytes = db.Column(db.Integer)
    sha256 = db.Column(db.String(64))
    fy = db.Column(db.String(7))
    period_label = db.Column(db.String(30))
    ocr_status = db.Column(db.String(50), default="none")  
    ocr_fields = db.Column(JSONB)  #


class ComplianceItemDocument(Table):
    __tablename__ = "compliance_item_documents"
    compliance_item_id = db.Column(db.Uuid, db.ForeignKey("compliance_items.id"))
    document_id = db.Column(db.Uuid, db.ForeignKey("documents.id"))
    checklist_key = db.Column(db.String(50), default="general")
    linked_by_id = db.Column(db.Uuid, db.ForeignKey("users.id"))



class CaProfile(Table):
    __tablename__ = "ca_profiles"
    user_id = db.Column(db.Uuid, db.ForeignKey("users.id"), unique=True)
    user = db.relationship("User", foreign_keys=[user_id])
    membership_no = db.Column(db.String(6), unique=True)
    cop_number = db.Column(db.String(20))
    city = db.Column(db.String(100))
    languages = db.Column(ARRAY(db.String(50)))
    specializations = db.Column(ARRAY(db.String(50)))
    capacity = db.Column(db.Integer)  
    years_experience = db.Column(db.Integer)
    about = db.Column(db.String(500), default="")
    verification_status = db.Column(db.String(50), default="pending") 
    verified_at = db.Column(db.DateTime(timezone=True))
    verified_by_id = db.Column(db.Uuid, db.ForeignKey("users.id"))
    cop_document_id = db.Column(db.Uuid, db.ForeignKey("documents.id")) 


class CatalogService(Table):
    __tablename__ = "service_catalog"
    code = db.Column(db.String(50), unique=True)
    name = db.Column(db.String(100))
    description = db.Column(db.String(300))
    unit = db.Column(db.String(50))
    sort_order = db.Column(db.Integer)
    form_code = db.Column(db.String(50)) 


class CaService(Table):
    __tablename__ = "ca_services"
    ca_profile_id = db.Column(db.Uuid, db.ForeignKey("ca_profiles.id"))
    service_id = db.Column(db.Uuid, db.ForeignKey("service_catalog.id"))
    price = db.Column(db.Numeric(12, 2))


class Engagement(Table):
    __tablename__ = "engagements"
    business_id = db.Column(db.Uuid, db.ForeignKey("businesses.id"))
    business = db.relationship("Business")
    ca_profile_id = db.Column(db.Uuid, db.ForeignKey("ca_profiles.id"))
    ca = db.relationship("CaProfile")
    status = db.Column(db.String(50), default="requested")
    requested_at = db.Column(db.DateTime(timezone=True), default=db_now)
    responded_at = db.Column(db.DateTime(timezone=True))
    activated_at = db.Column(db.DateTime(timezone=True))
    completed_at = db.Column(db.DateTime(timezone=True))


class EngagementItem(Table):
    __tablename__ = "engagement_items"
    engagement_id = db.Column(db.Uuid, db.ForeignKey("engagements.id"))
    compliance_item_id = db.Column(db.Uuid, db.ForeignKey("compliance_items.id"))
    filing = db.relationship("ComplianceItem")
    service_id = db.Column(db.Uuid, db.ForeignKey("service_catalog.id"))
    service = db.relationship("CatalogService")
    listed_price = db.Column(db.Numeric(12, 2))
    agreed_price = db.Column(db.Numeric(12, 2))


class Rating(Table):
    __tablename__ = "ratings"
    engagement_id = db.Column(db.Uuid, db.ForeignKey("engagements.id"), unique=True)
    stars = db.Column(db.SmallInteger)
    review = db.Column(db.String(2000))


class DocumentRequest(Table):
    __tablename__ = "document_requests"
    engagement_id = db.Column(db.Uuid, db.ForeignKey("engagements.id"))
    engagement = db.relationship("Engagement")
    compliance_item_id = db.Column(db.Uuid, db.ForeignKey("compliance_items.id"))
    filing = db.relationship("ComplianceItem")
    checklist_key = db.Column(db.String(50))
    message = db.Column(db.String(1000))
    status = db.Column(db.String(50), default="open")
    fulfilled_at = db.Column(db.DateTime(timezone=True))
    document_id = db.Column(db.Uuid, db.ForeignKey("documents.id"))