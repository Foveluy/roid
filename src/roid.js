const { readFileSync, writeFileSync } = require('fs')
const path = require('path')
const traverse = require('babel-traverse').default
const { transformFromAst, transform } = require('babel-core')

// 全局的自增 id
// 记录每一个载入的模块的 id，我们将所有的模块都用唯一标识符进行标示
// 因此自增 id 是最有效也是最直观的，有多少个模块，一统计就出来了
let ID = 0

// 当前用户的操作的目录
const currentPath = process.cwd()

// 首先，我们对每一个文件进行处理。因为这只是一个简单版本的 bundler
// 因此，我们并不考虑如何去解析 css、md、txt 等等之类的格式，我们专心处理好 js 文件的打包
// 因为对于其他文件而言，处理起来过程不太一样，用文件后缀很容易将他们区分进行不同的处理
// 在这个版本，我们还是专注 js
function parseDependecies(filename) {
  // 函数注入一个 filename 顾名思义，就是文件名，读取其的文件文本内容
  const rawCode = readFileSync(filename, 'utf-8')

  // 首先，我们使用 babel 的 transform 方法去转换我们的原始代码
  // 通过转换以后，我们的代码变成了抽象语法树（ AST ），你可以通过 https://astexplorer.net/
  // 这个可视化的网站，看看 AST 生成的是什么
  const ast = transform(rawCode).ast

  // 当我们解析完以后，我们就可以提取当前文件中的 dependencies
  // dependencies 翻译为依赖，也就是我们文件中所有的 `import xxxx from xxxx`
  // 我们将这些依赖都放在 dependencies 的数组里面，之后统一进行导出
  const dependencies = []

  // traverse 函数是一个遍历 AST 的方法，由 babel-traverse 提供
  // 他的遍历模式是经典的 visitor 模式
  // visitor 模式就是定义一系列的 visitor ，当碰到 AST 的 type === visitor 名字时
  // 就会进入这个 visitor 的函数
  traverse(ast, {
    // 类型为 `ImportDeclaration` 的 AST 节点，其实就是我们的 `import xxx from xxxx`
    ImportDeclaration(path) {
      // 其中 path.node.source.value 的值，就是我们 import from xxxx 中的地址
      const sourcePath = path.node.source.value
      //将地址 push 到 dependencies 中
      dependencies.push(sourcePath)
    }
  })

  // 当我们完成依赖的收集以后，我们就可以把我们的代码从 AST 转换成 CommenJS 的代码
  // 这样子兼容性更高，更好
  const es5Code = transformFromAst(ast, null, {
    presets: ['env']
  }).code

  // 还记得我们的 webpack-loader 系统吗？
  // 具体实现就是在这里可以实现
  // 通过将文件名和代码都传入 loader 中，进行判断，甚至用户定义行为再进行转换
  // 就可以实现 loader 的机制，当然，我们在这里，就做一个弱智版的 loader 就可以了
  // parcel 在这里的优化技巧是很有意思的，在 webpack 中，我们每一个 loader 之间传递的是转换好的代码
  // 而不是 AST，那么我们必须要在每一个 loader 进行 code -> AST 的转换，这样时非常耗时的
  // parcel 的做法其实就是将 AST 直接传递，而不是转换好的代码，这样，速度就快起来了
  const customCode = loader(filename, es5Code)

  // 最后模块导出
  // 不要忘记了，每导出一个文件模块，我们都往全局自增 id 中 + 1，以保证每一个文件模块的唯一性
  return {
    id: ID++,
    code: customCode,
    dependencies,
    filename
  }
}

// 接下来，我们对模块进行更高级的处理。
// 我们之前已经写了一个 parseDependecies 函数，那么现在我们要来写一个 parseGraph 函数
// 我们将所有文件模块组成的集合叫做 graph ，用于描述我们这个项目的所有的依赖关系
// parseGraph 从 entry （入口） 出发，一直手机完所有的以来文件为止
function parseGraph(entry) {
  // 从 entry 出发，首先收集 entry 文件的依赖
  const entryAsset = parseDependecies(path.resolve(currentPath, entry))

  // graph 其实是一个数组，我们将最开始的入口模块放在最开头
  const graph = [entryAsset]

  // 在这里我们使用 for of 循环而不是 foreach ，原因是因为我们在循环之中会不断的向 graph 中
  // push 进东西，graph 会不断增加，用 for of 会一直持续这个循环直到 graph 不会再被推进去东西
  // 这就意味着，所有的依赖已经解析完毕，graph 数组数量不会继续增加
  // 但是用 foreach 是不行的，只会遍历一次
  for (const asset of graph) {
    // asset 代表解析好的模块，里面有 filename,code,dependencies 等东西
    // asset.idMapping 是一个不太好理解的概念
    // 我们每一个文件都会进行 import 操作，import 操作在之后会被转换成 require
    // 每一个文件中的 require 的 path 其实会对应一个数字自增 id
    // 这个自增 id 其实就是我们一开始的时候设置的 id
    // 我们通过将 path-id 利用键值对，对应起来，之后我们在文件中 require 就能够轻松的找到文件的代码
    // 解释这么啰嗦的原因是往往模块之间的引用是错中复杂的，这恰巧是这个概念难以解释的原因
    if (!asset.idMapping) asset.idMapping = {}

    // 获取 asset 中文件对应的文件夹
    const dir = path.dirname(asset.filename)

    // 每个文件都会被 parse 出一个 dependencise，他是一个数组，在之前的函数中已经讲到
    // 因此，我们要遍历这个数组，将有用的信息全部取出来
    // 值得关注的是 asset.idMapping[dependencyPath] = denpendencyAsset.id 操作
    // 我们往下看
    asset.dependencies.forEach(dependencyPath => {
      // 获取文件中模块的绝对路径，比如 import ABC from './world'
      // 会转换成 /User/xxxx/desktop/xproject/world 这样的形式
      const absolutePath = path.resolve(dir, dependencyPath)

      // 解析这些依赖
      const denpendencyAsset = parseDependecies(absolutePath)

      // 获取唯一 id
      const id = denpendencyAsset.id

      // 这里是重要的点了，我们解析每解析一个模块，我们就将他记录在这个文件模块 asset 下的 idMapping 中
      // 之后我们 require 的时候，能够通过这个 id 值，找到这个模块对应的代码，并进行运行
      asset.idMapping[dependencyPath] = denpendencyAsset.id

      // 将解析的模块推入 graph 中去
      graph.push(denpendencyAsset)
    })
  }

  // 返回这个 graph
  return graph
}

