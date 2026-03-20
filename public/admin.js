// Cursor2API Admin Panel JS

// ===== Theme =====
function getTheme(){return document.documentElement.getAttribute('data-theme')||'light'}
function applyThemeIcon(){const btn=document.getElementById('themeToggle');if(btn)btn.textContent=getTheme()==='dark'?'\u2600\ufe0f':'\ud83c\udf19'}
function toggleTheme(){const t=getTheme()==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('cursor2api_theme',t);applyThemeIcon()}
applyThemeIcon();

// ===== Auth =====
const urlToken=new URLSearchParams(window.location.search).get('token');
if(urlToken)localStorage.setItem('cursor2api_token',urlToken);
const authToken=localStorage.getItem('cursor2api_token')||'';
function authQ(base){return authToken?(base.includes('?')?base+'&token=':base+'?token=')+encodeURIComponent(authToken):base;}
function logout(){localStorage.removeItem('cursor2api_token');window.location.href='/login';}
// 动态更新导航链接（带 token 参数，使页面跳转时通过鉴权）
if(authToken){
  const lb=document.getElementById('logoutBtn');if(lb)lb.style.display='';
  // 日志页链接追加 token
  document.querySelectorAll('.hdr-nav .nav-btn').forEach(a=>{
    const href=a.getAttribute('href');
    if(href&&!href.includes('token='))a.href=href+'?token='+encodeURIComponent(authToken);
  });
}

// ===== Sidebar Nav =====
function navTo(id,btn){
  const content=document.getElementById('mainContent');
  const target=document.getElementById(id);
  if(content&&target){
    const offset=target.offsetTop-content.offsetTop;
    content.scrollTo({top:offset,behavior:'smooth'});
  }
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
}

// ===== Toast =====
let toastTimer=null;
function showToast(msg,type='ok'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+type;
  t.classList.add('show');
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{t.classList.remove('show')},3000);
}

// ===== Vision mode toggle =====
function onVisionModeChange(){
  const mode=document.getElementById('f-visionMode').value;
  const fields=document.getElementById('vision-api-fields');
  if(fields)fields.style.display=mode==='api'?'':'none';
}

// ===== Populate form from config object =====
function populateForm(cfg){
  // Basic
  setVal('f-port', cfg.port);
  setVal('f-timeout', cfg.timeout);
  setVal('f-proxy', cfg.proxy||'');

  // Auth
  setVal('f-authTokens', (cfg.authTokens||[]).join('\n'));
  if(!cfg.authTokens||cfg.authTokens.length===0){
    document.getElementById('noAuthWarn').style.display='';
  } else {
    document.getElementById('noAuthWarn').style.display='none';
  }

  // Model
  setVal('f-cursorModel', cfg.cursorModel||'');
  setVal('f-maxAutoContinue', cfg.maxAutoContinue??0);
  setVal('f-maxHistoryMessages', cfg.maxHistoryMessages??-1);

  // Thinking
  const thinkSel=document.getElementById('f-thinking');
  if(cfg.thinking===undefined||cfg.thinking===null){
    thinkSel.value='none';
  } else {
    thinkSel.value=cfg.thinking.enabled?'true':'false';
  }

  // Compression
  const comp=cfg.compression||{};
  setChk('f-compressionEnabled', comp.enabled===true);
  setVal('f-compressionLevel', comp.level||1);
  setVal('f-compressionKeepRecent', comp.keepRecent??10);
  setVal('f-compressionEarlyChars', comp.earlyMsgMaxChars??4000);

  // Tools
  const tools=cfg.tools||{};
  setVal('f-toolsSchema', tools.schemaMode||'full');
  setVal('f-toolsDescLen', tools.descriptionMaxLength??0);
  setVal('f-toolsInclude', (tools.includeOnly||[]).join('\n'));
  setVal('f-toolsExclude', (tools.exclude||[]).join('\n'));
  setChk('f-toolsPassthrough', tools.passthrough===true);
  setChk('f-toolsDisabled', tools.disabled===true);

  // Vision
  const vis=cfg.vision||{};
  setChk('f-visionEnabled', vis.enabled!==false);
  setVal('f-visionMode', vis.mode||'ocr');
  setVal('f-visionBaseUrl', vis.baseUrl||'');
  setVal('f-visionModel', vis.model||'');
  setVal('f-visionApiKey', vis.apiKey||'');
  setVal('f-visionProxy', vis.proxy||'');
  onVisionModeChange();

  // Logging
  const log=cfg.logging||{};
  setChk('f-loggingEnabled', log.file_enabled===true);
  setVal('f-loggingDir', log.dir||'./logs');
  setVal('f-loggingMaxDays', log.max_days??7);

  // Fingerprint
  setVal('f-userAgent', cfg.fingerprint?.userAgent||'');

  // Sanitize
  setChk('f-sanitizeEnabled', cfg.sanitizeEnabled===true);
  setVal('f-refusalPatterns', (cfg.refusalPatterns||[]).join('\n'));
}

