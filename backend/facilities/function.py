"""
Lambda entry point for the facilities service. Routing lives in routes.py,
rules in service.py, SQL in repository.py, shared plumbing in common/.
"""

from common.http import handle
from routes import ROUTES


def handler(event: dict | None = None, context: object = None) -> dict:
    """Handle one Lambda invocation."""
    return handle(event, "facilities", ROUTES)
