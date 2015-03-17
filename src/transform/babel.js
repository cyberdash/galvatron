'use strict';

var babel = require('babel');
var extend = require('extend');

module.exports = function (options) {
  options = extend({
    sourceMap: 'inline'
  }, options);
  return function (data) {
    return babel.transform(data, options).code;
  };
};
