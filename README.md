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
aemsync -t targets [-i interval] -w path_to_watch

-t: Comma separated list of hosts.
-i: Update interval; default 300 ms.
-d: Enable debug mode.
```

### Example

```
aemsync -t http://admin:admin@localhost:4502 -w ~/workspace/my_project
```

The path has to contain jcr_root folder. File system changes inside the folder will be picked up and pushed to AEM instance as a package. There is no vault dependency.

Sync interval is the time the syncer waits for changes before the package is created. In case of multiple changes occuring at the same time (e.g. switchig between code branches), we want to avoid creating a new pachage for each file, but rather send all in one go. Lowering the value removes the delay from a single change but increases the delay for multiple changes.