'use strict'

const path = require('path')
const util = require('util')
const fs = require('graceful-fs')
const log = require('./log.js')
const Zip = require('./zip.js').Zip

const DATA_PATH = path.resolve(__dirname, '..', 'data')
const PACKAGE_CONTENT_PATH = path.join(DATA_PATH, 'package_content')
const NT_FOLDER_PATH = path.join(DATA_PATH, 'nt_folder', '.content.xml')

// const RE_ZIP_PATH = /^.*[\/\\](jcr_root[\/\\].*)$/

const FILTER_ZIP_PATH = 'META-INF/vault/filter.xml'
const FILTER_WRAPPER = `<?xml version="1.0" encoding="UTF-8"?>
<workspaceFilter version="1.0">%s
</workspaceFilter>`
const FILTER = `
   <filter root="%s" />`
const FILTER_CHILDREN = `
  <filter root="%s">
    <exclude pattern="%s/.*" />
    <include pattern="%s" />
    <include pattern="%s/.*" />
  </filter>`

class Package {
  constructor () {
    this.items = []
    this.path = []
  }

  update (item) {
    for (let i = this.items.length - 1; i >= 0; --i) {
      let existingItem = this.items[i]

      // Skip if item or parent already added.
      if (item.localPath.startsWith(existingItem.localPath)) {
        log.debug(`Already added to package, skipping: ${item.localPath}`)
        return
      }

      // Remove child if this one is parent.
      if (existingItem.localPath.startsWith(item.localPath)) {
        log.debug(`Removing child: ${item.localPath}`)
        this.items.splice(i, 1)
      }
    }

    item.zipPath = this.getZipPath(item.localPath)
    item.filterPath = this.getFilterPath(item.zipPath)
    this.items.push(item)

    return item
  }

  save (callback) {
    if (this.items.length === 0) {
      callback(null)
    }

    // Create archive and add default package content.
    let archive = new Zip()
    let jcrRoot = path.join(PACKAGE_CONTENT_PATH, 'jcr_root')
    let metaInf = path.join(PACKAGE_CONTENT_PATH, 'META-INF')
    archive.addLocalDirectory(jcrRoot, 'jcr_root')
    archive.addLocalDirectory(metaInf, 'META-INF')

    // Iterate over all items
    let filters = ''
    this.items.forEach((item) => {
      // Update filters (delete).
      if (!item.exists) {
        filters += util.format(FILTER, item.filterPath)
        return
      }

      // Update filters (add).
      let dirName = path.dirname(item.filterPath)
      filters += util.format(FILTER_CHILDREN, dirName, dirName,
        item.filterPath, item.filterPath)

      // Add directory to archive.
      if (item.isDirectory) {
        let cb = (localPath, zipPath) => {
          this.addNtFolder(archive, localPath, zipPath)
        }
        archive.addLocalDirectory(item.localPath, item.zipPath, cb)
      // Add file to archive
      } else {
        archive.addLocalFile(item.localPath, item.zipPath)
      }
    })

    // Wrap filters
    filters = util.format(FILTER_WRAPPER, filters)
    archive.addFile(new Buffer(filters), FILTER_ZIP_PATH)
    log.debug(filters)
    archive.save(callback)
  }

  /** Additional handling of directories added recursively. */
  addNtFolder (archive, localPath, zipPath) {
    // Add nt:folder if needed.
    let contentXml = path.join(localPath, '.content.xml')
    let hasContentXml = fs.existsSync(contentXml)
    let hasContentFolder = localPath.indexOf('_jcr_content') !== -1
    if (!hasContentFolder && !hasContentXml) {
      archive.addLocalFile(NT_FOLDER_PATH, this.getZipPath(contentXml))
      log.group()
      log.debug('Added as nt:folder.')
      log.groupEnd()
    }
  }

  /** Replaces backslashes with slashes. */
  cleanPath (localPath) {
    return path.resolve(localPath).replace(/\\/g, '/')
  }

  /** Gets a zip path from a local path. */
  getZipPath (localPath) {
    return this.cleanPath(localPath).replace(/.*\/(jcr_root\/.*)/, '$1')
  }

  /** Gets a filter path from a local path. */
  getFilterPath (localPath) {
    return this.cleanPath(localPath)
      .replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, '')
      .replace(/\/_([^\/]*)_([^\/]*)$/g, '\/$1:$2')
  }
}

module.exports.Package = Package
