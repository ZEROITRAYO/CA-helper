import os
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException
from models import db

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = False  # stay logged in until "Log out"
app.config["FIELD_ENCRYPTION_KEY"] = os.environ.get("FIELD_ENCRYPTION_KEY")  # for PAN, GSTIN, TAN, phone
app.config["MAX_UPLOAD_MB"] = 5
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # bigger requests are refused
app.config["MAIL_SERVER"] = os.environ.get("MAIL_SERVER", "localhost")
app.config["MAIL_PORT"] = int(os.environ.get("MAIL_PORT", "1025"))
app.config["MAIL_SENDER"] = os.environ.get("MAIL_DEFAULT_SENDER", "CA Helper <no-reply@ca-helper.local>")
app.config["MAIL_SUPPRESS_SEND"] = False  # True keeps emails in helpers.outbox instead of sending them

db.init_app(app)
jwt = JWTManager(app)


with app.app_context():
    db.create_all()



@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify({"error": {"code": error.name, "message": error.description}}), error.code


