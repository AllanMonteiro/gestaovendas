from django.conf import settings
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def auth_is_required() -> bool:
    return bool(getattr(settings, 'REQUIRE_AUTH', True))


class KitchenConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        if auth_is_required() and not self.scope['user'].is_authenticated:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add('kitchen', self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard('kitchen', self.channel_name)

    async def kitchen_event(self, event):
        await self.send_json(event['payload'])


def broadcast_kitchen_event(event_type: str, payload: dict):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'kitchen',
        {
            'type': 'kitchen.event',
            'payload': {'event': event_type, **payload},
        },
    )
