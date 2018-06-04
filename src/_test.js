// 教程不在这里，看 roid.js
const roid = require('./roid')
const vm = require('vm')

const jsBundle = roid(process.argv[2])
vm.runInThisContext(jsBundle)
