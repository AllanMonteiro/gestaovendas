from django.urls import path

from .views import DeliveryOrderDetailView, DeliveryOrdersView, PublicDeliveryOrderCreateView

urlpatterns = [
    path('public/', PublicDeliveryOrderCreateView.as_view()),
    path('', DeliveryOrdersView.as_view()),
    path('<uuid:id>/', DeliveryOrderDetailView.as_view()),
]
