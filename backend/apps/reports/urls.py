from django.urls import path
from apps.reports import views

urlpatterns = [
    path('reports/summary', views.SummaryView.as_view()),
    path('reports/by_payment', views.ByPaymentView.as_view()),
    path('reports/by_category', views.ByCategoryView.as_view()),
    path('reports/by_product', views.ByProductView.as_view()),
    path('reports/daily_sales', views.DailySalesView.as_view()),
    path('reports/hourly_heatmap', views.HourlyHeatmapView.as_view()),
    path('reports/top_customers', views.TopCustomersView.as_view()),
    path('reports/cash_reconciliation', views.CashReconciliationView.as_view()),
]
