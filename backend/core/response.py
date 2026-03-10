"""
core/response.py
~~~~~~~~~~~~~~~~
Single source of truth for all API response shapes in NEXUS BMS.

Every viewset and APIView MUST use these helpers instead of returning
`Response(...)` directly. This guarantees every endpoint has the same
envelope shape, making frontend consumption and error handling trivial.

Envelope shape::

    {
        "success": bool,
        "message": str,
        "data":    any | null,
        "meta":    {},
        "errors":  []
    }

Usage::

    from core.response import ApiResponse

    # Success
    return ApiResponse.success(data=serializer.data)
    return ApiResponse.created(data=serializer.data, message="Invoice created")

    # Paginated list (replaces DRF's default paginator envelope)
    return ApiResponse.paginated(data=results, page=1, page_size=25, total=142)

    # Errors
    return ApiResponse.error(errors="Something went wrong")
    return ApiResponse.not_found("Invoice")
    return ApiResponse.forbidden()
"""
from __future__ import annotations

import math
from typing import Any

from rest_framework import status as http_status
from rest_framework.response import Response


class ApiResponse:
    """
    Factory class — never instantiated, only static methods used.

    All methods return a DRF `Response` object so they work transparently
    inside any DRF view (ViewSet, APIView, @api_view).
    """

    # ── Success responses ────────────────────────────────────────────────────

    @staticmethod
    def success(
        data: Any = None,
        message: str = "",
        meta: dict | None = None,
        status: int = http_status.HTTP_200_OK,
    ) -> Response:
        """Generic 200 success response."""
        return Response(
            {
                "success": True,
                "message": message,
                "data": data,
                "meta": meta or {},
                "errors": [],
            },
            status=status,
        )

    @staticmethod
    def created(
        data: Any = None,
        message: str = "Created successfully",
        meta: dict | None = None,
    ) -> Response:
        """201 Created — use for POST that creates a new resource."""
        return ApiResponse.success(
            data=data,
            message=message,
            meta=meta,
            status=http_status.HTTP_201_CREATED,
        )

    @staticmethod
    def no_content() -> Response:
        """204 No Content — use for DELETE that returns no body."""
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    @staticmethod
    def paginated(
        data: Any,
        page: int,
        page_size: int,
        total: int,
        message: str = "",
        extra_meta: dict | None = None,
    ) -> Response:
        """
        200 response with pagination metadata embedded in `meta.pagination`.

        Called by NexusPagination.get_paginated_response — do not call directly
        in views (the paginator calls it for you when you use
        self.paginate_queryset() + self.get_paginated_response()).
        """
        total_pages = math.ceil(total / page_size) if page_size else 1
        meta: dict = {
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
            **(extra_meta or {}),
        }
        return ApiResponse.success(data=data, message=message, meta=meta)

    # ── Error responses ──────────────────────────────────────────────────────

    @staticmethod
    def error(
        errors: list[str] | dict | str | None = None,
        message: str = "Request failed",
        status: int = http_status.HTTP_400_BAD_REQUEST,
        data: Any = None,
    ) -> Response:
        """
        Generic error response.

        `errors` can be:
        - A string  → wrapped in a list automatically
        - A list    → used as-is
        - A dict    → used as-is (field-level errors from DRF serializers)
        - None      → empty list
        """
        if errors is None:
            errors = []
        elif isinstance(errors, str):
            errors = [errors]

        return Response(
            {
                "success": False,
                "message": message,
                "data": data,
                "meta": {},
                "errors": errors,
            },
            status=status,
        )

    @staticmethod
    def not_found(resource: str = "Resource") -> Response:
        """404 — resource not found."""
        return ApiResponse.error(
            errors=[f"{resource} not found"],
            message="Not found",
            status=http_status.HTTP_404_NOT_FOUND,
        )

    @staticmethod
    def forbidden(message: str = "You do not have permission to perform this action") -> Response:
        """403 — authenticated but not authorised."""
        return ApiResponse.error(
            errors=[message],
            message="Forbidden",
            status=http_status.HTTP_403_FORBIDDEN,
        )

    @staticmethod
    def validation_error(errors: list | dict, message: str = "Validation failed") -> Response:
        """422 — business-rule validation failed."""
        return ApiResponse.error(
            errors=errors,
            message=message,
            status=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @staticmethod
    def conflict(message: str = "Conflict", errors: list[str] | None = None) -> Response:
        """409 — state conflict."""
        return ApiResponse.error(
            errors=errors or [message],
            message=message,
            status=http_status.HTTP_409_CONFLICT,
        )

    @staticmethod
    def server_error(message: str = "Internal server error") -> Response:
        """500 — unexpected server error (used only by exception handler)."""
        return ApiResponse.error(
            errors=[message],
            message="Internal server error",
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
