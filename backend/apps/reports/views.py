from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.reports import queries
from apps.accounts.permissions import auth_is_required, user_has_permission

REPORT_DASHBOARD_CACHE_TTL = 15


class ReportPermissionView(APIView):
    def has_report_access(self, request):
        return not auth_is_required() or user_has_permission(request.user, 'reports.view')


class SummaryView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.summary(request.query_params.get('from'), request.query_params.get('to')))


class ByPaymentView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.by_payment(request.query_params.get('from'), request.query_params.get('to')))


class ByCategoryView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.by_category(request.query_params.get('from'), request.query_params.get('to')))


class ByProductView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        limit = int(request.query_params.get('limit', '20'))
        return Response(queries.by_product(request.query_params.get('from'), request.query_params.get('to'), limit=limit))


class HourlyHeatmapView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.hourly_heatmap(request.query_params.get('from'), request.query_params.get('to')))


class DailySalesView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.daily_sales(request.query_params.get('from'), request.query_params.get('to')))


class TopCustomersView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        limit = int(request.query_params.get('limit', '20'))
        return Response(queries.top_customers(request.query_params.get('from'), request.query_params.get('to'), limit=limit))


class CashReconciliationView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(queries.cash_reconciliation(request.query_params.get('session_id')))


class DashboardView(ReportPermissionView):
    def get(self, request):
        if not self.has_report_access(request):
            return Response({'detail': 'Forbidden'}, status=403)
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        limit = int(request.query_params.get('limit', '20'))
        cache_key = f'reports_dashboard:{from_date or ""}:{to_date or ""}:{limit}'
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)
        payload = {
            'summary': queries.summary(from_date, to_date),
            'products': queries.by_product(from_date, to_date, limit=limit),
            'daily_sales': queries.daily_sales(from_date, to_date),
            'payments': queries.by_payment(from_date, to_date),
        }
        cache.set(cache_key, payload, REPORT_DASHBOARD_CACHE_TTL)
        return Response(payload)
