import sys
from datetime import date
from decimal import Decimal

from app import app
from models import ObligationTemplate, RuleThreshold, db

RULES_FROM = date(2025, 4, 1)

MSME_SOURCE = (
    "Udyam Registration portal (udyamregistration.gov.in), MSME classification from "
    "1 April 2025 (MSMED Act; notification S.O. 1364(E), 21.03.2025)"
)


RULE_THRESHOLDS = [
    ("msme.micro.max_investment", "25000000", "inr", "Micro: investment up to ₹2.5 crore", MSME_SOURCE),
    ("msme.micro.max_turnover", "100000000", "inr", "Micro: turnover up to ₹10 crore", MSME_SOURCE),
    ("msme.small.max_investment", "250000000", "inr", "Small: investment up to ₹25 crore", MSME_SOURCE),
    ("msme.small.max_turnover", "1000000000", "inr", "Small: turnover up to ₹100 crore", MSME_SOURCE),
    ("msme.medium.max_investment", "1250000000", "inr", "Medium: investment up to ₹125 crore", MSME_SOURCE),
    ("msme.medium.max_turnover", "5000000000", "inr", "Medium: turnover up to ₹500 crore", MSME_SOURCE),
    ("gst.registration.min_turnover", "2000000", "inr",
     "GST registration needed above ₹20 lakh (lower limit, for services)",
     "CBIC, 'GST - An Update' (1 May 2019), cbic-gst.gov.in: registration needed above "
     "₹20 lakh for services (₹10 lakh in Manipur, Mizoram, Nagaland, Tripura) and ₹40 lakh "
     "for goods (₹20 lakh in some states); CGST Act s.22, Notification 10/2019-CT"),
    ("gst.qrmp.max_turnover", "50000000", "inr", "Quarterly returns (QRMP) allowed up to ₹5 crore",
     "GST portal FAQ 'Quarterly Return and Monthly Payment (QRMP) Scheme' "
     "(tutorial.gst.gov.in/userguide/returns/FAQs_change_profile.htm)"),
    ("gst.composition.max_turnover", "15000000", "inr",
     "Composition scheme allowed up to ₹1.5 crore (goods)",
     "CBIC, 'GST - An Update' (1 May 2019): composition up to ₹1.5 crore for goods "
     "(₹75 lakh in special category states); CGST Act s.10, Notification 14/2019-CT"),
    ("itr.presumptive_44ad.max_turnover", "20000000", "inr",
     "Presumptive scheme (44AD) allowed up to ₹2 crore",
     "incometax.gov.in, File ITR-4 (Sugam) FAQ Q9: s.44AD up to ₹2 crore (₹3 crore when "
     "cash receipts are at most 5%)"),
    ("itr.audit_44ab.min_turnover", "10000000", "inr", "Tax audit needed above ₹1 crore",
     "incometax.gov.in, Income Tax Forms FAQ: tax audit above ₹1 crore for a business "
     "(₹10 crore when cash is at most 5%); s.44AB of the 1961 Act, s.63 of the 2025 Act"),
]


