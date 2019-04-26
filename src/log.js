'use strict'

const Console = require('console').Console

class Log extends Console {
  static getInstance () {
    Log.instance = Log.instance || new Log(process.stdout, process.stderr)
    return Log.instance
  }

  constructor (stdout, stderr) {
    super(stdout, stderr)
    this.prefix = ''
  }

  enableDebug () {
    this.isDebug = true
  }

  disableDebug () {
    this.isDebug = false
  }

  _format (args, color) {
    args = Array.apply(null, args)
    this.prefix && args.unshift(this.prefix.slice(0, -1))

    return args.map(arg => {
      if (typeof arg === 'string') {
        arg = arg.replace(/\n/g, '\n' + this.prefix) // Handle prefix.
        arg = color ? color(arg) : arg // Handle color.
      }

      return arg
    })
  }

  gray (text) {
    return `\x1b[90m${text}\x1b[0m`
  }

  group () {
    this.prefix += '  '
  }

  groupEnd () {
    this.prefix = this.prefix.slice(0, -2)
  }

  info () {
    this.log.apply(this, this._format(arguments))
  }

  debug () {
    this.isDebug && super.log.apply(this, this._format(arguments, this.gray))
  }
}

module.exports = Log.getInstance()
