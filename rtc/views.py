from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponseRedirect
from django.shortcuts import render
from rtc.forms import LoginForm

def site_login(request):
    form = LoginForm(request.POST or None)
    if request.method == "POST":
        if form.is_valid():
            if not form.user:
                user = User(
                    username=form.cleaned_data['name'],
                    first_name=form.cleaned_data['screen_name'],
                    is_active=True,
                )
                user.set_password("no password needed")
                user.save()
            else:
                user = form.user
            login(request, user)
            return HttpResponseRedirect("/")
    return render(request, 'registration/login.html', {'form': form})

@login_required
def index(request):
    return render(request, 'rtc/index.html', {})
