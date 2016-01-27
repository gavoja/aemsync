/*jslint node: true*/
"use strict";

// -----------------------------------------------------------------------------
// VARIABLES
// -----------------------------------------------------------------------------

// Built-in packages
const os = require("os");
const path = require("path");
const parseUrl = require("url").parse;
const StringDecoder = require("string_decoder").StringDecoder;

// NPM packages
const fs = require("graceful-fs");
const minimist = require("minimist");
const archiver = require("archiver"); // TODO: consider using zip-stream for less dependencies.
const FormData = require("form-data");
const chokidar = require("chokidar");
const util = require("util");
require('colors');

// Constants
const MSG_HELP = "Usage: aemsync -t targets (defult is 'http://admin:admin@localhost:4502) -w path_to_watch (default is current)\nWebsite: https://github.com/gavoja/aemsync\n";
const MSG_INIT = "Working directory: %s\nTarget(s): %s\nUpdate interval: %s\nFilter: %s\n";
const MSG_EXIT = "\nGracefully shutting down from SIGINT (Ctrl-C)...";
const MSG_INST = "Deploying to [%s]: %s";
const FILTER_WRAPPER = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<workspaceFilter version="1.0">%s\n' +
'</workspaceFilter>';
const FILTER = '\n' +
'  <filter root="%s" />';
const FILTER_ZIP_PATH = "META-INF/vault/filter.xml";
const NT_FOLDER = __dirname + "/data/nt_folder/.content.xml";
const ZIP_NAME = "/aemsync.zip";
const RE_SPECIAL = /(.*?)\/(_jcr_content|[^\/]+\.dir|\.content\.xml).*/;
const RE_STATUS = /code="([0-9]+)">(.*)</;
const RE_WATCH_PATH = /^.*\/jcr_root\/[^\/]*$/;
const PACKAGE_MANAGER_URL = "/crx/packmgr/service.jsp";
const DEFAULT_TARGET = "http://admin:admin@localhost:4502";
const DEFAULT_WORKING_DIR = ".";
const DEFAULT_SYNCER_INTERVAL = 300;

// Global variables.
var DEBUG_MODE = false;

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

/** Prints debug message. */
function debug(msg) {
	if (DEBUG_MODE) {
		msg = typeof msg === "string" ? msg.grey : msg;
		console.log(msg);
	}
}

/** Cleans path. */
function cleanPath(localPath) {
	return path.resolve(path.normalize(localPath)).replace(/\\/g, "/");
}

/** Gets a zip path from a local path. */
function getZipPath(localPath) {
	return cleanPath(localPath).replace(/.*\/(jcr_root\/.*)/, "$1");
}

/** Gets a filter path from a local path. */
function getFilterPath(localPath) {
	return cleanPath(localPath)
		.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, "")
		.replace(/\/_([^\/]*)_([^\/]*)$/g, "\/$1:$2");
}

/** Recursively walks over directory. */
function walkSync(localPath, returnCallback) {
	localPath = cleanPath(localPath);

	var results = [];
	var stats = fs.statSync(localPath);

	// Check return condition.
	if (returnCallback && returnCallback(localPath, stats)) {
		return results;
	}

	// Add current item.
	results.push(localPath);

	// No need for recursion if not a directory.
	if (!stats.isDirectory()) {
		return results;
	}

	// Iterate over list of children.
	var list = fs.readdirSync(localPath);
	list.forEach(function (file) {
		file = localPath + "/" + file;
		results = results.concat(walkSync(file, returnCallback));
	});

	return results;
}

/** Handles _lock releasing. */
function releaseLock(sync) {
	if (sync.lock > 0) {
		--sync.lock;
	}
	if (sync.lock === 0) {
		console.log("\nAwaiting file changes...");
	}
}

// -----------------------------------------------------------------------------
// ZIP HANDLER
// -----------------------------------------------------------------------------

