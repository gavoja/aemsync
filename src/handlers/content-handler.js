'use strict';

const fs = require('graceful-fs')
const path = require('path')
const chalk = require('chalk')
const log = require('../log.js')

const RE_DOT = /^.*\/\..*$/
const RE_CONTENT_PATH = /^.*\/jcr_root(\/[^\/]+){2,}$/
const RE_SPECIAL = /^.*\/(_jcr_content|[^\/]+\.dir|\.content\.xml).*$/
const RE_ZIP_PATH = /^.*[\/\\](jcr_root[\/\\].*)$/

class ContentHandler {
  process(items, localPath) {
    let cleanPath = localPath.replace(/\\/g, '/')

    // Ignore dot-prefixed files and directories except ".content.xml".
    if (cleanPath.match(RE_DOT) && !cleanPath.endsWith('.content.xml')) {
      return
    }

    // Process items only under 'jcr_root/*/'
    if (!cleanPath.match(RE_CONTENT_PATH)) {
      return
    }

    // Use parent if item is 'special'.
    if (cleanPath.match(RE_SPECIAL)) {
      return this.process(items, path.dirname(localPath))
    }

    items.push({
      action: fs.existsSync(localPath) ? 'ADD' : 'DEL',
      localPath: localPath,
      zipPath: localPath.replace(RE_ZIP_PATH, '$1')
    });
  }
}

module.exports.ContentHandler = ContentHandler
