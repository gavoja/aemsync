'use strict';

const path = require('path');
const fs = require('graceful-fs');

const RE_WATCH_PATH = /^.*\/jcr_root\/[^\/]*$/;

/** Watches for file system changes. */
class Watcher {
	constructor(workingDir, userFilter, sync, log, callback) {
		this.sync = sync;
    this.log = log;
		this.helper = new Helper();

		var that = this;
		fs.exists(workingDir, function (exists) {
			if (!exists) {
				that.log.error('Invalid path: ', workingDir);
				return;
			}

			that.processWorkingDir(workingDir, userFilter, callback)
		});
	}

	processWorkingDir(workingDir, userFilter, callback) {
		// Get paths to watch.
		this.log.info('Scanning for package folders ...');
		var pathsToWatch = this.getPathsToWatch(workingDir);
		if (pathsToWatch.length === 0) {
			this.log.info('No package folders found.');
			return;
		}

		// Get ignored.
		var ignored = [this.skipHiddenFilter];
		if (userFilter) {
			ignored.push(userFilter);
		}

		this.startChokidar(pathsToWatch, userFilter, ignored, callback);
	}

	// Ignore all dot-prefixed folders and files except '.content.xml'.
	skipHiddenFilter(localPath) {
		var baseName = path.basename(localPath);
		if (baseName.indexOf('.') === 0 && baseName !== '.content.xml') {
			return true;
		}

		return false;
	}

	startChokidar(pathsToWatch, userFilter, ignored, callback) {
		// Start watcher.
		var watcher = chokidar.watch(pathsToWatch, {
			ignored: ignored,
			persistent: true
		});

		// When scan is complete.
		var that = this;
		watcher.on('ready', function () {
			that.log(util.format('Found %s package folder(s).',
				pathsToWatch.length));

			// Just to print the message.
			helper.releaseLock(that.sync);

			// Detect all changes.
			watcher.on('all', function (eventName, localPath) {
				localPath = cleanPath(localPath);
				that.debug('Change detected: ' + localPath);
				that.sync.queue.push(localPath);
			});

			// Fire callback.
			callback();
		});
	}

	/** Get paths to watch.
	 * By ignoring the lookup of certain folders (e.g. dot-prefixed or
	 * 'target'), we speed up chokidar's initial scan, as the paths are
	 * narrowed down to 'jcr_root/*' only.
	 * It is set to work one level below 'jcr_root' intentionally in order
	 * to prevent accidental removal of first level nodes such as 'libs'.
	 */
	getPathsToWatch(workingDir) {
    var that = this;

    log.group();

		return helper.walkSync(workingDir, function (localPath, stats) {
			// Skip non-directories.
			if (stats.isDirectory() === false) {
				return true;
			}

			// Skip dot-prefixed directories.
			if (localPath.indexOf('\/.') !== -1) {
				return true;
			}

			// Skip target directories outside 'jcr_root'.
			var i = localPath.indexOf('\/jcr_root');
			var j = localPath.indexOf('\/target\/');
			if (i !== -1 && j !== -1 && j < i) {
				return true;
			}

			// Skip directories two levels inside 'jcr_root'.
			var parentParentDir = path.basename(
				path.dirname(path.dirname(localPath)));
			if (i !== -1 && parentParentDir === 'jcr_root') {
				return true;
			}
		}).filter(function (localPath) {
			// Remove found items that are not 'jcr_root/*'.
			if (localPath.match(RE_WATCH_PATH)) {
				that.debug(localPath);
				return true;
			}
		});

    log.groupEnd();
	}
}

module.exports.Watcher = Watcher;
