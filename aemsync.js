/*jslint node: true*/
(function () {
	"use strict";

	// Built-in packages
	var os = require("os");
	var path = require('path');
	var parseUrl = require('url').parse;
	var StringDecoder = require('string_decoder').StringDecoder;

	// NPM packages
	var fs = require('graceful-fs');
	var watch = require("node-watch");
	var minimist = require('minimist');
	var archiver = require('archiver'); // TODO: consider using zip-stream for less dependencies.
	var FormData = require('form-data');

	// Constants
	var HELP = "Usage: aemsync -t targets [-i interval] -w path_to_watch\nWebsite: https://github.com/gavoja/aemsync";
	var NT_FOLDER = __dirname + "/data/nt_folder/.content.xml";
	var RE_DIR = /^.*\.dir$/;
	var RE_CONTENT = /.*\.content\.xml$/;
	// Include files on "jcr_root/xyz/..." path that's outside hidden or target folder.
	var RE_SAFE_PATH = /^((?!(\/\.)|(\/target\/)).)*\/jcr_root\/[^\/]*\/.*$/;
	var ZIP_NAME = "aemsyncX.zip";

	// Variables.
	var syncerInterval = 300;
	var queue = [];
	var debugMode = false;
	var maybeeExit = false;

	/** Prints debug message. */
	function debug(msg) {
		if (debugMode) {
			console.log(msg);
		}
	}

	/** Recursively walks over directory. */
	function walkSync(dir, includeDirectories) {
		var results = includeDirectories ? [dir] : [];
		var list = fs.readdirSync(dir);
		list.forEach(function(file) {
			file = dir + "/" + file;
			var stat = fs.statSync(file);
			if (stat && stat.isDirectory()) {
				results = results.concat(walkSync(file));
			} else {
				results.push(file);
			}
		});
		return results;
	}

	/** Gets a zip path from a local path. */
	function getZipPath(localPath) {
		return localPath.replace(/.*\/(jcr_root\/.*)/, "$1");
	}

	/** Gets a filter path from a local path. */
	function getFilterPath(localPath) {
		return localPath.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, "").replace(/\/_([^\/]*)_([^\/]*)$/g, "$1:$2");
	}

	/** Zip wrapper. */
	function Zip() {
		var zipPath = debugMode ? __dirname + "/aemsyncX.zip" : os.tmpdir() + "/aemsyncX.zip";
		zipPath = zipPath.replace("X", Zip.zipCounter++);
		var zip = archiver("zip");
		Zip.zipFiles[zipPath] = true;

		debug("Creating archive: " + zipPath);
		var output = fs.createWriteStream(zipPath);
		zip.pipe(output);

		this.addLocalFile = function(localPath, zipPath) {
			debug("  Zipping: " + zipPath);
			zip.append(fs.createReadStream(localPath), {name: zipPath});
		};

		this.addFile = function(content, zipPath) {
			debug("  Zipping: " + zipPath);
			zip.append(content, {name: zipPath});
		};

		this.save = function(callback) {
			output.on("close", function() {
				callback(zipPath, function() {
					debug("Deleting archive: " + zipPath);
					fs.unlinkSync(zipPath);
					delete Zip.zipFiles[zipPath];
				});
			});
			zip.finalize(); // Trigers the above.
		};
	}
	Zip.zipCounter = 0;
	Zip.zipFiles = {};

	function handleExit() {
		if (maybeeExit === false) {
			return;
		}

		for (var zipPath in Zip.zipFiles) {
			debug("Deleting archive: " + zipPath);
			fs.unlinkSync(zipPath);
		}
		console.log("Exit.");
		process.exit( );
	}

	/** Pushes changes to AEM. */
	function Syncer(targets, queue) {
		targets = targets.split(",");

		/** Submits the package manager form. */
		var sendForm = function(zipPath, callback) {
			debug("Seding form...");
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
				form.submit(options, function(err, res) {
					formSubmitCallback(err, res)
					callback();
				});
			}
		};

		/** Package install submit callback */
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

		/** Creates a package. */
		var createPackage = function() {
			var zip = new Zip();
			var path = __dirname + "/data/package_content";
			var fileList = walkSync(path, false);
			fileList.forEach(function(subItem) {
				zip.addLocalFile(subItem, subItem.substr(path.length + 1));
			});
			return {zip: zip, filters: ""};
		};

		/** Installs a package. */
		var installPackage = function(pack) {
			// Add filters.
			// TODO: Add support for rep:policy nodes.
			pack.filters = '<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\nFILTERS</workspaceFilter>'.replace(/FILTERS/g, pack.filters);
			pack.zip.addFile(new Buffer(pack.filters), "META-INF/vault/filter.xml");

			debug("\nPackage filters:\n" + pack.filters + "\n");

			// TODO: Make in-memory zip perhaps?
			pack.zip.save(sendForm);
		};

		/** Adds item to package. */
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
				pack.zip.addLocalFile(item, getZipPath(item));
				return;
			}

			// Add files in directory.
			var fileList = walkSync(item, true);
			fileList.forEach(function(subItem) {

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
		var deleteItemInPackage = function(pack, item) {
			console.log("DEL: " + item);

			var filterPath = getFilterPath(item);
			pack.filters += '  <filter root="FILE" />\n'.replace(/FILE/g, filterPath);
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

			handleExit();

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

	/** Watches for file system changes. */
	function Watcher(pathToWatch, queue) {
		pathToWatch = path.resolve(path.normalize(pathToWatch));
		fs.exists(pathToWatch, function(exists) {
			if (!exists) {
				console.error("Invalid path: " + pathToWatch);
				return;
			}

			watch(pathToWatch, function(localPath) {
				localPath = path.normalize(localPath);
				debug("Change detected: " + localPath);
				queue.push(localPath);
			});
			console.log("Watching: " + pathToWatch + ". Update interval: " + syncerInterval + " ms.");
		});
	}

	function main() {
		var args = minimist(process.argv.slice(2));
		if (!args.t || !args.w) {
			console.log(HELP);
			return;
		}
		syncerInterval = args.i || syncerInterval;
		debugMode = args.d;

		new Watcher(args.w, queue);
		new Syncer(args.t, queue);
	}

	process.on("SIGINT", function() {
		console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)...");
		maybeeExit = true;
	});

	main();
}());
