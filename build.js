"use strict";

var targetDir = __dirname + '/public';
var resourceDir = __dirname + '/resources';

var config = JSON.parse(require('fs').readFileSync(require('path').join(resourceDir, 'config.json'), 'utf8'));
require('./lib/makeGallery')(targetDir, resourceDir, config);

