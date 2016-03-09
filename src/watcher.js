'use strict'

const fs = require('graceful-fs')
const path = require('path')
const log = require('./log.js')
const anymatch = require('anymatch')

const PLATFORMS = ['win32', 'darwin']

class Watcher {
  watch (workingDir, exclude, callback) {
    if (PLATFORMS.indexOf(process.platform) !== -1) {
      return this.watchFolder(workingDir, true, exclude, callback)
    }

    this.watchFolderFallback(workingDir, exclude, callback)
  }

  watchFolderFallback (parent, exclude, callback) {
    console.log(parent)
    parent = path.resolve(parent)

    fs.stat(parent, (err, stats) => {
      if (err) {
        return log.debug(err.toString())
      }

      // Skip if not a directory.
      if (!stats.isDirectory()) {
        return
      }

      this.watchFolder(parent, false, exclude, callback)
      log.debug(`Watching over: ${parent}`)

      // Iterate over list of children.
      fs.readdir(parent, (err, children) => {
        if (err) {
          return log.debug(err.toString())
        }

        children.forEach((child) => {
          if (child.startsWith('.')) {
            return
          }

          child = path.resolve(parent, child)
          this.watchFolderFallback(child, exclude, callback)
        })
      })
    })
  }

  watchFolder (workingDir, recursive, exclude, callback) {
    let options = { persistent: true, recursive: recursive }

    fs.watch(workingDir, options, (event, fileName) => {
      if (!fileName) {
        log.debug('Error while watching.')
        return
      }

      let localPath = path.join(workingDir, fileName)
      log.debug('Changed:', localPath)

      fs.stat(localPath, (err, stats) => {
        if (err) {
          return
        }

        if (event === 'change' && stats && stats.isDirectory()) {
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
}

module.exports.Watcher = Watcher
