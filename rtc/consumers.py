from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels_presence.models import Presence, Room
from django.db.models import Case, F, Q, When, Value
from django.db.models.functions import Concat, Right
from django.template.loader import render_to_string


class RtcConsumer(AsyncJsonWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.function_dict = {
            'rtc': self._rtc,
            'join': self._join,
            'hangup': self._hangup,
        }

    @database_sync_to_async
    def _presence_connect(self, rtc_name):
        # Remove all existing connections to this room for this user.
        Presence.objects.leave_all(self.channel_name)
        self.room = Room.objects.add(rtc_name, self.channel_name, self.scope["user"])

    @database_sync_to_async
    def _presence_disconnect(self, channel_name):
        Presence.objects.leave_all(channel_name)

    @database_sync_to_async
    def _presence_touch(self):
        Presence.objects.touch(self.channel_name)

    @database_sync_to_async
    def _leave_room(self, room):
        Room.objects.remove(room, self.channel_name)

    @property
    def short_name(self):
        return 'peer-'+self.channel_name[-6:]

    @property
    def user_name(self):
        return self.scope['user'].first_name or self.scope['user'].username

    def _create_self_div(self):
        return render_to_string(
            'rtc/video_panel.html', {
                'id': f'{self.short_name}',
                'user_name': self.user_name
            }
        )

    def _create_other_div(self, occupant):
        return render_to_string(
            'rtc/video_panel.html', {
                'id': f'{occupant["short_name"]}',
                'user_name': occupant['user_name']
            }
        )

    async def connect(self):
        rtc_name = self.scope['url_route']['kwargs']['rtc_name']
        await self._presence_disconnect(self.channel_name)
        self.rtc_call = 'rtc_%s' % rtc_name
        await self._presence_connect(self.rtc_call)

        await self.accept()
        await self.send_json({
                'rtc': {'type': 'connect', 'channel_name': self.channel_name}
        })
        await self.send_json({
                'html': render_to_string('rtc/header.html', {'room': rtc_name})
        })

    async def disconnect(self, close_code):
        # Leave room group
        await self._hangup()
        await self._presence_disconnect(self.channel_name)
        # Send "remove video" to all_but_me
        await self._all_but_me(self.rtc_call,
            {
                'type': 'rtc_message',
                'rtc': {
                    'type': 'disconnected',
                    'channel_name': self.channel_name,
                },
            }
        )

    # Receive message from WebSocket
    async def receive_json(self, content):
        await self._presence_touch()

        for message_key, message_value in content.items():
            if message_key in self.function_dict:
                await self.function_dict[message_key](message_value)

    async def _hangup(self, hangup=None):
        await self._leave_room(self.rtc_call)

        await self._all_but_me(self.rtc_call,
            {
                'type': 'rtc_message',
                'rtc': {
                    'type': 'disconnected',
                    'channel_name': self.channel_name,
                }
            }
        )
        self.rtc_call = None

    async def _join(self, rtc_call):
        if self.rtc_call:
            await self._leave_room(self.rtc_call)

        self.rtc_call = rtc_call
        await self.send_json({
                'html': render_to_string('rtc/header.html', {'room': rtc_call})
        })

        # Send list of connected peers (occupants) to self
        occupants = await self._room_occupants(self.rtc_call)
        all_divs = "\n".join([
            self._create_other_div(occupant)
            for occupant in occupants
            if occupant['channel_name'] != self.channel_name
        ])

        #NOTE: The html must be sent before the connections
        # Otherwise, the connection functions in the client
        # will be trying to access the div before it exists

        await self.send_json({
                'html': all_divs
        })
        await self.send_json({
                'rtc': {
                    'type': 'others',
                    'ids': occupants,
                },
        })

        await self._all_but_me(self.rtc_call,
            {
                'type': 'html_message',
                'html': self._create_self_div()
            }
        )

        # Send self.channel_name to all connected peers
        await self._all_but_me(self.rtc_call,
            {
                'type': 'rtc_message',
                'rtc': {
                    'type': 'other',
                    'channel_name': self.channel_name,
                    'user_name': self.user_name,
                    'short_name': self.short_name
                },
            }
        )

        await self._presence_connect(self.rtc_call)

    async def _rtc(self, rtc):
        # If there's a recipient, send to it.
        if 'recipient' in rtc:
            await self.channel_layer.send(
                rtc['recipient'], {
                    'type': 'rtc_message',
                    'rtc': rtc,
                }
            )
        else:
            await self._all_but_me(
                self.rtc_call, {
                    'type': 'rtc_message',
                    'rtc': rtc
                }
            )


    @database_sync_to_async
    def _room_occupants(self, room):
        return list(Presence.objects.filter(
            room__channel_name=room
        ).annotate(
            user_name=Case(
                When(~Q(user__first_name=''), then=F('user__first_name')),
                default=F('user__username')
            ),
            short_name=Concat(Value('peer-'), Right('channel_name', 6))
        ).values('channel_name', 'user_name', 'short_name'))

    async def _all_but_me(self, room, message):
        occupants = await self._room_occupants(room)
        for occupant in occupants:
            if occupant['channel_name'] != self.channel_name:
                await self.channel_layer.send(
                    occupant['channel_name'], message
                )

    async def rtc_message(self, event):
        # Send message to WebSocket
        await self.send_json({
            'rtc': event['rtc']
        })

    async def html_message(self, event):
        # Send message to WebSocket
        await self.send_json(event)
