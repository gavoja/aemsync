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

	var HELP = "Usage: aemsync -t targets [-i interval] path_to_watch\nWebsite: https://github.com/gavoja/aemsync";

	var syncerInterval = 500;
	var queue = [];

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
			return filePath.replace(/(.*jcr_root)|(\.xml$)|(\.dir)/g, "").replace(/\.content$/g, "jcr:content").replace(/_cq_editConfig$/g, "cq:editConfig");
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

		var createPackage = function() {
			var zip = new AdmZip();
			zip.addLocalFolder(__dirname + "/data/package_content");
			return {zip: zip, filters: "" };
		};

		var installPackage = function(pack) {
			// Add filters.
			pack.filters = '<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\nFILTERS</workspaceFilter>'.replace(/FILTERS/g, pack.filters);
			pack.zip.addFile("META-INF/vault/filter.xml", new Buffer(pack.filters));

			// TODO: Make in-memory zip perhaps?
			var zipPath = os.tmpdir() + "/aemsync.zip";
//			var zipPath = __dirname + "/aemsync.zip";
			pack.zip.writeZip(zipPath);
			sendForm(zipPath);
		};

		// TODO: Simplify (https://github.com/gavoja/aemsync/issues/4)
		var addFileInPackage = function(pack, filePath) {
			var filterFilePath = getFilterPath(filePath);
			var dirfilePath = getDirFilePath(filePath);

			// Change done inside .dir and there is no corresponding file.
			var isDir = filePath.indexOf(".dir/") != -1;
			if (isDir && !dirfilePath) {
				return;
			}

			if (fs.lstatSync(filePath).isDirectory()) {
				pack.zip.addLocalFolder(filePath, getZipPath(filePath));
				pack.filters = '<filter root="ROOT"></filter>\n'.replace(/ROOT/g, filterFilePath);
			} else {
				pack.zip.addLocalFile(filePath, path.dirname(getZipPath(filePath)));
				var filter = '<filter root="PARENT"><exclude pattern="PARENT/.*" /><include pattern="ITEM" /><include pattern="ITEM/.*" /></filter>\n';
				pack.filters += filter.replace(/PARENT/g, path.dirname(filterFilePath)).replace(/ITEM/g, filterFilePath);
			}

			// Add data file.
			if (dirfilePath) {
				pack.zip.addLocalFile(dirfilePath, path.dirname(getZipPath(dirfilePath)));
			}

			// Add ".dir" folder.
			var dirfolderPath = getDirFolderPath(filePath);
			if (dirfolderPath) {
				pack.zip.addLocalFolder(dirfolderPath, getZipPath(dirfolderPath));
			}
		};

		// TODO: Simplify (https://github.com/gavoja/aemsync/issues/4)
		var deleteFileInPackage = function(pack, filePath) {
			var filterFilePath = getFilterPath(filePath);
			var dirfilePath = getDirFilePath(filePath);

			// Remove .content.xml
			var isDotContent = filePath.indexOf("/.content.xml") != -1;
			if (isDotContent) {
				var folderPath = path.dirname(filePath);
				if (dirfilePath) {
					pack.zip.addLocalFile(dirfilePath, path.dirname(getZipPath(dirfilePath)));
					pack.zip.addLocalFile(__dirname + "/data/nt_file/.content.xml" , getZipPath(folderPath));
				} else {
					pack.zip.addLocalFile(__dirname + "/data/nt_folder/.content.xml" , getZipPath(folderPath));
				}
				var filters = '<filter root="FILE"><exclude pattern="FILE/.*" /><include pattern="FILE/jcr:content" /></filter>\n';
				pack.filters += filters.replace(/FILE/g, path.dirname(filterFilePath));

			// Remove everything else.
			} else {
				console.log("Delete: ", filterFilePath);
				pack.filters += '<filter root="FILE" />\n'.replace(/FILE/g, filterFilePath);
			}
		};

		this.process = function() {
			var i, dict = {};

			// Enqueue items (dictionary takes care of duplicates).
			while((i = queue.pop())) {
				dict[i] = true;
			}

			if (Object.keys(dict).length === 0) {
				return;
			}

			var pack = createPackage();
			for (var filePath in dict) {
				if (!fs.existsSync(filePath)) {
					deleteFileInPackage(pack, filePath);
				} else {
					addFileInPackage(pack, filePath);
				}
			}
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
			// Include files on "jcr_root/xyz/..." path that's outside hidden or target folder.
			localPath = localPath.replace("/\\/g", "/");
			if (/^((?!(\/\.)|(\/target\/)).)*\/jcr_root\/[^\/]*\/.*$/.test(localPath)) {
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
