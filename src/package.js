'use strict';

const path = require('path');
const util = require('util');
const fs = require('graceful-fs');
const log = require('./log.js');
const Zip = require('./zip.js').Zip;

const DATA_PATH = path.resolve(__dirname, '..', 'data');
const PACKAGE_CONTENT_PATH = path.join(DATA_PATH, 'package_content');
const NT_FOLDER_PATH = path.join(DATA_PATH, 'nt_folder', '.content.xml');

const FILTER_ZIP_PATH = "META-INF/vault/filter.xml";
const FILTER_WRAPPER = `<?xml version="1.0" encoding="UTF-8"?>
<workspaceFilter version="1.0">%s
</workspaceFilter>`;
const FILTER = `
   <filter root="%s" />`;

class Package {
  constructor() {
    this.items = [];
    this.path = []
  }

  update(localPath, zipPath) {
    // Check if item or its parent is already in the package.
    for (var i = 0; i < this.items.length; ++i) {
      if (localPath.indexOf(items[i].localPath) === 0) {
        return;
      }
    }

    // Add item.
    this.items.push({
      localPath: localPath,
      zipPath: zipPath !== null ? zipPath : this.getZipPath(localPath),
      filterPath: this.getFilterPath(zipPath)
    });
  }

  save(callback) {
    if (this.items.length == 0) {
        callback(null);
    }

    // Create archive and add default package content.
    var archive = new Zip();
    var jcrRoot = path.join(PACKAGE_CONTENT_PATH, 'jcr_root');
    var metaInf = path.join(PACKAGE_CONTENT_PATH, 'META-INF');
    archive.addLocalDirectory(jcrRoot, 'jcr_root/');
    archive.addLocalDirectory(metaInf, 'META-INF/');

    var filters = '';
    var that = this;

    // Iterate over all items
    for (var i = 0; i < this.items.length; ++i) {
      var item = this.items[i];

      // Update filters.
      filters += util.format(FILTER, item.filterPath);

      // Check if item exists.
      if (!fs.existsSync(item.localPath)) {
        return;
      }

      var stat = fs.statSync(item.localPath);

      // Add file to archive.
      if (stat.isFile()) {
        archive.addLocalFile(item.localPath, item.zipPath);
      }

      // Add directory to archive.
      if (stat.isDirectory()) {
        archive.addLocalDirectory(localPath, zipPath, (localaPath, zipPath) => {
          that.onItemAdd(archive, localPath, zipPath);
        });
      }
    }

    // Wrap filters
    filters = util.format(FILTER_WRAPPER, filters);
    log.debug(filters);
		archive.addFile(new Buffer(filters), FILTER_ZIP_PATH);
    archive.save(callback);
  }

  /** Additional handling of directories added recursively. */
  onItemAdd(archive, localPath, zipPath) {
    if (!fs.lstatSync(subItem).isDirectory()) {
      return;
    }

    // Add NT_FOLDER if needed.
    var contentXml = path.join(localPath, '.content.xml');
    var hasContentXml = fs.existsSync(contentXml);
    var hasContentFolder = subItem.indexOf('_jcr_content') !== -1;
    if (!hasContentFolder && !hasContentXml) {
      archive.addLocalFile(NT_FOLDER, this.getZipPath(contentXml));
      log.debug('Added as nt:folder.');
    }
  }

  /** Replaces backslashes with slashes. */
  cleanPath(localPath) {
  	return path.resolve(localPath).replace(/\\/g, '/');
  }

  /** Gets a zip path from a local path. */
  getZipPath(localPath) {
  	return this.cleanPath(localPath).replace(/.*\/(jcr_root\/.*)/, '$1');
  }

  /** Gets a filter path from a local path. */
  getFilterPath(localPath) {
  	return this.cleanPath(localPath)
  		.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, '')
  		.replace(/\/_([^\/]*)_([^\/]*)$/g, '\/$1:$2');
  }
}

module.exports.Package = Package;
