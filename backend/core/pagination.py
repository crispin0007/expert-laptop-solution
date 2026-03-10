"""
core/pagination.py
~~~~~~~~~~~~~~~~~~
Cursor-based pagination for all NEXUS BMS list endpoints.

Why cursor over page-number pagination:
- No expensive COUNT(*) query on every list request
- Stable results when records are inserted/deleted mid-session
- Works correctly on large tables (invoices, stock movements, audit logs)
- Consistent with ApiResponse envelope shape

Usage — automatic when NexusViewSet is the base class.
For standalone APIViews::

    from core.pagination import NexusCursorPagination

    class MyView(APIView):
        def get(self, request):
            paginator = NexusCursorPagination()
            page = paginator.paginate_queryset(qs, request, view=self)
            serializer = MySerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
"""
from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.response import Response


class NexusCursorPagination(CursorPagination):
    """
    Default cursor paginator — use for all tenant-scoped list endpoints.

    Query params:
        cursor     — opaque continuation token (from response.meta.pagination.next)
        page_size  — number of results per page (default 25, max 100)

    Response shape (inside ApiResponse envelope)::

        {
          "success": true,
          "data": [...],
          "meta": {
            "pagination": {
              "next":      "...<cursor>...",
              "previous":  null,
              "page_size": 25
            }
          },
          "errors": []
        }
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"

    def get_paginated_response(self, data):
        return Response({
            "success": True,
            "message": "",
            "data": data,
            "meta": {
                "pagination": {
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                    "page_size": self.page_size,
                }
            },
            "errors": [],
        })

    def get_paginated_response_schema(self, schema):
        """OpenAPI schema hint for drf-spectacular."""
        return {
            "type": "object",
            "required": ["success", "data", "meta", "errors"],
            "properties": {
                "success": {"type": "boolean", "example": True},
                "message": {"type": "string", "example": ""},
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "pagination": {
                            "type": "object",
                            "properties": {
                                "next":      {"type": "string", "nullable": True},
                                "previous":  {"type": "string", "nullable": True},
                                "page_size": {"type": "integer", "example": 25},
                            },
                        }
                    },
                },
                "errors": {"type": "array", "items": {"type": "string"}},
            },
        }


class NexusPageNumberPagination(PageNumberPagination):
    """
    Page-number paginator — use only when cursor pagination is not suitable
    (e.g. reports that need random access to arbitrary pages).

    Query params:
        page       — 1-based page number
        page_size  — results per page (default 25, max 100)
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        total = self.page.paginator.count
        page_size = self.get_page_size(self.request)
        import math
        total_pages = math.ceil(total / page_size) if page_size else 1

        return Response({
            "success": True,
            "message": "",
            "data": data,
            "meta": {
                "pagination": {
                    "page":        self.page.number,
                    "page_size":   page_size,
                    "total":       total,
                    "total_pages": total_pages,
                    "next":        self.get_next_link(),
                    "previous":    self.get_previous_link(),
                }
            },
            "errors": [],
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "required": ["success", "data", "meta", "errors"],
            "properties": {
                "success": {"type": "boolean"},
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "pagination": {
                            "type": "object",
                            "properties": {
                                "page":        {"type": "integer"},
                                "page_size":   {"type": "integer"},
                                "total":       {"type": "integer"},
                                "total_pages": {"type": "integer"},
                                "next":        {"type": "string", "nullable": True},
                                "previous":    {"type": "string", "nullable": True},
                            },
                        }
                    },
                },
                "errors": {"type": "array"},
            },
        }
