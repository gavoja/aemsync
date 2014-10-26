/*jslint node: true*/
(function () {
	"use strict";

	var os = require("os");
	var fs = require("fs");
	var path = require('path');
	var parseUrl = require('url').parse;
	var watch = require("node-watch");
	var minimist = require('minimist');
	var AdmZip = require("adm-zip");
	var FormData = require('form-data');
	var StringDecoder = require('string_decoder').StringDecoder;

	var NT_FILE = __dirname + "/data/nt_file/.content.xml";
	var NT_FOLDER = __dirname + "/data/nt_folder/.content.xml";
	var HELP = "Usage: aemsync -t targets [-i interval] itemto_watch\nWebsite: https://github.com/gavoja/aemsync";
	var DEBUG = true;
	var RE_DIR = /^.*\.dir$/;
	var RE_CONTENT = /.*\.content\.xml$/;

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

		console.log("Package contents:");
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

		var addPathToPackage = function(pack, item) {
			debug("ADD: " + item);

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
				debug("ITEM: " + item);
				pack.zip.addLocalFile(item, path.dirname(getZipPath(item)));
				return;
			}

			// Add files in directory.
			var fileList = walk(item);
			fileList.forEach(function(subItem) {

				debug("ITEM: " + subItem);

				// Handle directories.
				if (fs.lstatSync(subItem).isDirectory()) {

					// Add NT_FILE for if empty folder.
					if (!fs.readdirSync(subItem)) {
						pack.zip.addLocalFile(NT_FILE, getZipPath(subItem));
					}

					// Add NT_FOLDER if no .content.xml.
					if (!fs.existsSync(subItem + "/.content.xml")) {
						pack.zip.addLocalFile(NT_FOLDER, getZipPath(subItem));
					}
				}

				// Add files
				if (fs.lstatSync(subItem).isFile()) {
					pack.zip.addLocalFile(subItem, path.dirname(getZipPath(subItem)));
				}
			});
		};

		var removePathFromPackage = function(pack, item) {
			debug("DEL: " + item);

			var filterPath = getFilterPath(item);
			pack.filters += '  <filter root="FILE" />\n'.replace(/FILE/g, filterPath);
		};

		/** Processes local path. */
		var processPath = function(pack, item) {
			var parentPath = path.dirname(item);

			// For any "special" case try the parent.
			if (parentPath.match(RE_DIR) || item.match(RE_DIR) || item.match(RE_CONTENT)) {
				processPath(pack, parentPath);
				return;
			}

			// Delete
			if (!fs.existsSync(item)) {
				removePathFromPackage(pack, item);
				return;
			}

			// Add
			addPathToPackage(pack, item);
		};

		this.processQueue = function() {
			var i, dict = {};

			// Enqueue items (dictionary takes care of duplicates).
			while((i = queue.pop())) {
				dict[i] = true;
			}

			// Skip if no items.
			if (Object.keys(dict).length === 0) {
				return;
			}

			var pack = createPackage();
			for (var item in dict) {
				processPath(pack, item);
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
			if (/^((?!(\/\.)|(\/target\/)).)*\/jcr_root\/[^\/]*\/.*$/.test(localPath)) {
				queue.push(localPath);
			}
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
