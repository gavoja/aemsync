'use strict'

const minimist = require('minimist')
const path = require('path')
const fs = require('graceful-fs')
const log = require('./src/log')
const chalk = require('chalk')
const Watcher = require('./src/watcher')
const Pipeline = require('./src/pipeline')

const MSG_HELP = `
Usage:
  aemsync [OPTIONS]

Options:
  -t <targets>            Defult is http://admin:admin@localhost:4502
  -w <path_to_watch>      Default is current
  -p <path_to_push>       Path to push directly; used instead of above,
                          no watching takes place
  -e <exclude_filter>     Micromatch exclude filter; disabled by default
  -i <sync_interval>      Update interval; default is 300ms
  -u <packmgr_path>       Package manager path; default is
                          /crx/packmgr/service.jsp
  -d                      Enable debug mode
  -h                      Displays this screen

Website:
  https://github.com/gavoja/aemsync
`

function aemsync (args) {
  const pipeline = new Pipeline(args)
  const watcher = new Watcher()

  pipeline.start()

  args.callback = (localPath) => {
    pipeline.enqueue(localPath)
  }

  watcher.watch(args)
}

function push (args) {
  const pipeline = new Pipeline(args)
  pipeline.push(args.pathToPush)
}

function main () {
  const args = minimist(process.argv.slice(2))

  // Show help.
  if (args.h) {
    return console.log(MSG_HELP)
  }

  // Get other args.
  log.isDebug = args.d
  const workingDir = path.resolve(args.w || '.')
  const targets = (args.t || 'http://admin:admin@localhost:4502').split(',')
  const interval = args.i || 300
  const exclude = args.e || ''
  const packmgrPath = args.u

  // Just the push.
  if (args.p) {
    let pathToPush = path.resolve(args.p)
    if (!fs.existsSync(pathToPush)) {
      return log.info('Invalid path:', chalk.yellow(workingDir))
    }

    return push({pathToPush, targets})
  }

  if (!fs.existsSync(workingDir)) {
    return log.info('Invalid path:', chalk.yellow(workingDir))
  }

  // Start aemsync
  log.info(`
      Working dir: ${chalk.yellow(workingDir)}
          Targets: ${chalk.yellow(targets)}
         Interval: ${chalk.yellow(interval)}
          Exclude: ${chalk.yellow(exclude)}
  `)

  aemsync({workingDir, targets, interval, exclude, packmgrPath})
}

if (require.main === module) {
  main()
}

aemsync.Watcher = Watcher
aemsync.Pipeline = Pipeline
aemsync.main = main
aemsync.push = push
module.exports = aemsync
