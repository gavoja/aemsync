import minimist from 'minimist'
import path from 'path'
import fs from 'fs'
import watch from 'simple-watcher'
import defaults from './src/defaults.js'
import log from './src/log.js'
import Pipeline from './src/pipeline.js'

const { version } = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

const MSG_HELP = `
The code and content synchronization for Sling / AEM; version ${version}.

Usage:
  aemsync [OPTIONS]

Options:
  -t <target>           URL to AEM instance; multiple can be set.
                        Default: ${defaults.targets}
  -w <path_to_watch>    Watch over folder.
                        Default: CWD
  -p <path_to_push>     Push specific file or folder.
  -e <exclude_filter>   Extended glob filter; multiple can be set.
                        Default:
                          **/jcr_root/*
                          **/@(.git|.svn|.hg|target)
                          **/@(.git|.svn|.hg|target)/**
  -i <sync_interval>    Update interval.
                        Default: ${defaults.interval} ms
  -u <packmgr_path>     Package manager path.
                        Default: ${defaults.packmgrPath}
  -c                    Check if AEM is up and running before pushing.
  -d                    Enable debug mode.
  -h                    Display this screen.

Website:
  https://github.com/gavoja/aemsync
`

function aemsync (workingDir, { targets, interval, exclude, packmgrPath, onPushEnd, checkBeforePush }) {
  const pipeline = new Pipeline({ targets, interval, exclude, packmgrPath, onPushEnd, checkBeforePush })

  pipeline.start()
  watch(workingDir, localPath => {
    pipeline.enqueue(localPath)
  })
}

async function push (pathToPush, { targets, exclude, packmgrPath, checkBeforePush }) {
  const pipeline = new Pipeline({ targets, exclude, packmgrPath, checkBeforePush })
  return pipeline.push(pathToPush)
}

function main () {
  const args = minimist(process.argv.slice(2))

  // Show help.
  if (args.h) {
    return log.info(MSG_HELP)
  }

  // Print additional debug information.
  args.d && log.enableDebug()

  // Get the args.
  const pathToPush = args.p ? path.resolve(args.p) : null
  const workingDir = path.resolve(args.w || defaults.workingDir)
  const targets = args.t ? (typeof args.t === 'string' ? [args.t] : args.t) : defaults.targets
  const exclude = args.e ? (typeof args.e === 'string' ? [args.e] : args.e) : defaults.exclude
  const interval = args.i || defaults.interval
  const checkBeforePush = args.c
  const packmgrPath = args.u || defaults.packmgrPath

  //
  // Just the push.
  //

  if (pathToPush) {
    // Path to push does not have to exist.
    // Non-existing path can be used for deletion.
    return push(pathToPush, { targets })
  }

  //
  // Watch mode.
  //

  if (!fs.existsSync(workingDir)) {
    return log.info('Invalid path:', log.gray(workingDir))
  }

  // Start aemsync
  log.info(`aemsync version ${version}

    Watch over: ${log.gray(workingDir)}
       Targets: ${targets.map(t => log.gray(t)).join('\n'.padEnd(17, ' '))}
       Exclude: ${exclude.map(x => log.gray(x)).join('\n'.padEnd(17, ' '))}
      Interval: ${log.gray(interval)}
  `)

  aemsync(workingDir, { targets, interval, exclude, packmgrPath, checkBeforePush })
}

// Serve if run directly.
if (path.normalize(import.meta.url) === path.normalize(`file://${process.argv[1]}`)) {
  main()
}

aemsync.Pipeline = Pipeline
aemsync.main = main
aemsync.push = push

export default aemsync
