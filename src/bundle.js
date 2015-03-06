'use strict';

var extend = require('extend');
var fs = require('fs');
var glob = require('./glob');
var mapStream = require('map-stream');
var minimatch = require('minimatch');
var vinylTransform = require('vinyl-transform');

function filesToPaths (files) {
  return files.map(function (file) {
    return file.path;
  });
}

function Bundle (events, fs, tracer, watcher, paths, options) {
  this._options = extend({
    common: false,
    joiner: '\n\n'
  }, options);
  this._events = events;
  this._fs = fs;
  this._tracer = tracer;
  this._watcher = watcher;
  this.files = glob(paths);
  this.init();
}

Bundle.prototype = {
  init: function () {
    var that = this;
    var traced = this._tracer.trace(this.files);
    var common = [];

    // Find duplicate files.
    var tracedDuplicates = traced.filter(function (value, index, self) {
      return self.indexOf(value) !== index;
    });

    // Find unique files.
    var tracedUniques = traced.filter(function (value, index, self) {
      return self.indexOf(value) === index;
    });

    // Ensure duplicate file dependencies are included and removed from unique.
    tracedDuplicates.forEach(function (duplicateFile) {
      that._tracer.trace(duplicateFile.path).forEach(function (duplicateFileDependency) {
        var indexInTracedDuplicates = common.indexOf(duplicateFileDependency);
        var indexInTracedUniques = tracedUniques.indexOf(duplicateFileDependency);

        if (indexInTracedDuplicates === -1) {
          common.push(duplicateFileDependency);
        }

        if (indexInTracedUniques !== -1) {
          tracedUniques.splice(indexInTracedUniques, 1);
        }
      });
    });

    this.all = filesToPaths(traced);
    this.common = filesToPaths(common);
    this.commonDestination = this._commonDestination();
    this.uncommon = filesToPaths(tracedUniques);

    return this;
  },

  destinations: function (file) {
    var that = this;
    var mainDestinations = [];

    if (this.common.indexOf(file) !== -1 && this.commonDestination) {
      return [this.commonDestination];
    }

    this.files.forEach(function (mainFile) {
      that._tracer.trace(mainFile).some(function (tracedFile) {
        if (file === tracedFile.path) {
          mainDestinations.push(mainFile);
          return true;
        }
      });
    });

    return mainDestinations;
  },

  generate: function (paths) {
    var that = this;
    var common = this.common;
    var files = this.files;
    var opts = this._options;
    var traced = [];

    glob(paths).forEach(function (file) {
      // Only allow files that are defined in the bundle.
      if (files.indexOf(file) === -1) {
        return;
      }

      that._events.emit('bundle.generate', file);

      // Prepend the common dependencies if our option matches the file.
      if (typeof opts.common === 'string' && minimatch(file, opts.common)) {
        traced = traced.concat(common);
      }

      // Trace each dependency and only add them to the common array if they
      // aren't in there so that there are no duplicates.
      that._tracer.trace(file).forEach(function (dependency) {
        if (common.indexOf(dependency.path) === -1) {
          traced.push(dependency.path);
        }
      });
    });

    return traced.map(function (file) {
      return that._fs.file(file).post;
    }).join(this._options.joiner);
  },

  stream: function () {
    var that = this;
    return vinylTransform(function (file) {
      return mapStream(function (data, next) {
        return next(null, that.generate(file));
      });
    });
  },

  watch: function () {
    return this._watcher.watch(this);
  },

  _commonDestination: function () {
    var common;
    var commonOpt = this._options.common;

    commonOpt && this.files.some(function (file) {
      return minimatch(file, commonOpt) && (common = file);
    });

    return common || (fs.existsSync(commonOpt) && commonOpt);
  }
};

module.exports = Bundle;
