import json
import re
import shutil
import subprocess
from pathlib import Path
from datetime import date
import pymupdf


STATES_FILE = Path(__file__).resolve().parent.parent / "content/reference/gst_states.json"
GST_STATES = json.loads(STATES_FILE.read_text())["states"]


MAX_PAGES = 3
MIN_PAGE_TEXT = 30  
RENDER_DPI = 200  
TESSERACT_TIMEOUT_SECONDS = 30


def _read_picture(picture):
    if shutil.which("tesseract") is None:  
        raise ValueError("file auto read not available!")
    try:
        result = subprocess.run(["tesseract", "stdin", "stdout", "-l", "eng"], input=picture,  capture_output=True, timeout=TESSERACT_TIMEOUT_SECONDS, check=False)
    except subprocess.TimeoutExpired as error:
        raise ValueError("Timeout!") from error
    if result.returncode != 0:
        raise ValueError("File Reading failed.")
    return result.stdout.decode("utf-8", errors="replace")


def extract_text(data, mime_type):
    if mime_type != "application/pdf":
        text = _read_picture(data)
    else:
        try:
            pdf = pymupdf.open(stream=data, filetype="pdf")
        except Exception as error: 
            raise ValueError("The PDF could not be opened.") from error
        texts = []
        with pdf:
            for number in range(min(MAX_PAGES, pdf.page_count)):
                page = pdf[number]
                text = page.get_text()
                if len(text.strip()) < MIN_PAGE_TEXT:
                    text = _read_picture(page.get_pixmap(dpi=RENDER_DPI).tobytes("png"))
                texts.append(text)
        text = "\n".join(texts)
    if not text.strip():
        raise ValueError("No text was found in the file.")
    return text


