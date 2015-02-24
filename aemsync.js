/*jslint node: true, multistr: true*/
"use strict";

// --------------------------------------------------------------------------------------
// VARIABLES
// --------------------------------------------------------------------------------------

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
var MSG_HELP = "Usage: aemsync -t targets -w path_to_watch\
Website: https://github.com/gavoja/aemsync";
var MSG_INIT = "Update interval: %s ms. Scanning path (may take while depending on the size): %s ...";
var MSG_EXIT = "\nGracefully shutting down from SIGINT (Ctrl-C)...";
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
var RE_WATCH_PATH = /^.*\/jcr_root\/[^\/]*$/;
var PACKAGE_MANAGER_URL = "/crx/packmgr/service.jsp";

// Variables.
var syncerInterval = 300;
var queue = [];
var debugMode = false;
var maybeeExit = false;
var lock = 0;

// --------------------------------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------------------------------

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

// --------------------------------------------------------------------------------------
// ZIP HANDLER
// --------------------------------------------------------------------------------------

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

// --------------------------------------------------------------------------------------
// SYNCER
// --------------------------------------------------------------------------------------

/** Pushes changes to AEM. */
function Syncer(targets, queue) {
	/** Submits the package manager form. */
	var sendForm = function (zipPath) {
		debug("Seding form...");
		for (var i = 0; i < targets.length; ++i) {
			sendFormToTarget(zipPath, targets[i]);
		}
	};

	var sendFormToTarget = function (zipPath, target) {
		var params = parseUrl(target);
		var options = {};
		options.path = PACKAGE_MANAGER_URL;
		options.port = params.port;
		options.host = params.hostname;
		options.headers = {
			"Authorization": "Basic " + new Buffer(params.auth).toString('base64')
		};

		var form = new FormData();
		form.append('file', fs.createReadStream(zipPath));
		form.append('force', 'true');
		form.append('install', 'true');
		form.submit(options, function (err, res) {
			onSubmit(err, res, zipPath, target);
		});
	};

	/** Package install submit callback */
	var onSubmit = function (err, res, zipPath, target) {
		if (!res) {
			console.log("  " + err.code.red);
			// Do not retry on server error. Servler is likely to be down.
			releaseLock();
			return;
		}

		var host = res.req._headers.host;
		console.log("Installing package on " + host.magenta + "...");

		var decoder = new StringDecoder('utf8');
		res.on("data", function (chunk) {
			// Get message and remove new line.
			var textChunk = decoder.write(chunk);
			textChunk = textChunk.substring(0, textChunk.length - 1);
			debug(textChunk);

			// Parse message.
			var match = RE_STATUS.exec(textChunk);
			if (match === null || match.length !== 3) {
				return;
			}

			var code = match[1];
			var msg = match[2];

			// Success.
			if (code === "200") {
				console.log("Status: " + msg.green);
				releaseLock();
				return;
			}

			console.log("Result: " + msg.red);
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
		pack.filters += util.format(FILTER_CHILDREN, dirName, dirName, filterPath,
			filterPath);

		// Add file.
		if (fs.lstatSync(item).isFile()) {
			pack.zip.addLocalFile(item, getZipPath(item));
			return;
		}

		// Add files in directory.
		var fileList = walkSync(item, function (localPath) {
			// Ignore dot-prefixed files and directories except of ".content.xml".
			var baseName = path.basename(localPath);
			if (baseName.indexOf(".") === 0 && baseName != ".content.xml") {
				debug("  Skipped: " + getZipPath(localPath));
				return true;
			}
			return false;
		});
		fileList.forEach(function (subItem) {

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
		if (item.match(RE_CONTENT) || item.match(RE_DIR) || parentItem.match(RE_DIR)) {
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
		// Otherwise an error may occur if two concurrent packages try to make changes
		// to the same node.
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

	setInterval(this.processQueue, syncerInterval);
}

// --------------------------------------------------------------------------------------
// WATCHER
// --------------------------------------------------------------------------------------

/** Watches for file system changes. */
function Watcher(pathToWatch, queue) {
	pathToWatch = cleanPath(pathToWatch);
	fs.exists(pathToWatch, function (exists) {
		if (!exists) {
			console.error("Invalid path: " + pathToWatch);
			return;
		}

		console.log(util.format(MSG_INIT, syncerInterval, pathToWatch.yellow));

		// Get paths to watch.
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
			var parentParentDir = path.basename(path.dirname(path.dirname(localPath)));
			if (i !== -1 && parentParentDir === "jcr_root") {
				return true;
			}
		});

		// All paths must contain "/jcr_root/" fragment.
		pathsToWatch = pathsToWatch.filter(function (localPath) {
			if (localPath.match(RE_WATCH_PATH)) {
				debug("  " + localPath);
				return true;
			}
		});

		// Ignore all dot-prefixed folders and files except "content.xml".
		var ignored = function (localPath) {
			var baseName = path.basename(localPath);
			if (baseName.indexOf(".") === 0 && baseName !== ".content.xml") {
				return true;
			}
			return false;
		};

		var watcher = chokidar.watch(pathsToWatch, {
			ignored: ignored,
			persistent: true
		});

		var isReady = false;
		watcher.on("ready", function () {
			console.log("Scan complete.");
			releaseLock();
			isReady = true;
		});

		watcher.on("all", function (eventName, localPath) {
			if (isReady === false) {
				return;
			}
			localPath = cleanPath(localPath);
			debug("Change detected: " + localPath);
			queue.push(localPath);
		});
	});
}

// --------------------------------------------------------------------------------------
// MAIN
// --------------------------------------------------------------------------------------

function main() {
	var args = minimist(process.argv.slice(2));
	if (!args.t || !args.w) {
		console.log(MSG_HELP);
		return;
	}
	syncerInterval = args.i || syncerInterval;
	debugMode = args.d;

	// Gracefull exit handling.
	process.on("SIGINT", function () {
		console.log(MSG_EXIT);
		maybeeExit = true;
	});

	new Watcher(args.w, queue);
	new Syncer(args.t.split(","), queue);
}

main();
