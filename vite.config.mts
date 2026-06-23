import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

type MetaValue = string | string[]
type UserscriptMeta = Record<string, MetaValue>

const require = createRequire(import.meta.url)
const commonMeta = require('./config/common.meta.js') as UserscriptMeta
const devMeta = require('./config/dev.meta.js') as UserscriptMeta

const year = new Date().getFullYear().toString()
const projectRoot = __dirname
const srcRoot = path.resolve(projectRoot, 'src')
const devOutputDir = path.resolve(projectRoot, 'dist/dev')
const productionOutputDir = path.resolve(projectRoot, 'dist/store')
const devHost = '127.0.0.1'
const devPort = 8864

function renderUserscriptBanner(meta: UserscriptMeta): string {
  const mergedMeta = {
    ...commonMeta,
    ...meta,
  }

  const lines = Object.entries(mergedMeta).flatMap(([key, value]) => {
    const values = Array.isArray(value) ? value : [value]
    return values.map((item) => `// @${key.padEnd(20, ' ')}${String(item).replace(/\[year\]/g, year)}`)
  })

  return `// ==UserScript==\n${lines.join('\n')}\n// ==/UserScript==\n/* eslint-disable */ /* spell-checker: disable */\n// @[ You can find all source codes in GitHub repo ]`
}

function sendText(response: ServerResponse, text: string, contentType = 'text/plain; charset=utf-8') {
  response.statusCode = 200
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', contentType)
  response.end(text)
}

function sendNotFound(response: ServerResponse, message = 'Not found') {
  response.statusCode = 404
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end(message)
}

function renderDevLoader(scriptFileName: string): string {
  const devOrigin = `http://${devHost}:${devPort}`

  return `${renderUserscriptBanner(devMeta)}

;(function () {
  'use strict'

  var devOrigin = '${devOrigin}'
  var scriptUrl = devOrigin + '/dev/${scriptFileName}'
  var versionUrl = devOrigin + '/__userscript_version'
  var currentVersion = ''
  var reloadTimer = 0

  function requestText(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now(),
        headers: {
          'Cache-Control': 'no-cache',
        },
        onload: function (response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText)
            return
          }
          reject(new Error('Dev server responded with ' + response.status + ' for ' + url))
        },
        onerror: function () {
          reject(new Error('Cannot connect to userscript dev server: ' + url))
        },
      })
    })
  }

  function scheduleVersionCheck() {
    reloadTimer = window.setInterval(function () {
      requestText(versionUrl)
        .then(function (nextVersion) {
          if (currentVersion && nextVersion && nextVersion !== currentVersion) {
            window.clearInterval(reloadTimer)
            window.location.reload()
          }
        })
        .catch(function (error) {
          console.warn(error)
        })
    }, 1000)
  }

  Promise.all([requestText(versionUrl), requestText(scriptUrl)])
    .then(function (results) {
      currentVersion = results[0]
      new Function(results[1])()
      scheduleVersionCheck()
    })
    .catch(function (error) {
      console.error(error)
    })
})()
`
}

function userscriptBundlePlugin(loaderFileName: string, scriptFileName: string, isProduction: boolean): Plugin {
  const scriptPath = path.join(devOutputDir, scriptFileName)

  return {
    name: 'userscript-bundle',
    buildStart() {
      fs.mkdirSync(devOutputDir, { recursive: true })
      fs.writeFileSync(path.join(devOutputDir, loaderFileName), renderDevLoader(scriptFileName))
    },
    generateBundle(_, bundle) {
      const banner = renderUserscriptBanner(isProduction ? {} : devMeta)
      Object.values(bundle).forEach((item) => {
        if (item.type === 'chunk' && item.fileName.endsWith('.js')) {
          item.code = `${banner}\n${item.code}`
        }
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0]
        if (requestPath === `/${loaderFileName}` || requestPath === `/dev/${loaderFileName}`) {
          sendText(response, renderDevLoader(scriptFileName), 'text/javascript; charset=utf-8')
          return
        }

        if (requestPath === `/dev/${scriptFileName}`) {
          if (!fs.existsSync(scriptPath)) {
            sendNotFound(response, `Waiting for ${scriptFileName}. Keep pnpm dev running until the first build completes.`)
            return
          }
          sendText(response, fs.readFileSync(scriptPath, 'utf8'), 'text/javascript; charset=utf-8')
          return
        }

        if (requestPath === '/__userscript_version') {
          const version = fs.existsSync(scriptPath) ? String(fs.statSync(scriptPath).mtimeMs) : 'missing'
          sendText(response, version)
          return
        }

        if (requestPath !== '/dev') {
          next()
          return
        }

        sendText(response, `Install dev loader: http://${devHost}:${devPort}/dev/${loaderFileName}`)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const scriptName = String(commonMeta.name)
  const devScriptFileName = `${scriptName}.script.js`
  const loaderFileName = `${scriptName}.loader.user.js`
  const outputDir = isProduction ? productionOutputDir : devOutputDir
  const outputFileName = isProduction ? `${scriptName}.user.js` : devScriptFileName

  return {
    plugins: [userscriptBundlePlugin(loaderFileName, devScriptFileName, isProduction)],
    publicDir: false,
    resolve: {
      alias: {
        '@': srcRoot,
      },
    },
    define: {
      PRODUCTION: JSON.stringify(isProduction),
      FILENAME: JSON.stringify(`/dev/${loaderFileName}`),
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      open: true,
      cors: true,
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      minify: isProduction,
      sourcemap: !isProduction,
      target: 'es2017',
      lib: {
        entry: path.resolve(srcRoot, 'index.ts'),
        name: 'TampermonkeyApp',
        formats: ['iife'],
        fileName: () => outputFileName,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  }
})
