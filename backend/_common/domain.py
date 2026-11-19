"""
The incident vocabulary every service shares. schema.sql's CHECK constraints enforce the same values;
these are what Python validates against and what queries pass as parameters
(e.g. `i.status = ANY(%(active)s)` with ACTIVE_STATUSES), so nothing re-types the lists.
"""

STATUSES = ("open", "in_progress", "blocked", "resolved", "closed")
ACTIVE_STATUSES = ("open", "in_progress", "blocked")  # work still to do
PRIORITIES = ("low", "medium", "high", "critical")
CATEGORY_TYPES = ("facility", "technology")
