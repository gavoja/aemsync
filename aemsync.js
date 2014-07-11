/*jslint node: true*/
/*global console, require, process, setInterval, Buffer, __dirname */
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

	var HELP = "Usage: aemsync -t targets [-i interval] path_to_watch\nWebsite: https://github.com/gavoja/aemsync";

	var syncerInterval = 500;
	var queue = [];
	var lock = 0;

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
				lock -=1;
				return;
			}

//			console.log("  " + res.req._headers.host + " -> " + res.statusCode);
			var decoder = new StringDecoder('utf8');
			res.on("data", function(chunk) {

//				var host = this.req._headers.host;
				var textChunk = this.req._headers.host + " " + decoder.write(chunk);
				if (textChunk.match(/(^.+ \/.*)|(code="500")/)) {
//					console.log();
					process.stdout.write(textChunk);
				}
			});

			lock -= 1;
		};

		var createPackage = function() {
			var zip = new AdmZip();
			zip.addLocalFolder(__dirname + "/package_content");
			return {zip: zip, filters: "" };
		};

		var installPackage = function(pack) {
			// Add filters.
			pack.filters = '<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\nFILTERS</workspaceFilter>'.replace(/FILTERS/g, pack.filters);
			pack.zip.addFile("META-INF/vault/filter.xml", new Buffer(pack.filters));

			// TODO: Make in-memory zip.
//			var zipPath = os.tmpdir() + "/aemsync.zip";
			var zipPath = __dirname + "/aemsync.zip";
			pack.zip.writeZip(zipPath);
			sendForm(zipPath);
		};

		var getZipPath = function(filePath) {
			return filePath.replace(/.*\/(jcr_root\/.*)/, "$1");
		};

		var getFilterPath = function(filePath) {
			return filePath.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, "").replace(/\.content$/g, "jcr:content");
		};

		var getDirFilePath = function(filePath) {
			var dataFilePath = filePath.replace(/\.dir.*/, "");
			if (filePath !== dataFilePath && fs.existsSync(dataFilePath)) {
				return dataFilePath;
			}
			return null;
		};

		var getDirFolderPath = function(filePath) {
			var dirPath = filePath + ".dir";
			if (fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()) {
				return dirPath;
			}
			return null;
		};

		this.process = function() {
			var i, list = [];

			// Lock.
			if (lock > 0 || queue.length === 0) {
				return;
			}
//			lock = targets.length;

			// Enqueue items.
			while((i = queue.pop())) {
				list.push(i);
			}

			// Remove duplicates.
			list = list.filter(function(elem, pos, self) {
				return self.indexOf(elem) == pos;
			});

			var pack = createPackage();

			for (i=0; i<list.length; ++i) {
				var filePath = list[i];
				var filterFilePath = getFilterPath(filePath);
				var isDelete = !fs.existsSync(filePath);
//				var isDir = filePath.indexOf(".dir/") != -1;
				var isDotContent = filePath.indexOf("/.content.xml") != -1;
				var dirFilePath = getDirFilePath(filePath); // Corresponding file for ".dir".
				var dirFolderPath = getDirFolderPath(filePath);

				if (isDelete) {
					console.log("delete");
					// Remove .content.xml
					if (isDotContent) {
//						zip.addLocalFolder(dirPath, path.

					// Remove everything except .content.xml.
					} else {
						console.log("Delete: ", filterFilePath);
						pack.filters += '<filter root="FILE" />\n'.replace(/FILE/g, filterFilePath);
					}
				}

				// Add file to zip if exists and if a file.
				else if (fs.lstatSync(filePath).isFile()) {
//					console.log("Update: ", filterFilePath);
					pack.zip.addLocalFile(filePath, path.dirname(getZipPath(filePath)));
					var filter = '<filter root="PARENT"><exclude pattern="PARENT/.*" /><include pattern="ITEM" /></filter>\n';
					pack.filters += filter.replace(/PARENT/g, path.dirname(filterFilePath)).replace(/ITEM/g, filterFilePath);

					// Add data file.
					if (dirFilePath) {
						pack.zip.addLocalFile(dirFilePath, path.dirname(getZipPath(dirFilePath)));
					}

					// Add ".dir" folder.
					if (dirFolderPath) {
						pack.zip.addLocalFolder(dirFolderPath, getZipPath(dirFolderPath));
					}
				}

			}

//			console.log(pack.filters);
			installPackage(pack);
		};



		setInterval(this.process, syncerInterval);
	}

	function Watcher(pathToWatch, queue) {
		if (!fs.existsSync(pathToWatch)) {
			console.error("Invalid path: " + pathToWatch);
			return;
		}

		console.log("Watching: " + pathToWatch + ". Update interval: " + syncerInterval + " ms.");
		watch(pathToWatch, function(localPath) {
			// Use slashes only.
			localPath = localPath.replace("/\\/g", "/");

			// Path must contain "jcr_root" outside hidden folder and must have at least one node after jcr_root.
			if (/^((?!\/\.).)*\/jcr_root\/[^\/]*\/.*$/.test(localPath)) {
				queue.push(localPath);
			}
		});
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
