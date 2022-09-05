#!/usr/bin/env node
import FormData from 'form-data'
import fs from 'fs'
import minimist from 'minimist'
import fetch from 'node-fetch'
import path from 'path'
import watch from 'simple-watcher'
import * as url from 'url'
import xmlToJson from 'xml-to-json-stream'
import Channel from './src/channel.js'
import * as log from './src/log.js'
import Package from './src/package.js'

const DIRNAME = url.fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_JSON = path.join(DIRNAME, 'package.json')
const VERSION = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')).version
const DEFAULTS = {
  workingDir: '.',
  exclude: ['**/jcr_root/*', '**/@(.git|.svn|.hg|target)', '**/@(.git|.svn|.hg|target)/**'],
  packmgrPath: '/crx/packmgr/service.jsp',
  targets: ['http://admin:admin@localhost:4502'],
  delay: 300,
  checkIfUp: false,
  postHandler: post,
  verbose: false
}

const HELP = `
The code and content synchronization for Sling / AEM; version ${VERSION}.

Usage:
  aemsync [OPTIONS]

Options:
  -t <target>           URL to AEM instance; multiple can be set.
                        Default: ${DEFAULTS.targets}
  -w <path_to_watch>    Watch over folder.
                        Default: ${DEFAULTS.workingDir}
  -p <path_to_push>     Push specific file or folder.
  -e <exclude_filter>   Extended glob filter; multiple can be set.
                        Default:
                          **/jcr_root/*
                          **/@(.git|.svn|.hg|target)
                          **/@(.git|.svn|.hg|target)/**
  -d <delay>            Time to wait since the last change before push.
                        Default: ${DEFAULTS.interval} ms
  -q <packmgr_path>     Package manager path.
                        Default: ${DEFAULTS.packmgrPath}
  -c                    Check if AEM is up and running before pushing.
  -v                    Enable verbose mode.
  -h                    Display this screen.

Examples:
  Magic:
    > aemsync
  Custom targets:
    > aemsync -t http://admin:admin@localhost:4502 -t http://admin:admin@localhost:4503 -w ~/workspace/my_project
  Custom exclude rules:
    > aemsync -e **/*.orig -e **/test -e -e **/test/**
  Just push, don't watch:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component

Website:
  https://github.com/gavoja/aemsync
`

// =============================================================================
// Posting to AEM.
// =============================================================================

async function post ({ archivePath, target, packmgrPath, checkIfUp }) {
  const url = target + packmgrPath
  const form = new FormData()
  form.append('file', fs.createReadStream(archivePath))
  form.append('force', 'true')
  form.append('install', 'true')

  // Check if AEM is up and runnig.
  if (checkIfUp && !await check(target)) {
    return { target, err: new Error('AEM not ready') }
  }

  const result = { target }
  try {
    const res = await fetch(url, { method: 'POST', body: form })

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

async function check (target) {
  try {
    const res = await fetch(target)
    return res.status === 200
  } catch (err) {
    log.debug(err.message)
    return false
  }
}

function parseXml (xml) {
  return new Promise(resolve => {
    xmlToJson().xmlToJson(xml, (err, json) => err ? resolve({}) : resolve(json))
  })
}

// =============================================================================
// Main API.
// =============================================================================

async function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
      await wait(100)
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
  const channel = new Channel()
  const payload = []
  let timeoutId

  // Process file changes in the background.
  ;(async function () {
    for await (const localPath of watch(workingDir)) {
      payload.push(localPath)

      // Graceful handling of bulk changes.
      // Process only after a certain amount of time passes since the last change.
      clearTimeout(timeoutId)
      timeoutId = setTimeout(async () => {
        // Make sure only current batch of payload is processed.
        const batch = payload.splice(0, payload.length)

        for await (const result of push({ ...args, payload: batch })) {
          channel.put(result)
        }
      }, delay)
    }
  })()

  // Yield results via channel.
  while (true) {
    yield await channel.take()
  }
}

// =============================================================================
// CLI handling.
// =============================================================================

function debugResult (result) {
  log.debug('Package contents:')
  log.group()
  log.debug(JSON.stringify(result?.archive?.contents, null, 2))
  log.groupEnd()
  log.debug('Response log:')
  log.group()
  log.debug(result?.response?.log)
  log.groupEnd()
}

function getArgs () {
  const args = minimist(process.argv.slice(2), {
    default: {
      w: DEFAULTS.workingDir,
      t: DEFAULTS.targets,
      e: DEFAULTS.exclude,
      d: DEFAULTS.delay,
      c: DEFAULTS.checkIfUp,
      q: DEFAULTS.packmgrPath,
      v: DEFAULTS.verbose
    }
  })

  return {
    payload: args.p ? path.resolve(args.p) : null,
    workingDir: path.resolve(args.w),
    targets: Array.isArray(args.t) ? args.t : [args.t],
    exclude: Array.isArray(args.e) ? args.e : [args.e],
    delay: args.d,
    checkIfUp: args.c,
    packmgrPath: args.q,
    help: args.h,
    verbose: args.v
  }
}

export async function main () {
  const args = getArgs()

  // Show help.
  if (args.help) {
    log.info(HELP)
    return
  }

  // Print additional debug information.
  args.verbose && log.enableDebug()

  //
  // Just the push.
  //

  // Path to push does not have to exist.
  // Non-existing path can be used for deletion.
  if (args.payload) {
    for await (const result of push(args)) {
      debugResult(result)
    }
  }

  //
  // Watch mode.
  //

  if (!fs.existsSync(args.workingDir)) {
    log.info('Invalid path:', log.gray(args.workingDir))
    return
  }

  // Start aemsync.
  log.info(`aemsync version ${VERSION}

    Watch over: ${log.gray(args.workingDir)}
       Targets: ${args.targets.map(t => log.gray(t)).join('\n'.padEnd(17, ' '))}
       Exclude: ${args.exclude.map(x => log.gray(x)).join('\n'.padEnd(17, ' '))}
         Delay: ${log.gray(args.delay)}
  `)

  for await (const result of aemsync(args)) {
    debugResult(result)
  }
}

if (path.normalize(import.meta.url) === path.normalize(`file://${process.argv[1]}`)) {
  main()
}
