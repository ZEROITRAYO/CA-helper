# The database tables. Every table has an id (UUID), created_at and updated_at.
# PAN, GSTIN, TAN and phone numbers are stored encrypted (EncryptedText below).

import uuid
from datetime import datetime, timezone

from cryptography.fernet import Fernet
from flask import current_app
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def now():
    return datetime.now(timezone.utc)


class EncryptedText(db.TypeDecorator):
    """A text column that is encrypted before it is saved and decrypted when it is read."""

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
    """The columns every table has."""

    __abstract__ = True
    id = db.Column(db.Uuid, primary_key=True, default=uuid.uuid4)
    created_at = db.Column(db.DateTime(timezone=True), default=now)
    updated_at = db.Column(db.DateTime(timezone=True), default=now, onupdate=now)


