const debug = require("debug");
/**
 * @type {got.Got}
 */
const baseGot = require("got");
const ws = require("ws");

const { version } = require("../package.json");
const got = baseGot.extend({
	headers: {
		"Content-Type": "application/json",
		"User-Agent": "Live Counting Bridge v" + version,
	},
	responseType: "json",
});

const config = require("./config.js")();

class Thread {
	constructor(id, gateway = "livecounting") {
		this.id = id;
		this.gateway = gateway;

		this.log = debug("live-counting-bridge:thread:" + id);

		/**
		 * @type {ws}
		 */
		this.websocket = null;

		this.onThreadInfo = this.onThreadInfo.bind(this);
		this.onOpen = this.onOpen.bind(this);
		this.onMessage = this.onMessage.bind(this);
		this.onClose = this.onClose.bind(this);
	}

	getAboutUrl() {
		return "https://www.reddit.com/live/" + this.id + "/about.json";
	}

	connect() {
		const aboutUrl = this.getAboutUrl();
		this.log("requesting thread info from %s", aboutUrl);

		got(aboutUrl, {
			throwHttpErrors: false,
		}).then(this.onThreadInfo).catch(error => {
			this.log("failed to get thread info: %O", error);
		});
	}

	/**
	 * Handles the thread info response.
	 * @param {got.Response} response The response.
	 */
	onThreadInfo(response) {
		if (response.body.error === 404) {
			this.log("could not find thread with id: %s", this.id);
		} else if (response.body.error && response.body.message) {
			this.log("failed to get thread info (error %s, message: '%s')", response.body.error, response.body.message);
		} else if (response.body.error) {
			this.log("failed to get thread info (error %s)", response.body.error);
		} else if (response.body && response.body.data) {
			const websocketUrl = response.body.data.websocket_url;
			this.log("found websocket for thread '%s': %s", response.body.data.title, websocketUrl);

			this.websocket = new ws(websocketUrl);
			this.websocket.on("open", this.onOpen);
			this.websocket.on("message", this.onMessage);
			this.websocket.on("close", this.onClose);
		}
	}

	/**
	 * Handles a websocket open event.
	 */
	onOpen() {
		this.log("websocket opened");
	}

	/**
	 * Handles a websocket message event.
	 * @param {string} data The websocket message data.
	 */
	onMessage(data) {
		const json = JSON.parse(data);
		if (json.type === "update" && json.payload.data.body) {
			this.log("handling websocket message from author %s: '%s'", json.payload.data.author, json.payload.data.body);

			got.post(config.apiBase + "/api/message", {
				headers: {
					Authorization: config.token && "Bearer " + config.token,
				},
				json: {
					gateway: this.gateway,
					text: json.payload.data.body,
					username: json.payload.data.author,
				},
			}).then(() => {
				this.log("sent message to bridge");
			}).catch(error => {
				if (error.response.statusCode) {
					if (error.response.statusCode === 401) {
						this.log("bridge request was unauthorized, was a valid token supplied?");
					} else if (error.response.body.message) {
						this.log("failed to send message to bridge (error %s, message: '%s')", error.response.statusCode, error.response.body.message);
					} else {
						this.log("failed to send message to bridge (error %s)", error.response.statusCode);
					}
				} else {
					this.log("failed to send message to bridge: %O", error);
				}
			});
		}
	}

	/**
	 * Handles a websocket close event.
	 * @param {ws.CloseEvent} event The close event.
	 */
	onClose(event) {
		if (event.reason) {
			this.log("reconnecting to websocket as it was closed for reason: %s", event.reason);
		} else {
			this.log("reconnecting to websocket");
		}
		this.connect();
	}
}

const threads = config.threads.map(thread => new Thread(thread[0], thread[1]));
threads.forEach(thread => thread.connect());