// 我们完成了 graph 的收集，那么就到我们真正的代码打包了
// 这个函数使用了大量的字符串处理，你们不要觉得奇怪，为什么代码和字符串可以混起来写
// 如果你跳出写代码的范畴，看我们的代码，实际上，代码就是字符串，只不过他通过特殊的语言形式组织起来而已
// 对于脚本语言 JS 来说，字符串拼接成代码，然后跑起来，这种操作在前端非常的常见
// 我认为，这种思维的转换，是拥有自动化、工程化的第一步
function build(graph) {
  // 我们的 modules 就是一个字符串
  let modules = ''

  // 我们将 graph 中所有的 asset 取出来，然后使用 node.js 制造模块的方法来将一份代码包起来
  // 我之前做过一个《庖丁解牛：教你如何实现》node.js 模块的文章，不懂的可以去看看
  // https://zhuanlan.zhihu.com/p/34974579
  //
  // 在这里简单讲述，我们将转换好的源码，放进一个 function(require,module,exports){} 函数中
  // 这个函数的参数就是我们随处可用的 require，module,以及 exports
  // 这就是为什么我们可以随处使用这三个玩意的原因，因为我们每一个文件的代码终将被这样一个函数包裹起来
  //
  // 不过这段代码中比较奇怪的是，我们将代码封装成了 `1:[...],2:[...]`的形式
  // 我们在最后导入模块的时候，会为这个字符串加上一个 {}
  // 变成 {1:[...],2:[...]}，你没看错，这是一个对象，这个对象里用数字作为 key
  // 一个二维元组作为值，
  // [0] 第一个就是我们被包裹的代码
  // [1] 第二个就是我们的 mapping
  graph.forEach(asset => {
    modules += `${asset.id}:[
            function(require,module,exports){${asset.code}},
            ${JSON.stringify(asset.idMapping)},
        ],`
  })

  // 马上要见到曙光了
  // 这一段代码实际上才是模块引入的核心逻辑
  // 我们制造一个顶层的 require 函数，这个函数接收一个 id 作为值，并且返回一个全新的 module 对象
  // 我们倒入我们刚刚制作好的模块，给他加上 {}，使其成为 {1:[...],2:[...]} 这样一个完整的形式
  // 然后塞入我们的立即执行函数中(function(modules) {...})()
  // 在 (function(modules) {...})() 中，我们先调用 require(0)
  // 理由很简单，因为我们的主模块永远是排在第一位的
  // 紧接着，在我们的 require 函数中，我们拿到外部传进来的 modules，利用我们一直在说的全局数字 id 获取我们的模块
  // 每个模块获取出来的就是一个二维元组
  // 然后，我们要制造一个 `子require`
  // 这么做的原因是我们在文件中使用 require 时，我们一般 require 的是地址，而顶层的 require 函数参数时 id
  // 不要担心，我们之前的 idMapping 在这里就用上了，通过用户 require 进来的地址，在 idMapping 中找到 id
  // 然后递归调用 require(id)，就能够实现模块的自动倒入了
  // 接下来制造一个 const newModule = {exports: {}};
  // 运行我们的函数 fn(childRequire, newModule, newModule.exports);，将应该丢进去的丢进去
  // 最后 return newModule.exports 这个模块的 exports 对象
  const wrap = `
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
  })({${modules}});` // 注意这里需要给 modules 加上一个 {}
  return wrap
}

// 这是一个 loader 的最简单实现
function loader(filename, code) {
  if (/index/.test(filename)) {
    console.log('这里是 loader ')
  }
  return code
}

// 最后我们导出我们的 bundler
module.exports = entry => {
  const graph = parseGraph(entry)
  const bundle = build(graph)
  return bundle
}
