#!/usr/bin/env node
import fs from 'fs'
import fetch, { FormData, File } from 'node-fetch'
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
  exclude: [
    '**/jcr_root/*',
    '**/@(.git|.svn|.hg|target)',
    '**/@(.git|.svn|.hg|target)/**',
    // Linux temp files
    '**/*~',
    '**/.fuse_hidden*',
    '**/.directory/**',
    '**/.Trash-*',
    '**/.Trash-*/**',
    '**/.nfs*',
    // macOS
    '**/.DS_Store',
    '**/.Apple',
    '**/.LSOverride',
    '**/._*',
    '**/.DocumentRevisions-V100',
    '**/.fseventsd',
    '**/.Spotlight-V100',
    '**/.TemporaryItems',
    '**/.Trashes',
    '**/.VolumeIcon.icns',
    '**/.com.apple.timemachine.donotpresent',
    '**/.AppleDB/**',
    '**/.AppleDesktop/**',
    '**/Network Trash Folder/**',
    '**/Temporary Items/**',
    '**/.apdisk/**',
    '**/*.icloud',
    // Windows
    '**/Thumbs.db',
    '**/Thumbs.db:encryptable',
    '**/ehthumbs.db',
    '**/ethumbs_vista.db',
    '**/*.stackdump',
    '**/[Dd]esktop.ini',
    '**/$RECYCLE.BIN/**',
    '**/*.lnk'
  ],
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
                          as well as Windows, macOS, and Linux system files (via https://www.toptal.com/developers/gitignore/api/windows,macos,linux).
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
  Push multiple:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-other-component

Website:
  https://github.com/gavoja/aemsync
`

// =============================================================================
// Posting to AEM.
// =============================================================================

async function post ({ archivePath, target, packmgrPath, checkIfUp }) {
  const form = new FormData()
  form.set('file', new File([fs.readFileSync(archivePath)], { type: 'text/plain' }))
  form.set('force', 'true')
  form.set('install', 'true')

  // Check if AEM is up and runnig.
  if (checkIfUp && !await check(target)) {
    return { target, err: new Error('AEM not ready') }
  }

  const result = { target }
  try {
    const urlObj = new URL(target + packmgrPath)
    const url = urlObj.origin + urlObj.pathname
    const fetchArgs = { method: 'POST', body: form }
    if (urlObj.password) {
      const credentials = Buffer.from(`${urlObj.username}:${urlObj.password}`).toString('base64')
      fetchArgs.headers = { Authorization: `Basic ${credentials}` }
    }

    const res = await fetch(url, fetchArgs)

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
      await wait(3000)
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
  const args = [' ', ...process.argv.slice(2)].join(' ').split(' -').slice(1).reduce((obj, arg) => {
    const [key, value] = arg.split(/ (.*)/s)
    obj[key] = obj[key] ?? []
    obj[key].push(value)
    return obj
  }, {})

  return {
    payload: args.p ? args.p.map(p => path.resolve(p)) : null,
    workingDir: path.resolve(args?.w?.[0] ?? DEFAULTS.workingDir),
    targets: args.t ?? DEFAULTS.targets,
    exclude: args.e ?? DEFAULTS.exclude,
    delay: Number(args?.d?.[0]) || DEFAULTS.delay,
    checkIfUp: !!args.c,
    packmgrPath: args?.q?.pop?.() ?? DEFAULTS.packmgrPath,
    help: !!args.h,
    verbose: !!args.v
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
    const result = (await push(args).next()).value
    debugResult(result)
    return
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
