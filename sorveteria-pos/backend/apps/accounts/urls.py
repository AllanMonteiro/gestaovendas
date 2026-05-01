from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.urls import path
from apps.accounts import views

urlpatterns = [
    path('auth/bootstrap', views.BootstrapView.as_view(), name='auth_bootstrap'),
    path('auth/login', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/session', views.SessionView.as_view(), name='auth_session'),
    path('auth/roles', views.RoleListView.as_view(), name='auth_roles'),
    path('auth/users', views.UserListCreateView.as_view(), name='auth_users'),
    path('auth/users/<int:id>', views.UserDetailView.as_view(), name='auth_user_detail'),
]
