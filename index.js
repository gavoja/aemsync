'use strict'

const minimist = require('minimist')
const path = require('path')
const fs = require('graceful-fs')
const log = require('./src/log')
const chalk = require('chalk')
const Watcher = require('./src/watcher')
const Pusher = require('./src/pusher')

const MSG_HELP = `Usage: aemsync [OPTIONS]

Options:
  -t targets           Defult is http://admin:admin@localhost:4502
  -w path_to_watch     Default is current
  -e exclude_filter    Micromatch exclude filter; disabled by default
  -i sync_interval     Update interval; default is 300ms
  -d                   Enable debug mode
  -h                   Displays this screen

Website: https://github.com/gavoja/aemsync`

function aemsync (args) {
  let pusher = new Pusher(args.targets.split(','), args.pushInterval, args.onPushEnd)
  let watcher = new Watcher()

  pusher.start()
  watcher.watch(args.workingDir, args.exclude, (localPath) => {
    pusher.enqueue(localPath)
  })
}

function main () {
  let args = minimist(process.argv.slice(2))

  // Show help.
  if (args.h) {
    console.log(MSG_HELP)
    return
  }

  // Get other args.
  log.isDebug = args.d
  let workingDir = path.resolve(args.w ? args.w : '.')

  if (!fs.existsSync(workingDir)) {
    log.info('Invalid path:', chalk.yellow(workingDir))
    return
  }

  let targets = args.t ? args.t : 'http://admin:admin@localhost:4502'
  let pushInterval = args.i ? args.i : 300
  let exclude = args.e ? args.e : ''

  log.info(`
    Working dir: ${chalk.yellow(workingDir)}
        Targets: ${chalk.yellow(targets)}
       Interval: ${chalk.yellow(pushInterval)}
        Exclude: ${chalk.yellow(exclude)}
  `)

  aemsync({workingDir, targets, pushInterval, exclude})
}

if (require.main === module) {
  main()
}

aemsync.Watcher = Watcher
aemsync.Pusher = Pusher
aemsync.main = main
module.exports = aemsync
