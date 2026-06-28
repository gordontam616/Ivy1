const _H="http"+"s://";

const BUS_STOPS = [
  { label:"天逸邨逸潭樓", keywords:["逸潭樓","天逸"], pin:"九巴 · 龍運 · 港鐵巴士",
    kmb:["265M","265B","276A","A37","E37","NA37"],
    mtrb:[{route:"K73",stop:"K73-U020"},{route:"K76",stop:"K76-U020"}] },
  { label:"天恒邨總站", keywords:["天恒邨總站","天恆邨總站","天恒","天恆"], mustEnd:true, pin:"九巴 · 港鐵巴士",
    kmb:["265M","276A","265B"],
    kmbDest:{ "265B":"旺角", "265M":"麗瑤", "276A":"上水" },
    mtrb:[{route:"K73",stop:"K73-U010",dest:"往 元朗"},{route:"K76",stop:"K76-U010",dest:"往 天水圍站"}] },
  { label:"天澤邨", keywords:["天澤"], pin:"九巴 · 城巴",
    kmb:["269M"],
    ctb:["967","967X"] },
];
const LRT_STATIONS = [
  { label:"天逸", id:550 },
];

const KMB = _H+"data.etabus.gov.hk/v1/transport/kmb";
const CTB = _H+"rt.data.gov.hk/v2/transport/citybus";
const MTRB = _H+"rt.data.gov.hk/v1/transport/mtr/bus/getSchedule";
const LRT = _H+"rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule";

const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
function nowStr(){const d=new Date(); return d.toLocaleTimeString("zh-HK",{hour:"2-digit",minute:"2-digit",hour12:false});}
function fetchJSON(u){return fetch(u,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});}
function minsFromNow(iso){ if(!iso) return null; const diff=(new Date(iso)-new Date())/60000; return diff; }
function clockOf(iso){ return iso? new Date(iso).toLocaleTimeString("zh-HK",{hour:"2-digit",minute:"2-digit",hour12:false}) : "--:--"; }
function etaText(mins){
  if(mins==null) return {cls:"none",html:'<span class="big none">—</span>'};
  const m=Math.round(mins);
  if(m<=0) return {cls:"now",html:'<span class="big now">到站</span>'};
  const cls = m<=3 ? "soon" : "";
  return {cls, html:`<span class="big ${cls}">${m}<span class="u">分</span></span>`};
}
function uniqByMin(items){
  const seen=new Set(); const out=[];
  for(const it of items){ const key=it.mins==null?"x":Math.round(it.mins); if(seen.has(key))continue; seen.add(key); out.push(it); }
  return out;
}
function renderEtaRow(body, route, routeCls, dest, d2html, items){
  const f=items[0];
  const et=etaText(f? f.mins : null);
  const row=el("div","row");
  row.innerHTML=`
    <div class="route ${routeCls||""}">${route}</div>
    <div class="dest"><div class="d1">${dest||"—"}</div><div class="d2">${d2html||""}</div></div>
    <div class="eta">${et.html}</div>
    <div class="chev">▶</div>`;
  const detail=el("div","detail");
  detail.innerHTML = items.slice(0,2).map((e,i)=>{
    const tt = e.mins==null? (e.text||"—") : (Math.round(e.mins)<=0?"到站":Math.round(e.mins)+" 分鐘");
    const sub = e.note ? (" · "+e.note) : (e.clock?(" · "+e.clock):"");
    return `<div class="line"><span>第 ${i+1} 班${sub}</span><span class="t">${tt}</span></div>` + (e.rmk?`<div class="line rmk"><span>${e.rmk}</span><span></span></div>`:"");
  }).join("") || '<div class="line"><span>暫無下一班資料</span><span></span></div>';
  row.addEventListener("click",()=> row.classList.toggle("open"));
  body.appendChild(row); body.appendChild(detail);
}

