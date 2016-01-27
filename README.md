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
-f: Anymatch filter; any file matching the pattern will be skipped.
-d: Enable debug mode.
```

```
aemsync -t http://admin:admin@localhost:4502,http://admin:admin@localhost:4503 -w ~/workspace/my_project
```

JavaScript
```JavaScript
const aemsync = require('aemsync');

var sync = new aemsync.Sync();               // Synchronisation object.
var workingDir = "~/workspace/my_project"~;
var targets = [
  "http://admin:admin@localhost:4502",
  "http://admin:admin@localhost:4503"];
var userFilter = "*.orig";                   // Skip merge files.
var syncerInterval = 300;

new aemsync.Watcher(workingDir, userFilter, sync, function() {
  new aemsync.Pusher(targets, syncerInterval, sync);
});
```

### Description

When run, the Watcher scans for `jcr_root/*` folders within the `path_to_watch` (dot-prefixed and "target" folders are omitted). This may take a while depending on the size. After the scan is done, file system changes inside those folders are detected and deployed to AEM instance(s) as a package.

Update interval is the time the Pusher waits for file changes changes before the package is created. In case of multiple file changes (e.g. switching between code branches), creating a new package per file should be avoided and instead, all changes should be pushed in one go. Lowering the value decreases the delay for a single file change but may increase the delay for multiple file changes. If you are unsure, please leave the default value.

### Known issues

Packages are installed using package manager service (`/crx/packmgr/service.jsp`), which takes some time to initialize after AEM startup. If the push happens before, the Sling Post Servlet will take over causing the `/crx/packmgr/service.jsp/file` node to be added to the repository.
