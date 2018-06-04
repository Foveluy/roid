
  (function(modules) {
    function require(id) {
      const [fn, idMapping] = modules[id];
      function childRequire(filename) {
        return require(idMapping[filename]);
      }
      const newModule = {exports: {}};
      fn(childRequire, newModule, newModule.exports);
      return newModule.exports
    }
    require(0);
  })({0:[
            function(require,module,exports){"use strict";

var _message = require("./message.js");

var _message2 = _interopRequireDefault(_message);

var _name = require("./name.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

console.log((0, _message2.default)());
console.log(_name.name);},
            {"./message.js":1,"./name.js":2},
        ],1:[
            function(require,module,exports){"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _name = require("./name.js");

exports.default = function () {
  return "hello " + _name.name + "!";
};},
            {"./name.js":3},
        ],2:[
            function(require,module,exports){"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var name = exports.name = 'world';},
            {},
        ],3:[
            function(require,module,exports){"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var name = exports.name = 'world';},
            {},
        ],});