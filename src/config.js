/* eslint-disable unicorn/no-process-exit */

const { cosmiconfigSync } = require("cosmiconfig");

const debug = require("debug");
const log = debug("live-counting-bridge:config");

/**
 * Transforms a config.
 * @param {Object} result The config result from cosmiconfig.
 * @returns {Object} The result with the transformed config.
 */
function transformConfig(result) {
	if (!result) {
		result = {};
	}

	const newConfig = {
		apiBase: "",
		threads: [],
		token: "",
		...(result && result.config || {}),
	};

	result.config = newConfig;
	return result;
}

/**
 * Gets the user-defined configuration for live-counting-bridge with defaults.
 * @returns {Object} The configuration object.
 */
function getConfig() {
	const explorer = cosmiconfigSync("live-counting-bridge", {
		searchPlaces: [
			"package.json",
			"config.json",
			".live-counting-bridgerc",
			".live-counting-bridgerc.json",
			".live-counting-bridgerc.yaml",
			".live-counting-bridgerc.yml",
			".live-counting-bridgerc.js",
			"live-counting-bridge.config.js",
		],
		transform: transformConfig,
	});

	const result = explorer.search();

	if (result.filepath) {
		log("loaded configuration from '%s'", result.filepath);
	} else {
		log("could not find existing configuration, using default");
	}
	log("loaded configuration: %O", result.config);

	if (typeof result.config.apiBase !== "string" || result.config.apiBase === "") {
		log("the matterbridge api base must be provided");
		process.exit(1);
	} else if (!Array.isArray(result.config.threads)) {
		log("the threads must be an array of arrays specifying thread id and matterbridge gateway");
		process.exit(1);
	}

	return result.config;
}
module.exports = getConfig;