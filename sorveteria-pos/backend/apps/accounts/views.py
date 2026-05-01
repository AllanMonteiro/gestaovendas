from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.accounts.permissions import auth_is_required, user_has_permission
from apps.accounts.serializers import BootstrapSerializer, RoleSerializer, UserSerializer, UserUpsertSerializer
from apps.accounts.services import build_user_access_maps, ensure_default_security, has_bootstrap_admin


class BootstrapView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'required': not has_bootstrap_admin()})

    def post(self, request):
        if has_bootstrap_admin():
            return Response({'detail': 'Bootstrap already completed'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = BootstrapSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create_user(
            email=serializer.validated_data['email'],
            name=serializer.validated_data['name'],
            password=serializer.validated_data['password'],
            is_staff=True,
            is_superuser=True,
        )
        ensure_default_security()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class SessionView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        authenticated = bool(getattr(request.user, 'is_authenticated', False))
        data = {
            'require_auth': auth_is_required(),
            'authenticated': authenticated,
            'bootstrap_required': not has_bootstrap_admin(),
        }
        if authenticated:
            data['user'] = UserSerializer(request.user).data
        return Response(data)


class RoleListView(APIView):
    def get(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'system.users.manage'):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        roles = Role.objects.prefetch_related('rolepermission_set__permission').order_by('name')
        return Response(RoleSerializer(roles, many=True).data)


class UserListCreateView(APIView):
    def get(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'system.users.manage'):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        users = list(User.objects.all().order_by('name', 'email'))
        role_ids_map, permission_codes_map = build_user_access_maps(users)
        return Response(
            UserSerializer(
                users,
                many=True,
                context={
                    'user_role_ids_map': role_ids_map,
                    'user_permission_codes_map': permission_codes_map,
                },
            ).data
        )

    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'system.users.manage'):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        serializer = UserUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        role_ids_map, permission_codes_map = build_user_access_maps([user])
        return Response(
            UserSerializer(
                user,
                context={
                    'user_role_ids_map': role_ids_map,
                    'user_permission_codes_map': permission_codes_map,
                },
            ).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    def put(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'system.users.manage'):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        user = User.objects.get(id=id)
        serializer = UserUpsertSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        role_ids_map, permission_codes_map = build_user_access_maps([user])
        return Response(
            UserSerializer(
                user,
                context={
                    'user_role_ids_map': role_ids_map,
                    'user_permission_codes_map': permission_codes_map,
                },
            ).data
        )

    def delete(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'system.users.manage'):
            return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        user = User.objects.get(id=id)
        if user.id == getattr(request.user, 'id', None):
            return Response({'detail': 'Nao e permitido excluir o proprio usuario.'}, status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response({'status': 'deleted'})
