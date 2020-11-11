'use strict'

const util = require('util')
const fs = require('fs')
const path = require('path')
const globrex = require('globrex')
const log = require('./log')
const defaults = require('./defaults')
const Zip = require('./zip')

const DATA_PATH = path.resolve(__dirname, '..', 'data')
const PACKAGE_CONTENT_PATH = path.join(DATA_PATH, 'package-content')
const NT_FOLDER_PATH = path.join(DATA_PATH, 'nt-folder', '.content.xml')
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

// https://jackrabbit.apache.org/filevault/vaultfs.html
class Package {
  constructor (exclude = defaults.exclude) {
    this.zip = new Zip()
    this.exclude = exclude || []
    this.entries = []
  }

  //
  // Path processing.
  //

  add (localPath) {
    // Clean path.
    localPath = this._cleanPath(localPath)

    // Added path must be inside 'jcr_root' folder.
    if (!localPath.includes('jcr_root/')) {
      return null
    }

    // If the change is to an xml file, the parent folder will be processed.
    // It is better to leave the xml file handling to package manager.
    if (localPath.endsWith('.xml')) {
      return this.add(path.dirname(localPath))
    }

    // Include path.
    const entry = this._deduplicateAndAdd(localPath)
    if (!entry) {
      return null
    }

    // If folder, Add missing .content.xml@nt:folder inside.
    // This ensures proper handlig when removing inner .content.xml file.
    this._addContentXml(localPath)

    // Walk up the tree and add all .content.xml files.
    for (let parentPath = path.dirname(localPath); !parentPath.endsWith('jcr_root'); parentPath = path.dirname(parentPath)) {
      this._addContentXml(parentPath)
    }

    return entry
  }

  _addContentXml (localPath) {
    try {
      if (fs.lstatSync(localPath).isDirectory()) {
        const contentXmlPath = path.join(localPath, '.content.xml')
        if (fs.existsSync(contentXmlPath)) {
          // Include existing .content.xml.
          this._deduplicateAndAdd(contentXmlPath)
        } else {
          // Include missing .content.xml@nt:folder.
          // This is needed in case the .content.xml was removed locally.
          this._deduplicateAndAdd(contentXmlPath, NT_FOLDER_PATH)
        }
      }
    } catch (err) {
      log.debug(err)
    }
  }

  _deduplicateAndAdd (virtualLocalPath, localPath) {
    virtualLocalPath = this._cleanPath(virtualLocalPath)

    // Handle exclusions.
    if (this._isExcluded(virtualLocalPath)) {
      return null
    }

    // Deduplication handling.
    const zipPath = this._getZipPath(virtualLocalPath)
    for (let i = this.entries.length - 1; i >= 0; --i) {
      const existingZipPath = this.entries[i].zipPath

      // Skip if already added.
      if (zipPath === existingZipPath) {
        return log.debug(`Already added to package, skipping: ${zipPath}`)
      }

      // Skip if parent already added (with exception of .content.xml).
      if (zipPath.startsWith(existingZipPath) && !zipPath.endsWith('.content.xml')) {
        return log.debug(`Parent already added to package, skipping: ${zipPath}`)
      }

      // Remove child if path to add is a parent.
      if (existingZipPath.startsWith(zipPath)) {
        log.debug(`Removing child: ${existingZipPath}`)
        this.entries.splice(i, 1)
      }
    }

    localPath = localPath ? this._cleanPath(localPath) : virtualLocalPath
    const entry = this._getEntry(localPath, zipPath)
    this.entries.push(entry)
    return entry
  }

  _isExcluded (localPath) {
    for (const globPattern of this.exclude) {
      const regex = globrex(globPattern, { globstar: true, extended: true }).regex
      if (regex.test(localPath)) {
        return true
      }
    }

    return false
  }

  //
  // Zip creation.
  //

  save (archivePath) {
    if (this.entries.length === 0) {
      return null
    }

    // Create archive and add default package content.
    const jcrRoot = path.join(PACKAGE_CONTENT_PATH, 'jcr_root')
    const metaInf = path.join(PACKAGE_CONTENT_PATH, 'META-INF')
    this.zip.add(jcrRoot, 'jcr_root')
    this.zip.add(metaInf, 'META-INF')

    // Add each entry.
    const filters = []
    for (const entry of this.entries) {
      if (!entry.exists) {
        // DELETE
        // Only filters need to be updated.
        filters.push(util.format(FILTER, entry.filterPath))
      } else {
        // ADD
        // Filters need to be updated.
        const dirName = path.dirname(entry.filterPath)
        // if (!entry.localPath.endsWith('.content.xml')) {
        filters.push(util.format(FILTER_CHILDREN, dirName, dirName, entry.filterPath, entry.filterPath))
        // }

        // ADD
        // File or folder needs to be added to the zip.
        this.zip.add(entry.localPath, entry.zipPath)
      }
    }

    // Add filter file.
    const filter = util.format(FILTER_WRAPPER, filters.join('\n'))
    this.zip.add(Buffer.from(filter), FILTER_ZIP_PATH)

    // Debug package contents.
    log.debug('Package details:')
    log.group()
    log.debug(JSON.stringify(this.zip.inspect(), null, 2))
    log.groupEnd()

    return this.zip.save(archivePath)
  }

  //
  // Entry handling.
  //

  // Entry format:
  // {
  //   localPath:    Path to the local file
  //   zipPath:      Path inside zip
  //   filterPath:   Vault filter path
  //   isFolder
  //   exists
  // }
  _getEntry (localPath, zipPath) {
    localPath = this._cleanPath(localPath)

    const entry = {
      localPath,
      zipPath,
      filterPath: this._getFilterPath(zipPath)
    }

    try {
      const stat = fs.statSync(localPath)
      entry.exists = true
      entry.isFolder = stat.isDirectory()
    } catch (err) {
      entry.exists = false
    }

    return entry
  }

  _cleanPath (localPath) {
    return path.resolve(localPath)
      .replace(/\\/g, '/') // Replace backlashes with slashes.
      .replace(/\/$/, '') // Remove trailing slash.
  }

  _getZipPath (localPath) {
    return this._cleanPath(localPath)
      .replace(/.*\/(jcr_root\/.*)/, '$1')
  }

  _getFilterPath (localPath) {
    // .content.xml will result in .content entries.
    // Although incorrect, it does not matter and makes the handling
    // consistent.
    return this._cleanPath(localPath)
      .replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, '')
      .replace(/\/_([^/^_]*)_([^/]*)$/g, '/$1:$2')
  }
}

module.exports = Package
