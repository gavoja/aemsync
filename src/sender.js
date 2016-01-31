'use strict';

const fs = require('graceful-fs');
const parseUrl = require('url').parse;
const log = require('./log');
const FormData = require('form-data');

const RE_STATUS = /code="([0-9]+)">(.*)</;

class Sender {
  constructor(targets) {
    this.targets = targets;
  }

  /** Submits the package manager form. */
  send(zipPath, callback) {
    log.debug('Posting...');
    for (var i = 0; i < targets.length; ++i) {
      this.sendFormToTarget(zipPath, targets[i], callback);
    }
  }

  sendFormToTarget(zipPath, target, callback) {
    var params = parseUrl(target);
    var auth = new Buffer(params.auth).toString('base64');
    var timestamp = Date.now();

    var options = {};
    options.path = PACKAGE_MANAGER_URL;
    options.port = params.port;
    options.host = params.hostname;
    options.headers = {
      'Authorization': 'Basic ' + auth
    };

    var form = new FormData();
    form.append('file', fs.createReadStream(zipPath));
    form.append('force', 'true');
    form.append('install', 'true');

    var that = this;
    form.submit(options, function (err, res) {
      that.onSubmit(err, res, zipPath, target, timestamp, callback);
    });
  };

  /** Package install submit callback */
  onSubmit(err, res, zipPath, target, timestamp, callback) {
    var host = target.substring(target.indexOf('@') + 1);

    // Server error.
    if (!res) {
      log.error(`Deploying to [${host}]: ${err.code}`);
      callback();
      return;
    }

    var decoder = new StringDecoder('utf8');
    var output = [`Output from ${host}:`];
    res.on('data', function (chunk) {

      // Get message and remove new line.
      var textChunk = decoder.write(chunk);
      textChunk = textChunk.substring(0, textChunk.length - 1);
      output.push(textChunk);

      // Parse message.
      var match = RE_STATUS.exec(textChunk);
      if (match === null || match.length !== 3) {
        return;
      }

      var code = match[1];
      var msg = match[2];

      log.debug('\n', output.join('\n'));

      if (code === '200') {
        var delta = Date.now() - timestamp;
        var time = new Date().toISOString();
        log.info(`completed in ${delta} ms at ${time}`);
      } else { // Error.
        log.error(`Deploying to [${host}]: ${msg}`);
      }

      callback()
    });
  }
}

module.exports.Sender = Sender;
