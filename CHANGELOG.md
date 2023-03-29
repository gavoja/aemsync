# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [5.0.5]

### Fixed

- The `-w` parameter is now properly handled.
- Typos in README.md.

# [5.0.4]

### Changed

- No more callbacks in JavaScript API; asynchronous generators are used instead.
- The pipeline has been rewritten. Instead of interval-based approach, packages are now pushed after a delay since the last change.
- The `-i` (interval) argument becomes `-d` (delay).
- The `-d` (debug) argument becomes `-v` (verbose).
- The `-u` argument becomes `-q`.
