/**
 * 判断当前代码是否运行在 Tampermonkey userscript 环境中
 */
export const isTampermonkey = () => {
  let tampermonkey = true
  try {
    GM_info
  } catch (err) {
    tampermonkey = false
  }
  return tampermonkey
}
