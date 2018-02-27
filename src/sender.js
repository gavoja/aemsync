'use strict'

const fs = require('graceful-fs')
const parseUrl = require('url').parse
const FormData = require('form-data')
const StringDecoder = require('string_decoder').StringDecoder
const log = require('./log')

const PACKMGR_PATH = '/crx/packmgr/service.jsp'
const RE_STATUS = /code="([0-9]+)">(.*)</

class Sender {
  constructor ({targets, packmgrPath}) {
    this.targets = targets
    this.packmgrPath = packmgrPath || PACKMGR_PATH
  }

  /** Submits the package manager form. */
  send (zipPath, callback) {
    log.debug('Posting...')
    for (let i = 0; i < this.targets.length; ++i) {
      this.sendFormToTarget(zipPath, this.targets[i], callback)
    }
  }

  sendFormToTarget (zipPath, target, callback) {
    const params = parseUrl(target)
    const auth = Buffer.from(params.auth).toString('base64')
    const timestamp = Date.now()

    const options = {}
    options.path = this.packmgrPath
    options.port = params.port
    options.host = params.hostname
    options.headers = {
      'Authorization': 'Basic ' + auth
    }

    const form = new FormData()
    form.append('file', fs.createReadStream(zipPath))
    form.append('force', 'true')
    form.append('install', 'true')
    form.submit(options, (err, res) => {
      this.onSubmit(err, res, zipPath, target, timestamp, callback)
    })
  }

  /** Package install submit callback */
  onSubmit (err, res, zipPath, target, timestamp, callback) {
    const host = target.substring(target.indexOf('@') + 1)
    let errorMessage = 'Invalid response; is the packmgr path valid?'

    // Server error.
    if (!res) {
      const delta = Date.now() - timestamp
      const time = new Date().toISOString()
      return callback(err.code, host, delta, time)
    }

    const decoder = new StringDecoder('utf8')
    const output = [`Output from ${host}:`]

    res.on('data', (chunk) => {
      // Get message and remove new line.
      let textChunk = decoder.write(chunk)
      textChunk = textChunk.replace(/\r/g, '').substring(0, textChunk.length - 1)
      output.push(textChunk)

      // Parse message.
      const match = RE_STATUS.exec(textChunk)
      if (match === null || match.length !== 3) {
        return
      }

      const code = match[1]
      const msg = match[2]
      errorMessage = code === '200' ? '' : msg

      log.group()
      output.forEach(line => {
        log.debug(line)
        if (line.startsWith('E ')) {
          errorMessage += `\n${line.substr(2)}`
        }
      })

      log.groupEnd()
    })

    res.on('end', () => {
      let delta = Date.now() - timestamp
      let time = new Date().toISOString()
      callback(errorMessage, host, delta, time)
    })
  }
}

module.exports = Sender
