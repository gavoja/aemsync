'use strict';

const NodeWatcher = require('./watchers/node-watcher.js').NodeWatcher;
const log = require('./log.js');

function Watcher() {
	// TODO: Chose the handler for the OS.
	return new NodeWatcher();
}

module.exports.Watcher = Watcher;
