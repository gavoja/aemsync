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
aemsync -t targets [-i interval] path_to_watch

-t: Comma separated list of hosts.
-i: Update interval; default 100 ms.
```

### Example

```
aemsync -t http://admin:admin@localhost:4502 ~/workspace/my_project
```

The path has to contain jcr_root folder. The script will pick up changes automatically and push them to the AEM instance.