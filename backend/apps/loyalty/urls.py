from django.urls import path
from apps.loyalty import views

urlpatterns = [
    path('loyalty/customer', views.LoyaltyCustomerView.as_view()),
    path('loyalty/earn', views.LoyaltyEarnView.as_view()),
    path('loyalty/redeem', views.LoyaltyRedeemView.as_view()),
    path('loyalty/moves', views.LoyaltyMovesView.as_view()),
]