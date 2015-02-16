aemsync
=======

AEM (Adobe CQ) Synchronization Tool.


### Installation

With [npm](http://npmjs.org) do:

```
npm install aemsync -g
```

### Usage

```
aemsync -t targets -w path_to_watch

-t: Comma separated list of hosts.
-w: Path to watch.
-i: Update interval; default 300 ms.
-d: Enable debug mode.
```

### Example

```
aemsync -t http://admin:admin@localhost:4502 -w ~/workspace/my_project
```

After the script is run, all `jcr_root/*` folders within the `path_to_watch` are searched for (dot-prefixed and `target` folders are omitted). This may take a while depending on the size. Once the scan is completed, file system changes inside those folders are picked up and pushed to AEM instance as a package. There is no vault dependency.

Update interval is the time the syncer waits for the changes before the package is created. In case of multiple changes occurring at the same time (e.g. switching between code branches), creating a new package for each file should be avoided and instead, all files should be send as one package. Lowering the value decreases the delay for a single file change but can increase the delay for multiple file changes. If you are unsure, please leave the default value.