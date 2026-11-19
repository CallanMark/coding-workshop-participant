"""
Auth routes: method + path -> service function. Paths are relative to /api/auth.
"""

import service
from common.http import Route

ROUTES = [
    # Public: anyone can register, as an employee only.
    Route("POST", "/register", service.register, status=201, public=True),
    # Public: sign in with email + password.
    Route("POST", "/login", service.login, public=True),
    # Requires the user to be logged in. No role/privilege check: any signed-in user.
    Route("GET", "/me", service.me),
    # Engineer profiles: the facility admin's job.
    Route("GET", "/engineers", service.list_engineers, roles=("admin",)),
    Route("POST", "/engineers", service.add_engineer, status=201, roles=("admin",)),
    Route("PATCH", "/engineers/{id}", service.update_engineer, roles=("admin",)),
]
