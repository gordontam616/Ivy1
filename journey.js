/* ===== 「我要去邊度」公共交通路線規劃（Google Directions） ===== */
let JP_ROUTES=[];
let DRIVE_COND=null;
let mapsLoading=false, mapsReady=false, acDone=false;
let mapsCbs=[];

function gKey(){ try{ return localStorage.getItem("gmapsKey")||""; }catch(e){ return ""; } }
function setGKey(k){ try{ localStorage.setItem("gmapsKey", k); }catch(e){} }
function getSaved(){ try{ return JSON.parse(localStorage.getItem("savedPlaces")||"[]"); }catch(e){ return []; } }
function setSaved(a){ try{ localStorage.setItem("savedPlaces", JSON.stringify(a)); }catch(e){} }
function jpMsg(t){ const m=$("#jpMsg"); if(m) m.textContent=t||""; }
function openSheet(sel){ const s=$(sel); if(s) s.classList.remove("hidden"); }
function closeSheet(sel){ const s=$(sel); if(s) s.classList.add("hidden"); }

function ensureMaps(cb){
  if(mapsReady){ cb(); return; }
  mapsCbs.push(cb);
  if(mapsLoading) return;
  const key=gKey();
  if(!key){ renderKeyPrompt(); return; }
  mapsLoading=true;
  window.__jpMapsReady=function(){ mapsReady=true; mapsLoading=false; try{ setupAC(); }catch(e){} mapsCbs.forEach(f=>f()); mapsCbs=[]; };
  const s=document.createElement("script");
  s.src="http"+"s://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(key)+"&libraries=places&language=zh-HK&region=HK&callback=__jpMapsReady";
  s.async=true; s.defer=true;
  s.onerror=function(){ mapsLoading=false; jpMsg("Google Maps 載入失敗，請確認 API key 正確並已啟用 Maps JavaScript API 與 Directions API。"); };
  document.head.appendChild(s);
}

function setupAC(){
  if(acDone || !window.google || !google.maps || !google.maps.places) return;
  acDone=true;
  const opt={ componentRestrictions:{country:"hk"}, fields:["formatted_address","geometry","name"] };
  try{ new google.maps.places.Autocomplete($("#jpDest"), opt); }catch(e){}
  try{ new google.maps.places.Autocomplete($("#jpOrigin"), opt); }catch(e){}
}

function renderKeyPrompt(){
  const box=$("#jpResults"); if(!box) return;
  box.innerHTML='<div class="jp-sheet-h"><b>需要 Google Maps API Key</b><span class="jp-x" data-close="#jpResults">✕</span></div>'+
    '<div class="jp-keybox">'+
    '<p>公共交通路線規劃由 Google Directions 提供。請貼上你的 <b>Google Maps API Key</b>（需啟用 <b>Maps JavaScript API</b> 及 <b>Directions API</b>）。Key 只會存在你部機，不會上傳。</p>'+
    '<input id="jpKeyInput" class="rin" placeholder="貼上 API key…" />'+
    '<button class="addbtn" id="jpKeySave">儲存並啟用</button>'+
    '<p class="jp-hint">建議在 Google Cloud Console 將 key 限制 HTTP referrer 為你的 GitHub Pages 網域，以免被什人盜用。</p>'+
    '</div>';
  openSheet("#jpResults");
  const sv=$("#jpKeySave");
  if(sv) sv.addEventListener("click",function(){ const k=($("#jpKeyInput").value||"").trim(); if(!k) return; setGKey(k); closeSheet("#jpResults"); jpMsg("已儲存 API key，再按一次搜尋路線。"); });
}

function renderSaved(){
  const box=$("#jpSaved"); if(!box) return;
  const arr=getSaved(); box.innerHTML="";
  arr.forEach(function(p,idx){
    const chip=el("span","jp-chip", "⭐ "+p.name+' <b data-del="'+idx+'">✕</b>');
    chip.addEventListener("click",function(e){
      if(e.target.hasAttribute("data-del")){ const a=getSaved(); a.splice(idx,1); setSaved(a); renderSaved(); return; }
      const d=$("#jpDest"); d.value=p.q; jpMsg('已填入「'+p.name+'」');
    });
    box.appendChild(chip);
  });
}
function saveCurrentDest(){
  const v=($("#jpDest").value||"").trim();
  if(!v){ jpMsg("請先輸入目的地再儲存"); return; }
  const name=(prompt("幫這個地點改名（例如：公司、屋企）", v)||"").trim()||v;
  const a=getSaved(); a.push({name:name, q:v}); setSaved(a); renderSaved();
  jpMsg('已儲存「'+name+'」');
}

