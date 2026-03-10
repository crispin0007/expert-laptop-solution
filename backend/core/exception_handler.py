"""
core/exception_handler.py
~~~~~~~~~~~~~~~~~~~~~~~~~
Global DRF exception handler for NEXUS BMS.

Registered in settings via::

    REST_FRAMEWORK = {
        "EXCEPTION_HANDLER": "core.exception_handler.nexus_exception_handler",
    }

Handles three tiers of exceptions:

1. **AppException subclasses** (core.exceptions) — our own typed errors.
   Converted directly to ApiResponse.error using the exception's status_code
   and message. No traceback logged — these are expected/business errors.

2. **DRF exceptions** (NotAuthenticated, ValidationError, PermissionDenied, etc.)
   Passed through DRF's default handler first, then the response is reformatted
   into the ApiResponse envelope so the frontend sees a consistent shape.

3. **Unexpected exceptions** (anything else) — logged at ERROR level with full
   traceback, then returns a generic 500 so we never leak stack traces.
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.views import exception_handler as _drf_default_handler

from core.exceptions import AppException
from core.response import ApiResponse

logger = logging.getLogger("nexus.errors")


def nexus_exception_handler(exc: Exception, context: dict):
    """
    Central exception handler — replaces DRF's default handler.

    Called for every unhandled exception raised inside a DRF view.
    """

    # ── Tier 1: Our own typed exceptions ────────────────────────────────────
    if isinstance(exc, AppException):
        # These are intentional business errors — log at WARNING, not ERROR.
        logger.warning(
            "AppException [%s] in %s — %s",
            exc.__class__.__name__,
            _view_name(context),
            exc.message,
            extra=exc.extra,
        )
        return ApiResponse.error(
            errors=[exc.message],
            message=exc.message,
            status=exc.status_code,
        )

    # ── Tier 2: DRF framework exceptions ────────────────────────────────────
    drf_response = _drf_default_handler(exc, context)
    if drf_response is not None:
        return _reformat_drf_response(drf_response, exc)

    # ── Tier 3: Truly unexpected exceptions ─────────────────────────────────
    logger.exception(
        "Unhandled exception in %s — %s: %s",
        _view_name(context),
        type(exc).__name__,
        exc,
    )
    return ApiResponse.server_error()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _reformat_drf_response(drf_response, exc):
    """
    Convert DRF's raw exception response into the ApiResponse envelope.

    DRF returns various shapes depending on the exception type:
    - {"detail": "..."} for AuthenticationFailed / PermissionDenied
    - {"field": ["msg"]} for serializer ValidationError
    - A list of strings for non-field errors

    We normalise all of these into a flat list of strings for `errors`.
    """
    raw = drf_response.data
    errors: list | dict

    if isinstance(raw, dict):
        # Field-level validation errors or {"detail": "..."}
        if "detail" in raw and len(raw) == 1:
            # Single detail string — simplify to list
            errors = [str(raw["detail"])]
        else:
            # Field-level errors: flatten into "field: message" strings
            flat: list[str] = []
            for field, msgs in raw.items():
                if isinstance(msgs, (list, tuple)):
                    for m in msgs:
                        flat.append(f"{field}: {m}" if field != "non_field_errors" else str(m))
                else:
                    flat.append(f"{field}: {msgs}" if field != "non_field_errors" else str(msgs))
            errors = flat if flat else [str(raw)]
    elif isinstance(raw, list):
        errors = [str(item) for item in raw]
    else:
        errors = [str(raw)]

    # Map HTTP status to a human-readable message header
    _messages = {
        400: "Bad request",
        401: "Authentication required",
        403: "Permission denied",
        404: "Not found",
        405: "Method not allowed",
        429: "Too many requests",
    }
    message = _messages.get(drf_response.status_code, "Request failed")

    return ApiResponse.error(
        errors=errors,
        message=message,
        status=drf_response.status_code,
    )


def _view_name(context: dict) -> str:
    """Extract a readable view name from the exception context."""
    view = context.get("view")
    if view is None:
        return "unknown"
    return view.__class__.__name__
