let isDebug = false
let prefix = ''

function format (args, color) {
  args = Array.apply(null, args)
  prefix && args.unshift(prefix.slice(0, -1))

  return args.map(arg => {
    if (typeof arg === 'string') {
      arg = arg.replace(/\n/g, '\n' + prefix) // Handle prefix.
      arg = color ? color(arg) : arg // Handle color.
    }

    return arg
  })
}

export function enableDebug () {
  isDebug = true
}

export function disableDebug () {
  isDebug = false
}

export function gray (text) {
  return `\x1b[90m${text}\x1b[0m`
}

export function group () {
  prefix += '  '
}

export function groupEnd () {
  prefix = prefix.slice(0, -2)
}

export function info () {
  console.log(...format(arguments))
}

export function error () {
  console.error(...format(arguments))
}

export function debug () {
  isDebug && console.log(...format(arguments, this.gray))
}
