from datetime import datetime
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo
from flask import jsonify, current_app, render_template
from flask_jwt_extended import get_current_user, jwt_required
import smtplib
from email.message import EmailMessage
from argon2 import PasswordHasher

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
