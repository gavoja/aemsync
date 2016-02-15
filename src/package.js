'use strict'

const path = require('path')
const util = require('util')
const fs = require('graceful-fs')
const log = require('./log.js')
const Zip = require('./zip.js').Zip

const DATA_PATH = path.resolve(__dirname, '..', 'data')
const PACKAGE_CONTENT_PATH = path.join(DATA_PATH, 'package_content')
const NT_FOLDER_PATH = path.join(DATA_PATH, 'nt_folder', '.content.xml')

const FILTER_ZIP_PATH = "META-INF/vault/filter.xml"
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
  constructor() {
    this.items = []
    this.path = []
  }

  update(localPath, zipPath, action) {
    // Check if item or its parent is already in the package.
    for (let i = 0; i < this.items.length; ++i) {
      if (localPath.indexOf(this.items[i].localPath) === 0) {
        return;
      }
    }

    // Add item.
    this.items.push({
      action: action,
      localPath: localPath,
      zipPath: zipPath !== null ? zipPath : this.getZipPath(localPath),
      filterPath: this.getFilterPath(zipPath)
    });
  }

  save(callback) {
    if (this.items.length == 0) {
        callback(null)
    }

    // Create archive and add default package content.
    let archive = new Zip()
    let jcrRoot = path.join(PACKAGE_CONTENT_PATH, 'jcr_root')
    let metaInf = path.join(PACKAGE_CONTENT_PATH, 'META-INF')
    archive.addLocalDirectory(jcrRoot, 'jcr_root')
    archive.addLocalDirectory(metaInf, 'META-INF')

    let filters = ''
    let that = this

    // Iterate over all items
    for (let i = 0; i < this.items.length; ++i) {
      let item = this.items[i]

      // Update filters.
      if (item.action === 'ADD') {
        let dirName = path.dirname(item.filterPath)
        filters += util.format(FILTER_CHILDREN, dirName, dirName,
        				               item.filterPath, item.filterPath)
      } else {
        filters += util.format(FILTER, item.filterPath)
      }

      // Check if item exists.
      if (!fs.existsSync(item.localPath)) {
        break
      }

      let stat = fs.statSync(item.localPath)

      // Add file to archive.
      if (stat.isFile()) {
        archive.addLocalFile(item.localPath, item.zipPath)
      }

      // Add directory to archive.
      if (stat.isDirectory()) {
        let cb = (localPath, zipPath) => {
          that.onItemAdd(archive, localPath, zipPath)
        };

        archive.addLocalDirectory(item.localPath, item.zipPath, cb)
      }
    }

    // Wrap filters
    filters = util.format(FILTER_WRAPPER, filters)
		archive.addFile(new Buffer(filters), FILTER_ZIP_PATH)
    log.debug(filters)
    archive.save(callback)
  }

  /** Additional handling of directories added recursively. */
  onItemAdd(archive, localPath, zipPath) {
    if (!fs.lstatSync(localPath).isDirectory()) {
      return
    }

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
  cleanPath(localPath) {
  	return path.resolve(localPath).replace(/\\/g, '/')
  }

  /** Gets a zip path from a local path. */
  getZipPath(localPath) {
  	return this.cleanPath(localPath).replace(/.*\/(jcr_root\/.*)/, '$1')
  }

  /** Gets a filter path from a local path. */
  getFilterPath(localPath) {
  	return this.cleanPath(localPath)
  		.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, '')
  		.replace(/\/_([^\/]*)_([^\/]*)$/g, '\/$1:$2')
  }
}

module.exports.Package = Package