GST_FAQ = "tutorial.gst.gov.in/userguide/returns/"
OBLIGATION_TEMPLATES = [
    ("itr", "Income tax return", "yearly", {},
     {"month": 8, "day": 31, "audit_month": 10, "audit_day": 31, "by_itr_form": {"itr_5": [7, 31]}},
     "incometax.gov.in, Income Tax Returns FAQ Q16 and Q24: 31 August for individuals and HUFs with business or professional income and no audit (31 July only without business income: no profile of the app), 31 October with an audit; s.139(1) of the 1961 Act, s.263 of the 2025 Act as amended by Finance Act 2026. TODO_VERIFY: ITR-5 (firms, LLPs) without audit, 31 July used (sources say 31 July or 31 August; the earlier date)"),
    ("gstr_1", "GSTR-1 (monthly)", "monthly", {"gst_scheme": ["regular_monthly"]},
     {"day": 11}, f"GST portal FAQ 'Form GSTR-1' Q10 ({GST_FAQ}GSTR_1.htm): 11th of the next month"),
    ("gstr_1", "GSTR-1 (quarterly, QRMP)", "quarterly", {"gst_scheme": ["regular_qrmp"]},
     {"quarters": [[7, 13], [10, 13], [1, 13], [4, 13]]},
     f"GST portal FAQ 'Form GSTR-1' Q10 ({GST_FAQ}GSTR_1.htm): 13th after the quarter"),
    ("gstr_3b", "GSTR-3B (monthly)", "monthly", {"gst_scheme": ["regular_monthly"]},
     {"day": 20}, f"GST portal FAQ 'Form GSTR-3B' ({GST_FAQ}GSTR3B.htm): 20th of the next month"),
    ("gstr_3b", "GSTR-3B (quarterly, QRMP)", "quarterly", {"gst_scheme": ["regular_qrmp"]},
     {"quarters": [[7, 22], [10, 22], [1, 22], [4, 22]]},
     f"GST portal FAQ 'Form GSTR-3B' ({GST_FAQ}GSTR3B.htm) and GSTN QRMP advisory Q28: 22nd or 24th after the quarter by state; the app uses the 22nd for every state(the earlier date, as the team decided on 2026-09-29)"),
    ("cmp_08", "CMP-08", "quarterly", {"gst_scheme": ["composition"]},
     {"quarters": [[7, 18], [10, 18], [1, 18], [4, 18]]},
     f"GST portal FAQ 'Filing Form GST CMP-08' Q3 ({GST_FAQ}FAQs_CMP02.htm): 18th after the quarter"),
    ("gstr_4", "GSTR-4", "yearly", {"gst_scheme": ["composition"]}, {"month": 6, "day": 30},
     "TODO_VERIFY: 30 June after the FY from FY 2024-25 (CGST Rules r.62 as amended by Notification 12/2024-CT, 10.07.2024; not read, the GST portal FAQ still says the 30th of the month after the FY)"),
    ("tds_24q", "TDS return 24Q (salaries)", "quarterly", {"files_24q": [True]},
     {"quarters": [[7, 31], [10, 31], [1, 31], [5, 31]]},
     "incometax.gov.in, Form 138 (earlier 24Q) user manual: 31 July, 31 October, 31 January, 31 May; shown as Form 138 from tax year 2026-27 (Income-tax Act 2025 s.392 and Income-tax Rules 2026; filings.RENAMED_FORMS)"),
    ("tds_26q", "TDS return 26Q (other payments)", "quarterly", {"files_26q": [True]},
     {"quarters": [[7, 31], [10, 31], [1, 31], [5, 31]]},
     "incometax.gov.in, Form 140 (earlier 26Q) user manual: 31 July, 31 October, 31 January, 31 May; shown as Form 140 from tax year 2026-27 (Income-tax Act 2025 s.393 and Income-tax Rules 2026; filings.RENAMED_FORMS)"),
]

def save(table, lookup, values):
    row = table.query.filter_by(**lookup).first()
    if row is None:
        row = table(**lookup)
        db.session.add(row)
    for column, value in values.items():
        setattr(row, column, value)


def seed():
    for key, value, unit, description, source in RULE_THRESHOLDS:
        save(
            RuleThreshold,
            {"key": key, "effective_from": RULES_FROM},
            {
                "value": Decimal(value),
                "unit": unit,
                "description": description,
                "source_reference": source,
            },
        )

    for form, name, frequency, applicability, rule, source in OBLIGATION_TEMPLATES:
        save(
            ObligationTemplate,
            {
                "form_code": form,
                "frequency": frequency,
                "effective_from": RULES_FROM,
            },
            {
                "name": name,
                "applicability": applicability,
                "due_date_rule": rule,
                "source_reference": source,
            },
        )

    db.session.commit()
    print("Seeded: rule thresholds and obligation templates")

if __name__ == "__main__":
    with app.app_context():
        if "--reset" in sys.argv:
            if "neon.tech" in app.config["SQLALCHEMY_DATABASE_URI"]:
                sys.exit("--reset is for a local database only, never the shared Neon database.")
            db.drop_all()
            db.create_all()
        seed()