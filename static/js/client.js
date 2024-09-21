'use strict';

const $self = {
    user_name: "",
    rtc_config: {
        iceServers: [
            { urls: 'stun:kww.us:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            {
                username: "dcus",
                credential: "dcus2024",
                urls: 'turn:kww.us:3478',
            },
        ],
        iceTransportPolicy: "all"
    },
    media_constraints: {
        audio: false,
        video: true,
    },
    video_constraints: {
        height: {max:240, min:48, ideal:120},
        width: {max:320, min:64, ideal:160}
    },
    media_stream: new MediaStream(),
    media_tracks: {},
    features: { audio: false },
    ws: null,
    ws_json: function(data) {
        this.ws.send(JSON.stringify(data));
    }
};

const $others = new Map();

function element_id(id='self') {
    if (id === 'self') return '#self';
    else return $others.get(id).short_name;
}

function signal(recipient, signal) {
    $self.ws_json(
        {  'rtc': {
            'type': 'signal', 'recipient': recipient,
            'sender': $self.id, 'signal': signal
            }
        }
    )
};

function connected({channel_name}) {
    if (channel_name) {
        $self.id = channel_name;
    }
};

function connected_other(conn_info) {
    initialize_other(conn_info, true);
    establish_features(conn_info.channel_name);
};

function connected_others({ids}) {
    for (let conn_info of ids) {
        if (conn_info.channel_name === $self.id) continue;
        initialize_other(conn_info, false);
        establish_features(conn_info.channel_name);
    }
};

function disconnected_other({channel_name}) {
    console.log(`disconnected_other: ${channel_name}`);
    reset_other(channel_name);
};

async function signalled({sender,
    signal: {candidate, description} }) {

    const id = sender;
    const other = $others.get(id);
    const self_state = other.self_states;

    if (description) {
        if (description.type === '_reset') {
            retry_connection(id);
            return;
        }

        // Work with incoming description
        const readyForOffer =
            !self_state.making_offer &&
            (other.connection.signalingState === 'stable'
                || self_state.remote_answer_pending);

        const offerCollision = description.type === 'offer' && !readyForOffer;

        self_state.ignoring_offer = !self_state.is_polite && offerCollision;

        if (self_state.ignoring_offer) {
            return;
        }
        self_state.remote_answer_pending = description.type === 'answer';

        try {
            await other.connection.setRemoteDescription(description);
        } catch(e) {
            retry_connection(id);
            return;
        }

        self_state.remote_answer_pending = false;

        if (description.type === 'offer') {
            try {
                    await other.connection.setLocalDescription();
            } catch(e) {
                    const answer = await other.connection.createAnswer();
                    await other.connection.setLocalDescription(answer);
            } finally {
                signal(id, {'description': other.connection.localDescription});
                self_state.suppressing_offer = false;
            }
        }

    } else if (candidate) {
        // Work with incoming ICE
        try {
            await other.connection.addIceCandidate(candidate);
        } catch(e) {
            // Log error unless $self is ignoring offers
            // and candidate is not an empty string
            if (!self_state.ignoring_offer && candidate.candidate.length > 1) {
                console.error(`Unable to add ICE candidate for other ID: ${id}`, e);
            }
        }
    }
}

apps._add('rtc', 'connect', connected)
apps._add('rtc', 'other', connected_other);
apps._add('rtc', 'others', connected_others);
apps._add('rtc', 'disconnected', disconnected_other);
apps._add('rtc', 'signal', signalled);


function display_stream(stream, id = 'self') {
    var selector = `${element_id(id)} video`;
    var element = document.querySelector(selector);
    if (element) { element.srcObject = stream; };
}

async function request_user_media(media_constraints) {
    $self.media = await navigator.mediaDevices.getUserMedia(media_constraints);
    $self.media_tracks.video = $self.media.getVideoTracks()[0];
    $self.media_tracks.video.applyConstraints($self.video_constraints);
    $self.media_stream.addTrack($self.media_tracks.video);
    display_stream($self.media_stream);
}

function add_features(id) {
    const other = $others.get(id);
    function manage_video(video_feature) {
        other.features['video'] = video_feature;
        if (other.media_tracks.video) {
          if (video_feature) {
              other.media_stream.addTrack(other.media_tracks.video);
          } else {
            other.media_stream.removeTrack(other.media_tracks.video);
            display_stream(other.media_stream, id);
          }
        }
      }
    other.features_channel = other.connection.createDataChannel('features', {negotiated: true, id: 500 });
	other.features_channel.onopen = function(event){
		other.features_channel.send(JSON.stringify($self.features))
	};
	other.features_channel.onmessage = function(event) {
		const features = JSON.parse(event.data);
        if ('video' in features) {
            manage_video(features['video']);
        }
	};
}

