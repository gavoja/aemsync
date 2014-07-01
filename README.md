aemsync
=======

Adobe AEM Synchronization Tool

Usage
```
node aemsync.js -t targets [-i interval] path_to_watch

-t   Comma separated list of hosts.
-i   Update interval; default 500 ms.
```

Example
```
node aemsync.js -t http://admin:admin@localhost:4502 ~/workspace/my_project
```
