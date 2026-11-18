"""
Authentication shared by all services: password hashing, JWT issue/verify and role checks.
"""

import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from common.errors import Forbidden, Unauthorized

# Every role a user can have (matches the users.role CHECK in schema.sql).
ROLES = ("employee", "engineer", "manager", "admin")

TOKEN_TTL = timedelta(hours=8)
JWT_ALGORITHM = "HS256"

# scrypt cost parameters: 2**14 * 8 * 128 bytes = 16 MB per hash, fine for a 128 MB Lambda.
SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_LEN = 2**14, 8, 1, 64


def _jwt_secret() -> str:
    """The signing secret; injected by Terraform. A fixed fallback is allowed only for local development."""
    secret = os.getenv("JWT_SECRET")
    if secret:
        return secret
    if os.getenv("IS_LOCAL", "false") == "true":
        return "local-dev-only-secret-change-me"
    raise RuntimeError("JWT_SECRET is not configured")


def hash_password(password: str) -> str:
    """Hash a password with scrypt and a random salt. Format: scrypt$n$r$p$salt_hex$hash_hex."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_LEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """True if `password` matches the stored hash. Constant-time compare; False for malformed hashes."""
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                                n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# Used when the email is unknown, so a failed login takes as long as a wrong password.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def issue_token(user: dict) -> str:
    """Sign a JWT for a user row (needs id, role, team_id). Expires after TOKEN_TTL."""
    now = datetime.now(UTC)
    claims = {
        "sub": str(user["id"]),
        "role": user["role"],
        "team_id": user["team_id"],
        "iat": now,
        "exp": now + TOKEN_TTL,
    }
    return jwt.encode(claims, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Verify a JWT and return the signed-in user as {"id", "role", "team_id"}. Raises Unauthorized."""
    try:
        claims = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
        return {"id": int(claims["sub"]), "role": claims["role"], "team_id": claims.get("team_id")}
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("Your session has expired. Please sign in again.") from exc
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise Unauthorized("Invalid session. Please sign in again.") from exc


def user_from_headers(headers: dict | None) -> dict:
    """The signed-in user from an `Authorization: Bearer <token>` header. Raises Unauthorized."""
    headers = {k.lower(): v for k, v in (headers or {}).items()}
    scheme, _, token = (headers.get("authorization") or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise Unauthorized()
    return decode_token(token.strip())


def require_role(user: dict, *roles: str) -> None:
    """Raise Forbidden unless the user has one of `roles`."""
    if user["role"] not in roles:
        raise Forbidden()
