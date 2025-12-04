# aemsync

The code and content synchronization for Sling / AEM (Adobe Experience Manager).

## Synopsis

The tool pushes content to AEM instance(s) upon a file change.

* There is no vault dependency.
* It can push to multiple instances at the same time (e.g. author and publish).
* IDE / editor agnostic.
* Works on Windows, Linux, and Mac.

## Installation

With [npm](http://npmjs.org) do:

```
npm install aemsync -g
```

## Usage

Simply run `aemsync` on your project path, make a change to any of your files or directories, and watch the magic happen.

## Advanced usage

### CLI

```
Usage:
  aemsync [OPTIONS]

Options:
  -t <target>           URL to AEM instance; multiple can be set.
                        Default: http://admin:admin@localhost:4502
  -w <path_to_watch>    Watch over folder.
                        Default: .
  -p <path_to_push>     Push specific file or folder.
  -e <exclude_filter>   Extended glob filter; multiple can be set.
                        Default:
                          **/jcr_root/*
                          **/@(.*|target|[Tt]humbs.db|[Dd]esktop.ini)
                          **/@(.*|target)/**
  -d <delay>            Time to wait since the last change before push.
                        Default: 300 ms
  -q <packmgr_path>     Package manager path.
                        Default: /crx/packmgr/service.jsp
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
```

### API

Watch mode:

```js
import { aemsync } from 'aemsync'

const args = { workingDir: 'c:/code/my-aem-project' }

for await (const result of aemsync(args)) {
  console.log(result)
}
```

Push:

```js
import { push } from 'aemsync'

const args = {
  payload: [
    './foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component',
    './foo/bar/my-workspace/jcr_content/apps/my-app/components/something-else'
  ]
}

// Will yield for each target.
for await (const result of push(args)) {
  console.log(result)
}
```

Defaults for `args`:

```js
const args = {
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
  verbose: false
}
```

## Description

Watching for file changes is fast, since it uses Node's `recursive` option for `fs.watch()` where applicable.

Any changes inside `jcr_root` folders are detected and uploaded to AEM instance(s) as a package. By default, there is a simple exclusion filter in place to prevent hidden or system files from being uploaded. It also ignores changes to first-level directories under `jcr_root` in order to prevent accidental removal of `apps`, `libs`, or any other first-level node in AEM. The exclusion filter can be overridden with the `-e` parameter.

The delay is the time elapsed since the last change before the package is created. In case of bulk changes (e.g., switching between code branches), creating a new package per file should be avoided; instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave it at the default.

## Caveats

1. Packages are installed using the package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before initialization, the Sling Post Servlet will take over, causing the `/crx/packmgr/service.jsp/file` node to be added to the repository. Use the `-c` option to perform a status check before sending (all bundles must be active).
2. Changing any XML file will cause the parent folder to be pushed. Given the many special cases around XML files, the handling is left to the package manager.
