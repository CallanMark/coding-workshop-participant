"""
Facilities routes: method + path -> service function. Paths are relative to /api/facilities.

Reading is open to any signed-in user (the report form and list filters need it).
Creating, editing and deleting is admin only; anything still in use can't be deleted (409).
"""

import service
from common.http import Route

ADMIN = ("admin",)

ROUTES = [
    # Buildings
    Route("GET", "/buildings", service.list_buildings),
    Route("POST", "/buildings", service.create_building, status=201, roles=ADMIN),
    Route("PUT", "/buildings/{id}", service.update_building, roles=ADMIN),
    Route("DELETE", "/buildings/{id}", service.delete_building, status=204, roles=ADMIN),
    # Floors belong to a building
    Route("GET", "/buildings/{id}/floors", service.list_floors),
    Route("POST", "/buildings/{id}/floors", service.create_floor, status=201, roles=ADMIN),
    Route("PUT", "/floors/{id}", service.update_floor, roles=ADMIN),
    Route("DELETE", "/floors/{id}", service.delete_floor, status=204, roles=ADMIN),
    # Seats belong to a floor
    Route("GET", "/floors/{id}/seats", service.list_seats),
    Route("POST", "/floors/{id}/seats", service.create_seat, status=201, roles=ADMIN),
    Route("PUT", "/seats/{id}", service.update_seat, roles=ADMIN),
    Route("DELETE", "/seats/{id}", service.delete_seat, status=204, roles=ADMIN),
    # Categories route incidents to a team
    Route("GET", "/categories", service.list_categories),
    Route("POST", "/categories", service.create_category, status=201, roles=ADMIN),
    Route("PUT", "/categories/{id}", service.update_category, roles=ADMIN),
    Route("DELETE", "/categories/{id}", service.delete_category, status=204, roles=ADMIN),
    # Teams, for choosing a category's team
    Route("GET", "/teams", service.list_teams),
]
