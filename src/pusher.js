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

  enqueue (localPath) {
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

    // Get all the items.
    let list = []
    Object.keys(dict).forEach(localPath => {
      this.handlers.forEach(handler => {
        let processedPath = handler.process(localPath)
        processedPath && list.push(processedPath)
      })
    })

    // Skip if no items to add to package ...
    if (list.length === 0) {
      return
    }

    // .. otherwise, process.
    this.process(list, err => {
      if (err) {
        console.log(err)
        this.queue = this.queue.concat(list)
      }

      this.lock -= 1
    })
  }

  process (list, callback) {
    try {
      let pack = new Package()
      list.forEach(localPath => {
        let item = pack.add(localPath)
        item && log.info(item.exists ? 'ADD' : 'DEL', chalk.yellow(item.zipPath))
      })

      // Save the package.
      log.group()
      this.lock = this.targets.length
      pack.save(packagePath => {
        this.onSave(packagePath, () => {
          callback(null)
          log.groupEnd()
        })
      })
    } catch (err) {
      callback(err)
    }
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