function share_features(id, ...features) {
    const other = $others.get(id);

    const shared_features = {};

    if (!other.features_channel) return;

    for (let f of features) {
        shared_features[f] = $self.features[f];
    }

    try {
        other.features_channel.send(JSON.stringify(shared_features));
    } catch(e) {
        console.error('Error sending features:', e);
    }
}

request_user_media($self.media_constraints);

function establish_features(id) {
    register_rtc_callbacks(id);
	add_features(id);
    const other = $others.get(id);
    for (let track in $self.media_tracks) {
        other.connection.addTrack($self.media_tracks[track]);
    }
}

function initialize_other({channel_name, user_name, short_name}, polite) {
    $others.set(channel_name, {
        user_name: user_name,
        short_name: '#' + short_name,
        connection: new RTCPeerConnection($self.rtc_config),
        media_stream: new MediaStream(),
        media_tracks: {},
        features: { 'connection_count': 0},
        self_states: {
            is_polite: polite,
            making_offer: false,
            ignoring_offer: false,
            remote_answer_pending: false,
            suppressing_offer: false
        }
    });
}

function reset_other(channel_name, preserve) {
    const other = $others.get(channel_name);
    display_stream(null, channel_name);
    if (other) {
        if (other.connection) {
            other.connection.close();
        }
    }
    if (!preserve) {
        let qs = document.querySelector(`${other.short_name}-div`);
        if (qs) { qs.remove(); };
        $others.delete(channel_name);
    }
}

function retry_connection(channel_name) {
    const polite = $others.get(channel_name).self_states.is_polite;
    reset_other(channel_name, true);
    //TODO bundle id with username for this call
    initialize_other({channel_name, user_name}, polite);
    $others.get(channel_name).self_states.suppressing_offer = polite;

    establish_features(channel_name);

    if (polite) {
        signal(channel_name,
            {'description': {'type': '_reset'}}
        );
    }
}

function register_rtc_callbacks(id) {
    const other = $others.get(id);
    other.connection.onconnectionstatechange = conn_state_change(id);
    other.connection.onnegotiationneeded = conn_negotiation(id);
    other.connection.onicecandidate = ice_candidate(id);
    other.connection.ontrack = other_track(id);
}

function conn_state_change(id) {
    return function() {
        const other = $others.get(id);
        const otherElement = document.querySelector(`${other.short_name}`);
        if (otherElement) {
            otherElement.dataset.connectionState = other.connection.connectionState;
        }
    }
}

function conn_negotiation(id) {
    return async function() {
        const other = $others.get(id);
        const self_state = other.self_states;
        if (self_state.suppressing_offer) return;
        try {
            self_state.making_offer = true;
            await other.connection.setLocalDescription();
        } catch(e) {
            const offer = await other.connection.createOffer();
            await other.connection.setLocalDescription(offer);
        } finally {
            signal(id, {'description': other.connection.localDescription});
            self_state.making_offer = false;
        };
    }
}

function ice_candidate(id) {
    return function({candidate}) {
        signal(id, {candidate});
    }
}

function other_track(id) {
    return function({track}) {
        const other = $others.get(id);
        other.media_tracks[track.kind] = track;
        other.media_stream.addTrack(track);
        display_stream(other.media_stream, id);
    };
}

htmx.on('htmx:wsOpen', function(e) {
    $self.ws = e.detail.socketWrapper;
    $self.ws_json({'room': 'lobby'});
});

function handleCallButton(event) {
    const call_button = event.target;
    if (call_button.className === 'join') {
        call_button.className = 'leave';
        call_button.innerText = 'Leave Call';
        if ($self.ws) {
            $self.ws_json({'join': 'video'});
        }
    } else {
        // Leave the call
        call_button.className = 'join';
        call_button.innerText = 'Join Call';
        $self.ws_json({'hangup': true});
        for (let channel_name of $others.keys()) {
            reset_other(channel_name);
        }
        let node_list = document.querySelectorAll('[id^="other-"][id$="-div"]');
        for (let node of node_list) { node.remove(); }
    }
};

function toggleCam(event) {
    const button = event.target;
    const video = $self.media_tracks.video;
    const state = video.enabled = !video.enabled;
    $self.features.video = state;
    button.setAttribute('aria-checked', state);

    for (let id of $others.keys()) {
        share_features(id, 'video');
    }

    if (state) {
        $self.media_stream.addTrack($self.media_tracks.video);
    } else {
        $self.media_stream.removeTrack($self.media_tracks.video);
		display_stream($self.media_stream);
    }
}
