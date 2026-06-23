const pj = require('../package.json')
module.exports = {
  name: `${pj.name}`,
  namespace: `https://github.com/${pj.author}/monkey-${pj.name}`,
  match: [
    'https://*.cybozu.cn/k/*',
    'https://*.s.cybozu.cn/k/*',
    'https://*.cybozu.com/k/*',
    'https://*.s.cybozu.com/k/*',
    'http://localhost:8864/*',
  ],
  grant: ['GM_xmlhttpRequest', 'unsafeWindow'],
  connect: ['127.0.0.1', 'localhost'],
}
