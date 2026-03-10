"""
core/serializers.py
-------------------
Shared DRF serializer base classes for the NEXUS BMS project.
"""
from rest_framework import serializers
from core.mixins import NepaliDateMixin


class NepaliModelSerializer(NepaliDateMixin, serializers.ModelSerializer):
    """
    Base model serializer that automatically injects a ``<field>_bs`` companion
    dict for every DateField and DateTimeField value in the serialized output.

    Inherit from this instead of ``serializers.ModelSerializer`` for any
    serializer that should expose BS (Bikram Sambat) dates to the frontend.

    Example response field added automatically::

        "created_at":    "2024-07-31",
        "created_at_bs": {
            "bs":     "2081-04-15",
            "bs_en":  "15 Shrawan 2081",
            "bs_np":   "१५ श्रावण २०८१",
            "ad":     "2024-07-31",
            "ad_iso": "2024-07-31"
        }
    """
    pass
