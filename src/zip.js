'use strict'

const path = require('path')
const os = require('os')
const fs = require('fs')
const AdmZip = require('adm-zip')

const DEFAULT_ARCHIVE_PATH = path.join(os.tmpdir(), 'aemsync.zip')

class Zip {
  constructor (archivePath) {
    this.zip = archivePath ? new AdmZip(archivePath) : new AdmZip()
  }

  // One method to add them all. Clean API is always nice.
  add (localPathOrBuffer, zipPath) {
    if (typeof localPathOrBuffer === 'string') {
      for (const entry of this._getEntriesToAdd(localPathOrBuffer, zipPath)) {
        this._addIfNotExists(entry.zipPath, entry.buffer)
      }
    } else {
      this._addIfNotExists(zipPath, localPathOrBuffer)
    }
  }

  save (archivePath = DEFAULT_ARCHIVE_PATH) {
    // TODO:
    // Technically, the data could be stored to a buffer instead.
    // The package manager however does not play well with buffers.
    // Something to think about in future.
    this.zip.writeZip(archivePath)
    return archivePath
  }

  _addIfNotExists (zipPath, buffer) {
    if (this.zip.getEntry(zipPath) === null) {
      this.zip.addFile(zipPath, buffer)
    }
  }

  // Using getLocalFolder() and getLocalFile() methods would have been simpler,
  // however adm-zip does not handle empty folders properly.
  // A top-down walk to identify all items makes the handlinng consistent
  // for all the cases.
  _getEntriesToAdd (localPath, zipPath) {
    const entries = [] // [{ localPath, zipPath, buffer }]
    const pipeline = [{ localPath, zipPath }]

    while (pipeline.length) {
      const current = pipeline.pop()
      if (this._isFolder(current.localPath)) {
        // Add folder.
        entries.push({ localPath: current.localPath, zipPath: current.zipPath + '/', buffer: Buffer.alloc(0) })

        // Walk down the tree.
        for (const entityName of fs.readdirSync(current.localPath)) {
          pipeline.push({
            localPath: current.localPath + '/' + entityName,
            zipPath: current.zipPath + '/' + entityName
          })
        }
      } else {
        // Add file.
        entries.push({ ...current, buffer: fs.readFileSync(current.localPath) })
      }
    }

    return entries
  }

  _isFolder (filePath) {
    try {
      return fs.lstatSync(filePath).isDirectory()
    } catch (err) {
      return false
    }
  }

  //
  // Archive debugging.
  //

  inspect () {
    return { entries: this._getEntries(), filter: this._getFilter() }
  }

  _getEntries () {
    const entries = []
    for (const entry of this.zip.getEntries()) {
      if (entry.entryName.endsWith('.content.xml')) {
        // Read the resource type.
        const re = /jcr:primaryType\s*=\s*"([^"]+)"/g
        const content = this.zip.readAsText(entry.entryName)
        const type = (re.exec(content) || ['', 'undefined'])[1]
        entries.push(entry.entryName + '@' + type)
      } else {
        entries.push(entry.entryName)
      }
    }

    return entries
  }

  _getFilter () {
    return this.zip.readAsText('META-INF/vault/filter.xml').split('\n').map(line => line.trim())
  }
}

module.exports = Zip
