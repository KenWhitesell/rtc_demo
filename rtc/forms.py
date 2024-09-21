from django import forms
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User

class LoginForm(forms.Form):
    screen_name = forms.CharField(label="First name (or nickname)", max_length=12)
    name = forms.CharField(label="Real name", max_length=50)

    def clean(self):
        super().clean()
        screen_name = self.cleaned_data.get('screen_name', '')
        name = self.cleaned_data.get('name', '')
        self.user = None

        found_name = User.objects.filter(username=name)
        if found_name:
            if found_name.exclude(first_name=screen_name):
                self.add_error("name",
                    "The name exists but does not match the screen name used"
                )
            else:
                self.user = found_name.first()

        if screen_name == name:
            self.add_error("screen_name",
                "Do not use your real name as your screen name"
            )
