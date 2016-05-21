'use strict'

const fs = require('graceful-fs')
const path = require('path')
const log = require('./log.js')
const anymatch = require('anymatch')
const chalk = require('chalk')

const PLATFORMS = ['win32', 'darwin']

class Watcher {
  watch (workingDir, exclude, callback) {
    if (PLATFORMS.indexOf(process.platform) !== -1) {
      this.watchFolder(workingDir, true, exclude, callback)
    } else {
      log.info(`Scanning folder (may take a while): ${chalk.yellow(workingDir)} ...`)
      this.watchFolderFallback(workingDir, exclude, callback)
    }

    log.info('Awaiting changes ...')
  }

  watchFolder (workingDir, recursive, exclude, callback) {
    let options = { persistent: true, recursive: recursive }

    fs.watch(workingDir, options, (event, fileName) => {
      if (!fileName) {
        log.debug('Error while watching.')
        return
      }

      let localPath = path.join(workingDir, fileName)

      // Skip excluded.
      if (exclude && anymatch(exclude, localPath)) {
        return
      }

      log.debug('Changed:', localPath)

      fs.stat(localPath, (err, stats) => {
        if (err) {
          // If file does not exist - process deletion.
          if (err.code === 'ENOENT') {
            callback(localPath)
          }
          return
        }

        // Skip excluded.
        if (exclude && anymatch(exclude, localPath)) {
          return
        }

        callback(localPath)
      })
    })
  }

  // Attach watchers recursively.
  // This code is synchronous in order to be able tell when it actuall ends.
  watchFolderFallback (parent, exclude, callback) {
    parent = path.resolve(parent)

    try {
      // Skip if not a directory.
      if (!fs.statSync(parent).isDirectory()) {
        return
      }

      this.watchFolder(parent, false, exclude, callback)

      // Iterate over list of children.
      fs.readdirSync(parent).forEach((child) => {
        // Skip dot prefixed to speed up the scan.
        if (child.startsWith('.')) {
          return
        }
        child = path.resolve(parent, child)
        this.watchFolderFallback(child, exclude, callback)
      })
    } catch (err) {
      log.debug(err)
    }
  }
}

module.exports.Watcher = Watcher
