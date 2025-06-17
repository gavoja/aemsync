import { watch as nodeWatch } from 'node:fs'
import path from 'node:path'

let previousDir = ''

function watchWithCallback (pathsToWatch, options = { delay: 0 }, callback) {
  pathsToWatch = Array.isArray(pathsToWatch) ? pathsToWatch : [pathsToWatch]

  const payload = new Set()

  let timeout
  for (const pathToWatch of pathsToWatch) {
    nodeWatch(pathToWatch, { ...options, recursive: true }, (eventType, filename) => {
      // Deduplicate parent folder changes.
      if (!filename || (previousDir === filename && eventType === 'change')) {
        return
      }

      previousDir = path.dirname(filename)
      payload.add(path.resolve(pathToWatch, filename))

      // Handle bulk changes in batches.
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const batch = [...payload]
        callback(batch)
        payload.clear()
      }, options.delay)
    })
  }
}

export default async function * watch (pathsToWatch, options = { delay: 0 }) {
  const promises = []
  const resolves = []
  const enqueue = () => promises.push(new Promise(resolve => resolves.push(resolve)))

  enqueue()
  watchWithCallback(pathsToWatch, options, items => {
    enqueue()
    resolves.shift()(items)
  })

  while (promises.length > 0) {
    yield promises.shift()
  }
}
//
