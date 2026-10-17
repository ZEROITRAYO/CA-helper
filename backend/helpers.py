import json
from datetime import datetime
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo
from flask import jsonify, current_app, render_template, request
from flask_jwt_extended import get_current_user, jwt_required
import smtplib
from email.message import EmailMessage
from argon2 import PasswordHasher
from models import Notification, db, Business
from decimal import Decimal

REPO = Path(__file__).resolve().parent.parent  


def error(status, code, message):
    return jsonify({"error": {"code": code, "message": message}}), status


def role_required(*roles):

    def decorator(route):
        @wraps(route)
        @jwt_required()
        def check_role(*args, **kwargs):
            if get_current_user().role not in roles:
                return error(403, "FORBIDDEN", "You cant access this page.")
            return route(*args, **kwargs)

        return check_role

    return decorator


def current_user():
    return get_current_user()

def now():
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def my_business():
    return Business.query.filter_by(user_id=current_user().id).first()



def date(time):
    return time.astimezone(ZoneInfo("Asia/Kolkata")).date()


def iso(value):
    return value.isoformat() if value is not None else None

def money(value):
    return None if value is None else f"{Decimal(value):.2f}"

def format_inr(amount):
    digits = str(int(amount))
    head, groups = digits[:-3], [digits[-3:]]
    while head:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return "₹" + ",".join(groups)



def page_of(query, to_dict):
    page = max(request.args.get("page", 1, type=int), 1)
    page_size = min(max(request.args.get("page_size", 20, type=int), 1), 100)
    result = query.paginate(page=page, per_page=page_size, error_out=False)
    items = [to_dict(item) for item in result.items]
    return {"items": items, "page": page, "page_size": page_size, "total": result.total}


hasher = PasswordHasher()


def hash_password(password):
    return hasher.hash(password)


def check_password(password_hash, password):
    try:
        return hasher.verify(password_hash, password)
    except Exception:
        return False



def send_email(to, subject, template, **values):
    message = EmailMessage()
    message["From"] = current_app.config["MAIL_SENDER"]
    message["To"] = to
    message["Subject"] = subject
    message.set_content(render_template(f"email/{template}.txt", **values))
    try:
        with smtplib.SMTP(current_app.config["MAIL_SERVER"], current_app.config["MAIL_PORT"]) as smtp:
            smtp.send_message(message)
    except OSError:
        print("Could not send the email") 



def notify(user, kind, title, body, link=None):
    notification = Notification(user_id=user.id, type=kind, title=title, body=body, link=link)
    db.session.add(notification)
    return notification



def read_amount(value, lowest, highest):
    if isinstance(value, bool):
        return None
    try:
        amount = round(Decimal(str(value)), 2)
        return amount if lowest <= amount <= highest else None
    except Exception: 
        return None



def email_notice(user, title, body):
    if user.email_notifications:
        send_email(user.email, title, "notification", name=user.full_name, title=title, body=body)


GST_STATES = json.loads((REPO / "content/reference/gst_states.json").read_text())["states"]

def state_code(name):
    for state in GST_STATES:
        if state["name"] == name:
            return state["code"]
    return None

def gstin_check_character(first_14):
    characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    total = 0
    for index, character in enumerate(first_14):
        product = characters.index(character) * (1 if index % 2 == 0 else 2)
        total += product // 36 + product % 36
    return characters[(36 - total % 36) % 36]



def gstin_error(gstin, pan, state):
    if gstin_check_character(gstin[:14]) != gstin[14]:
        return "This GSTIN seems not valid: its last character does not match. Check for a typo error!"
    code = state_code(state)
    if code and gstin[:2] != code:
        return f"This GSTIN starts with {gstin[:2]}, but the code of {state} is {code}."
    if pan and gstin[2:12] != pan:
        return "The PAN inside this GSTIN (characters 3 to 12) does not match your PAN."
    return None


FILE_STARTS = {"application/pdf": b"%PDF-", "image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}


def read_upload():
    upload = request.files.get("file")
    if upload is None:
        return None, None, error(422, "VALIDATION_ERROR", "Choose a file to upload!")
    data = upload.read()
    max_mb = current_app.config["MAX_UPLOAD_MB"]
    if not data:
        return None, None, error(400, "FILE_EMPTY", "File is empty.")
    start = FILE_STARTS.get(upload.mimetype)
    if start is None or not data.startswith(start):
        return None, None, error(400, "FILE_TYPE_NOT_ALLOWED", "Allowed types are JPG, PNG, PDF only.")
    if len(data) > max_mb * 1024 * 1024:
        return None, None, error(400, "FILE_TOO_LARGE", f"The file is larger than {max_mb} MB!")
    return upload, data, None