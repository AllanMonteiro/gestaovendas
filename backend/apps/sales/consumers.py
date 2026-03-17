import os
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def auth_is_required() -> bool:
    debug_enabled = os.environ.get('DJANGO_DEBUG', '1') == '1'
    default_value = '0' if debug_enabled else '1'
    return os.environ.get('DJANGO_REQUIRE_AUTH', default_value) == '1'


class PDVConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        if auth_is_required() and not self.scope['user'].is_authenticated:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add('pdv', self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard('pdv', self.channel_name)

    async def pdv_event(self, event):
        await self.send_json(event['payload'])


def broadcast_pdv_event(event_type: str, payload: dict):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'pdv',
        {
            'type': 'pdv.event',
            'payload': {'event': event_type, **payload},
        },
    )
