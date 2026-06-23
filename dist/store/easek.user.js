// ==UserScript==
// @name                easek
// @namespace           https://github.com/forestsheep911/easek
// @version             0.0.1
// @description         Easek Tampermonkey userscript
// @author              forestsheep911
// @copyright           forestsheep911
// @license             MIT
// @match               https://*.cybozu.cn/k/*
// @match               https://*.s.cybozu.cn/k/*
// @match               https://*.cybozu.com/k/*
// @match               https://*.s.cybozu.com/k/*
// @run-at              document-idle
// @supportURL          https://github.com/forestsheep911/easek/issues
// @homepage            https://github.com/forestsheep911/easek
// @grant               unsafeWindow
// @icon                https://raw.githubusercontent.com/forestsheep911/easek/main/public/icon.png
// ==/UserScript==
/* eslint-disable */ /* spell-checker: disable */
// @[ You can find all source codes in GitHub repo ]
var re=Object.defineProperty,se=Object.defineProperties;var ae=Object.getOwnPropertyDescriptors;var q=Object.getOwnPropertySymbols;var ie=Object.prototype.hasOwnProperty,de=Object.prototype.propertyIsEnumerable;var v=(p,i,c)=>i in p?re(p,i,{enumerable:!0,configurable:!0,writable:!0,value:c}):p[i]=c,H=(p,i)=>{for(var c in i||(i={}))ie.call(i,c)&&v(p,c,i[c]);if(q)for(var c of q(i))de.call(i,c)&&v(p,c,i[c]);return p},C=(p,i)=>se(p,ae(i));(function(){"use strict";const p="#/ntf/mention",i="easek-mark-all-read",c="easek-mark-all-read-style",k="easek-dev-status",l="easek-mark-all-read-modal",z="[Easek]",S="easek-request-token-result",R="easekClickHandlerInstalled";let h="",M=null;const b=e=>typeof e=="object"&&e!==null,$=()=>{var a,f,u,y,O,U;const e=globalThis.unsafeWindow,t=(f=(a=e==null?void 0:e.kintone)==null?void 0:a.getRequestToken)==null?void 0:f.call(a);if(t)return t;const n=(y=(u=e==null?void 0:e.cybozu)==null?void 0:u.getRequestToken)==null?void 0:y.call(u);if(n)return n;const o=(U=(O=e==null?void 0:e.cybozu)==null?void 0:O.data)==null?void 0:U.REQUEST_TOKEN;if(o)return o;if(h)return h;const r=e==null?void 0:e.__REQUEST_TOKEN__;if(typeof r=="string")return r;const s=document.querySelector('input[name="__REQUEST_TOKEN__"]');if(s!=null&&s.value)return s.value;const m=Array.from(document.scripts);for(const ne of m){const E=(ne.textContent||"").match(/__REQUEST_TOKEN__["']?\s*[:=]\s*["']([^"']+)["']/);if(E!=null&&E[1])return E[1]}return""},P=e=>{if(typeof e!="string"||!e.includes("__REQUEST_TOKEN__"))return;const t=e.match(/"__REQUEST_TOKEN__"\s*:\s*"([^"]+)"/);t!=null&&t[1]&&(h=t[1],d("captured request token from fetch body"))},B=()=>{window.addEventListener("message",e=>{e.source!==window||!b(e.data)||e.data.type!==S||typeof e.data.token=="string"&&e.data.token&&(h=e.data.token,d("captured request token from page context"))})},I=()=>{const e=document.createElement("script");e.textContent=`
    ;(function () {
      function readToken() {
        var token =
          (window.kintone && typeof window.kintone.getRequestToken === 'function' && window.kintone.getRequestToken()) ||
          (window.cybozu && typeof window.cybozu.getRequestToken === 'function' && window.cybozu.getRequestToken()) ||
          (window.cybozu && window.cybozu.data && window.cybozu.data.REQUEST_TOKEN) ||
          window.__REQUEST_TOKEN__ ||
          ''

        window.postMessage({
          type: '${S}',
          token: token
        }, window.location.origin)
      }

      readToken()
      window.setTimeout(readToken, 300)
      window.setTimeout(readToken, 1000)
    })()
  `,document.documentElement.append(e),e.remove()},Q=async()=>{const e=$();if(e)return e;I();for(let t=0;t<20;t++){await new Promise(o=>window.setTimeout(o,100));const n=$();if(n)return n}return""},D=()=>{const e=globalThis.unsafeWindow;if(e)try{const t=e.fetch.bind(e);e.fetch=(n,o)=>(P(typeof(o==null?void 0:o.body)=="string"?o.body:void 0),t(n,o))}catch(t){d("failed to install fetch token capture",t)}},T=async(e,t)=>{d("posting kintone api",{path:e,body:Z(t)});const n=e.includes("?")?"&":"?",o=await fetch(`${location.origin}${e}${n}_ref=${encodeURIComponent(location.href)}`,{method:"POST",credentials:"include",headers:{accept:"*/*","content-type":"application/json"},body:JSON.stringify(t)});if(!o.ok)throw new Error(`Kintone API failed: ${e} ${o.status}`);return o.json()},w=(e,t=[],n="")=>{if(Array.isArray(e))return e.forEach(s=>w(s,t,n)),t;if(!b(e))return t;const o=typeof e.groupKey=="string"?e.groupKey:n,r=typeof e.baseId=="string"?e.baseId:typeof e.id=="string"&&o?e.id:typeof e.notificationId=="string"&&o?e.notificationId:"";return o&&r&&t.push({read:!0,groupKey:o,baseId:r}),Object.values(e).forEach(s=>w(s,t,o)),t},j=async e=>{var s,m;const t=await T("/k/api/ntf/list.json",{checkIgnoreMention:!0,readType:"UNREAD",mentioned:!0,checkNew:!1,__REQUEST_TOKEN__:e});d("raw unread list response",t);const n=((m=(s=t.result)==null?void 0:s.ntf)==null?void 0:m.filter(a=>a.read===!1&&a.mention!==!1&&a.id&&a.groupKey).map(a=>({read:!0,groupKey:a.groupKey,baseId:a.id})))||[];if(n.length>0)return n;const o=w(t),r=new Map;return o.forEach(a=>{r.set(`${a.groupKey}:${a.baseId}`,a)}),Array.from(r.values())},Y=async e=>{const t=await T("/k/api/ntf/countMention.json?_lc=zh",{__REQUEST_TOKEN__:e});return d("raw unread count response",t),!b(t)||!b(t.result)||!Array.isArray(t.result.items)?[]:t.result.items.filter(n=>typeof n=="string")},F=async(e,t)=>{d("mark read payload",{messages:e,__REQUEST_TOKEN__:A(t)}),await T("/k/api/ntf/mark.json",{messages:e,__REQUEST_TOKEN__:t})},G=async(e,t,n)=>{let o=0;for(let r=0;r<e.length;r+=1){const s=e.slice(r,r+1);n.setProgress(o,e.length,`标记进度 ${o}/${e.length}`),await F(s,t),o+=s.length,n.setProgress(o,e.length,`标记进度 ${o}/${e.length}`),o<e.length&&await V(600)}},g=(e,t,n)=>{e.textContent=t,e.disabled=n},V=e=>new Promise(t=>window.setTimeout(t,e)),d=(...e)=>{console.log(z,...e)},A=e=>e.length<=8?"***":`${e.slice(0,4)}...${e.slice(-4)}`,Z=e=>C(H({},e),{__REQUEST_TOKEN__:typeof e.__REQUEST_TOKEN__=="string"?A(e.__REQUEST_TOKEN__):e.__REQUEST_TOKEN__}),J=()=>location.hash.startsWith(p)||location.href.includes("/k/#/ntf/mention"),x=()=>{if(document.getElementById(c))return;const e=document.createElement("style");e.id=c,e.textContent=`
    #${i} {
      box-sizing: border-box;
      display: inline-block;
      height: 24px;
      margin-left: 8px;
      padding: 0 10px;
      border: 1px solid #c8d6df;
      border-radius: 3px;
      background: #ffffff;
      color: #333333;
      font: 12px/22px Arial, "Microsoft YaHei", sans-serif;
      cursor: pointer;
      vertical-align: middle;
      white-space: nowrap;
    }

    #${i}:hover {
      background: #f2f7fb;
      border-color: #8db4cf;
    }

    #${i}:disabled {
      cursor: default;
      opacity: 0.7;
    }

    #${i}.easek-floating {
      position: fixed;
      top: 84px;
      right: 16px;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
    }

    #${k} {
      position: fixed;
      top: 48px;
      right: 16px;
      z-index: 2147483647;
      padding: 6px 8px;
      border-radius: 3px;
      background: #fff8dc;
      border: 1px solid #d7b85b;
      color: #5c4600;
      font: 12px/1.4 Arial, "Microsoft YaHei", sans-serif;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    }

    #${l} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.28);
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }

    #${l} .easek-modal-panel {
      width: 360px;
      box-sizing: border-box;
      border: 1px solid #c8d6df;
      border-radius: 6px;
      background: #ffffff;
      color: #333333;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
      padding: 18px;
    }

    #${l} .easek-modal-title {
      margin: 0 0 10px;
      font-size: 15px;
      font-weight: 700;
    }

    #${l} .easek-modal-message {
      min-height: 44px;
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.6;
      text-align: left;
    }

    #${l} .easek-modal-progress {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #edf2f7;
      margin-bottom: 14px;
    }

    #${l} .easek-modal-progress-bar {
      width: 0%;
      height: 100%;
      background: #2f75b5;
      transition: width 0.2s ease;
    }

    #${l} .easek-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #${l} .easek-modal-button {
      min-width: 76px;
      height: 28px;
      border: 1px solid #c8d6df;
      border-radius: 4px;
      background: #ffffff;
      color: #333333;
      cursor: pointer;
    }

    #${l} .easek-modal-button-primary {
      border-color: #2f75b5;
      background: #2f75b5;
      color: #ffffff;
    }

    #${l} .easek-modal-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      border: 2px solid #d7e3ee;
      border-top-color: #2f75b5;
      border-radius: 50%;
      vertical-align: -2px;
      animation: easek-spin 0.8s linear infinite;
    }

    #${l} .easek-modal-progress-text {
      display: inline-block;
      min-width: 150px;
    }

    @keyframes easek-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,document.head.append(e)},X=e=>{if(!document.body)return;x();const t=document.getElementById(k);if(t){t.textContent=e;return}const n=document.createElement("div");n.id=k,n.textContent=e,document.body.append(n)},K=(e,t="")=>{var a;x(),(a=document.getElementById(l))==null||a.remove();const n=document.createElement("div");n.id=l,n.innerHTML=`
    <div class="easek-modal-panel" role="dialog" aria-modal="true">
      <p class="easek-modal-title">标记通知为已读</p>
      <p class="easek-modal-message">${e}</p>
      <div class="easek-modal-progress"><div class="easek-modal-progress-bar"></div></div>
      <div class="easek-modal-actions">${t}</div>
    </div>
  `,document.body.append(n);const o=n.querySelector(".easek-modal-message"),r=n.querySelector(".easek-modal-progress-bar"),s=n.querySelector(".easek-modal-actions");return n.addEventListener("click",f=>{const u=f.target;u instanceof HTMLElement&&u.dataset.action==="close"&&n.remove()}),{modal:n,controller:{close:()=>n.remove(),setBusy:f=>{o&&(o.innerHTML=`<span class="easek-modal-spinner"></span>${f}`),s&&(s.innerHTML="")},setProgress:(f,u,y)=>{o&&(o.innerHTML=`<span class="easek-modal-spinner"></span><span class="easek-modal-progress-text">${y||`标记进度 ${f}/${u}`}</span>`),r&&(r.style.width=`${u===0?0:Math.round(f/u*100)}%`)},setError:f=>{o&&(o.textContent=f),s&&(s.innerHTML='<button class="easek-modal-button easek-modal-button-primary" type="button" data-action="close">关闭</button>')}}}},W=e=>K(`<span class="easek-modal-spinner"></span>${e}`).controller,ee=e=>{const{modal:t,controller:n}=K(`发现 ${e} 条“与我相关”的未读通知。是否全部标记为已读？<br>确认后会按 600ms 间隔逐条提交，避免一次性请求过多。`,'<button class="easek-modal-button" type="button" data-action="cancel">取消</button><button class="easek-modal-button easek-modal-button-primary" type="button" data-action="start">全部标记为已读</button>'),o=new Promise(r=>{t.addEventListener("click",s=>{const m=s.target;if(!(m instanceof HTMLElement))return;const a=m.dataset.action;if(a==="start"){r(!0);return}(a==="cancel"||a==="close")&&(r(!1),t.remove())})});return{controller:n,waitForStart:o}},N=async e=>{d("mark-all-read clicked"),g(e,"准备中...",!0);const t=W("正在读取未读通知...");let n=t;const o=await Q();if(!o){g(e,"缺少 token",!1),t.setError("没有找到 __REQUEST_TOKEN__，无法调用 kintone 通知 API。");return}try{d("request token ready"),g(e,"读取中...",!0);let r=await j(o);if(d("unread messages loaded",{count:r.length,messages:r}),r.length===0&&(r=(await Y(o)).map(u=>({read:!0,baseId:u})),d("unread messages loaded from countMention fallback",{count:r.length,messages:r})),r.length===0){g(e,"没有未读",!1),t.setError("没有未读通知。"),window.setTimeout(()=>g(e,"全部已读",!1),1500);return}t.close();const{controller:s,waitForStart:m}=ee(r.length);if(n=s,!await m){g(e,"全部已读",!1);return}g(e,`标记 0/${r.length}`,!0),s.setProgress(0,r.length,`准备按 600ms 间隔标记 ${r.length} 条通知...`),await G(r,o,s),d("mark read api completed"),g(e,"已完成",!1),s.setProgress(r.length,r.length,`已完成，共标记 ${r.length} 条通知。页面即将刷新。`),window.setTimeout(()=>{s.close(),window.location.reload()},900)}catch(r){console.error(r),g(e,"失败，重试",!1),n.setError(r instanceof Error?r.message:"标记已读失败")}},te=()=>{const e=document.querySelector(".ocean-ntf-listheader-readfilter");if(e)return{target:e,position:"afterend",floating:!1,method:"readfilter"};const t=document.querySelector(".ocean-ntf-listheader-left");if(t)return{target:t,position:"beforeend",floating:!1,method:"listheader-left"};const n=document.querySelector(".ocean-ntf-listheader");return n?{target:n,position:"beforeend",floating:!1,method:"listheader"}:{target:document.body,position:"beforeend",floating:!0,method:"floating"}},_=()=>{if(!J()){X(`Easek loaded, waiting target page: ${location.hash||"(no hash)"}`);return}if(document.getElementById(i)){const o=document.getElementById(k);o==null||o.remove();return}if(!document.body)return;x();const e=te(),t=document.createElement("button");t.id=i,t.type="button",t.textContent="全部已读",t.title="把当前与我相关的未读通知标记为已读",e.floating&&t.classList.add("easek-floating"),t.addEventListener("click",o=>{o.preventDefault(),o.stopPropagation(),N(t)}),M=t,e.target.insertAdjacentElement(e.position,t);const n=document.getElementById(k);n==null||n.remove(),d(`mounted mark-all-read button by ${e.method}`,{hash:location.hash,href:location.href})},oe=()=>{const e=window;e[R]||(e[R]=!0,document.addEventListener("click",t=>{const n=t.target;if(!(n instanceof Element))return;const o=n.closest(`#${i}`);o&&(t.preventDefault(),t.stopPropagation(),N(M||o))},!0))},L=()=>{B(),D(),oe(),I(),d("loaded",{hash:location.hash,href:location.href,readyState:document.readyState,initialMountDelay:3e3}),window.setTimeout(()=>{d("initial delayed mount"),_()},3e3),window.setInterval(()=>{_()},1e3),new MutationObserver(()=>{_()}).observe(document.body,{childList:!0,subtree:!0}),window.addEventListener("hashchange",_)};(()=>{if(document.body){L();return}d("waiting for document.body",{readyState:document.readyState,href:location.href});const e=window.setInterval(()=>{document.body&&(window.clearInterval(e),L())},100)})()})();
