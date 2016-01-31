'use strict';

const archiver = require('archiver'); // TODO: consider using zip-stream for less dependencies.
const fs = require('graceful-fs');
const path = require('path');
const log = require('./log.js');

const DEFAULT_ZIP_NAME = 'aemsync.zip';

class Zip {
	constructor(zipPath) {
		// TODO:  path.join(os.tmpdir(), DEFAULT_ZIP_NAME);
		this.path = path.join(__dirname, '..', DEFAULT_ZIP_NAME);
		this.zip = archiver('zip');

		log.debug('Creating archive:', this.path);
		this.output = fs.createWriteStream(this.path);
		this.zip.pipe(this.output);
	}

	addLocalFile(localPath, zipPath) {
		// Normalize slashes.
		zipPath = zipPath.replace(/\\/g, '/');
		
		// Only files can be zipped.
		if (!fs.statSync(localPath).isFile()) {
      return;
    }

		log.debug('Zipping:', zipPath);
		this.zip.append(fs.createReadStream(localPath), {
			name: zipPath
		});
	}

	addLocalDirectory(localPath, zipPath, callback) {
		if (!fs.statSync(localPath).isDirectory()) {
			return;
		}

		var items = this.walkSync(localPath);
		for (var i = 0; i < items.length; ++i) {
			var subLocalPath = items[i];
			var subZipPath = zipPath + subLocalPath.substr(localPath.length + 1);
			 this.addLocalFile(subLocalPath, subZipPath);
			 callback && callback(subLocalPath, subZipPath);
		}
	}

	addFile(content, zipPath) {
		log.debug('Zipping:', zipPath);
		this.zip.append(content, {
			name: zipPath
		});
	}

	/** Recursively walks over directory. */
	walkSync(localPath, returnCallback) {
		localPath = path.resolve(localPath);

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
	  var that = this;
		var children = fs.readdirSync(localPath);

	  for (var i = 0; i < children.length; ++i) {
	    var child = path.resolve(localPath, children[i]);
	    results = results.concat(this.walkSync(child, returnCallback));
	  }

		return results;
	}

	save(callback) {
		var that = this;
		this.output.on('close', function () {
			callback(that.path);
		});
		this.zip.finalize(); // Trigers the above.
	}
}

module.exports.Zip = Zip
