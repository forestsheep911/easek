const pj = require('../package.json')
module.exports = {
  name: pj.name,
  namespace: pj.homepage,
  version: pj.version,
  description: pj.description,
  author: pj.author,
  copyright: pj.author,
  license: pj.license,
  match: [
    'https://*.cybozu.cn/k/*',
    'https://*.s.cybozu.cn/k/*',
    'https://*.cybozu.com/k/*',
    'https://*.s.cybozu.com/k/*',
  ],
  require: [],
  'run-at': 'document-idle',
  supportURL: pj.bugs.url,
  homepage: pj.homepage,
  grant: ['unsafeWindow'],
  icon: 'https://raw.githubusercontent.com/forestsheep911/easek/main/public/icon.png',
}
