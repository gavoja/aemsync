'use strict'

const log = require('./log.js')
const mm = require('minimatch')
const chalk = require('chalk')
const watcher = require('simple-watcher')

class Watcher {
  watch ({workingDir, exclude, callback}) {
    log.info(`Scanning: ${chalk.yellow(workingDir)} ...`)

    watcher(workingDir, (localPath) => {
      log.debug('Changed:', localPath)

      // Skip excluded.
      if (exclude && mm(localPath, exclude, {dot: true})) {
        return
      }

      callback(localPath)
    }, 0)

    log.info('Awaiting changes ...')
  }
}

module.exports = Watcher