function doSearch(){
  const dest=($("#jpDest").value||"").trim();
  if(!dest){ jpMsg("請輸入目的地"); return; }
  if(!gKey()){ renderKeyPrompt(); return; }
  jpMsg("載入地圖服務…");
  ensureMaps(function(){ runRoute(dest); });
}

async function runRoute(dest){
  let origin;
  const oin=$("#jpOrigin");
  if(oin.dataset.gps==="1"){
    let loc; try{ loc=await getLoc(); }catch(e){ loc=null; }
    if(!loc){ jpMsg("無法取得你的位置，請手動輸入起點"); return; }
    origin=new google.maps.LatLng(loc.lat, loc.lon);
  } else {
    const ov=(oin.value||"").trim();
    if(!ov){ jpMsg("請輸入起點或按 📍 用實時位置"); return; }
    origin=ov;
  }
  jpMsg("搜尋路線中…");
  DRIVE_COND=null;
  const ds=new google.maps.DirectionsService();
  ds.route({
    origin:origin, destination:dest,
    travelMode:google.maps.TravelMode.TRANSIT,
    transitOptions:{ departureTime:new Date() },
    provideRouteAlternatives:true, region:"HK"
  }, function(res,status){
    if(status!=="OK" || !res || !res.routes || !res.routes.length){
      jpMsg("搜不到公共交通路線（"+status+"），請檢查起點 / 目的地。");
      return;
    }
    JP_ROUTES = res.routes.slice().sort(function(a,b){ return a.legs[0].duration.value-b.legs[0].duration.value; }).slice(0,5);
    jpMsg("");
    renderResults();
    fetchDriveCond(origin, dest);
  });
}

function fetchDriveCond(origin, dest){
  try{
    const ds=new google.maps.DirectionsService();
    ds.route({
      origin:origin, destination:dest,
      travelMode:google.maps.TravelMode.DRIVING,
      drivingOptions:{ departureTime:new Date(), trafficModel:"bestguess" },
      region:"HK"
    }, function(res,status){
      if(status!=="OK" || !res || !res.routes || !res.routes.length){ DRIVE_COND={label:"暫無資料",cls:"a",extra:0}; updateCondLine(); return; }
      const leg=res.routes[0].legs[0];
      const base=leg.duration.value;
      const tr=(leg.duration_in_traffic||leg.duration).value;
      const ratio= base>0 ? tr/base : 1;
      let label,cls;
      if(ratio<1.15){ label="大致暢順"; cls="g"; }
      else if(ratio<1.4){ label="略為繁忙"; cls="a"; }
      else { label="頗為擠塞"; cls="r"; }
      DRIVE_COND={ label:label, cls:cls, extra:Math.max(0,Math.round((tr-base)/60)) };
      updateCondLine();
    });
  }catch(e){ DRIVE_COND={label:"暫無資料",cls:"a",extra:0}; updateCondLine(); }
}

function transitStepsOf(route){ return route.legs[0].steps.filter(function(s){ return s.travel_mode==="TRANSIT"; }); }
function vehEmoji(step){
  const v=step.transit && step.transit.line && step.transit.line.vehicle;
  const t=(v&&(v.type||""))||"";
  if(/SUBWAY|METRO|HEAVY_RAIL|RAIL|COMMUTER/.test(t)) return "🚇";
  if(/TRAM|LIGHT_RAIL/.test(t)) return "🚊";
  if(/FERRY|BOAT/.test(t)) return "⛴️";
  if(/BUS|TROLLEY/.test(t)) return "🚌";
  return "🚍";
}
function lineLabel(step){ const l=step.transit && step.transit.line; if(!l) return ""; return l.short_name||l.name||""; }

function updateCondLine(){
  const c=$("#jpCond"); if(!c) return;
  if(!DRIVE_COND){ c.innerHTML='<div class="jp-cond a">🚗 道路狀況分析中…</div>'; return; }
  const d=DRIVE_COND;
  c.innerHTML='<div class="jp-cond '+d.cls+'">🚗 沿途道路狀況：'+d.label+(d.extra>0?'（駕駛因車流多用約 '+d.extra+' 分鐘）':'')+'</div>';
}

