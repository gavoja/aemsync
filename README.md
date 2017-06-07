aemsync
=======

AEM (Adobe CQ) Synchronization Tool.

### Synopsis

The tool pushes code changes to AEM instance(s) upon a file change.
* There is no vault dependency.
* It can push to multiple instances at the same time (e.g. author and publish).
* IDE/editor agnostic.
* Works on Windows, Linux and Mac.

### Installation

With [npm](http://npmjs.org) do:

```
npm install aemsync -g
```

### Usage

Commandline
```
aemsync -t targets -w path_to_watch

-t: Comma separated list of target hosts; default is http://admin:admin@localhost:4502.
-w: Folder to watch; default is current.
-i: Update interval; default is 300ms.
-e: Anymatch exclude filter; any file matching the pattern will be skipped.
-d: Enable debug mode.
```
```
aemsync -t http://admin:admin@localhost:4502,http://admin:admin@localhost:4503 -w ~/workspace/my_project
```

JavaScript
```JavaScript
// Import aemsync.
const aemsync = require('aemsync')

// Set up the environment.
let workingDir = '~/workspace/my_project'
let targets = [
  'http://admin:admin@localhost:4502',
  'http://admin:admin@localhost:4503'
]
let exclude = '**/*.orig' // Skip merge files.
let pushInterval = 300
let onPushEnd = (err, host) => {
  if (err) {
    return console.log(`Error when pushing package to ${host}.`, err)
  }
  console.log(`Package pushed to ${host}.`)
}

aemsync({workingDir, targets, exclude, pushInterval, onPushEnd})
```

### Description

The Watcher uses Node's `fs.watch()` function to watch over directory changes recursively. For Windows and OSX the `recursive` option is used, which significantly improves the performance.
Any changes inside `jcr_root` folders are detected and deployed to AEM instance(s) as a package. Rules:
* Changes to first level folders under `jcr_root` are igored. This is to avoid accidentally removing `apps`, `libs` or any other first level folders in AEM.
* The following are ignored by default: `.svn`, `.git`, `.hg`.

Update interval is the time the Pusher waits for file changes before the package is created. In case of multiple file changes (e.g. switching between code branches), creating a new package per file should be avoided and instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave the default value.

Note that some of the file changes will result in pushing the entire parent folder:
* Ading, removing or renaming files or directories.
* Changing `.content.xml`.
* Changing any file or directory inside `nt:unstructured` subtree. In this case the first non `nt:unstructured` ancestor will be pushed. This behaviour ensures proper handling of self-contained unstructured blocks of nodes such as dialogs that are distributed across multiple files (see [issue 19](https://github.com/gavoja/aemsync/issues/19)).

### Known issues

Packages are installed using package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before, the Sling Post Servlet will take over causing the `/crx/packmgr/service.jsp/file` node to be added to the repository.
