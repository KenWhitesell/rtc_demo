import asyncio
from django.core.management.base import BaseCommand
from django.core.management.base import BaseCommand

from channels.db import database_sync_to_async
from channels_presence.models import Room

class Command(BaseCommand):
    help = "Periodically runs the channel presence clean-up commands"

    def handle(self, *args, **options):
        asyncio.run(self.do_clean_up())

    async def do_clean_up(self):
        await asyncio.gather(
            self.prune_rooms(),
            self.prune_presences()
        )

    async def prune_rooms(self):
        while True:
            await database_sync_to_async(Room.objects.prune_rooms)()
            await asyncio.sleep(1800)

    async def prune_presences(self):
        while True:
            await database_sync_to_async(Room.objects.prune_presences)()
            await asyncio.sleep(600)
