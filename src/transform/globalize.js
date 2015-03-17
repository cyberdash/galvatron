'use strict';

var convert = require('convert-source-map');
var crypto = require('crypto');
var path = require('path');

var prefix = '__';
var regexUseStrict = /\n*\s*['"]use strict['"];?\s*/gm;

function hash (str) {
  var cryp = crypto.createHash('md5');
  cryp.update(str);
  return cryp.digest('hex');
}

function generateModuleName (file) {
  return prefix + hash(file);
}

function indent (code) {
  var amount = 2;
  var lines = code.split('\n');

  lines.forEach(function (line, index) {
    lines[index] = new Array(amount + 1).join(' ') + line;
  });

  return lines.join('\n');
}

function makePathRelative (file) {
  return path.relative(process.cwd(), file);
}

module.exports = function () {
  return function (data, info) {
    var sm = convert.fromSource(data);

    if (sm) {
      sm.setProperty('file', path.basename(info.path));
      data = convert.removeComments(data);
      console.log(sm);
    }

    info.imports.forEach(function (imp, index) {
      data = data.replace('require("' + imp + '")', generateModuleName(info.dependencies[index]));
    });

    data = data.replace(regexUseStrict, '');
    data = 'var module = { exports: {} };\nvar exports = module.exports;\n\n' + data;
    data = data + '\n\nreturn module.exports';
    data = indent(data);
    data = '(function () {\n' + data + '\n}).call(this);';
    data = generateModuleName(info.path) + ' = ' + data;
    data = '// ' + makePathRelative(info.path) + '\n' + data;

    return data;
  };
};
