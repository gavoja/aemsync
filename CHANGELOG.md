# Changelog

## 5.1.1

- Added file system exclusions.

## 5.1.0

- Updated and reduced dependencies.
- Fixed check if up authentication.
- Updated README.md.

## 5.0.5

- The `-w` parameter is now properly handled.
- Typos in README.md.

## 5.0.4

- No more callbacks in JavaScript API; asynchronous generators are used instead.
- The pipeline has been rewritten. Instead of interval-based approach, packages are now pushed after a delay since the last change.
- The `-i` (interval) argument becomes `-d` (delay).
- The `-d` (debug) argument becomes `-v` (verbose).
- The `-u` argument becomes `-q`.
