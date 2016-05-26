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

// Create Pusher and Watcher.
let pusher = new Pusher(targets, pushInterval, onPushEnd)
let watcher = new Watcher()

// Initialize queue processing.
pusher.start()

// Watch over workingDir.
watcher.watch(workingDir, exclude, (localPath) => {
  // Add item to Pusher's queue when a change is detected.
  pusher.enqueue(localPath)
})
```

### Description

The Watcher uses Node's `fs.watch()` function to watch over directory changes recursively. For Windows and OSX the `recursive` option is used, which significantly improves the performance. Any changes inside `jcr_root/*` folders are detected and deployed to AEM instance(s) as a package.

Update interval is the time the Pusher waits for file changes before the package is created. In case of multiple file changes (e.g. switching between code branches), creating a new package per file should be avoided and instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave the default value.

### Known issues

Packages are installed using package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before, the Sling Post Servlet will take over causing the `/crx/packmgr/service.jsp/file` node to be added to the repository.
