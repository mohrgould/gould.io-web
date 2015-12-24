var fs = require('fs');
var path = require('path');
var gm = require('gm');
var Promise = require('lie');
var ExifImage = require('exif').ExifImage;


var monthNames = [ 'January', 'February', 'March',
  'April', 'May', 'June',
  'July', 'August', 'September',
  'October', 'November', 'December' ];


function shotDate (exifDate) {
  var tmp = exifDate.split(' ');
  tmp[0] = tmp[0].split(':').join('-');
  var date = new Date(tmp[0] + 'T' + tmp[1]);
  return monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}


function shutterSpeed (seconds) {
  if (seconds === 1) {
    return '1 second';
  } else if (seconds >= 1) {
    return Math.round(seconds * 10) / 10 + ' seconds';
  } else {
    return '1/' + Math.round(1/seconds);
  }
}


function fetchSize (infile)  {
  return new Promise(function (resolve, reject) {
    gm(infile).size(function (err, size) {
      resolve(size);
    });
  });
}


function fetchEXIF (infile) {
  return new Promise(function (resolve, reject) {
    new ExifImage({image: infile }, function (err, data) {
      if (err) reject(err.message);
      resolve(data);
    });
  });

}


function makeDirIfNeeded(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, 0755);
}


var footerHTML = '<footer><a href="mailto:david@gould.io">david@gould.io</a></footer>';


module.exports = function makeGallery (targetDir, sourceDir, config) {
  makeDirIfNeeded(targetDir);
  fs.createReadStream(path.join(sourceDir, 'site.css')).pipe(fs.createWriteStream(path.join(targetDir, 'site.css')));

  function makeOriginalImage(galleryName, infile, n) {
    var outFile = path.join(targetDir, galleryName, 'original', n+'.jpg');
    return new Promise(function (resolve, reject) {
      fs.createReadStream(infile).pipe(fs.createWriteStream(outFile));
      resolve();
    });
  }

  function makeLargeImage(galleryName, infile, n) {
    var outFile = path.join(targetDir, galleryName, 'large', n+'.jpg');
    return new Promise(function (resolve, reject) {
      gm(infile)
        .quality(90)
        .resize(900, 900, '>')
        .write(outFile, function (err) {
          if (err) reject(err);
          fetchSize(outFile).then(function (size) {
            resolve(size);
          });
        });
    });
  }

  function makeMediumImage(galleryName, infile, n) {
    var outFile = path.join(targetDir, galleryName, 'medium', n+'.jpg');
    return new Promise(function (resolve, reject) {
      gm(infile)
        .quality(90)
        .gravity('Center')
        .resize(500, 500, '>')
        .write(outFile, function (err) {
          if (err) reject(err);
          fetchSize(outFile).then(function (size) {
            resolve(size);
          });
        });
    });
  }

  function makeSmallImage(galleryName, infile, n) {
    var outFile = path.join(targetDir, galleryName, 'small', n+'.jpg');
    return new Promise(function (resolve, reject) {
      gm(infile)
        .quality(90)
        .gravity('Center')
        .resize(200, 200, '^')
        .crop(150, 150, 0, 0)
        .write(outFile, function (err) {
          if (err) reject(err);
          resolve();
        });
    });
  }

  var frontHTML = '<!doctype html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>David Mohr Gould</title>' +
    '<link rel="stylesheet" href="/site.css">' +
    '</head>' +
    '<body>' +
    '<h2>David Mohr Gould</h2>';

  var galleryName, photo;
  var infile;

  for (galleryName in config.galleries) {
    makeDirIfNeeded(path.join(targetDir, galleryName));
    makeDirIfNeeded(path.join(targetDir, galleryName, 'large'));
    makeDirIfNeeded(path.join(targetDir, galleryName, 'medium'));
    makeDirIfNeeded(path.join(targetDir, galleryName, 'small'));
    makeDirIfNeeded(path.join(targetDir, galleryName, 'original'));

    for (photoIndex in config.galleries[galleryName].images) {
      infile = path.join(
        sourceDir,
        'images',
        config.galleries[galleryName].images[photoIndex].filename);

      var fetchPhotoData = (function (galleryName, filename, photo, n) {
        return new Promise(function (resolve, reject) {
          Promise.all([
            fetchSize(filename),
            fetchEXIF(filename),
            makeLargeImage(galleryName, filename, n),
            makeMediumImage(galleryName, filename, n),
            makeSmallImage(galleryName, filename, n),
            makeOriginalImage(galleryName, filename, n)
          ]).then(function (results) {
            var width = results[0].width;
            var height = results[0].height;

            resolve({
              galleryName: galleryName,
              photoIndex: n,
              title: photo.title,
              filename: filename,
              width: results[2].width,
              takenAt: shotDate(results[1].exif.DateTimeOriginal),
              height: results[2].height,
              shutterSpeed: shutterSpeed(results[1].exif.ExposureTime),
              fNumber: results[1].exif.FNumber
            });
          });
        });
      })(galleryName, infile, config.galleries[galleryName].images[photoIndex], photoIndex);

      fetchPhotoData.then(function (data) {
        var html = photoHTML(
          galleryName,
          config.galleries[data.galleryName].title,
          data,
          config.galleries[data.galleryName].images.length,
          config.googleAnalyticsTrackingId);

        var outFile = path.join(targetDir, data.galleryName, data.photoIndex + '.html');

        fs.writeFile(outFile, html);

        console.log(data.galleryName + ' #' + data.photoIndex);
      });
    }

    fs.writeFile(path.join(targetDir, galleryName, 'index.html'),
      galleryHTML(galleryName,
        config.galleries[galleryName].title,
        config.galleries[galleryName].images,
        config.tracking.googleAnalyticsTrackingId)
    );

    if (config.galleries[galleryName].publish === true) {
      frontHTML += '<div>' +
        '<a href="/' + galleryName + '/"> '+
        '<img src="' + imageURL(galleryName, "medium",
          config.galleries[galleryName].images.length - 1) + '">' +
        '</div>';
    }
  }

  frontHTML += '</body>' +
    footerHTML +
    '</html>';

  fs.writeFile(path.join(targetDir, 'index.html'), frontHTML);
};


