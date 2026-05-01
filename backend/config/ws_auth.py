from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken, TokenError

from apps.accounts.models import User


@database_sync_to_async
def get_user_for_token(raw_token: str):
    try:
        token = AccessToken(raw_token)
        user_id = token.get('user_id')
        if not user_id:
            return AnonymousUser()
        return User.objects.filter(id=user_id, is_active=True).first() or AnonymousUser()
    except (TokenError, ValueError, TypeError):
        return AnonymousUser()


class JwtQueryAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        token = params.get('token', [None])[0]
        if token:
            scope['user'] = await get_user_for_token(token)
        else:
            scope.setdefault('user', AnonymousUser())
        return await self.inner(scope, receive, send)


def JwtQueryAuthMiddlewareStack(inner):
    return JwtQueryAuthMiddleware(inner)