let STOP_CACHE = null;
async function loadStopList(){
  if(STOP_CACHE) return STOP_CACHE;
  try{
    const raw = localStorage.getItem("kmbStops");
    if(raw){ const o=JSON.parse(raw); if(Date.now()-o.t < 86400000){ STOP_CACHE=o.d; return STOP_CACHE; } }
  }catch(e){}
  const j = await fetchJSON(`${KMB}/stop`);
  STOP_CACHE = j.data;
  try{ localStorage.setItem("kmbStops", JSON.stringify({t:Date.now(), d:STOP_CACHE})); }catch(e){}
  return STOP_CACHE;
}
function findStops(cfg){
  const kws = cfg.keywords || [cfg.label];
  let list = STOP_CACHE.filter(s=> s.name_tc && kws.some(k=>s.name_tc.includes(k)));
  if(cfg.mustEnd){ const t = list.filter(s=> /總站|總$/.test(s.name_tc)); if(t.length) return t; }
  return list;
}

async function kmbEntries(cfg){
  const out=[];
  if(!STOP_CACHE) return out;
  const stops=findStops(cfg);
  if(!stops.length) return out;
  let etas=[];
  try{ const res=await Promise.all(stops.map(s=> fetchJSON(`${KMB}/stop-eta/${s.stop}`).then(j=>j.data).catch(()=>[]))); etas=res.flat(); }catch(e){}
  const set=cfg.kmb.map(r=>r.toUpperCase());
  etas=etas.filter(e=> set.includes((e.route||"").toUpperCase()) && e.eta);
  const groups={};
  for(const e of etas){ const k=`${e.route}|${e.dir}|${e.dest_tc}`; (groups[k]=groups[k]||[]).push(e); }
  for(const k of Object.keys(groups)){
    const arr=groups[k].sort((a,b)=>(a.eta_seq||0)-(b.eta_seq||0));
    const f=arr[0];
    if(cfg.kmbDest && cfg.kmbDest[(f.route||"").toUpperCase()] && !(f.dest_tc||"").includes(cfg.kmbDest[(f.route||"").toUpperCase()])) continue;
    const isLwb=["A37","E37","NA37"].includes((f.route||"").toUpperCase());
    out.push({ route:f.route, routeCls:isLwb?"lwbno":"kmbno", dest:f.dest_tc,
      d2html: f.rmk_tc?`<span class=amber>${f.rmk_tc}</span>`:(isLwb?"龍運":"九巴"),
      items: uniqByMin(arr.map(e=>({mins:minsFromNow(e.eta), clock:clockOf(e.eta), rmk:e.rmk_tc}))) });
  }
  return out;
}

let CTB_NAME={};
async function ctbStopName(id){
  if(CTB_NAME[id]!=null) return CTB_NAME[id];
  try{ const lc=localStorage.getItem("ctbn_"+id); if(lc){ CTB_NAME[id]=lc; return lc; } }catch(e){}
  let nm=""; try{ const j=await fetchJSON(`${CTB}/stop/${id}`); nm=(j.data&&j.data.name_tc)||""; }catch(e){}
  CTB_NAME[id]=nm; try{ localStorage.setItem("ctbn_"+id,nm); }catch(e){}
  return nm;
}
async function ctbEntries(route, kws){
  let stopId=null;
  for(const dir of ["inbound","outbound"]){
    let rs; try{ rs=await fetchJSON(`${CTB}/route-stop/CTB/${route}/${dir}`).then(j=>j.data); }catch(e){ continue; }
    for(const x of (rs||[])){ const nm=await ctbStopName(x.stop); if(kws.some(k=>nm.includes(k))){ stopId=x.stop; break; } }
    if(stopId) break;
  }
  if(!stopId) return [];
  let etas=[]; try{ etas=await fetchJSON(`${CTB}/eta/CTB/${stopId}/${route}`).then(j=>j.data); }catch(e){ return []; }
  etas=(etas||[]).filter(e=>e.eta);
  const groups={};
  for(const e of etas){ const k=`${e.route}|${e.dir}|${e.dest_tc}`; (groups[k]=groups[k]||[]).push(e); }
  return Object.keys(groups).map(k=>{
    const arr=groups[k].sort((a,b)=>(a.eta_seq||0)-(b.eta_seq||0));
    const f=arr[0];
    return { route:f.route, routeCls:"ctbno", dest:f.dest_tc,
      d2html: f.rmk_tc?`<span class=amber>${f.rmk_tc}</span>`:"城巴",
      items: uniqByMin(arr.map(e=>({mins:minsFromNow(e.eta), clock:clockOf(e.eta), rmk:e.rmk_tc}))) };
  });
}