PAN = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
GSTIN = re.compile(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b")


CONSTITUTIONS = {
    "PROPRIETORSHIP": "proprietorship",
    "PARTNERSHIP": "partnership",
    "LIMITED LIABILITY PARTNERSHIP": "llp",
    "PRIVATE LIMITED COMPANY": "private_limited",
}

def _clean(text):
    return re.sub(r"\s+", " ", text.upper())

def read_registration(text):
    clean = _clean(text)
    found = {}
    gstin = GSTIN.search(clean)

    if gstin:
        found["gstin"] = gstin[0]
        found["pan"] = gstin[0][2:12]
        for state in GST_STATES:
            if state["code"] == gstin[0][:2]:
                found["state"] = state["name"]
    else:
        pan = PAN.search(clean)
        if pan:
            found["pan"] = pan[0]

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        legal = re.search(r"LEGAL NAME\s*[:\-]?\s*(.*)", line, flags=re.IGNORECASE)
        if legal:
            value = legal.group(1) or next_line
        elif re.fullmatch(r"(?:.*/\s*)?NAME\s*:?", line, flags=re.IGNORECASE):
            value = next_line
        else:
            continue
        if value and not PAN.search(value.upper()):
            found["legal_name"] = value.strip()[:200]
            break

    if "CONSTITUTION OF BUSINESS" in clean:
        for words, entity_type in CONSTITUTIONS.items():
            if words in clean:
                found["entity_type"] = entity_type  
    return found

MONTHS = {
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "MAY": 5, "JUNE": 6, "JULY": 7,
    "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11, "DECEMBER": 12,
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "JUN": 6, "JUL": 7, "AUG": 8, "SEP": 9,
    "SEPT": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}  

FORM_PATTERNS = {
    "gstr_3b": re.compile(r"\bGSTR\s*-?\s*3B\b"),
    "gstr_1": re.compile(r"\bGSTR\s*-?\s*1\b"),
    "cmp_08": re.compile(r"\bCMP\s*-?\s*0?8\b"),
    "gstr_4": re.compile(r"\bGSTR\s*-?\s*4\b"),
    "tds_24q": re.compile(r"\b24\s*Q\b"),
    "tds_26q": re.compile(r"\b26\s*Q\b"),
    "itr": re.compile(r"\bITR\s*-?\s*(?:[1-7]|V)?\b|\bINCOME\s*TAX\s*RETURN\b"),
}

ACK_NUMBER = re.compile(
    r"(?:\bARN\b|ACKNOWLEDGE?MENT\s*(?:REFERENCE\s*)?(?:NUMBER|NO\b\.?)|\bACK\.?\s*NO\b\.?"
    r"|TOKEN\s*(?:NUMBER|NO\b\.?)|(?:PROVISIONAL\s*)?RECEIPT\s*(?:NUMBER|NO\b\.?))"
    r"\s*[:\-]?\s*([A-Z0-9]{10,20})\b"
)

BARE_ARN = re.compile(r"\b(A[A-Z][0-9]{2}[0-9A-Z]{11})\b")

DAY_MONTH_YEAR = re.compile(r"\b([0-3]?[0-9])[/\-. ]([0-1]?[0-9]|[A-Z]{3,9})[/\-. ,]+(20[0-9]{2})\b")

YEAR_MONTH_DAY = re.compile(r"\b(20[0-9]{2})-([0-1][0-9])-([0-3][0-9])\b")

TYPE_KEYWORDS = {
    "acknowledgement": ["ACKNOWLEDGEMENT", "ACKNOWLEDGMENT", "ARN", "ITR-V", "SUCCESSFULLY FILED"],
    "gst_certificate": ["REG-06", "REGISTRATION CERTIFICATE", "CERTIFICATE OF REGISTRATION"],
    "pan_card": ["PERMANENT ACCOUNT NUMBER", "INCOME TAX DEPARTMENT", "GOVT. OF INDIA"],
    "bank_statement": ["STATEMENT OF ACCOUNT", "OPENING BALANCE", "CLOSING BALANCE", "IFSC"],
    "invoice": ["TAX INVOICE", "INVOICE NO", "INVOICE NUMBER", "BILL TO", "HSN"],
    "sales_register": ["SALES REGISTER", "SALES BOOK"],
    "purchase_register": ["PURCHASE REGISTER", "PURCHASE BOOK"],
    "salary_register": ["SALARY REGISTER", "NET PAY", "BASIC PAY", "PAYSLIP"],
    "tds_challan": ["CHALLAN", "BSR CODE", "ITNS 281"],
    "certificate_of_practice": ["CERTIFICATE OF PRACTICE", "CHARTERED ACCOUNTANTS OF INDIA"],
}

def _dates(clean, today):
    found = []

    for day, month, year in DAY_MONTH_YEAR.findall(clean):
        month_number = int(month) if month.isdigit() else MONTHS.get(month)
        
        found.append((int(year), month_number, int(day)))
    
    for year, month, day in YEAR_MONTH_DAY.findall(clean):
        found.append((int(year), int(month), int(day)))
    
    dates = []
    
    for year, month, day in found:
        try:
            value = date(year, month, day)
        
        except (TypeError, ValueError): 
            continue
        
        if value <= today:
            dates.append(value)
    
    return dates


def guess_document_type(text):
    clean = _clean(text)

    best_type, best_hits = None, 0
    
    for doc_type, keywords in TYPE_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if re.search(rf"\b{re.escape(keyword)}\b", clean))
    
        if hits > best_hits:
            best_type, best_hits = doc_type, hits
    
    return best_type


def read_proof_fields(text, today):
    clean = _clean(text)

    ack_number = None

    labelled = ACK_NUMBER.search(clean)

    if labelled:
        ack_number = labelled.group(1)

    else:
        bare = BARE_ARN.search(clean)

        if bare:
            ack_number = bare.group(1)

    form_codes = []

    for code, pattern in FORM_PATTERNS.items():
        if pattern.search(clean):
            form_codes.append(code)

    dates = _dates(clean, today)

    filing_date = None

    if dates:
        filing_date = max(dates).isoformat()

    return {
        "acknowledgement_no": ack_number,
        "filing_date": filing_date,
        "form_codes": form_codes,
        "type_guess": guess_document_type(text),
    }
