# chat/routing.py
from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/(?P<rtc_name>\w+)/$', consumers.RtcConsumer.as_asgi()),
]
