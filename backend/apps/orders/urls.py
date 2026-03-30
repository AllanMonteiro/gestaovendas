from django.urls import path

from .views import DeliveryOrderDetailView, DeliveryOrdersView

urlpatterns = [
    path('', DeliveryOrdersView.as_view()),
    path('<uuid:id>/', DeliveryOrderDetailView.as_view()),
]
