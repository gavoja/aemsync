const minimist = require('minimist')
const path = require('path')
const fs = require('graceful-fs')
const log = require('./src/log.js')
const chalk = require('chalk')
const Watcher = require('./src/watcher.js').Watcher
const Pusher = require('./src/pusher.js').Pusher

const MSG_HELP = `Usage: aemsync [OPTIONS]

Options:
  -t targets           Defult is http://admin:admin@localhost:4502
  -w path_to_watch     Default is current
  -e exclude_filter    Anymach exclude filter; disabled by default
  -i sync_interval     Update interval; default is 300ms
  -d                   Enable debug mode
  -h                   Displays this screen

Website: https://github.com/gavoja/aemsync`

function main () {
  var args = minimist(process.argv.slice(2))

  // Show help.
  if (args.h) {
    console.log(MSG_HELP)
    return
  }

  // Get other args.
  log.isDebug = args.d
  var workingDir = path.resolve(args.w ? args.w : '.')

  if (!fs.existsSync(workingDir)) {
    log.info('Invalid path:', chalk.yellow(workingDir))
    return
  }

  var targets = args.t ? args.t : 'http://admin:admin@localhost:4502'
  var pushInterval = args.i ? args.i : 300
  var exclude = args.e ? args.e : ''

  log.info(`
    Working dir: ${chalk.yellow(workingDir)}
        Targets: ${chalk.yellow(targets)}
       Interval: ${chalk.yellow(pushInterval)}
        Exclude: ${chalk.yellow(exclude)}
  `)

  log.info('Awaiting changes...')

  var pusher = new Pusher(targets.split(','), pushInterval)
  var watcher = new Watcher()

  pusher.start()
  watcher.watch(workingDir, exclude, (localPath) => {
    pusher.addItem(localPath)
  })
}

if (require.main === module) {
  main()
}

module.exports.Watcher = Watcher
module.exports.Pusher = Pusher
