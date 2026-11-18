"""
HTTP plumbing shared by all services: parse the Lambda event, match a route, build the response.
"""

import base64
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from common.auth import user_from_headers
from common.db import ensure_schema
from common.errors import ApiError, BadRequest, NotFound

logger = logging.getLogger()
logger.setLevel(logging.INFO)


@dataclass
class Request:
    """What a route handler receives."""

    method: str
    parts: list[str]
    query: dict[str, str] = field(default_factory=dict)
    body: dict = field(default_factory=dict)
    params: dict[str, int] = field(default_factory=dict)  # path params, e.g. {"id": 12}
    headers: dict[str, str] = field(default_factory=dict)
    user: dict | None = None  # signed-in user {"id", "role", "team_id"}; None only on public routes


@dataclass
class Route:
    """
    One endpoint. `path` is relative to the service, e.g. "/{id}/status"; `{name}` matches an integer.
    Routes require a signed-in user unless `public=True`.
    """

    method: str
    path: str
    handler: Callable[[Request], Any]
    status: int = 200
    public: bool = False


def respond(status: int, body: Any = None) -> dict:
    """Build a Lambda HTTP response; no body for 204."""
    response = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if status != 204:
        response["body"] = json.dumps(body, default=str)
    return response


def error_response(err: ApiError) -> dict:
    """The one error body format: {"error": {"message", "details"}}."""
    return respond(err.status, {"error": {"message": err.message, "details": err.details}})


def parse_request(event: dict, service: str) -> Request:
    """
    Turn a Lambda event into a Request.

    Locally the Lambda sees "/12/status"; behind CloudFront it sees "/api/<service>/12/status".
    Both become parts == ["12", "status"].
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"
    parts = [p for p in path.split("/") if p]
    if parts[:1] == ["api"]:
        parts = parts[1:]
    if parts[:1] == [service]:
        parts = parts[1:]

    raw = event.get("body") or ""
    if raw and event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    try:
        body = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise BadRequest("Request body must be valid JSON") from exc
    if not isinstance(body, dict):
        raise BadRequest("Request body must be a JSON object")

    return Request(
        method=method,
        parts=parts,
        query=event.get("queryStringParameters") or {},
        body=body,
        headers=event.get("headers") or {},
    )


def match(path: str, parts: list[str]) -> dict[str, int] | None:
    """Return path params if `parts` matches `path` (e.g. "/{id}/status"), else None."""
    pattern = [p for p in path.split("/") if p]
    if len(pattern) != len(parts):
        return None
    params = {}
    for expected, actual in zip(pattern, parts, strict=True):
        if expected.startswith("{") and expected.endswith("}"):
            if not actual.isdigit():
                return None
            params[expected[1:-1]] = int(actual)
        elif expected != actual:
            return None
    return params


def handle(event: dict | None, service: str, routes: list[Route]) -> dict:
    """Entry point for every service: route the request and turn errors into responses."""
    try:
        ensure_schema()
        req = parse_request(event or {}, service)
        for route in routes:
            if route.method != req.method:
                continue
            params = match(route.path, req.parts)
            if params is None:
                continue
            req.params = params
            if not route.public:
                req.user = user_from_headers(req.headers)  # 401 if missing, invalid or expired
            return respond(route.status, route.handler(req))
        raise NotFound("Route not found")
    except ApiError as err:
        return error_response(err)
    except Exception:  # pylint: disable=broad-except
        logger.exception("Unhandled error")
        return error_response(ApiError())
