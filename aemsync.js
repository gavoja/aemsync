/*jslint node: true*/
(function () {
	"use strict";

	// Built-in packages
	var os = require("os");
	var fs = require("fs");
	var path = require('path');
	var parseUrl = require('url').parse;
	var StringDecoder = require('string_decoder').StringDecoder;

	// NPM packages
	var watch = require("node-watch");
	var minimist = require('minimist');
	var AdmZip = require("adm-zip");
	var FormData = require('form-data');

	// Constants
	var DEBUG = false;
	var HELP = "Usage: aemsync -t targets [-i interval] itemto_watch\nWebsite: https://github.com/gavoja/aemsync";
	var NT_FOLDER = __dirname + "/data/nt_folder/.content.xml";
	var RE_DIR = /^.*\.dir$/;
	var RE_CONTENT = /.*\.content\.xml$/;
	var RE_SAFE_PATH = /^((?!(\/\.)|(\/target\/)).)*\/jcr_root\/[^\/]*\/.*$/;

	var syncerInterval = 500;
	var queue = [];

	/** Prints debug message. */
	function debug(msg) {
		if (DEBUG) {
			console.log(msg);
		}
	}

	/** Prints package info. */
	function debugPack(pack) {
		if (!DEBUG) {
			return;
		}

		console.log("\nPackage contents:");
		pack.zip.getEntries().forEach(function(zipEntry) {
			console.log("  " + zipEntry.entryName);
		});
		console.log("Package filters:");
		console.log(pack.filters);
		console.log("");
	}

	function Syncer(targets, queue) {
		targets = targets.split(",");

		var sendForm = function(zipPath) {
			for (var i=0; i<targets.length; ++i) {
				var params = parseUrl(targets[i]);
				var options = {};
				options.path = "/crx/packmgr/service.jsp";
				options.port = params.port;
				options.host = params.hostname;
				options.headers = {"Authorization":"Basic " + new Buffer(params.auth).toString('base64')};

				var form = new FormData();
				form.append('file', fs.createReadStream(zipPath));
				form.append('force', 'true');
				form.append('install', 'true');
				form.submit(options, formSubmitCallback);
			}
		};

		var formSubmitCallback = function(err, res) {
			if (!res) {
				console.log(this._headers.host + " " + err.code);
				return;
			}

			var decoder = new StringDecoder('utf8');
			res.on("data", function(chunk) {
				var textChunk = this.req._headers.host + " " + decoder.write(chunk);
				if (textChunk.match(/(^.+ \/.*)|(code="500")/)) {
					// TODO: Better error handling (https://github.com/gavoja/aemsync/issues/3)
					process.stdout.write(textChunk);
				}
			});
		};

		var getZipPath = function(filePath) {
			return filePath.replace(/.*\/(jcr_root\/.*)/, "$1");
		};

		var getFilterPath = function(filePath) {
			return filePath.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, "").replace(/_([^\/]*)_([^\/]*)$/g, "$1:$2");
		};

		var createPackage = function() {
			var zip = new AdmZip();
			zip.addLocalFolder(__dirname + "/data/package_content");
			return {zip: zip, filters: "" };
		};

		var installPackage = function(pack) {
			// Add filters.
			// TODO: Add support for rep:policy nodes.
			pack.filters = '<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\nFILTERS</workspaceFilter>'.replace(/FILTERS/g, pack.filters);
			pack.zip.addFile("META-INF/vault/filter.xml", new Buffer(pack.filters));

			debugPack(pack);

			// TODO: Make in-memory zip perhaps?
			var zipPath = os.tmpdir() + "/aemsync.zip";
			if (DEBUG) {
				zipPath = __dirname + "/aemsync.zip";
			}
			pack.zip.writeZip(zipPath);
			sendForm(zipPath);
		};

		/** Recursively walks over directory */
		var walk = function(dir) {
			var results = [dir];
			var list = fs.readdirSync(dir);
			list.forEach(function(file) {
				file = dir + "/" + file;
				var stat = fs.statSync(file);
				if (stat && stat.isDirectory()) {
					results = results.concat(walk(file));
				} else {
					results.push(file);
				}
			});
			return results;
		};

		var addItemInPackage = function(pack, item) {

			console.log("ADD: " + item);
			var filterPath = getFilterPath(item);
			var filter = '';
			filter += '  <filter root="PARENT">\n';
			filter += '    <exclude pattern="PARENT/.*" />\n';
			filter += '    <include pattern="ITEM" />\n';
			filter += '    <include pattern="ITEM/.*" />\n';
			filter += '  </filter>\n';
			pack.filters += filter.replace(/PARENT/g, path.dirname(filterPath)).replace(/ITEM/g, filterPath);

			// Add file.
			if (fs.lstatSync(item).isFile()) {
				pack.zip.addLocalFile(item, path.dirname(getZipPath(item)));
				return;
			}

			// Add files in directory.
			var fileList = walk(item);
			fileList.forEach(function(subItem) {

				// Add files
				if (fs.lstatSync(subItem).isFile()) {
					pack.zip.addLocalFile(subItem, path.dirname(getZipPath(subItem)));
					return;
				}

				// Add NT_FOLDER if no .content.xml.
				if (!fs.existsSync(subItem + "/.content.xml")) {
					pack.zip.addLocalFile(NT_FOLDER, getZipPath(subItem));
				}
			});
		};

		var deleteItemInPackage = function(pack, item) {
			console.log("DEL: " + item);

			var filterPath = getFilterPath(item);
			pack.filters += '  <filter root="FILE" />\n'.replace(/FILE/g, filterPath);
		};

		/** Processes local path. */
		var processItem = function(pack, item) {
			if (fs.existsSync(item)) {
				addItemInPackage(pack, item);
			} else {
				deleteItemInPackage(pack, item);
			}
		};

		/** Processes queue items; duplicates and descendants are removed. */
		var processQueueItem = function(item, dict) {
			var parentItem = path.dirname(item);

			// Check if path is safe (prevents from deleting stuff like "/apps").
			if (!RE_SAFE_PATH.test(item)) {
				return;
			}

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
		this.processQueue = function() {
			var i, item, dict = {};

			// Dequeue items (dictionary takes care of duplicates).
			while((i = queue.pop())) {
				processQueueItem(i, dict);
			}

			// Skip if no items.
			if (Object.keys(dict).length === 0) {
				return;
			}

			console.log("");

			var pack = createPackage();
			for (item in dict) {
				processItem(pack, item);
			}
			installPackage(pack);
		};

		setInterval(this.processQueue, syncerInterval);
	}

	function Watcher(pathToWatch, queue) {
		if (!fs.existsSync(pathToWatch)) {
			console.error("Invalid path: " + pathToWatch);
			return;
		}

		watch(pathToWatch, function(localPath) {
			// Include files on "jcr_root/xyz/..." path that's outside hidden or target folder.
			localPath = localPath.replace("/\\/g", "/");
			debug("Change detected: " + localPath);
			queue.push(localPath);
		});
		console.log("Watching: " + pathToWatch + ". Update interval: " + syncerInterval + " ms.");
	}

	function main() {
		var args = minimist(process.argv.slice(2));
		if (!args.t || !args._[0]) {
			console.log(HELP);
			return;
		}
		syncerInterval = args.i || syncerInterval;
		new Watcher(args._[0], queue);
		new Syncer(args.t, queue);
	}

	main();
}());
