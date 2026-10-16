import os
from flask import Flask, jsonify, redirect
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException
from models import db, User
import uuid
from sqlalchemy import text

app = Flask(__name__)

@app.route("/")
def home():
    return redirect("/api/health")

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = False 
app.config["FIELD_ENCRYPTION_KEY"] = os.environ.get("FIELD_ENCRYPTION_KEY")  
app.config["MAX_UPLOAD_MB"] = 5
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  
app.config["MAIL_SERVER"] = os.environ.get("MAIL_SERVER", "localhost")
app.config["MAIL_PORT"] = int(os.environ.get("MAIL_PORT", "1025"))
app.config["MAIL_SENDER"] = os.environ.get("MAIL_DEFAULT_SENDER", "CA Helper <no-reply@ca-helper.local>")
app.config["MAIL_SUPPRESS_SEND"] = False  

db.init_app(app)
jwt = JWTManager(app)


with app.app_context():
    db.create_all()


@jwt.user_lookup_loader
def load_user(header, payload):
    return db.session.get(User, uuid.UUID(payload["sub"]))  

@jwt.unauthorized_loader
def no_token(reason):
    return jsonify({"error": {"code": "AUTH_REQUIRED", "message": "Please log in."}}), 401

@jwt.invalid_token_loader
def bad_token(reason):
    return jsonify({"error": {"code": "TOKEN_INVALID", "message": "Please log in again."}}), 401

@jwt.user_lookup_error_loader
def user_gone(header, payload):
    return jsonify({"error": {"code": "ACCOUNT_INACTIVE", "message": "This account no longer exists."}}), 401


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify({"error": {"code": error.name, "message": error.description}}), error.code

@app.route("/api/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ok", "database": "ok"})
    
    except Exception:
        print("Database unavailable")
        db.session.rollback()
        return jsonify({"status": "bad", "database": "unavailable"}), 503

import routes_auth