from channels_presence.models import Presence, Room
from django.contrib import admin

admin.site.register(Room)

@admin.register(Presence)
class PresenceAdmin(admin.ModelAdmin):
    list_display = ['user', 'room_name', 'channel_name']
    list_select_related = ['room']

    @admin.display
    def room_name(self, obj):
        return obj.room.channel_name