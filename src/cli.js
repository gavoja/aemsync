#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULTS, aemsync, push } from './api.js'
import * as log from './log.js'

const DIRNAME = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_JSON = path.resolve(DIRNAME, '..', 'package.json')
const VERSION = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')).version
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
                          **/@(.*|target|[Tt]humbs.db|[Dd]esktop.ini)
                          **/@(.*|target)/**
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
    > aemsync -e **/*.orig -e **/test -e **/test/**
  Just push, don't watch:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component
  Push multiple:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-other-component

Website:
  https://github.com/gavoja/aemsync
`

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
  // Just push.
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

main()