async function mtrbEntry(route, stopId, destLabel){
  const base={ route, routeCls:"mtrno", dest: destLabel||"西鐵綫接駁巴士", d2html:"港鐵巴士", items:[] };
  let j; try{ j=await fetch(MTRB,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:"zh",routeName:route})}).then(r=>{if(!r.ok)throw 0;return r.json();}); }catch(e){ return base; }
  const bs=(j.busStop||[]).find(b=>b.busStopId===stopId);
  if(!bs||!bs.bus) return base;
  const items=(bs.bus||[]).map(b=>{
    let raw=(b.arrivalTimeInSecond && String(b.arrivalTimeInSecond)!=="108000")? b.arrivalTimeInSecond : b.departureTimeInSecond;
    let sec=parseInt(raw,10); if(isNaN(sec)||sec>=108000) return null;
    return { mins:sec/60, clock:new Date(Date.now()+sec*1000).toLocaleTimeString("zh-HK",{hour:"2-digit",minute:"2-digit",hour12:false}), rmk:"" };
  }).filter(Boolean).sort((a,b)=>a.mins-b.mins);
  base.items=items; return base;
}

async function buildEntries(cfg){
  let entries=[];
  const tasks=[];
  if(cfg.kmb && cfg.kmb.length) tasks.push(kmbEntries(cfg));
  for(const route of (cfg.ctb||[])) tasks.push(ctbEntries(route, cfg.keywords||[cfg.label]));
  for(const mb of (cfg.mtrb||[])) tasks.push(mtrbEntry(mb.route, mb.stop, mb.dest).then(x=>x?[x]:[]));
  const res=await Promise.all(tasks);
  res.forEach(r=>{ entries=entries.concat(r); });
  entries.sort((a,b)=> String(a.route).localeCompare(String(b.route),"en",{numeric:true}));
  return entries;
}

async function buildDefaultCard(cfg, wrap){
  const card=el("div","stop");
  const head=el("div","stop-h");
  head.appendChild(el("span","name",cfg.label));
  const allRoutes=[...(cfg.kmb||[]),...((cfg.mtrb||[]).map(x=>x.route)),...(cfg.ctb||[])];
  head.appendChild(el("span","tag","只顯示 "+allRoutes.join("/")));
  head.appendChild(el("span","pin",cfg.pin||"九巴 KMB"));
  card.appendChild(head);
  const body=el("div"); card.appendChild(body); wrap.appendChild(card);
  let entries=[]; try{ entries=await buildEntries(cfg); }catch(e){}
  if(!entries.length){ body.appendChild(el("div","empty","暫時無班次資料")); return 0; }
  entries.forEach(en=> renderEtaRow(body, en.route, en.routeCls, en.dest, en.d2html, en.items));
  return entries.length;
}

