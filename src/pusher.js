'use strict'

const chalk = require('chalk')
const ContentHandler = require('./handlers/content-handler.js').ContentHandler
const Package = require('./package.js').Package
const Sender = require('./sender.js').Sender
const log = require('./log.js')

/** Pushes changes to AEM. */
class Pusher {
  constructor (targets, interval, onPushEnd) {
    this.lock = 0
    this.queue = []
    this.targets = targets
    this.interval = interval || 300
    this.handlers = [new ContentHandler()]
    this.sender = new Sender(targets)
    this.onPushEnd = onPushEnd || function () {}
  }

  start () {
    setInterval(() => {
      this.processQueue()
    }, this.interval)
  }

  addItem (localPath) {
    this.queue.push(localPath)
  }

  /** Processes queue. */
  processQueue () {
    // Wait for the previous package to install.
    // Otherwise an error may occur if two concurrent packages try to make
    // changes to the same node.
    if (this.lock > 0) {
      return
    }

    // Get unique list of local paths.
    let dict = {}
    while (this.queue.length > 0) {
      dict[this.queue.pop()] = true
    }
    let localPaths = Object.keys(dict)

    // Process local paths with all the handlers.
    let items = []
    for (let i = 0; i < this.handlers.length; ++i) {
      for (let j = 0; j < localPaths.length; ++j) {
        this.handlers[i].process(items, localPaths[j])
      }
    }

    if (items.length === 0) {
      return
    }

    // Create package.
    let pack = new Package()
    for (let i = 0; i < items.length; ++i) {
      let item = items[i]
      log.info(item.action, chalk.yellow(item.zipPath))
      pack.update(item.localPath, item.zipPath, item.action)
    }

    // Save the package.
    log.group()
    this.lock = this.targets.length
    pack.save((packagePath) => {
      this.onSend(packagePath)
    })
  }

  onSend (packagePath) {
    this.sender.send(packagePath, (err, host, delta, time) => {
      let prefix = `Deploying to [${chalk.yellow(host)}] in ${delta} ms at ${time}`

      if (err) {
        log.info(`${prefix}: ${chalk.red(err)}`)
      } else {
        log.info(`${prefix}: ${chalk.green('OK')}`)
      }

      this.onPushEnd(err, host)
      log.groupEnd()
      this.lock -= 1
    })
  }
}

module.exports.Pusher = Pusher
