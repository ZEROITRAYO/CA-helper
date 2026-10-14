from datetime import datetime
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo
from flask import jsonify, current_app, render_template, request
from flask_jwt_extended import get_current_user, jwt_required
import smtplib
from email.message import EmailMessage
from argon2 import PasswordHasher
from models import Notification, db

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


def date(time):
    return time.astimezone(ZoneInfo("Asia/Kolkata")).date()


def iso(value):
    return value.isoformat() if value is not None else None


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


def email_notice(user, title, body):
    if user.email_notifications:
        send_email(user.email, title, "notification", name=user.full_name, title=title, body=body)



