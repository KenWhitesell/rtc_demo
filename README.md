WebRTC demo using Django, Channels, HTMX, and Coturn

This is a Proof-of-Concept demonstration of WebRTC sharing video using Django, Channels, and HTMX as a signalling service, with Coturn providing STUN and TURN support.

Running this:

If you're just looking to run this in a local environment, running it using runserver does work.
However, getting other machines to connect to your server can be problematic due to the requirement that some of the protocols involved will only work across https. Therefore, for anything other than just
trying it out on your own system, you'll want to deploy this to a server.

Here's a summary of what's needed to get this running.

Keep in mind that this is a full deployment, so everything you're used to doing applies here.
(Note: A full detailed description of a deployment is beyond the scope of this readme.)

- Create your virtual environment
    (My version was built using Python 3.12)

- Install packages listed in the requirements.txt file

- Install and run redis or a true redis-compatible server for the channels layer
    (I have only ever used redis. This is untested with any of the forks.)

- Adjust your settings as appropriate. At a minimum, you will probably want to change:
  - CSRF_TRUSTED_ORIGINS
  - ALLOWED_HOSTS
  - STATIC_ROOT

- Run `manage.py migrate` to initialize the database

- Configure nginx.
  - See the sample file `rtc` in the nginx directory. You will need SSL certificates.

- Set up Daphne and gunicorn to run your project
  - I use `supervisor` as the process manager. A sample configuration file is in the etc/supervisor/conf.d directory

- Deploy your Django project
  - Copy it to an appropriate directory
  - Run `collectstatic`

- Configure coturn - sample file in etc/turnserver.conf
  - You will need a non-local location for your coturn instance if you're behind a NAT
    - You can use a public STUN server, but TURN should be on a public IP address
    - (This is not an issue if everyone using this is behind the same NAT)
