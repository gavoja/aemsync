import fs from 'node:fs'
import xmlToJson from 'xml-to-json-stream'
import * as log from './log.js'
import Package from './package.js'
import watch from './watch.js'

const ZIP_RETRY_DELAY = 3000

export const DEFAULTS = {
  workingDir: '.',
  exclude: [
    // AEM root folders (we do not want to accidentally delete them).
    '**/jcr_root/*',
    // Special files.
    '**/@(.*|target|[Tt]humbs.db|[Dd]esktop.ini)',
    // Special folders.
    '**/@(.*|target)/**'
  ],
  packmgrPath: '/crx/packmgr/service.jsp',
  targets: ['http://admin:admin@localhost:4502'],
  delay: 300,
  checkIfUp: false,
  postHandler: post,
  verbose: false
}

// =============================================================================
// Helper functions.
// =============================================================================

async function post ({ archivePath, target, packmgrPath, checkIfUp }) {
  const form = new FormData()
  form.set('file', new File([fs.readFileSync(archivePath)], { type: 'text/plain' }))
  form.set('force', 'true')
  form.set('install', 'true')

  // Check if AEM is up and running.
  if (checkIfUp && !await check(target)) {
    return { target, err: new Error('AEM not ready') }
  }

  const result = { target }
  try {
    const [url, headers] = extractBasicAuth(target + packmgrPath)
    const res = await fetch(url, { method: 'POST', body: form, headers })

    if (res.ok) {
      const text = await res.text()

      // Handle errors with AEM response.
      try {
        const obj = await parseXml(text)
        result.log = obj.crx.response.data.log
        const errorLines = [...new Set(result.log.split('\n').filter(line => line.startsWith('E')))]

        // Errors when installing selected nodes.
        if (errorLines.length) {
          result.err = new Error('Error installing nodes:\n' + errorLines.join('\n'))
        } else if (obj.crx.response.status.code !== '200') {
          // Error code in status.
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
    // Handle unexpected errors.
    result.err = err
  }

  return result
}

async function check (target) {
  try {
    const [url, headers] = extractBasicAuth(target)
    const res = await fetch(url, { headers })
    return res.status === 200
  } catch (err) {
    log.debug(err.message)
    return false
  }
}

function extractBasicAuth (url) {
  const urlObj = new URL(url)
  let headers

  if (urlObj.username || urlObj.password) {
    const credentials = `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(urlObj.password)}`
    headers = { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` }
  }

  urlObj.username = ''
  urlObj.password = ''

  return [urlObj.toString(), headers]
}

function parseXml (xml) {
  return new Promise(resolve => {
    xmlToJson().xmlToJson(xml, (err, json) => err ? resolve({}) : resolve(json))
  })
}

async function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// Main API.
// =============================================================================

export async function * push (args) {
  const { payload, exclude, targets, packmgrPath, checkIfUp, postHandler, breakStuff } = { ...DEFAULTS, ...args }

  // Get archive as many times as necessary.
  let archive
  while (true) {
    const pack = new Package(exclude)
    for (const localPath of payload) {
      const item = pack.add(localPath)
      item && log.info(item.exists ? '+' : '-', item.zipPath)
    }

    // Ability to break stuff when testing.
    // This is to simulate changes between change reported and archive creation.
    breakStuff && await breakStuff()

    archive = pack.save()
    if (archive.err) {
      log.debug(archive.err)
      await wait(ZIP_RETRY_DELAY)
      log.info('Failed to create ZIP, retrying...')
    } else {
      break
    }
  }

  // Archive may not be created if items added are on the exclude path.
  if (archive.path) {
    for (const target of targets) {
      const response = await postHandler({ archivePath: archive.path, target, packmgrPath, checkIfUp })
      log.info(log.gray(`${response.target} > ${response.err ? response.err.message : 'OK'}`))
      yield { archive, response }
    }
  } else {
    yield {}
  }
}

export async function * aemsync (args) {
  const { workingDir, delay } = { ...DEFAULTS, ...args }
  for await (const payload of watch(workingDir, { delay })) {
    for await (const result of push({ ...args, payload })) {
      yield result
    }
  }
}
