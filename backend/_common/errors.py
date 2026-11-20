"""
API errors. Raise these anywhere in a service; only common.http.handle() turns them into responses.
"""


class ApiError(Exception):
    """Base class: an error with an HTTP status, a user-safe message and field-level details."""

    status = 500
    default_message = "Internal server error"

    def __init__(self, message: str | None = None, details: dict | None = None) -> None:
        """Create the error; message falls back to the class default."""
        self.message = message or self.default_message
        self.details = details or {}
        super().__init__(self.message)


class BadRequest(ApiError):
    """400: invalid input. Put per-field messages in `details`."""

    status = 400
    default_message = "Validation failed"


class Unauthorized(ApiError):
    """401: not signed in."""

    status = 401
    default_message = "Sign in required"


class Forbidden(ApiError):
    """403: signed in, but not allowed to do this."""

    status = 403
    default_message = "Not allowed"


class NotFound(ApiError):
    """404: does not exist, or is outside the caller's scope."""

    status = 404
    default_message = "Not found"


class Conflict(ApiError):
    """409: duplicate, or an invalid state transition."""

    status = 409
    default_message = "Conflict"


class NotImplementedYet(ApiError):
    """501: route exists but is still a stub."""

    status = 501
    default_message = "Not implemented yet"


def counted(count: int, noun: str) -> str:
    """For messages: "1 incident", "3 incidents" (noun is the singular; plural adds an s)."""
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"
