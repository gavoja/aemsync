'use strict'

const chalk = require('chalk')
const ContentHandler = require('./handlers/content-handler.js').ContentHandler
const Package = require('./package.js').Package
const Sender = require('./sender.js').Sender
const log = require('./log.js')
const fs = require('graceful-fs')

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

  enqueue (localPath) {
    this.queue.push(localPath)
  }

  /** Gets item with metadata from local path. */
  getItem (localPath) {
    let item = {
      localPath: localPath
    }
    try {
      let stat = fs.statSync(localPath)
      item.exists = true
      item.isDirectory = stat.isDirectory()
    } catch (err) {
      item.exists = false
    }

    return item
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

    // Get all the items.
    let items = []
    Object.keys(dict).forEach((localPath) => {
      this.handlers.forEach((handler) => {
        handler.process(items, this.getItem(localPath))
      })
    })

    // Skip if no items to add to package ...
    if (items.length === 0) {
      return
    }

    // ... otherwise, create package.
    let pack = new Package()
    items.forEach((item) => {
      item = pack.addItem(item)
      if (item) {
        log.info(item.exists ? 'ADD' : 'DEL', chalk.yellow(item.zipPath))
      }
    })

    // Save the package.
    log.group()
    this.lock = this.targets.length
    pack.save((packagePath) => {
      this.onSave(packagePath, () => {
        log.groupEnd()
        this.lock -= 1
      })
    })
  }

  onSave (packagePath, callback) {
    this.sender.send(packagePath, (err, host, delta, time) => {
      let prefix = `Deploying to [${chalk.yellow(host)}] in ${delta} ms at ${time}`

      if (err) {
        log.info(`${prefix}: ${chalk.red(err)}`)
      } else {
        log.info(`${prefix}: ${chalk.green('OK')}`)
      }

      this.onPushEnd(err, host)
      callback()
    })
  }
}

module.exports.Pusher = Pusher
