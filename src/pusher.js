'use strict';

const ContentHandler = require('./handlers/content-handler.js').ContentHandler;
const Package = require('./package.js').Package;
const Sender = require('./sender.js').Sender;
const log = require('./log.js');

/** Pushes changes to AEM. */
class Pusher {
  constructor(targets, interval) {
    this.lock = 0;
    this.queue = [];
    this.targets = targets;
    this.interval = interval || 300;
    this.handlers = [new ContentHandler()];

    this.sender = new Sender(targets);
  }

  start() {
    console.log('Setting interval', this.interval);
    setInterval(() => {
      this.processQueue();
    }, this.interval);
  }

  addItem(localPath) {
    this.queue.push(localPath);
  }

  /** Processes queue. */
	processQueue() {
		// Wait for the previous package to install.
		// Otherwise an error may occur if two concurrent packages try to make
		// changes to the same node.
		if (this.lock > 0) {
			return;
		}

    // Dequeue items and remove duplicates.
    var dict = {};
    while(this.queue.length > 0) {
      dict[this.queue.pop()] = true;
    }

    // Convert items back to list.
    var items = Object.keys(dict);
    if (items.length === 0) {
      return;
    }

    // Lock!
    this.lock = this.targets.length;

    // Create package.
    var pack = new Package();

    // Process items with all the handlers.
    for (var i = 0; i < this.handlers.length; ++i) {
      for (var j = 0; j < items.length; ++j) {
        this.handlers[i].process(pack, items[j]);
      }
    }

    // Save the package.
    log.group();
    pack.save((packagePath) => {
      this.onSend(packagePath);
      log.groupEnd();
    });
	}

  onSend(packagePath) {
    this.lock == 0;

    // TODO: Use sender to send to targets.
  }
}

module.exports.Pusher = Pusher;
