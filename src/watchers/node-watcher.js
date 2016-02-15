'use strict';

const fs = require('graceful-fs');
const path = require('path');
const log = require('../log.js');

class NodeWatcher {
  watch(workingDir, userFilter, callback) {
    var options = { persistent: true, recursive: true };
    fs.watch(workingDir, options, (event, fileName) => {

      if (!fileName) {
        log.debug('Error while watching.')
        return;
      }

      var localPath = path.join(workingDir, fileName);
      log.debug('Changed:', localPath);

      fs.stat(localPath, (err, stats) => {
        if (event === 'change' && stats && stats.isDirectory()) {
          return;
        }

        callback(localPath);
      });
    });
  }
}

module.exports.NodeWatcher = NodeWatcher;
