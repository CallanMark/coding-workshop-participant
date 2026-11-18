"""
Auth service layer: registration, login and the current user.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.
"""

import re

from psycopg import errors as pg_errors

import repository
from common.auth import DUMMY_HASH, hash_password, issue_token, verify_password
from common.errors import BadRequest, Conflict, Forbidden, Unauthorized
from common.http import Request

EMAIL_PATTERN = re.compile(r"^[a-z0-9._%+-]+@acme\.inc$")
MIN_PASSWORD, MAX_PASSWORD = 8, 128
MAX_NAME = 100
LOGIN_FAILED = "Email or password is incorrect"


def register(req: Request) -> dict:
    """Create an employee account (self-registration is employees only) and sign them in."""
    name = _text(req.body.get("name")).strip()
    email = _text(req.body.get("email")).strip().lower()
    password = _text(req.body.get("password"))

    details = {}
    if not name:
        details["name"] = "Name is required"
    elif len(name) > MAX_NAME:
        details["name"] = f"Name must be at most {MAX_NAME} characters"
    if not EMAIL_PATTERN.match(email):
        details["email"] = "Use your @acme.inc email address"
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        details["password"] = f"Password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters"
    if details:
        raise BadRequest(details=details)

    try:
        user_id = repository.insert_user({
            "email": email,
            "password_hash": hash_password(password),
            "name": name,
            "role": "employee",
            "team_id": None,
            "created_by": None,
        })
    except pg_errors.UniqueViolation as exc:
        raise Conflict("An account with this email already exists",
                       {"email": "An account with this email already exists"}) from exc
    return _session(repository.get_user(user_id))


def login(req: Request) -> dict:
    """
    Check email + password and return a token.
    Every failed sign-in (blank, unknown email, wrong password) is the same 401, so the
    response never says which part was wrong. The login form checks for blank fields itself.
    """
    email = _text(req.body.get("email")).strip().lower()
    password = _text(req.body.get("password"))

    creds = repository.get_credentials(email) if email else None
    # Always run one hash check so blank or unknown emails take as long as wrong passwords.
    password_ok = verify_password(password, creds["password_hash"] if creds else DUMMY_HASH)
    if creds is None or not password_ok:
        raise Unauthorized(LOGIN_FAILED)
    if not creds["is_active"]:
        raise Forbidden("This account has been deactivated. Contact a facility admin.")
    return _session(repository.get_user(creds["id"]))


def me(req: Request) -> dict:
    """The signed-in user's current profile (re-read from the database, so deactivation applies)."""
    user = repository.get_user(req.user["id"])
    if user is None or not user["is_active"]:
        raise Unauthorized("Your account is no longer active. Please sign in again.")
    return user


def _text(value) -> str:
    """A JSON field as a string; anything else (number, list, null, missing) counts as blank."""
    return value if isinstance(value, str) else ""


def _session(user: dict) -> dict:
    """The login/register response: a signed token plus the public user."""
    return {"token": issue_token(user), "user": user}
