import json
import re
import shutil
import subprocess
from pathlib import Path

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