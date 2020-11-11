'use strict'

const fs = require('fs')
const fetch = require('node-fetch')
const FormData = require('form-data')
const xmlToJson = require('xml-to-json-stream')
const Package = require('./package')
const log = require('./log')
const defaults = require('./defaults')

class Pipeline {
  constructor (opts = {}) {
    this.lock = false
    this.queue = []
    this.checkBeforePush = opts.checkBeforePush || defaults.checkBeforePush
    this.packmgrPath = opts.packmgrPath || defaults.packmgrPath
    this.targets = opts.targets || defaults.target
    this.interval = opts.interval || defaults.interval
    this.exclude = opts.exclude || defaults.exclude
    this.onPushEnd = opts.onPushEnd || function () {}
  }

  start () {
    setInterval(async () => {
      await this._processQueue()
    }, this.interval)
  }

  enqueue (localPath) {
    log.debug(`Changed: ${localPath}`)
    this.queue.push(localPath)
  }

  async push (pathToPush) {
    this.enqueue(pathToPush)
    return this._processQueue()
  }

  async _processQueue () {
    // Wait for the previous package to install.
    // Otherwise an error may occur if two concurrent packages try to make
    // changes to the same node.
    if (this.lock === true || this.queue.length < 1) {
      return null
    }

    // Lock the queue.
    this.lock = true

    // Create package.
    const pack = new Package(this.exclude)
    while (this.queue.length > 0) {
      const localPath = this.queue.pop()
      const item = pack.add(localPath)
      item && log.info(item.exists ? '+' : '-', item.zipPath)
    }

    // Push package to targets (if any entries detected).
    log.group()
    const archivePath = pack.save()
    if (archivePath) {
      for (const target of this.targets) {
        const result = await this._post(archivePath, target)
        this.onPushEnd(result.err, result.target, result.log)
        log.info(log.gray(target + ' >'), log.gray(result.err ? result.err.message : 'OK'))
      }
    }
    log.groupEnd()

    // Release lock.
    this.lock = false

    return pack
  }

  async _post (archivePath, target) {
    const url = target + this.packmgrPath
    const form = new FormData()
    form.append('file', fs.createReadStream(archivePath))
    form.append('force', 'true')
    form.append('install', 'true')

    // Check if AEM is up and runnig.
    if (this.checkBeforePush && !await this._check(target)) {
      return { target, err: new Error('AEM not ready') }
    }

    const result = { target }
    try {
      const res = await fetch(url, { method: 'POST', body: form })

      if (res.ok) {
        const text = await res.text()
        log.debug('Response text:')
        log.group()
        log.debug(text)
        log.groupEnd()

        // Handle errors with AEM response.
        try {
          const obj = await this._parseXml(text)
          result.log = obj.crx.response.data.log
          const errorLines = [...new Set(result.log.split('\n').filter(line => line.startsWith('E')))]

          // Errors when installing selected nodes.
          if (errorLines.length) {
            result.err = new Error('Error installing nodes:\n' + errorLines.join('\n'))
          // Error code in status.
          } else if (obj.crx.response.status.code !== '200') {
            result.err = new Error(obj.crx.response.status.textNode)
          }
        } catch (err) {
          // Unexpected response format.
          throw new Error('Unexpected response text format')
        }
      } else {
        // Handle errors with the failed request.
        result.err = new Error(res.statusText)
      }
    } catch (err) {
      // Handle unexpeted errors.
      result.err = err
    }

    return result
  }

  async _check (target) {
    try {
      const res = await fetch(target)
      return res.status === 200
    } catch (err) {
      log.debug(err.message)
      return false
    }
  }

  _parseXml (xml) {
    return new Promise(resolve => {
      xmlToJson().xmlToJson(xml, (err, json) => err ? resolve({}) : resolve(json))
    })
  }
}

module.exports = Pipeline