function setVal(id,val){
  const el=document.getElementById(id);
  if(el)el.value=val??'';
}
function setChk(id,val){
  const el=document.getElementById(id);
  if(el)el.checked=!!val;
}
function getVal(id){const el=document.getElementById(id);return el?el.value.trim():''}
function getNum(id,def=0){const v=parseFloat(getVal(id));return isNaN(v)?def:v;}
function getChk(id){const el=document.getElementById(id);return el?el.checked:false;}
function getLines(id){return getVal(id).split('\n').map(s=>s.trim()).filter(Boolean);}

// ===== Build config from form =====
function buildConfig(){
  const cfg={};

  // Basic
  cfg.port=getNum('f-port',3010);
  cfg.timeout=getNum('f-timeout',120);
  const proxy=getVal('f-proxy');
  cfg.proxy=proxy||null; // null = clear

  // Auth
  const tokens=getLines('f-authTokens');
  cfg.authTokens=tokens.length?tokens:null; // null = clear

  // Model
  cfg.cursorModel=getVal('f-cursorModel')||'anthropic/claude-sonnet-4.6';
  cfg.maxAutoContinue=getNum('f-maxAutoContinue',0);
  cfg.maxHistoryMessages=getNum('f-maxHistoryMessages',-1);

  // Thinking
  const thinkVal=document.getElementById('f-thinking').value;
  if(thinkVal==='none'){
    cfg.thinking=null; // clear
  } else {
    cfg.thinking={enabled:thinkVal==='true'};
  }

  // Compression
  cfg.compression={
    enabled:getChk('f-compressionEnabled'),
    level:parseInt(getVal('f-compressionLevel'))||1,
    keepRecent:getNum('f-compressionKeepRecent',10),
    earlyMsgMaxChars:getNum('f-compressionEarlyChars',4000),
  };

  // Tools
  const incl=getLines('f-toolsInclude');
  const excl=getLines('f-toolsExclude');
  cfg.tools={
    schemaMode:getVal('f-toolsSchema')||'full',
    descriptionMaxLength:getNum('f-toolsDescLen',0),
    includeOnly:incl.length?incl:undefined,
    exclude:excl.length?excl:undefined,
    passthrough:getChk('f-toolsPassthrough')||undefined,
    disabled:getChk('f-toolsDisabled')||undefined,
  };

  // Vision
  cfg.vision={
    enabled:getChk('f-visionEnabled'),
    mode:getVal('f-visionMode')||'ocr',
    baseUrl:getVal('f-visionBaseUrl')||'https://api.openai.com/v1/chat/completions',
    apiKey:getVal('f-visionApiKey')||'',
    model:getVal('f-visionModel')||'gpt-4o-mini',
    proxy:getVal('f-visionProxy')||undefined,
  };

  // Logging
  cfg.logging={
    file_enabled:getChk('f-loggingEnabled'),
    dir:getVal('f-loggingDir')||'./logs',
    max_days:getNum('f-loggingMaxDays',7),
  };

  // Fingerprint
  cfg.fingerprint={
    userAgent:getVal('f-userAgent')||'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  };

  // Sanitize
  cfg.sanitizeEnabled=getChk('f-sanitizeEnabled');
  const refusalLines=getLines('f-refusalPatterns');
  cfg.refusalPatterns=refusalLines.length?refusalLines:null;

  return cfg;
}

// ===== Save Config =====
async function saveConfig(){
  const btn=document.getElementById('saveBtn');
  const status=document.getElementById('saveStatus');
  btn.disabled=true;
  btn.textContent='保存中...';
  status.textContent='';
  status.className='save-status';
  try{
    const cfg=buildConfig();
    const r=await fetch(authQ('/api/config'),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(cfg),
    });
    if(r.status===401){localStorage.removeItem('cursor2api_token');window.location.href='/login';return;}
    const data=await r.json();
    if(data.success){
      showToast('配置已保存并立即生效','ok');
      status.textContent='\u2713 已保存 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
      status.className='save-status ok';
      // 重新填充（可能后端做了规整）
      if(data.config)populateForm(data.config);
    } else {
      showToast('保存失败：'+(data.error||'未知错误'),'err');
      status.textContent='\u2717 保存失败';
      status.className='save-status err';
    }
  }catch(e){
    showToast('网络错误：'+e.message,'err');
    status.textContent='\u2717 网络错误';
    status.className='save-status err';
  }finally{
    btn.disabled=false;
    btn.textContent='\ud83d\udcbe 保存并立即生效';
  }
}

