const minimist = require('minimist');
const path = require('path');
const fs = require('graceful-fs');
const log = require('./src/log.js');
const Watcher = require('./src/watcher.js').Watcher;
const Pusher = require('./src/pusher.js').Pusher;

const MSG_HELP = `Usage: aemsync -t targets (defult is http://admin:admin@localhost:4502) -w path_to_watch (default is current)
Website: https://github.com/gavoja/aemsync`;

function main() {
  var args = minimist(process.argv.slice(2));

  // Show help.
  if (args.h) {
    console.log(MSG_HELP);
    return;
  }

  // Get other args.
  log.isDebug = args.d;
  var workingDir = args.w ? args.w : '.';
  workingDir = path.resolve(workingDir);
  if (!fs.existsSync(workingDir)) {
    log.info('Invalid path:', workingDir);
    return;
  }

  var targets = args.t ? args.t : 'http://admin:admin@localhost:4502';
  var pushInterval = args.i ? args.i : 300;
  // var userFilter = args.f ? args.f : "";

  // var watcher = new Watcher(sync, log);
  // watcher.watch(workingDir, userFilter, function(path) {
  // });

  var pusher = new Pusher(targets, pushInterval);
  var watcher = new Watcher();
  watcher.onChange((localPath) => {
    pusher.addItem(localPath)
  });

  pusher.start();
  watcher.watch(workingDir);
}

if (require.main === module) {
	main();
}
