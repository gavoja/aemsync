'use strict'

const fs = require('graceful-fs')
const parseUrl = require('url').parse
const FormData = require('form-data')
const StringDecoder = require('string_decoder').StringDecoder
const log = require('./log')

const PACKAGE_MANAGER_URL = '/crx/packmgr/service.jsp'
const RE_STATUS = /code="([0-9]+)">(.*)</

class Sender {
  constructor (targets) {
    this.targets = targets
  }

  /** Submits the package manager form. */
  send (zipPath, callback) {
    log.debug('Posting...')
    for (let i = 0; i < this.targets.length; ++i) {
      this.sendFormToTarget(zipPath, this.targets[i], callback)
    }
  }

  sendFormToTarget (zipPath, target, callback) {
    let params = parseUrl(target)
    let auth = new Buffer(params.auth).toString('base64')
    let timestamp = Date.now()

    let options = {}
    options.path = PACKAGE_MANAGER_URL
    options.port = params.port
    options.host = params.hostname
    options.headers = {
      'Authorization': 'Basic ' + auth
    }

    let form = new FormData()
    form.append('file', fs.createReadStream(zipPath))
    form.append('force', 'true')
    form.append('install', 'true')

    let that = this
    form.submit(options, function (err, res) {
      that.onSubmit(err, res, zipPath, target, timestamp, callback)
    })
  }

  /** Package install submit callback */
  onSubmit (err, res, zipPath, target, timestamp, callback) {
    let host = target.substring(target.indexOf('@') + 1)

    // Server error.
    if (!res) {
      let delta = Date.now() - timestamp
      let time = new Date().toISOString()
      return callback(err.code, host, delta, time)
    }

    let decoder = new StringDecoder('utf8')
    let output = [`Output from ${host}:`]
    res.on('data', function (chunk) {
      // Get message and remove new line.
      let textChunk = decoder.write(chunk)
      textChunk = textChunk.substring(0, textChunk.length - 1)
      output.push(textChunk)

      // Parse message.
      let match = RE_STATUS.exec(textChunk)
      if (match === null || match.length !== 3) {
        return
      }

      let code = match[1]
      let msg = match[2]

      output = output.join('\n').replace(/\r/g, '')
      log.group()
      log.debug(output)
      log.groupEnd()

      let delta = Date.now() - timestamp
      let time = new Date().toISOString()
      let err = code === '200' ? null : msg
      callback(err, host, delta, time)
    })
  }
}

module.exports.Sender = Sender
