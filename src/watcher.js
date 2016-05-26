'use strict'

const log = require('./log.js')
const anymatch = require('anymatch')
const chalk = require('chalk')
const watcher = require('simple-watcher')

class Watcher {
  watch (workingDir, exclude, callback) {
    log.info(`Scanning: ${chalk.yellow(workingDir)} ...`)

    watcher(workingDir, (localPath) => {
      log.debug('Changed:', localPath)

      // Skip excluded.
      if (exclude && anymatch(exclude, localPath)) {
        return
      }

      callback(localPath)
    })

    log.info('Awaiting changes ...')
  }
}

module.exports.Watcher = Watcher
