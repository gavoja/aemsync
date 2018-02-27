'use strict'

const chalk = require('chalk')
const ContentHandler = require('./handlers/content-handler.js')
const Package = require('./package.js')
const Sender = require('./sender.js')
const log = require('./log.js')

/** Pushes changes to AEM. */
class Pipeline {
  constructor ({targets, interval, packmgrPath, onPushEnd}) {
    this.lock = 0
    this.queue = []
    this.targets = targets
    this.interval = interval || 300
    this.handlers = [new ContentHandler()]
    this.sender = new Sender({targets, packmgrPath})
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
        // Restore the queue if anything goes wrong.
        // It will be processed in the next tick.
        this.queue = this.queue.concat(list)
      }
    })
  }

  process (list, callback) {
    // Finalization function.
    let finalize = (err) => {
      this.lock = err ? 0 : this.lock - 1
      if (this.lock === 0) {
        callback && callback(err)
        log.groupEnd()
      }
    }

    try {
      // Add all paths to the package.
      let pack = new Package()
      list.forEach(localPath => {
        let item = pack.add(localPath)
        item && log.info(item.exists ? 'ADD' : 'DEL', chalk.yellow(item.zipPath))
      })

      // Save the package.
      log.group()
      this.lock = this.targets.length
      pack.save(packagePath => {
        // Send the saved package.
        this.sender.send(packagePath, (err, host, delta, time) => {
          let prefix = `Deploying to [${chalk.yellow(host)}] in ${delta} ms at ${time}`
          err ? log.info(`${prefix}: ${chalk.red(err)}`) : log.info(`${prefix}: ${chalk.green('OK')}`)
          this.onPushEnd(err, host)
          finalize()
        })
      })
    } catch (err) {
      log.error(err)
      finalize(err)
    }
  }

  push (localPath) {
    this.process([localPath])
  }
}

module.exports = Pipeline
