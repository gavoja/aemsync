aemsync
=======

The code and content synchronization for Sling / AEM (Adobe Experience Manager).

### Synopsis

The tool pushes content to AEM instance(s) upon a file change.
* There is no vault dependency.
* It can push to multiple instances at the same time (e.g. author and publish).
* IDE / editor agnostic.
* Works on Windows, Linux and Mac.

### Installation

With [npm](http://npmjs.org) do:

```
npm install aemsync -g
```

### Usage

Simply run `aemsync` on your project path, make a change to any of your files or directories and watch the magic happen.

### Advanced usage

Commandline
```
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

Examples:
  Magic:
    > aemsync
  Custom targets:
    > aemsync -t http://admin:admin@localhost:4502 -t http://admin:admin@localhost:4503 -w ~/workspace/my_project
  Custom exclude rules:
    > aemsync -e **/*.orig -e **/test -e -e **/test/**
  Just push, don't watch:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component
```

JavaScript (full watch example):
```JavaScript
const aemsync = require('aemsync')

const workingDir = '~/workspace/my_project'

// Arguments below are optional.
const targets = [
  'http://admin:admin@localhost:4502',
  'http://admin:admin@localhost:4503'
]
const exclude = ['**/*.orig'] // Skip merge files.
const packmgrPath = '/foo/crx/packmgr/service.jsp'
const interval = 300
const onPushEnd = (err, target, log) => {
  // Called for each of the targets.
  if (err) {
    console.log(`Error when pushing package to ${target}.`, err.message)
  } else {
    console.log(`Package pushed to ${target}. Response log:\n${log}`)
  }
}
const checkBeforePush = true

// Will watch for changes over workingDir and push upon a file change.
// Only the first argument is mandatory.
aemsync(workingDir, { targets, exclude, interval, packmgrPath, onPushEnd, checkBeforePush })
```

JavaScript (direct push example):
```JavaScript
const { push } = require('aemsync')

const pathToPush = '~/foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component'

// Arguments below are optional.
const targets = [
  'http://admin:admin@localhost:4502',
  'http://admin:admin@localhost:4503'
]
const onPushEnd = (err, target, log) => {
  // Called for each of the targets.
  if (err) {
    console.log(`Error when pushing package to ${target}.`, err.message)
  } else {
    console.log(`Package pushed to ${target}. Response log:\n${log}`)
  }
}
const checkBeforePush = true

// Will push the path to AEM.
// To use await, the call must be made inside an async function.
// The result is a Promise so it can also be resolved with .then().
// Only the first argument is mandatory.
await push(pathToPush, { targets, onPushEnd, checkBeforePush })
```

### Description

The Watcher uses Node's `fs.watch()` function to watch over directory changes recursively. For Windows and OSX the `recursive` option is used, which significantly improves the performance.

Any changes inside `jcr_root` folders are detected and deployed to AEM instance(s) as a package. By default, there is an exclude filter in palce:
* Changes to first level directories under `jcr_root` are ingored. This is to avoid accidentally removing `apps`, `libs` or any other first level node in AEM.
* Any paths containing `.svn`, `.git`, `.hg` or `target` are ignored.
* The exclude filter can be overriden. Do note that this will remove the above rules completely and if required, they must be added manually.

Update interval is the time aemsync waits for file changes before the package is created. In case of multiple file changes (e.g. switching between code branches), creating a new package per file should be avoided and instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave the default value.

### Caveats

1. Packages are installed using package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before, the Sling Post Servlet will take over causing the `/crx/packmgr/service.jsp/file` node to be added to the repository. Use `-c` option to performs a status check before sending (all bundles must be active).
2. Changing any XML file will cause the parent folder to be pushed. Given the many special cases around XML files, the handlig is left to the package manager.

### Backward incompatible changes since version 4

1. Multiple targes are now specified with multiple `-t` options rather than a comma separated string.
2. The same goes for the exclude filter (`-e`).
3. Exclude filter supports extended globbing only. Setting exclude filter with `-e` option overrides the default.
4. JavaScript API functions have a different signature. This is to spearate mandatory and optional arguments.
5. The `push()` function returns Promise and can be resolved with `await`.
