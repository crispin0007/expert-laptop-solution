"""
core/exceptions.py
~~~~~~~~~~~~~~~~~~
Typed exception hierarchy for NEXUS BMS.

Rules:
- Every intentional error raise in services/views MUST use one of these classes.
- Never raise bare Exception or RuntimeError — the exception handler cannot
  produce clean responses for those.
- Domain-specific exceptions live here too. App-level exceptions that
  require app models should subclass these from within that app.

Usage::

    from core.exceptions import NotFoundError, ValidationError
    raise NotFoundError("Invoice not found")
    raise ValidationError("Cannot cancel a paid invoice")
"""
from rest_framework import status as http_status


class AppException(Exception):
    """
    Base class for all NEXUS BMS exceptions.

    The global exception handler (core.exception_handler) catches every
    AppException subclass and converts it to a structured ApiResponse.error
    response automatically — no try/except needed in views.
    """

    # HTTP status to return when this exception is raised from a view
    status_code: int = http_status.HTTP_400_BAD_REQUEST

    # Default message when none is provided
    default_message: str = "An error occurred"

    def __init__(self, message: str | None = None, extra: dict | None = None):
        self.message = message or self.default_message
        self.extra = extra or {}
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.message!r})"


# ── HTTP-mapped exceptions ───────────────────────────────────────────────────


class NotFoundError(AppException):
    """Resource does not exist or is not visible to this tenant."""
    status_code = http_status.HTTP_404_NOT_FOUND
    default_message = "Resource not found"


class ForbiddenError(AppException):
    """Authenticated but not authorised for this action."""
    status_code = http_status.HTTP_403_FORBIDDEN
    default_message = "Permission denied"


class ConflictError(AppException):
    """State conflict — action cannot be performed in the current state."""
    status_code = http_status.HTTP_409_CONFLICT
    default_message = "Conflict"


class ValidationError(AppException):
    """Business-rule validation failed (not DRF field validation)."""
    status_code = http_status.HTTP_422_UNPROCESSABLE_ENTITY
    default_message = "Validation failed"


class ServiceUnavailableError(AppException):
    """A downstream dependency (email, FCM, etc.) is temporarily unavailable."""
    status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE
    default_message = "Service temporarily unavailable"


# ── Domain-specific exceptions ───────────────────────────────────────────────


class TenantScopeError(ForbiddenError):
    """Cross-tenant data access attempt detected."""
    default_message = "Cross-tenant access denied"


class InsufficientStockError(ValidationError):
    """
    A product cannot be allocated because stock on hand is too low.

    Usage::

        raise InsufficientStockError(
            f"Only {available} units of '{product.name}' available",
            extra={"product_id": product.id, "available": available},
        )
    """
    default_message = "Insufficient stock available"


class CoinApprovalError(ConflictError):
    """Coin transaction is already in a terminal state (approved/rejected)."""
    default_message = "Coin transaction is already processed"


class FiscalYearError(ValidationError):
    """Fiscal year parameter is missing, invalid, or out of range."""
    default_message = "Invalid fiscal year"


class InvoiceStateError(ConflictError):
    """Invoice action attempted on a document in an incompatible state."""
    default_message = "Invoice action not permitted in current state"


class TicketStateError(ConflictError):
    """Ticket action attempted on a ticket in an incompatible state."""
    default_message = "Ticket action not permitted in current state"


class ModuleDisabledError(ForbiddenError):
    """The module required for this endpoint is not active on this tenant's plan."""
    status_code = http_status.HTTP_402_PAYMENT_REQUIRED
    default_message = "Module not active on your current plan"