/* ===== 自訂巴士站 ===== */
let editingStopId=null;
function getUserStops(){ try{ return JSON.parse(localStorage.getItem("userStops")||"[]"); }catch(e){ return []; } }
function saveUserStops(a){ try{ localStorage.setItem("userStops", JSON.stringify(a)); }catch(e){} }
function persistUserStop(stop){
  const arr=getUserStops(); const i=arr.findIndex(s=>s.id===stop.id);
  if(i>=0) arr[i]=stop; else arr.push(stop); saveUserStops(arr);
}
function deleteStop(stop){
  saveUserStops(getUserStops().filter(s=> s.id!==stop.id));
  if(editingStopId===stop.id) editingStopId=null;
  renderBus();
}
function removeRoute(stop, r){
  stop.routes = stop.routes.filter(x=> !(x.route===r.route && x.co===r.co));
  persistUserStop(stop);
  if(stop.routes.length===0){
    if(confirm("「"+stop.label+"」已沒有任何路線，是否刪除這個巴士站？")){ deleteStop(stop); return; }
  }
  renderBus();
}
async function detectCo(route){
  for(const b of ["outbound","inbound"]){
    try{ const j=await fetchJSON(`${KMB}/route/${route}/${b}/1`); if(j && j.data && j.data.route) return "kmb"; }catch(e){}
  }
  try{ const j=await fetchJSON(`${CTB}/route/CTB/${route}`); if(j && j.data && j.data.route) return "ctb"; }catch(e){}
  return null;
}
function customCfg(stop){
  return {
    label: stop.label, keywords:[stop.label],
    kmb: stop.routes.filter(r=>r.co==="kmb").map(r=>r.route),
    ctb: stop.routes.filter(r=>r.co==="ctb").map(r=>r.route),
    mtrb: []
  };
}
function buildEditPanel(stop){
  const p=el("div","editbar");
  const chips=el("div","chips");
  if(!stop.routes.length) chips.appendChild(el("span","chipnote","尚未加入路線"));
  stop.routes.forEach(r=>{
    const c=el("span","chip "+(r.co==="ctb"?"cy":"cr"), r.route+' <b>✕</b>');
    c.querySelector("b").addEventListener("click",()=> removeRoute(stop,r));
    chips.appendChild(c);
  });
  p.appendChild(chips);
  const addrow=el("div","addrow");
  const inp=el("input","rin"); inp.type="text"; inp.placeholder="搜尋路線號，例如 265M / 967";
  const ab=el("button","addbtn","加入");
  addrow.appendChild(inp); addrow.appendChild(ab); p.appendChild(addrow);
  const msg=el("div","editmsg"); p.appendChild(msg);
  const del=el("button","delstop","🗑 刪除巴士站");
  del.addEventListener("click",()=>{ if(confirm("確定刪除「"+stop.label+"」？")) deleteStop(stop); });
  p.appendChild(del);
  ab.addEventListener("click", async()=>{
    const v=(inp.value||"").trim().toUpperCase();
    if(!v) return;
    if(stop.routes.some(r=>r.route.toUpperCase()===v)){ msg.textContent="路線已在列表內"; return; }
    msg.textContent="搜尋中…"; ab.disabled=true;
    const co=await detectCo(v); ab.disabled=false;
    if(!co){ msg.textContent="找不到路線 "+v+"（自訂站僅支援九巴 / 城巴）"; return; }
    stop.routes.push({co, route:v}); persistUserStop(stop); renderBus();
  });
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); ab.click(); } });
  return p;
}
async function buildUserCard(stop, wrap){
  const card=el("div","stop");
  const head=el("div","stop-h");
  head.appendChild(el("span","name",stop.label));
  head.appendChild(el("span","tag","自訂"));
  const editBtn=el("span","editbtn", editingStopId===stop.id?"完成":"編輯");
  head.appendChild(editBtn);
  card.appendChild(head);
  const body=el("div"); card.appendChild(body); wrap.appendChild(card);
  editBtn.addEventListener("click",()=>{ editingStopId = (editingStopId===stop.id)? null : stop.id; renderBus(); });
  if(editingStopId===stop.id) card.appendChild(buildEditPanel(stop));
  if(!stop.routes.length){ body.appendChild(el("div","empty","尚未加入路線 · 按右上「編輯」加入")); return; }
  let entries=[]; try{ entries=await buildEntries(customCfg(stop)); }catch(e){}
  if(!entries.length){ body.appendChild(el("div","empty","暫時無班次資料（請確認巴士站名稱）")); }
  else entries.forEach(en=> renderEtaRow(body, en.route, en.routeCls, en.dest, en.d2html, en.items));
}
function buildAddCard(wrap){
  const card=el("div","addcard");
  card.innerHTML='<div class="addinner"><span class="plus">＋</span><span>新增巴士站</span></div>';
  card.addEventListener("click",()=>{
    const name=(prompt("輸入巴士站名稱（例如：天悦邨 / 天秀路）")||"").trim();
    if(!name) return;
    const stop={ id:"u"+Date.now(), label:name, routes:[] };
    const arr=getUserStops(); arr.push(stop); saveUserStops(arr);
    editingStopId=stop.id; renderBus();
  });
  wrap.appendChild(card);
}

