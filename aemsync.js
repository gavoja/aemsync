/*jslint node: true, multistr: true*/
"use strict";

// -----------------------------------------------------------------------------
// VARIABLES
// -----------------------------------------------------------------------------

// Built-in packages
var os = require("os");
var path = require("path");
var parseUrl = require("url").parse;
var StringDecoder = require("string_decoder").StringDecoder;

// NPM packages
var fs = require("graceful-fs");
var minimist = require("minimist");
var archiver = require("archiver"); // TODO: consider using zip-stream for less dependencies.
var FormData = require("form-data");
var chokidar = require("chokidar");
var util = require("util");
require('colors');

// Constants
var MSG_HELP = "Usage: aemsync -t targets (defult is 'http://admin:admin@localhost:4502) -w path_to_watch (default is current)\nWebsite: https://github.com/gavoja/aemsync\n";
var MSG_INIT = "Working directory: %s\nTarget(s): %s\nFilter(s): %s\nUpdate interval: %s\n";
var MSG_EXIT = "\nGracefully shutting down from SIGINT (Ctrl-C)...";
var MSG_INST = "Deploying to [%s]: %s";
var FILTER_WRAPPER = '<?xml version="1.0" encoding="UTF-8"?>\
<workspaceFilter version="1.0">%s\
</workspaceFilter>';
var FILTER_CHILDREN = '\
  <filter root="%s">\
	<exclude pattern="%s/.*" />\
	<include pattern="%s" />\
	<include pattern="%s/.*" />\
  </filter>';
var FILTER = '\
  <filter root="%s" />';
var FILTER_ZIP_PATH = "META-INF/vault/filter.xml";
var NT_FOLDER = __dirname + "/data/nt_folder/.content.xml";
var ZIP_NAME = "/aemsync.zip";
var RE_DIR = /^.*\.dir$/;
var RE_CONTENT = /.*\.content\.xml$/;
var RE_STATUS = /code="([0-9]+)">(.*)</;
var RE_WATCH_PATH = /.*\/jcr_root$/;
var PACKAGE_MANAGER_URL = "/crx/packmgr/service.jsp";
var DEFAULT_TARGET = "http://admin:admin@localhost:4502";
var DEFAULT_WORKING_DIR = ".";
var DEFAULT_SYNCER_INTERVAL = 300;

// Global variables.
var queue = [];
var debugMode = false;
var maybeeExit = false;
var lock = 0;

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

/** Graceful exit. */
function gracefulExit() {

	process.on("SIGINT", function () {
		console.log(MSG_EXIT);
		maybeeExit = true;
	});

	// Proper SIGINT handling on Windows.
	if (process.platform === "win32") {
		require("readline").createInterface({
			input: process.stdin,
			output: process.stdout
		}).on("SIGINT", function () {
			process.emit("SIGINT");
		});
	}
}

