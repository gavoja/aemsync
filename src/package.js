'use strict'

const path = require('path')
const util = require('util')
const fs = require('graceful-fs')
const log = require('./log.js')
const Zip = require('./zip.js')

const CONTENT_XML = '.content.xml'
const DATA_PATH = path.resolve(__dirname, '..', 'data')
const PACKAGE_CONTENT_PATH = path.join(DATA_PATH, 'package_content')
const NT_FOLDER_PATH = path.join(DATA_PATH, 'nt_folder', '.content.xml')
const RE_UNSTRUCTURED = /jcr:primaryType\s*=\s*"nt:unstructured"/g
const RE_CONTENT_PATH = /^.*\/jcr_root(\/[^/]+){2,}$/
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

  /** Adds local path to package. */
  add (localPath) {
    return this.addItem(this.getItem(localPath))
  }

  /** Adds item to package. */
  addItem (item) {
    // Handle duplicates.
    for (let i = this.items.length - 1; i >= 0; --i) {
      let existingItem = this.items[i]

      // Skip if parent already added.
      if (item.localPath.startsWith(existingItem.localPath)) {
        log.debug(`Already added to package, skipping: ${item.localPath}`)
        return
      }

      // Force replace or remove child if this one is parent.
      if (existingItem.localPath.startsWith(item.localPath)) {
        log.debug(`Removing child: ${item.localPath}`)
        this.items.splice(i, 1)
      }
    }

    item.zipPath = item.zipPath || this.getZipPath(item.localPath)
    item.filterPath = item.filterPath || this.getFilterPath(item.zipPath)
    this.items.push(item)

    return this.handleContentXml(item)
  }

  /** Adds all '.content.xml' files on the item's path. */
  handleContentXml (item) {
    // Skip if '.content.xml' file.
    if (path.basename(item.localPath) === CONTENT_XML) {
      return item
    }

    // Add all '.content.xml' files going up the path.
    let dirPath = path.dirname(item.localPath)
    while (this.cleanPath(dirPath).match(RE_CONTENT_PATH)) {
      let contentXmlPath = path.join(dirPath, CONTENT_XML)
      let contents = this.getFileContents(contentXmlPath)
      // Process parent if 'nt:unstructured' found.
      if (contents && contents.match(RE_UNSTRUCTURED)) {
        return this.addItem(this.getItem(dirPath))
      }

      // Process '.content.xml'.
      if (contents) {
        this.addItem(this.getItem(contentXmlPath))
      }

      dirPath = path.dirname(dirPath)
    }

    return item
  }

  /** Saves package. */
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
      // When adding we need to account for all the sibbling '.content.xml' files.
      let dirName = path.dirname(item.filterPath)
      filters += util.format(FILTER_CHILDREN, dirName, dirName, item.filterPath, item.filterPath)

      // Add directory to archive.
      if (item.isDirectory) {
        archive.addLocalDirectory(item.localPath, item.zipPath, (localPath, zipPath) => {
          // Add as 'nt:folder' if no '.content.xml'.
          this.addNtFolder(archive, localPath, zipPath)
        })
      // Add file to archive
      } else {
        archive.addLocalFile(item.localPath, item.zipPath)
      }
    })

    // Wrap filters
    filters = util.format(FILTER_WRAPPER, filters)
    archive.addFile(Buffer.from(filters), FILTER_ZIP_PATH)
    log.debug(filters)
    archive.save(callback)
  }

  /** Additional handling of directories added recursively. */
  addNtFolder (archive, localPath, zipPath) {
    // Add nt:folder if needed.
    let contentXml = path.join(localPath, CONTENT_XML)
    let hasContentXml = fs.existsSync(contentXml)
    let hasContentFolder = localPath.indexOf('_jcr_content') !== -1
    if (!hasContentFolder && !hasContentXml) {
      archive.addLocalFile(NT_FOLDER_PATH, this.getZipPath(contentXml))
      log.group()
      log.debug('Added as nt:folder.')
      log.groupEnd()
    }
  }

  /** Gets file contents; returns null if does not exist or other error. */
  getFileContents (localPath) {
    let contents
    try {
      contents = fs.readFileSync(localPath, 'utf8')
    } catch (err) {
      // File likely does not exist.
      contents = null
    }

    return contents
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
      .replace(/\/_([^/]*)_([^/]*)$/g, '/$1:$2')
  }
}

module.exports = Package