/** Creates zip archive. */
class Zip {
	constructor() {
		this.path = DEBUG_MODE ? __dirname + ZIP_NAME : os.tmpdir() + ZIP_NAME;
		this.zip = archiver("zip");

		debug("Creating archive: " + this.path);
		this.output = fs.createWriteStream(this.path);
		this.zip.pipe(this.output);
	}

	addLocalFile(localPath, zipPath) {
		debug("  Zipping: " + zipPath);
		this.zip.append(fs.createReadStream(localPath), {
			name: zipPath
		});
	}

	addFile(content, zipPath) {
		debug("  Zipping: " + zipPath);
		this.zip.append(content, {
			name: zipPath
		});
	}

	save(onSave) {
		var that = this;
		this.output.on("close", function () {
			onSave(that.path);
		});
		this.zip.finalize(); // Trigers the above.
	};
}

// -----------------------------------------------------------------------------
// SYNC
// -----------------------------------------------------------------------------

class Sync {
	constructor() {
		this.queue = [];
		this.lock = 0;
	}
}

// -----------------------------------------------------------------------------
// PUSHER
// -----------------------------------------------------------------------------

/** Pushes changes to AEM. */
function Pusher(targets, interval, sync) {

	/** Submits the package manager form. */
	var sendForm = function (zipPath) {
		debug("Posting...");
		for (var i = 0; i < targets.length; ++i) {
			sendFormToTarget(zipPath, targets[i]);
		}
	};

	var sendFormToTarget = function (zipPath, target) {
		var params = parseUrl(target);
		var auth = new Buffer(params.auth).toString("base64");
		var timestamp = Date.now();

		var options = {};
		options.path = PACKAGE_MANAGER_URL;
		options.port = params.port;
		options.host = params.hostname;
		options.headers = {
			"Authorization": "Basic " + auth
		};

		var form = new FormData();
		form.append("file", fs.createReadStream(zipPath));
		form.append("force", "true");
		form.append("install", "true");
		// releaseLock(sync);
		// return;
		form.submit(options, function (err, res) {
			onSubmit(err, res, zipPath, target, timestamp);
		});
	};

	/** Package install submit callback */
	var onSubmit = function (err, res, zipPath, target, timestamp) {
		var host = target.substring(target.indexOf("@") + 1);
		if (!res) {
			console.log(util.format(MSG_INST, host.magenta, err.code.red));
			// Do not retry on server error. Servler is likely to be down.
			releaseLock(sync);
			return;
		}

		var decoder = new StringDecoder("utf8");
		var output = "\nOutput from " + host + ":";
		res.on("data", function (chunk) {

			// Get message and remove new line.
			var textChunk = decoder.write(chunk);
			textChunk = textChunk.substring(0, textChunk.length - 1);
			output += "\n" + textChunk;

			// Parse message.
			var match = RE_STATUS.exec(textChunk);
			if (match === null || match.length !== 3) {
				return;
			}

			var code = match[1];
			var msg = match[2];

			debug(output);

			if (code === "200") {
				var delta = Date.now() - timestamp;
				var time = new Date().toISOString();
				var msg = util.format("completed in %sms at %s", delta, time);
				console.log(util.format(MSG_INST, host.magenta, msg.green));
			} else { // Error.
				console.log(util.format(MSG_INST, host.magenta, msg.red));
			}

			releaseLock(sync);
		});
	};

	/** Creates a package. */
	var createPackage = function () {
		var zip = new Zip();
		var path = __dirname + "/data/package_content";
		var fileList = walkSync(path);

		fileList.forEach(function (subItem) {
			if (fs.statSync(subItem).isFile()) {
				zip.addLocalFile(subItem, subItem.substr(path.length + 1));
			}
		});

		return {
			zip: zip,
			filters: ""
		};
	};

	/** Installs a package. */
	var installPackage = function (pack) {
		// Add filters.
		// TODO: Add support for rep:policy nodes.
		pack.filters = util.format(FILTER_WRAPPER, pack.filters);
		pack.zip.addFile(new Buffer(pack.filters), FILTER_ZIP_PATH);

		debug("\nPackage filters:\n" + pack.filters + "\n");

		// TODO: Make in-memory zip perhaps?
		pack.zip.save(sendForm);
	};

	/** Adds item to package. */
	var addItemInPackage = function (pack, item) {
		console.log("ADD: " + item.substring(item.indexOf("jcr_root")).yellow);
		var filterPath = getFilterPath(item);
		var dirName = path.dirname(filterPath);
		pack.filters += util.format(FILTER, filterPath);

		// Add file.
		if (fs.lstatSync(item).isFile()) {
			pack.zip.addLocalFile(item, getZipPath(item));
			return;
		}

		// Add files in directory.
		walkSync(item, function (localPath) {
			// Ignore dot-prefixed files and directories except ".content.xml".
			var baseName = path.basename(localPath);
			if (baseName.indexOf(".") === 0 && baseName !== ".content.xml") {
				debug("  Skipped: " + getZipPath(localPath));
				return true;
			}

			return false;
		}).forEach(function (subItem) {
			// Add files
			if (fs.lstatSync(subItem).isFile()) {
				pack.zip.addLocalFile(subItem, getZipPath(subItem));
				return;
			}

			// Add NT_FOLDER if needed.
			var contentXml = subItem + "/.content.xml";
			var hasContentXml = fs.existsSync(contentXml);
			var isContentFolder = path.basename(subItem) === '_jcr_content';
			if (!isContentFolder && !hasContentXml) {
				pack.zip.addLocalFile(NT_FOLDER, getZipPath(contentXml));
				debug("           Added as nt:folder.")
			}
		});
	};

	/** Deletes item in package. */
	var deleteItemInPackage = function (pack, item) {
		console.log("DEL: " + item.substring(item.indexOf("jcr_root")).yellow);

		var filterPath = getFilterPath(item);
		pack.filters += util.format(FILTER, filterPath);
	};

	/** Processes queue items; duplicates and descendants are removed. */
	var processQueueItem = function (item, dict) {

		// If item is special, use the parent.
		item = item.replace(RE_SPECIAL, '$1');
		console.log(item);

		// Make sure only parent items are processed.
		for (var dictItem in dict) {
			// Skip item if ancestor was already added to dict.
			if (item.indexOf(dictItem + "/") === 0) {
				item = null;
				break;
			}

			// Remove item if item is ancestor.
			if (dictItem.indexOf(item + "/") === 0) {
				delete dict[dictItem];
			}
		}

		// Add to dictionary.
		if (item) {
			dict[item] = true;
		}
	};

	/** Processes queue. */
	this.processQueue = function () {
		var i, item, dict = {};

		// Wait for the previous package to install.
		// Otherwise an error may occur if two concurrent packages try to make
		// changes to the same node.
		if (sync.lock > 0) {
			return;
		}

		// Dequeue items (dictionary takes care of duplicates).
		while ((i = sync.queue.pop())) {
			processQueueItem(i, dict);
		}

		// Skip if no items.
		if (Object.keys(dict).length === 0) {
			return;
		}

		sync.lock = targets.length;

		var pack = createPackage();
		for (item in dict) {
			if (fs.existsSync(item)) {
				addItemInPackage(pack, item);
			} else {
				deleteItemInPackage(pack, item);
			}
		}
		installPackage(pack);
	};

	// captureSigint();
	setInterval(this.processQueue, interval);
}

