from datetime import datetime
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo
from flask import jsonify
from flask_jwt_extended import get_current_user, jwt_required

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


