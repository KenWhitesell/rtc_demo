(function() {

	/** @type {import("../htmx").HtmxInternalApi} */
	var api;

    /* data is the parsed JSON response
       data.html is the html to add to the page
    */
    htmx.defineExtension('tr-ext', {
        transformResponse : function(text, xhr, elt) {
            const data = JSON.parse(text);
            for (var [app, message] of Object.entries(data)) {
                var event = message.type;
                apps._forward(app, event, message)
            }
            if ('remove' in data) {
                htmx.remove(htmx.find(data.remove));
            }
            if (data.html === undefined) { data.html = ""; };
            return data.html;
        }
    })
})();

htmx.on('htmx:wsOpen', function(e) {
    // Send heartbeat at least every 30 seconds
    setInterval(function() {
        $self.ws_json({"signal": "hb"});
    }, 25000 + (Math.random() * 5000) );
});

const apps = {
    '_add': function(app, name, target) {
        if (!apps[app]) {
            apps[app] = new Map();
        }
        if (!apps[app].has(name)) {
            apps[app].set(name, new Array());
        }
        if (!apps[app].get(name).includes(target)) {
            apps[app].get(name).push(target);
        }
    },
    '_remove': function(app, name, target) {
        if (apps[app]) {
            idx = apps[app].get(name).indexOf(target)
            if (idx > -1) {
                apps[app].get(name).splice(idx, 1);
            }
            if (apps[app].get(name).length == 0) {
                apps[app].delete(name);
            }
        }
    },
    '_forward': function(app, name, message) {
        if (apps[app] && apps[app].has(name)) {
            for (target of apps[app].get(name)) {
                target(message);
            }
        }
    },
}
