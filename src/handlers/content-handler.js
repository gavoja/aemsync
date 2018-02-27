'use strict'

const path = require('path')

const RE_CONTENT_PATH = /^.*\/jcr_root(\/[^/]+){2,}$/
const RE_SPECIAL = /^.*\/(_jcr_content|[^/]+\.dir|\.content\.xml).*$/
const RE_TARGET_PATH = /^.*\/(target|\..*)\/(.*\/)?jcr_root\/.*$/
const IGNORED = ['.svn', '.hg', '.git']

class ContentHandler {
  process (localPath) {
    let cleanPath = localPath.replace(/\\/g, '/')
    // TODO: Simplify path checking.

    // Ignore CVS files.
    if (IGNORED.some(i => cleanPath.endsWith(i))) {
      return null
    }

    // Skip paths on 'target' or dot prefixed folders
    if (cleanPath.match(RE_TARGET_PATH)) {
      return null
    }

    // Process items only under 'jcr_root/*/'
    if (!cleanPath.match(RE_CONTENT_PATH)) {
      return null
    }

    // Use parent if item is 'special'.
    if (cleanPath.match(RE_SPECIAL)) {
      return this.process(path.dirname(localPath))
    }

    return localPath
  }
}

module.exports = ContentHandler
