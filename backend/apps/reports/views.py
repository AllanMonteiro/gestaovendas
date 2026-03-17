from rest_framework.views import APIView
from rest_framework.response import Response
from apps.reports import queries
from apps.accounts.permissions import auth_is_required, user_has_permission


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