function photoSiteURL (galleryName, photoIndex) {
  return '/', galleryName, photoIndex + '.html';
}


function imageURL (galleryName, sizeName, photoIndex) {
  return path.join('/', galleryName, sizeName, photoIndex + '.jpg');
}


function googleAnalyticsTrackingHTML (trackingId) {
  var html = '<script>' +
    '(function(i,s,o,g,r,a,m){i["GoogleAnalyticsObject"]=r;i[r]=i[r]||function(){' +
    '(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o), ' +
    'm=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)' +
    '})(window,document,"script","//www.google-analytics.com/analytics.js","ga");' +
    'ga("create", "' + trackingId + '", "auto");' +
    'ga("send", "pageview");' +
    '</script>';

  return html;
}


function photoHTML (galleryName, galleryTitle, photoData, length, googleAnalyticsTrackingId) {
  var html = '<!doctype html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>David Mohr Gould ' + galleryTitle + ' - ' + photoData.title + '</title>' +
    '<link rel="stylesheet" href="/site.css">';

  if (googleAnalyticsTrackingId) {
    html += googleAnalyticsTrackingHTML(googleAnalyticsTrackingId);
  }

  var n = parseInt(photoData.photoIndex);

  html += '</head>' +
    '<body>' +
    '<h2><a href="/' + photoData.galleryName + '/">&#9664; ' + galleryTitle + '</a></h2>' +
    '<nav>' +
    (n>0 ? '<a href="' + (n-1) + '.html">previous</a>' : '<span class="disabled">previous</span>') +
    ' / ' +
    (n<length-1 ? '<a href="' + (n+1) + '.html">next</a>' : '<span class="disabled">next</span>') +
    '</nav>' +
    '<figure>' +
      '<a href="original/' + n + '.jpg">' +
      '<img width="' + photoData.width + '" height="' + photoData.height + '" ' +
        'src="' + imageURL(photoData.galleryName, 'large', n) + '">' +
      '</a>' +
      '<figurecaption>' +
      '<h3>' + photoData.title + '</h3>' +
      '<span>' +
        photoData.takenAt + ', ' +
        photoData.shutterSpeed +
        ' at f/' + photoData.fNumber +
      '</span>' +
      '</figurecaption>' +
    '</figure>' +
    '</body>' +
    '</html>';

  return html;
}


function galleryHTML (galleryName, galleryTitle, photos, googleAnalyticsTrackingId) {
  var html = '<!doctype html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>David Mohr Gould ' + galleryTitle + '</title>' +
    '<link rel="stylesheet" href="/site.css">';

  if (googleAnalyticsTrackingId) {
    html += googleAnalyticsTrackingHTML(googleAnalyticsTrackingId);
  }

  html += '</head>' +
    '<body>' +
    '<h2>' + galleryTitle + '</h2>';

  for (var i in photos) {
    html += '<span>' +
        '<a href="' + photoSiteURL(galleryName, i) + '">' +
          '<img width="150" height="150" src="' + imageURL(galleryName, 'small', i) + '">' +
        '</a>' +
      '</span>';
  }

  html += '<h4><a href="/">David Mohr Gould</a></h3>' +
    '</body>' +
    '</html>';

  return html;
}