/** Prints debug message. */
function debug(msg) {
	if (debugMode) {
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

/** Handles lock releasing. */
function releaseLock() {
	if (lock > 0) {
		--lock;
	}
	if (lock === 0) {
		console.log("\nAwaiting file changes...");
	}
}

/** Handles script exit. */
function handleExit() {
	if (maybeeExit === true) {
		// Graceful exit.
		console.log("Exit.");
		process.exit();
	}
}

// -----------------------------------------------------------------------------
// ZIP HANDLER
// -----------------------------------------------------------------------------

/** Creates zip archive. */
function Zip() {
	var zipPath = debugMode ? __dirname + ZIP_NAME : os.tmpdir() + ZIP_NAME;
	var zip = archiver("zip");

	debug("Creating archive: " + zipPath);
	var output = fs.createWriteStream(zipPath);
	zip.pipe(output);

	this.addLocalFile = function (localPath, zipPath) {
		debug("  Zipping: " + zipPath);
		zip.append(fs.createReadStream(localPath), {
			name: zipPath
		});
	};

	this.addFile = function (content, zipPath) {
		debug("  Zipping: " + zipPath);
		zip.append(content, {
			name: zipPath
		});
	};

	this.save = function (onSave) {
		output.on("close", function () {
			onSave(zipPath);
		});
		zip.finalize(); // Trigers the above.
	};
}

// -----------------------------------------------------------------------------
// SYNCER
// -----------------------------------------------------------------------------

/** Pushes changes to AEM. */
function Syncer(targets, queue, interval) {
	/** Submits the package manager form. */
	var sendForm = function (zipPath) {
		debug("Posting...");
		for (var i = 0; i < targets.length; ++i) {
			sendFormToTarget(zipPath, targets[i]);
		}
	};

	var sendFormToTarget = function (zipPath, target) {
		var params = parseUrl(target);
		var auth = new Buffer(params.auth).toString('base64');
		var options = {};
		options.path = PACKAGE_MANAGER_URL;
		options.port = params.port;
		options.host = params.hostname;
		options.headers = {
			"Authorization": "Basic " + auth
		};

		var timestamp = Date.now();

		var form = new FormData();
		form.append('file', fs.createReadStream(zipPath));
		form.append('force', 'true');
		form.append('install', 'true');
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
			releaseLock();
			return;
		}

		var decoder = new StringDecoder('utf8');
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

			// Success.
			if (code === "200") {
				var delta = Date.now() - timestamp;
				var time = new Date().toISOString();
				var msg = util.format("completed in %sms at %s", delta, time);
				// msg = "completed in " +
				console.log(util.format(MSG_INST, host.magenta, msg.green));
				releaseLock();
				return;
			}

			console.log(util.format(MSG_INST, host.magenta, msg.red));
			console.log("Retrying.");

			// Retry on error.
			this.sendFormToTarget(zipPath, target);
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
		pack.filters += util.format(FILTER_CHILDREN, dirName, dirName,
				filterPath, filterPath);

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

			// Add NT_FOLDER if no .content.xml.
			var contentXml = subItem + "/.content.xml";
			if (!fs.existsSync(contentXml)) {
				pack.zip.addLocalFile(NT_FOLDER, getZipPath(contentXml));
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
		var parentItem = path.dirname(item);

		// Try the parent if item is "special".
		if (item.match(RE_CONTENT) || item.match(RE_DIR) ||
				parentItem.match(RE_DIR)) {
			processQueueItem(parentItem, dict);
			return;
		}

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
		if (lock > 0) {
			return;
		}

		handleExit();

		// Dequeue items (dictionary takes care of duplicates).
		while ((i = queue.pop())) {
			processQueueItem(i, dict);
		}

		// Skip if no items.
		if (Object.keys(dict).length === 0) {
			return;
		}

		lock = targets.length;

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

	setInterval(this.processQueue, interval);
}

// -----------------------------------------------------------------------------
// WATCHER
// -----------------------------------------------------------------------------

/** Watches for file system changes. */
function Watcher(pathToWatch, filters, queue, callback) {
	fs.exists(pathToWatch, function (exists) {
		if (!exists) {
			console.error("Invalid path: " + pathToWatch);
			return;
		}

		console.log("Scanning for 'jcr_root' folders ...");

		// Get paths to watch.
		// By ignoring the lookup of certain folders (e.g. dot-prefixed or
		// "target"), we speed up chokidar's initial scan, as the paths are
		// narrowed down to "jcr_root/*".
		var pathsToWatch = walkSync(pathToWatch, function (localPath, stats) {
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

			// Skip directories inside two levels inside "jcr_root".
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

		// Return if nothing to watch.
		if (pathsToWatch.length === 0) {
			console.log("No 'jcr_root' folders found.");
			return;
		}

		// Ignore all dot-prefixed folders and files except ".content.xml".
		var ignored = function (localPath) {
			
			var baseName = path.basename(localPath);
			var filterPath = cleanPath(localPath).replace(pathToWatch, '');

			// Skit filtered paths
			for(var i = 0; i < filters.length; i++) {
				var patt = new RegExp(filters[i], "g");

				if (patt.test(filterPath)) {
					return true;
				}
			}

			if (baseName.indexOf(".") === 0 && baseName !== ".content.xml") {
				return true;
			}

			return false;
		};

		// Start watcher.
		var watcher = chokidar.watch(pathsToWatch, {
			ignored: ignored,
			persistent: true
		});

		// When scan is complete.
		watcher.on("ready", function () {
			
			console.log(util.format("Found %s 'jcr_root' folder(s).'",
				pathsToWatch.length));
			releaseLock();

			// Detect all changes.
			watcher.on("all", function (eventName, localPath) {
				localPath = cleanPath(localPath);
				debug("Change detected: " + localPath);
				queue.push(localPath);
			});

			// Fire callback.
			callback();
		});
	});
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
	debugMode = args.d;

	// Get configuration.
	var targets = args.t ? args.t : DEFAULT_TARGET;
	var workingDir = args.w ? cleanPath(args.w) :
		cleanPath(DEFAULT_WORKING_DIR);
	var filters = args.f ? args.f : '';

	var syncerInterval = args.i ? args.i : DEFAULT_SYNCER_INTERVAL;

	// Show info.
	console.log(util.format(MSG_INIT, workingDir.yellow, targets.yellow, filters.yellow,
		(syncerInterval + "ms").yellow));

	if(filters) {
		filters = filters.split(",");
	} else {
		filters = [];
	}

	// Start the watcher.
	new Watcher(workingDir, filters, queue, function() {
		gracefulExit();
		// Start the syncer.
		new Syncer(targets.split(","), queue, syncerInterval);
	});
}

main();
