const minimist = require('minimist');
const path = require('path');
const fs = require('graceful-fs');
const log = require('./src/log.js');
const chalk = require('chalk');
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
  var workingDir = path.resolve(args.w ? args.w : '.');

  if (!fs.existsSync(workingDir)) {
    log.info('Invalid path:', chalk.yellow(workingDir));
    return;
  }

  var targets = args.t ? args.t : 'http://admin:admin@localhost:4502';
  var pushInterval = args.i ? args.i : 300;
  var userFilter = args.f ? args.f : '';

  log.info(`
    Working dir: ${chalk.yellow(workingDir)}
        Targets: ${chalk.yellow(targets)}
       Interval: ${chalk.yellow(pushInterval)}
         Filter: ${chalk.yellow(userFilter)}
  `);

  log.info('Awaiting changes...');

  var pusher = new Pusher(targets.split(','), pushInterval);
  var watcher = new Watcher();

  pusher.start();
  watcher.watch(workingDir, null, (localPath) => {
    pusher.addItem(localPath);
  });
}

if (require.main === module) {
	main();
}

module.exports.Watcher = Watcher;
module.exports.Pusher = Pusher;
