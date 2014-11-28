aemsync
=======

Adobe AEM Synchronization Tool

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