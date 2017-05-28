var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var qs = require('querystring');
var url = require('url');

var failed = [];

module.exports = function(username) {
	var destDir = path.join('./', username);

	_mkdir(destDir, function(err) {
		if (err) {
			return console.error(err);
		}

		new Scraper(username).crawl();
	});
};

function Scraper(username) {
	this.username = username;
	this.baseUrl = url.format({
		protocol: 'http',
		host: 'instagram.com',
		pathname: path.join(username, 'media')
	});
}

Scraper.prototype.crawl = function(maxId) {
	var url = this.baseUrl + '?' + qs.stringify({
		max_id: maxId
	});

	return request.getAsync(url)
		.spread(function(resp, body) {
			var media = JSON.parse(body);

			media.items.forEach(this.download.bind(this));

			if (media.more_available) {
				console.log('Loading after ' + media.items[media.items.length - 1].id);
				setTimeout(() => {
					this.crawl(media.items[media.items.length - 1].id);
				}, 200); // Cooldown helps with request blocking!
			} else {
				if (failed.length > 0) {
					console.log('Re-trying failed downloads...');
					setTimeout(() => {
						failed.forEach(this.download.bind(this));
					}, 3000); // Cooldown helps with request blocking!
				} else {
					console.log('All done!');
				}
			}
		}.bind(this));
}

Scraper.prototype.download = function(item) {
	console.log(item.type)
	if (item.type === 'carousel') {
		var carouselItems = item['carousel_media'];
		carouselItems.forEach(this.getImage.bind(this))
	} else {
		this.getImage(item)
	}
}

Scraper.prototype.getImage = function(item) {
	var mediaUrl = item[item.type + 's'].standard_resolution.url
		.split('?')[0]
		.replace(/\/s\d{3,}x\d{3,}\//, '/') // get full size dimensions
    .replace(/\/c\d{1,}.\d{1,}.\d{1,}.\d{1,}\//, '/'); // get non-square image

	var filename = path.basename(mediaUrl);
	var localFile = path.join('./', this.username, filename);

	if (fs.existsSync(localFile)) return console.log('Skipping ' + filename);
	try {
		return request.getAsync(mediaUrl, {
				encoding: null
			}).spread(function(resp, body) {
				fs.writeFileAsync(localFile, body).then(function() {
					console.log('Downloaded ' + filename);
				});
			});
	} catch (ex) {
		console.log('Downloaded Failed ' + filename);
		failed.push(item);
	}
}

function _mkdir(path, mask, cb) {
	if (typeof mask == 'function') {
		cb = mask;
		mask = 0777;
	}

	fs.mkdir(path, mask, function(err) {
		if (err) {
			if (err.code == 'EEXIST') {
				cb(null); // ignore the error if the folder already exists
			} else {
				cb(err); // something else went wrong
			}
		} else {
			cb(null); // successfully created folder
		}
	});
}
