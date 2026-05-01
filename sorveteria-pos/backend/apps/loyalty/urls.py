from django.urls import path
from apps.loyalty import views

urlpatterns = [
    path('customer', views.LoyaltyCustomerView.as_view()),
    path('earn', views.LoyaltyEarnView.as_view()),
    path('redeem', views.LoyaltyRedeemView.as_view()),
    path('moves', views.LoyaltyMovesView.as_view()),
]
