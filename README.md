aemsync
=======

Adobe AEM Synchronization Tool

### Installation

With [npm](http://npmjs.org) do:

    $ npm install aemsync -g

### Usage

```
aemsync -t targets [-i interval] path_to_watch

-t   Comma separated list of hosts.
-i   Update interval; default 500 ms.
```

### Example

```
aemsync -t http://admin:admin@localhost:4502 ~/workspace/my_project
```
