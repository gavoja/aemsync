'use strict';

const fs = require('graceful-fs');
const path = require('path');

const log = require('../log.js');
class NodeWatcher {
  constructor() {
    this.callback = () => {};
  }

  watch(workingDir, userFilter) {
    var options = { persistent: true, recursive: true };
    var callback = this.callback;
    fs.watch(workingDir, options, (event, fileName) => {
      var localPath = path.join(workingDir, fileName);

      fs.stat(localPath, (err, stats) => {
        if (event === 'change' && stats.isDirectory()) {
          return;
        }

        callback(localPath);
      });
    });
  }

  onChange(callback) {
    this.callback = callback;
  }
}

module.exports.NodeWatcher = NodeWatcher;