async function renderBus(){
  const wrap = $("#busStops");
  try{ await loadStopList(); }
  catch(e){ $("#busErr").innerHTML = '<div class="err">巴士站資料載入失敗，請檢查網絡後重試。</div>'; }
  $("#busErr").innerHTML=""; wrap.innerHTML=""; let total=0;
  for(const cfg of BUS_STOPS){ total += await buildDefaultCard(cfg, wrap); }
  for(const stop of getUserStops()){ await buildUserCard(stop, wrap); }
  buildAddCard(wrap);
  $("#busMeta").textContent = total+" 條路線";
}

function lrtMins(t){
  if(!t) return null;
  if(/即將|抵達|arriving/i.test(t)) return 0;
  const m = t.match(/(\d+)/);
  return m? parseInt(m[1],10): null;
}
async function renderLRT(){
  const wrap=$("#lrtStops"); wrap.innerHTML=""; let cnt=0;
  for(const st of LRT_STATIONS){
    const card=el("div","stop");
    const head=el("div","stop-h");
    head.appendChild(el("span","name",st.label+"站"));
    head.appendChild(el("span","pin","輕鐵 LR"));
    card.appendChild(head);
    const body=el("div"); card.appendChild(body); wrap.appendChild(card);
    let data=null;
    try{ data = await fetchJSON(`${LRT}?station_id=${st.id}`); }catch(e){}
    if(!data || data.status===0 || !data.platform_list){ body.appendChild(el("div","empty","暫時無班次資料（深夜時段可能停駛）")); continue; }
    const groups={};
    for(const p of data.platform_list){
      for(const r of (p.route_list||[])){
        if(!r.route_no) continue;
        const k=`${r.route_no}|${r.dest_ch}`;
        (groups[k]=groups[k]||[]).push({...r, plat:p.platform_id});
      }
    }
    let keys=Object.keys(groups);
    if(!keys.length){ body.appendChild(el("div","empty","暫時無班次資料")); continue; }
    keys.sort((a,b)=> a.split("|")[0].localeCompare(b.split("|")[0],"en",{numeric:true}));
    for(const k of keys){
      cnt++;
      const arr=groups[k]; const f=arr[0];
      const items=arr.slice(0,2).map(r=>{
        const mm=lrtMins(r.time_ch);
        return { mins: mm==null?null:mm, text: r.time_ch||"—", note:"月台 "+r.plat+" · "+(r.train_length||"?")+" 卡", rmk:"" };
      });
      renderEtaRow(body, f.route_no, "lrtno", "往 "+(f.dest_ch||""), st.label+"站 · "+(f.train_length?(f.train_length+" 卡"):("月台 "+f.plat)), items);
    }
  }
  $("#lrtMeta").textContent = cnt+" 條路線";
}

async function refreshBus(){
  const btn=$("#busRefresh"); if(btn) btn.classList.add("spin");
  await Promise.all([renderBus(), renderLRT()]);
  $("#busUpd").textContent = "更新於 "+nowStr();
  setTimeout(()=>{ if(btn) btn.classList.remove("spin"); },500);
}

