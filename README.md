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

CLI
```
Usage:
  aemsync [OPTIONS]

Options:
  -t <target>           URL to AEM instance; multiple can be set.
                        Default: http://admin:admin@localhost:4502
  -w <path_to_watch>    Watch over folder.
                        Default: '.'
  -p <path_to_push>     Push specific file or folder.
  -e <exclude_filter>   Extended glob filter; multiple can be set.
                        Default:
                          **/jcr_root/*
                          **/@(.git|.svn|.hg|target)
                          **/@(.git|.svn|.hg|target)/**
                          as well as Windows, macOS, and Linux system files (via https://www.toptal.com/developers/gitignore/api/windows,macos,linux).
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
    > aemsync -e **/*.orig -e **/test -e -e **/test/**
  Just push, don't watch:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component
  Push multiple:
    > aemsync -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component -p /foo/bar/my-workspace/jcr_content/apps/my-app/components/my-other-component
```

JavaScript API
```JavaScript
import { aemsync, push } from 'aemsync'

// Interactive watch example.
(async function () {
  const args = { workingDir }

  for await (const result of aemsync(args)) {
    console.log(result)
  }
})()

// Push example.
(async function () {
  const args = { payload: [
    './foo/bar/my-workspace/jcr_content/apps/my-app/components/my-component',
    './foo/bar/my-workspace/jcr_content/apps/my-app/components/something-else'
  ]}

  for await (const result of aemsync(args)) {
    // Will yield one result for each target.
    console.log(result)
  }
})()
```

JavaScript arguments and defaults for `aemsync()` and `push()` functions:
```JavaScript
const args = {
  workingDir: '.',
  exclude: ['**/jcr_root/*', '**/@(.git|.svn|.hg|target)', '**/@(.git|.svn|.hg|target)/**'],
  packmgrPath: '/crx/packmgr/service.jsp',
  targets: ['http://admin:admin@localhost:4501'],
  delay: 300,
  checkIfUp: false
}
```

### Description

Watching for file changes is fast, since it uses Node's `recursive` option for `fs.watch()` where applicable.

Any changes inside `jcr_root` folders are detected and deployed to AEM instance(s) as a package. By default, there is an exclude filter in place:
* Changes to first level directories under `jcr_root` are ingored. This is to avoid accidentally removing `apps`, `libs` or any other first level node in AEM.
* Any paths containing `.svn`, `.git`, `.hg` or `target` are ignored.
* The exclude filter can be overriden. Do note that this will remove the above rules completely and if required, they must be added manually.

Delay is the time to wait to pass since the last change before the package is created. In case of bulk changes (e.g. switching between code branches), creating a new package per file should be avoided and instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave the default.

### Caveats

1. Packages are installed using package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before, the Sling Post Servlet will take over causing the `/crx/packmgr/service.jsp/file` node to be added to the repository. Use `-c` option to performs a status check before sending (all bundles must be active).
2. Changing any XML file will cause the parent folder to be pushed. Given the many special cases around XML files, the handling is left to the package manager.