function renderResults(){
  const box=$("#jpResults"); if(!box) return;
  let html='<div class="jp-sheet-h"><b>路線建議</b><span class="jp-x" data-close="#jpResults">✕</span></div>';
  html+='<div id="jpCond"></div>';
  JP_ROUTES.forEach(function(r,i){
    const leg=r.legs[0];
    const ts=transitStepsOf(r);
    const transfers=Math.max(0, ts.length-1);
    const walk=leg.steps.filter(function(s){ return s.travel_mode==="WALKING"; }).reduce(function(a,s){ return a+(s.duration?s.duration.value:0); },0);
    let lines=ts.map(function(s){ return '<span class="lchip">'+vehEmoji(s)+' '+lineLabel(s)+'</span>'; }).join('<span class="arrow">›</span>');
    if(!lines) lines='<span class="lchip">🚶 全程步行</span>';
    const dep=leg.departure_time?leg.departure_time.text:"";
    const arr=leg.arrival_time?leg.arrival_time.text:"";
    html+='<div class="jp-res" data-idx="'+i+'">'+
      '<div class="top"><span class="dur">'+leg.duration.text+'</span><span class="times">'+dep+' → '+arr+'</span></div>'+
      '<div class="lines">'+lines+'</div>'+
      '<div class="sub">轉乘 '+transfers+' 次 · 步行約 '+Math.round(walk/60)+' 分鐘'+(leg.distance?(' · 全程 '+leg.distance.text):'')+'</div>'+
    '</div>';
  });
  box.innerHTML=html;
  openSheet("#jpResults");
  box.querySelectorAll(".jp-res").forEach(function(elm){ elm.addEventListener("click",function(){ renderDetail(+elm.dataset.idx); }); });
  updateCondLine();
}

function renderDetail(i){
  const r=JP_ROUTES[i]; if(!r) return;
  const leg=r.legs[0];
  const dep=leg.departure_time?leg.departure_time.text:"";
  const arr=leg.arrival_time?leg.arrival_time.text:"";
  let html='<div class="jp-sheet-h"><button class="jp-back" data-back>‹ 返回</button><b style="margin-left:8px">行程詳情</b><span class="jp-x" data-close="#jpDetail">✕</span></div>';
  html+='<div class="jp-cond '+(DRIVE_COND?DRIVE_COND.cls:"a")+'">'+(DRIVE_COND?('🚗 沿途道路狀況：'+DRIVE_COND.label):'🚗 道路狀況分析中…')+'</div>';
  html+='<div class="jp-res" style="cursor:default"><div class="top"><span class="dur">'+leg.duration.text+'</span><span class="times">'+dep+' → '+arr+'</span></div><div class="sub">'+(leg.distance?('全程 '+leg.distance.text):'')+'</div></div>';
  html+='<ul class="jp-steps">';
  leg.steps.forEach(function(s){
    if(s.travel_mode==="WALKING"){
      const instr=(s.instructions||"步行").replace(/<[^>]+>/g,"");
      html+='<li class="jp-step"><div class="si">🚶</div><div class="sc"><div class="l1">步行 '+(s.duration?s.duration.text:"")+'</div><div class="l2">'+instr+(s.distance?(' · '+s.distance.text):'')+'</div></div></li>';
    } else if(s.travel_mode==="TRANSIT"){
      const td=s.transit||{}; const line=lineLabel(s); const head=td.headsign?("往 "+td.headsign):"";
      const dStop=td.departure_stop?td.departure_stop.name:""; const aStop=td.arrival_stop?td.arrival_stop.name:"";
      const dT=td.departure_time?td.departure_time.text:""; const aT=td.arrival_time?td.arrival_time.text:"";
      const n=(td.num_stops!=null)?td.num_stops:"";
      html+='<li class="jp-step"><div class="si">'+vehEmoji(s)+'</div><div class="sc">'+
        '<div class="l1">'+line+' '+head+'</div>'+
        '<div class="l2">🔼 上車：'+dStop+' <span class="tm">'+dT+'</span></div>'+
        '<div class="l2">🔽 落車：'+aStop+' <span class="tm">'+aT+'</span></div>'+
        '<div class="l2">共 '+n+' 個站 · '+(s.duration?s.duration.text:"")+'</div>'+
      '</div></li>';
    }
  });
  html+='</ul>';
  const box=$("#jpDetail"); if(!box) return;
  box.innerHTML=html; openSheet("#jpDetail");
}

document.addEventListener("click",function(e){
  const c=e.target.closest("[data-close]"); if(c){ closeSheet(c.getAttribute("data-close")); }
  const b=e.target.closest("[data-back]"); if(b){ closeSheet("#jpDetail"); }
});

(function initJP(){
  if(!$("#jpGo")) return;
  const o=$("#jpOrigin");
  o.dataset.gps="1"; o.readOnly=true; o.value="📍 我的位置（GPS）"; $("#jpGps").classList.add("on");
  $("#jpGps").addEventListener("click",function(){ o.dataset.gps="1"; o.readOnly=true; o.value="📍 我的位置（GPS）"; $("#jpGps").classList.add("on"); jpMsg(""); });
  o.addEventListener("focus",function(){ if(o.dataset.gps==="1"){ o.readOnly=false; o.value=""; o.dataset.gps="0"; $("#jpGps").classList.remove("on"); } });
  $("#jpDest").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); doSearch(); } });
  $("#jpGo").addEventListener("click", doSearch);
  $("#jpStar").addEventListener("click", saveCurrentDest);
  renderSaved();
})();
