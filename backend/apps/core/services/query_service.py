"""
Boas práticas para queries Django
"""

from django.db.models import QuerySet


class QueryService:

    @staticmethod
    def with_select_related(qs: QuerySet, *fields):
        return qs.select_related(*fields)

    @staticmethod
    def with_prefetch_related(qs: QuerySet, *fields):
        return qs.prefetch_related(*fields)

    @staticmethod
    def only_fields(qs: QuerySet, *fields):
        return qs.only(*fields)

    @staticmethod
    def defer_fields(qs: QuerySet, *fields):
        return qs.defer(*fields)

    @staticmethod
    def paginate(qs: QuerySet, limit=20):
        return qs[:limit]
