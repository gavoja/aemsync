'use strict'

const archiver = require('archiver') // TODO: consider using zip-stream for less dependencies.
const fs = require('graceful-fs')
const path = require('path')
const os = require('os')
const log = require('./log.js')

const DEFAULT_ZIP_NAME = 'aemsync.zip'

class Zip {
  constructor (zipPath) {
    this.path = path.join(os.tmpdir(), DEFAULT_ZIP_NAME)
    // this.path = path.join(__dirname, '..', DEFAULT_ZIP_NAME)
    this.zip = archiver('zip')

    log.debug('Creating archive:', this.path)
    this.output = fs.createWriteStream(this.path)
    this.zip.pipe(this.output)
  }

  isFile (localPath) {
    let stat = fs.statSync(localPath)
    return stat && stat.isFile()
  }

  isDirectory (localPath) {
    let stat = fs.statSync(localPath)
    return stat && stat.isDirectory()
  }

  addLocalFile (localPath, zipPath) {
    // Normalize slashes.
    zipPath = zipPath.replace(/\\/g, '/')

    // Only files can be zipped.
    if (!this.isFile(localPath)) {
      return
    }

    log.debug('Zipping:', zipPath)
    this.zip.append(fs.createReadStream(localPath), {
      name: zipPath
    })
  }

  addLocalDirectory (localPath, zipPath, callback) {
    if (!this.isDirectory(localPath)) {
      return
    }

    // Ensure slash.
    zipPath = zipPath.endsWith('/') ? zipPath : `${zipPath}/`

    let items = this.walkSync(localPath)
    for (let i = 0; i < items.length; ++i) {
      let subLocalPath = items[i]
      let subZipPath = zipPath + subLocalPath.substr(localPath.length + 1)
      this.addLocalFile(subLocalPath, subZipPath)
      callback && callback(subLocalPath, subZipPath)
    }
  }

  addFile (content, zipPath) {
    log.debug('Zipping:', zipPath)
    this.zip.append(content, {
      name: zipPath
    })
  }

  /** Recursively walks over directory. */
  walkSync (localPath) {
    localPath = path.resolve(localPath)

    let results = []

    // Add current item.
    results.push(localPath)

    // No need for recursion if not a directory.
    if (!this.isDirectory(localPath)) {
      return results
    }

    // Iterate over list of children.
    let children = fs.readdirSync(localPath)

    for (let i = 0; i < children.length; ++i) {
      let child = path.resolve(localPath, children[i])
      results = results.concat(this.walkSync(child))
    }

    return results
  }

  save (callback) {
    let that = this

    this.output.on('close', () => {
      callback(that.path)
    })

    this.zip.finalize() // Trigers the above.
  }
}

module.exports = Zip