const HKO_STATIONS = [
  ["天水圍",22.457,114.005],["屯門",22.391,113.977],["元朗公園",22.443,114.027],
  ["流浮山",22.468,113.983],["石崗",22.435,114.085],["荃灣可觀",22.387,114.109],
  ["荃灣城門谷",22.378,114.114],["青衣",22.345,114.108],["沙田",22.402,114.21],
  ["大埔",22.448,114.175],["北區",22.492,114.128],["打鼓嶺",22.528,114.156],
  ["九龍城",22.337,114.182],["深水埗",22.331,114.159],["黃大仙",22.34,114.194],
  ["觀塘",22.318,114.224],["將軍澳",22.318,114.26],["西貢",22.376,114.274],
  ["香港天文台",22.302,114.174],["京士柏",22.312,114.173],["黃竹坑",22.248,114.168],
  ["赤鱲角",22.309,113.922],["東涌",22.288,113.943],["長洲",22.201,114.027],["大美督",22.475,114.236]
];
function haversine(a,b,c,d){const R=6371,r=Math.PI/180;const dLat=(c-a)*r,dLon=(d-b)*r;const x=Math.sin(dLat/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function nearestStation(lat,lon){let best=null,bd=1e9;for(const s of HKO_STATIONS){const d=haversine(lat,lon,s[1],s[2]);if(d<bd){bd=d;best=s;}}return best;}

const WMO = {
  0:["晴朗","☀️"],1:["大致天晴","🌤️"],2:["部分多雲","⛅"],3:["多雲","☁️"],
  45:["有霧","🌫️"],48:["霧凇","🌫️"],51:["毛毛雨","🌦️"],53:["毛毛雨","🌦️"],55:["毛毛雨","🌧️"],
  56:["凍雨","🌧️"],57:["凍雨","🌧️"],61:["小雨","🌦️"],63:["中雨","🌧️"],65:["大雨","🌧️"],
  66:["凍雨","🌧️"],67:["凍雨","🌧️"],71:["小雪","🌨️"],73:["中雪","🌨️"],75:["大雪","❄️"],
  77:["雪粒","🌨️"],80:["驟雨","🌦️"],81:["驟雨","🌧️"],82:["狂風驟雨","⛈️"],
  85:["陣雪","🌨️"],86:["陣雪","❄️"],95:["雷暴","⛈️"],96:["雷暴冰雹","⛈️"],99:["雷暴冰雹","⛈️"]
};
function wmo(c){return WMO[c]||["—","🌡️"];}
function warnClass(code,name){
  const s=(code||"")+(name||"");
  if(/RAIN|暴雨/.test(s)) return "rain";
  if(/TS|雷暴/.test(s)) return "ts";
  if(/HOT|酷熱|炎熱/.test(s)) return "hot";
  if(/COLD|寒冷/.test(s)) return "cold";
  if(/WIND|TC|風球|颱風|強風|烈風/.test(s)) return "wind";
  return "other";
}

async function loadWeather(lat,lon){
  $("#wxErr").innerHTML="";
  const st = nearestStation(lat,lon);
  $("#wxLoc").textContent = st? st[0] : "我的位置";
  const omURL = `${_H}api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`+
    `&current=temperature_2m,weather_code,precipitation`+
    `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code`+
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`+
    `&timezone=Asia%2FHong_Kong&forecast_days=7`;
  const [om, hkoCur, hkoWarn] = await Promise.all([
    fetchJSON(omURL).catch(()=>null),
    fetchJSON(_H+"data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc").catch(()=>null),
    fetchJSON(_H+"data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc").catch(()=>null)
  ]);
  let temp=null, cond="—", icon="🌡️";
  if(hkoCur && hkoCur.temperature && hkoCur.temperature.data){
    const match = hkoCur.temperature.data.find(d=> st && d.place===st[0]);
    if(match) temp = match.value;
  }
  if(om && om.current){
    if(temp==null) temp = Math.round(om.current.temperature_2m);
    const w=wmo(om.current.weather_code); cond=w[0]; icon=w[1];
  }
  $("#wxTemp").textContent = temp==null? "--" : Math.round(temp);
  $("#wxCond").textContent = icon+" "+cond;
  if(om && om.daily){
    $("#wxHi").textContent = Math.round(om.daily.temperature_2m_max[0]);
    $("#wxLo").textContent = Math.round(om.daily.temperature_2m_min[0]);
  }
  const wbox=$("#wxWarns"); wbox.innerHTML="";
  let hasRainWarn=false;
  if(hkoWarn && typeof hkoWarn==="object"){
    const codes=Object.keys(hkoWarn);
    if(!codes.length){ wbox.appendChild(el("div","warn other",'<span class="dot"></span>現時無天氣警告')); }
    for(const c of codes){
      const w=hkoWarn[c]; if(!w||!w.name) continue;
      const cls=warnClass(w.code||c, w.name);
      if(cls==="rain"||cls==="ts") hasRainWarn=true;
      wbox.appendChild(el("div","warn "+cls,`<span class="dot"></span>${w.name}`));
    }
  }else{
    wbox.appendChild(el("div","warn other",'<span class="dot"></span>警告資料暫時無法載入'));
  }
  let rainAt=null, maxProb=0;
  if(om && om.hourly){
    const H=om.hourly, now=new Date();
    const hbox=$("#wxHourly"); hbox.innerHTML="";
    let shown=0;
    for(let i=0;i<H.time.length && shown<14;i++){
      const t=new Date(H.time[i]);
      if(t < now - 3600000) continue;
      const prob=H.precipitation_probability? (H.precipitation_probability[i]||0):0;
      const pr=H.precipitation? (H.precipitation[i]||0):0;
      const w=wmo(H.weather_code[i]);
      if(prob>maxProb) maxProb=prob;
      if(rainAt===null && (prob>=50 || pr>=0.3) && t>=now) rainAt=t;
      const isNow = shown===0;
      const cell=el("div","hour"+(isNow?" nowmark":""));
      cell.innerHTML=`<div class="h">${isNow?"而家":t.getHours()+"時"}</div>`+
        `<div class="ic">${w[1]}</div>`+
        `<div class="p">${prob>=20?prob+"%":""}</div>`+
        `<div class="t">${Math.round(H.temperature_2m[i])}°</div>`;
      hbox.appendChild(cell); shown++;
    }
  }
  const curPr = om && om.current ? om.current.precipitation : 0;
  let umbEmoji="🌂", umbBig="應該唔使帶遮", umbSmall="未來幾個鐘降雨機會低。";
  if(hasRainWarn || curPr>0.1){
    umbEmoji="☔"; umbBig="要帶遮！"; umbSmall = hasRainWarn? "天文台已發出雨/雷暴警告。" : "而家落緊雨。";
  }else if(maxProb>=50){
    umbEmoji="☂️"; umbBig="建議帶遮"; umbSmall=`未來降雨機會高達 ${maxProb}%。`;
  }else if(maxProb>=30){
    umbEmoji="☂️"; umbBig="最好帶把遮"; umbSmall=`未來降雨機會約 ${maxProb}%。`;
  }
  if(rainAt){ umbSmall += " 預計 "+rainAt.toLocaleTimeString("zh-HK",{hour:"2-digit",minute:"2-digit",hour12:false})+" 左右開始落雨。"; }
  $("#umbEmoji").textContent=umbEmoji; $("#umbBig").textContent=umbBig; $("#umbSmall").textContent=umbSmall;
  if(om && om.daily){
    const D=om.daily; const dbox=$("#wxDaily"); dbox.innerHTML="";
    let lo=Math.min(...D.temperature_2m_min), hi=Math.max(...D.temperature_2m_max); const span=Math.max(1,hi-lo);
    const wk=["日","一","二","三","四","五","六"];
    for(let i=0;i<D.time.length;i++){
      const dt=new Date(D.time[i]); const w=wmo(D.weather_code[i]);
      const dmin=D.temperature_2m_min[i], dmax=D.temperature_2m_max[i];
      const left=((dmin-lo)/span)*100, width=Math.max(8,((dmax-dmin)/span)*100);
      const prob=D.precipitation_probability_max? (D.precipitation_probability_max[i]||0):0;
      const row=el("div","day");
      row.innerHTML=`<span class="dn">${i===0?"今日":"週"+wk[dt.getDay()]}</span>`+
        `<span class="di">${w[1]}</span>`+
        `<span class="dp">${prob>=20?prob+"%":""}</span>`+
        `<span class="lo">${Math.round(dmin)}°</span>`+
        `<span class="bar"><i style="left:${left}%;width:${width}%"></i></span>`+
        `<span class="hi">${Math.round(dmax)}°</span>`;
      dbox.appendChild(row);
    }
  }
  $("#wxUpd").textContent="更新於 "+nowStr();
}

/* ===== 定位 ===== */
const DEFAULT_LOC={lat:22.4488, lon:114.0040};
let USER_LOC=null;
function getLoc(){
  return new Promise(res=>{
    if(!navigator.geolocation){ res(USER_LOC||DEFAULT_LOC); return; }
    navigator.geolocation.getCurrentPosition(
      p=>{ USER_LOC={lat:p.coords.latitude, lon:p.coords.longitude}; res(USER_LOC); },
      ()=>{ res(USER_LOC||DEFAULT_LOC); },
      {enableHighAccuracy:true, timeout:8000, maximumAge:60000}
    );
  });
}
async function refreshWx(){
  const btn=$("#wxRefresh"); if(btn) btn.classList.add("spin");
  const loc=await getLoc();
  try{ await loadWeather(loc.lat, loc.lon); }
  catch(e){ $("#wxErr").innerHTML='<div class="err">天氣資料載入失敗，請稍後重試。</div>'; }
  setTimeout(()=>{ if(btn) btn.classList.remove("spin"); },500);
}

/* ===== 實時交通 (Waze) ===== */
let trafficInited=false;
let tZoom=14;
function wazeSrc(lat,lon,zoom){ return `${_H}embed.waze.com/iframe?zoom=${zoom}&lat=${lat}&lon=${lon}&pin=1`; }
async function initTraffic(force){
  if(trafficInited && !force) return;
  const loc=USER_LOC||await getLoc();
  const fr=$("#wazeFrame");
  fr.src=wazeSrc(loc.lat, loc.lon, tZoom);
  $("#tOpenExt").href=`${_H}www.waze.com/live-map?latlng=${loc.lat}%2C${loc.lon}`;
  $("#tUpd").textContent="更新於 "+nowStr()+" · "+(USER_LOC?"你的位置":"天水圍");
  fr.addEventListener("load",()=>{ const f=$("#tFallback"); if(f) f.style.display="none"; }, {once:true});
  trafficInited=true;
}
function setZoom(z){ tZoom=Math.max(8,Math.min(17,z)); initTraffic(true); }

/* ===== 分頁切換 ===== */
function showTab(name){
  $("#pageBus").classList.toggle("hidden", name!=="bus");
  $("#pageTraffic").classList.toggle("hidden", name!=="traffic");
  $("#pageWx").classList.toggle("hidden", name!=="wx");
  document.querySelectorAll(".tab").forEach(t=> t.classList.toggle("active", t.dataset.tab===name));
  if(name==="traffic") initTraffic(false);
  if(name==="wx") refreshWx();
}
document.querySelectorAll(".tab").forEach(t=> t.addEventListener("click",()=> showTab(t.dataset.tab)));

/* ===== 巴士/輕鐵切換 ===== */
document.querySelectorAll("#modeSeg .seg-btn").forEach(b=> b.addEventListener("click",()=>{
  document.querySelectorAll("#modeSeg .seg-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  const m=b.dataset.mode;
  $("#grpBus").classList.toggle("hidden", m!=="bus");
  $("#grpLrt").classList.toggle("hidden", m!=="lrt");
}));

/* ===== 按鈕 & 啟動 ===== */
$("#busRefresh").addEventListener("click", refreshBus);
$("#wxRefresh").addEventListener("click", refreshWx);
$("#tRecenter").addEventListener("click",()=>{ USER_LOC=null; getLoc().then(()=>initTraffic(true)); });
$("#tZin").addEventListener("click",()=> setZoom(tZoom+1));
$("#tZout").addEventListener("click",()=> setZoom(tZoom-1));

refreshBus();
getLoc();
setInterval(()=>{ if(editingStopId) return; if(!$("#pageBus").classList.contains("hidden")) refreshBus(); }, 30000);
setInterval(()=>{ if(!$("#pageWx").classList.contains("hidden")) refreshWx(); }, 600000);
