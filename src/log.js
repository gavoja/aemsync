'use strict'

const Console = require('console').Console
const chalk = require('chalk')

let c = null

function Log () {
  c = c || new Console(process.stdout, process.stderr)
  let prefix = ''

  c.isDebug = false

  c.format = function (args, color) {
    args = Array.apply(null, args)
    prefix && args.unshift(prefix.slice(0, -1))

    args = args.map(function (arg) {
      if (typeof arg === 'string') {
        // Handle prefix.
        arg = arg.replace(/\n/g, '\n' + prefix)

        // Handle color.
        arg = color ? color(arg) : arg
      }

      return arg
    })

    return args
  }

  c.debug = function () {
    if (this.isDebug) {
      this.log.apply(this, this.format(arguments, chalk.gray))
    }
  }

  c.error = function () {
    this.log.apply(this, this.format(arguments, chalk.red))
  }

  c.info = function () {
    this.log.apply(this, this.format(arguments))
  }

  c.group = function () {
    prefix += '  '
  }

  c.groupEnd = function () {
    prefix = prefix.slice(0, -2)
  }

  return c
}

module.exports = new Log()