// -----------------------------------------------------------------------------
// WATCHER
// -----------------------------------------------------------------------------

//** Watches for file system changes. */
class Watcher {
	constructor(workingDir, userFilter, sync, callback) {
		this.sync = sync;

		var that = this;
		fs.exists(workingDir, function (exists) {
			if (!exists) {
				console.error("Invalid path: " + workingDir);
				return;
			}

			that.processWorkingDir(workingDir, userFilter, callback)
		});
	}

	processWorkingDir(workingDir, userFilter, callback) {
		// Get paths to watch.
		console.log("Scanning for 'jcr_root/*' folders ...");
		var pathsToWatch = this.getPathsToWatch(workingDir);
		if (pathsToWatch.length === 0) {
			console.log("No 'jcr_root/*' folders found.");
			return;
		}

		// Get ignored.
		var ignored = [this.skipHiddenFilter];
		if (userFilter) {
			ignored.push(userFilter);
		}

		this.startChokidar(pathsToWatch, userFilter, ignored, callback);
	}

	// Ignore all dot-prefixed folders and files except ".content.xml".
	skipHiddenFilter(localPath) {
		var baseName = path.basename(localPath);
		if (baseName.indexOf(".") === 0 && baseName !== ".content.xml") {
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
		watcher.on("ready", function () {
			console.log(util.format("Found %s 'jcr_root/*' folder(s).'",
				pathsToWatch.length));

			// Just to print the message.
			releaseLock(that.sync);

			// Detect all changes.
			watcher.on("all", function (eventName, localPath) {
				localPath = cleanPath(localPath);
				debug("Change detected: " + localPath);
				that.sync.queue.push(localPath);
			});

			// Fire callback.
			callback();
		});
	}

	/** Get paths to watch.
	 * By ignoring the lookup of certain folders (e.g. dot-prefixed or
	 * "target"), we speed up chokidar's initial scan, as the paths are
	 * narrowed down to "jcr_root/*" only.
	 * It is set to work one level below "jcr_root" intentionally in order
	 * to prevent accidental removal of first level nodes such as "libs".
	 */
	getPathsToWatch(workingDir) {
		return walkSync(workingDir, function (localPath, stats) {
			// Skip non-directories.
			if (stats.isDirectory() === false) {
				return true;
			}

			// Skip dot-prefixed directories.
			if (localPath.indexOf("\/.") !== -1) {
				return true;
			}

			// Skip target directories outside "jcr_root".
			var i = localPath.indexOf("\/jcr_root");
			var j = localPath.indexOf("\/target\/");
			if (i !== -1 && j !== -1 && j < i) {
				return true;
			}

			// Skip directories two levels inside "jcr_root".
			var parentParentDir = path.basename(
				path.dirname(path.dirname(localPath)));
			if (i !== -1 && parentParentDir === "jcr_root") {
				return true;
			}
		}).filter(function (localPath) {
			// Remove found items that are not "jcr_root/*".
			if (localPath.match(RE_WATCH_PATH)) {
				debug("  " + localPath);
				return true;
			}
		});
	}
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------

function main() {
	var args = minimist(process.argv.slice(2));

	// Show help.
	if (args.h) {
		console.log(MSG_HELP);
		return;
	}

	// Set debug mode.
	DEBUG_MODE = args.d;

	// Get configuration.
	var targets = args.t ? args.t : DEFAULT_TARGET;
	var workingDir = args.w ? cleanPath(args.w) :
		cleanPath(DEFAULT_WORKING_DIR);
	var syncerInterval = args.i ? args.i : DEFAULT_SYNCER_INTERVAL;
	var userFilter = args.f ? args.f : "";

	// Show info.
	console.log(util.format(MSG_INIT, workingDir.yellow, targets.yellow,
		(syncerInterval + "ms").yellow, userFilter.yellow));

	// Create synchronisation object.
	var sync = new Sync();

	// Start the watcher.
	new Watcher(workingDir, userFilter, sync, function() {
		// Start the syncer.
		new Pusher(targets.split(","), syncerInterval, sync);
	});
}

if (require.main === module) {
	main();
}

exports.Sync = Sync;
exports.Pusher = Pusher;
exports.Watcher = Watcher;
