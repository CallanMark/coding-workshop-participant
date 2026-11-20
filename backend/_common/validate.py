"""
Reading and checking request values, shared by every service so each rule (and its wording) is written once.
Helpers return the value or an error message; the service decides the field name and raises BadRequest.
"""


def text(value, strip: bool = True) -> str:
    """A JSON string field (trimmed unless strip=False, e.g. passwords); anything else counts as blank."""
    if not isinstance(value, str):
        return ""
    return value.strip() if strip else value


def is_id(value) -> bool:
    """A positive integer id from a JSON body. (bool is excluded: in Python True is an int.)"""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def query_id(raw: str | None) -> int | None:
    """A positive integer from a query-string value, or None if it isn't one."""
    raw = (raw or "").strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else None


def length_error(value: str, label: str, max_len: int, required: bool = True) -> str | None:
    """Why a (trimmed) text value is invalid, e.g. "Name is required", or None if it's fine."""
    if required and not value:
        return f"{label} is required"
    if len(value) > max_len:
        return f"{label} must be at most {max_len} characters"
    return None