// ===== Reload Config =====
async function reloadConfig(){
  try{
    const r=await fetch(authQ('/api/config/reload'),{method:'POST'});
    if(r.status===401){localStorage.removeItem('cursor2api_token');window.location.href='/login';return;}
    const data=await r.json();
    if(data.success){
      populateForm(data.config);
      showToast('已从 config.yaml 重新加载配置','ok');
    } else {
      showToast('重载失败：'+(data.error||'未知错误'),'err');
    }
  }catch(e){
    showToast('网络错误：'+e.message,'err');
  }
}

// ===== Stats =====
function fmtNum(n){if(n===undefined||n===null)return'-';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return String(n);}
function fmtMs(ms){if(!ms)return'-';if(ms>=1000)return(ms/1000).toFixed(1)+'s';return ms+'ms';}
function fmtUptime(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+sec+'s';return sec+'s';}

async function loadStats(){
  try{
    const r=await fetch(authQ('/api/stats'));
    if(!r.ok)return;
    const s=await r.json();
    document.getElementById('st-total').textContent=fmtNum(s.totalRequests);
    document.getElementById('st-success').textContent=fmtNum(s.successCount);
    document.getElementById('st-error').textContent=fmtNum(s.errorCount);
    document.getElementById('st-today').textContent=fmtNum(s.todayCount);
    document.getElementById('st-7d').textContent=fmtNum(s.last7dCount);
    document.getElementById('st-30d').textContent=fmtNum(s.last30dCount);
    document.getElementById('st-chars').textContent=fmtNum(s.totalResponseChars);
    document.getElementById('st-thinking').textContent=fmtNum(s.totalThinkingChars);
    document.getElementById('st-tools').textContent=fmtNum(s.totalToolCalls);
    document.getElementById('st-avg').textContent=fmtMs(s.avgResponseTime);
    document.getElementById('st-ttft').textContent=fmtMs(s.avgTTFT);
    document.getElementById('st-retries').textContent=fmtNum((s.totalRetries||0)+(s.totalContinuations||0));
    const upEl=document.getElementById('statsUptime');
    if(upEl&&s.uptimeSeconds!==undefined)upEl.textContent='运行时长 '+fmtUptime(s.uptimeSeconds);
    const total=Math.max(s.totalRequests||1,1);
    const fmts=s.formatCounts||{};
    const fmtEl=document.getElementById('formatBars');
    if(fmtEl){
      fmtEl.innerHTML=[{key:'anthropic',label:'Anthropic'},{key:'openai',label:'OpenAI Chat'},{key:'responses',label:'Responses'}].map(({key,label})=>{
        const cnt=fmts[key]||0;const pct=Math.round(cnt/total*100);
        return '<div class="bar-row"><span class="bar-lbl">'+label+'</span><div class="bar-track"><div class="bar-fill '+key+'" style="width:'+pct+'%"></div></div><span class="bar-cnt">'+cnt+'</span></div>';
      }).join('');
    }
    const rateEl=document.getElementById('successRate');
    if(rateEl){
      const done=(s.successCount||0)+(s.errorCount||0);
      const pct=done>0?Math.round((s.successCount||0)/done*100):0;
      rateEl.innerHTML='<div class="rate-pct">'+pct+'%</div><div class="rate-bar-wrap"><div class="rate-track"><div class="rate-fill" style="width:'+pct+'%"></div></div></div><div class="rate-label">'+(s.successCount||0)+' 成功 / '+(s.errorCount||0)+' 失败，共 '+done+' 已完成</div>';
    }
  }catch(e){console.warn('统计加载失败',e);}
}

// ===== Init =====
async function init(){
  try{
    const [cfgR]=await Promise.all([fetch(authQ('/api/config')),loadStats()]);
    if(cfgR.status===401){localStorage.removeItem('cursor2api_token');window.location.href='/login';return;}
    const cfg=await cfgR.json();
    populateForm(cfg);
  }catch(e){
    showToast('加载配置失败：'+e.message,'err');
  }
}

// ===== Scroll spy for sidebar active state =====
const sections=['s-stats','s-basic','s-auth','s-model','s-thinking','s-compression','s-tools','s-vision','s-logging','s-fp'];
const content=document.getElementById('mainContent');
if(content){
  content.addEventListener('scroll',()=>{
    const scrollTop=content.scrollTop;
    let active=sections[0];
    sections.forEach(id=>{
      const el=document.getElementById(id);
      if(el&&el.offsetTop-content.offsetTop<=scrollTop+80)active=id;
    });
    document.querySelectorAll('.sb-item').forEach((btn,i)=>{
      btn.classList.toggle('active',sections[i]===active);
    });
  });
}

init();
