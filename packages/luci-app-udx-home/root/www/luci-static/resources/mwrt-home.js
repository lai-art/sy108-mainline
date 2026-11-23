
(function(){
const C=2*Math.PI*38;
function rng(el,p,c){if(!el)return;const f=el.querySelector('.ga-fg')||el.querySelector('.sr-fg');if(!f)return;f.style.strokeDasharray=C;f.style.strokeDashoffset=C-(p/100)*C;if(c)f.style.stroke=c;}
function av(el,t,s){if(!el)return;let c=parseInt(el.textContent)||0;const d=(t-c)/15;let i=0;const x=setInterval(()=>{c+=d;i++;el.textContent=Math.round(c)+s;if(i>=15){el.textContent=t+s;clearInterval(x);}},30);}
function toast(m){const t=document.getElementById('mrt-toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4000);}
function rp(v){v=parseFloat(v);if(isNaN(v))return 0;if(v>=-80)return 100;if(v>=-90)return 90;if(v>=-105)return 70;if(v>=-120)return 45;return 15;}
function rc(p){return p>=70?'#34d399':p>=40?'#fbbf24':'#f87171';}
function tc(h){h.querySelector('.cla').classList.toggle('shut');h.nextElementSibling.classList.toggle('shut');}

// Fan control - instant UI response
function fanSet(action,label){
// Instant UI update
updateFanBtns(label);
document.getElementById('fan-mode').textContent=label;
document.getElementById('fan-slider-wrap').style.display='none';
toast('风扇: '+label);
// Send to server (fire and forget)
XHR.get('/cgi-bin/luci/admin/fancontrol/'+action,{set:action,p:'1'},function(){});
}
function fanFree(){
// Get current PWM and switch to 无极 immediately
const curPwm=document.getElementById('fan-range').value||'128';
updateFanBtns('无极');
document.getElementById('fan-mode').textContent='无极';
document.getElementById('fan-slider-wrap').style.display='flex';
toast('无极调速: PWM '+curPwm);
XHR.get('/cgi-bin/luci/admin/fancontrol/fanswj',{set:'fanswj',p:curPwm},function(){});
}
function fanSlider(val){
document.getElementById('fan-pwm').textContent=val+'/255';
document.getElementById('fan-pct').textContent=Math.round(val/255*100)+'%';
XHR.get('/cgi-bin/luci/admin/fancontrol/fanswj',{set:'fanswj',p:String(val)},function(){});
}
function updateFanBtns(mode){
const map={'智能':'fc-smart','低速':'fc-low','中速':'fc-mid','高速':'fc-high','全速':'fc-max','无极':'fc-free'};
document.querySelectorAll('.fan-ctrl .fc-btn:not(.fc-link)').forEach(b=>b.classList.remove('active'));
const id=map[mode];if(id){const el=document.getElementById(id);if(el)el.classList.add('active');}
const sw=document.getElementById('fan-slider-wrap');if(sw&&mode!=='无极'){sw.style.display='none';}
}
/* s143 11-22: 风扇浮窗整体移除（SY108 无 PWM/风扇硬件，入口按钮已从模板删除）。 */
/* s122 关于本机浮窗: 产品图右上角「关于本机」键(#dv-about)打开, 里面是原来首页的设备规格卡 .cd-q(节点原样放在浮窗里, f-* 等 id 与刷新逻辑都不动)。
 * 用事件委托: 这段脚本在 HTML 之前执行, 解析时拿不到节点。 */
(function(){
 function $(i){return document.getElementById(i);}
 function open(){
  var m=$('abw');if(!m)return;
  var w=$('wfm');
  if(w&&w.parentNode&&m.parentNode!==w.parentNode)w.parentNode.insertBefore(m,w);
  var host=document.querySelector('.main-right')||$('maincontent'),left=0;
  if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
  m.style.setProperty('--wfm-l',left+'px');
  try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
  m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  var b=$('dv-about');if(b)b.classList.add('on');
  var x=$('abw-x');if(x)try{x.focus({preventScroll:true});}catch(e){}
 }
 function close(){
  var m=$('abw');if(!m||!m.classList.contains('open'))return;
  m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';
  var b=$('dv-about');if(b){b.classList.remove('on');try{b.focus({preventScroll:true});}catch(e){}}
 }
 document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  if(t.closest('#dv-about')){e.preventDefault();var m=$('abw');if(m&&m.classList.contains('open'))close();else open();return;}
  if(t.closest('#abw-x')){close();return;}
  if(t.id==='abw')close();
 });
 document.addEventListener('keydown',function(e){
  var m=$('abw');if(e.key==='Escape'&&m&&m.classList.contains('open'))close();
 });
 window.MRT_ABOUT={open:open,close:close};
})();
/* s122 设备总览右栏收起 / 展开(PC): 收起后整张卡只剩产品展台, 展台里的元素本来就按展台中线排, 自然居中到整张卡; 状态记在 localStorage。
 * 首页自适应排版: 宽度 >768 时给 #P 加 .fit, 蜂窝卡 / 设备总览 / 圆环卡竖排, 圆环卡贴底。
 * 不做任何缩放: 元素大小不变, 只把 #P 的最小高度撑到「菜单栏顶 ~ 菜单栏底」, 设备总览卡 flex:1 吃掉多出来的高度(展台里的产品图居中)。
 * 蜂窝卡顶 = 菜单栏顶(页面上方有通知条等把 #P 顶下去时只保证底对齐), 圆环卡底 = 菜单栏底; 内容比视口高时照常出滚动条。
 * 窗口缩放 / 内容变化时重新量。 */
(function(){
 var KEY='mwrt-dvsolo',busy=0,raf=0,on=0,tk=0;
 function $(i){return document.getElementById(i);}
 function setSolo(on,save){
  var b=document.querySelector('#P .dv-body'),f=$('dv-fold');if(!b)return;
  b.classList.toggle('dv-solo',!!on);
  var dc=b.closest&&b.closest('.dv-card');if(dc)dc.classList.toggle('dvc-solo',!!on);
  if(f){f.setAttribute('aria-pressed',on?'true':'false');var s=on?'展开右侧状态栏':'收起右侧状态栏';f.title=s;f.setAttribute('aria-label',s);}
  sched();
  /* 展台宽度在 0.5s 内连续变化: 逐帧让接口插头 / 胶囊 / JBL 跟着产品图走, 结束后完整重排 */
  var t0=0,n=++tk;
  (function step(ts){if(n!==tk)return;if(!t0)t0=ts;
   if(window.MRT_PTS_FOLLOW)window.MRT_PTS_FOLLOW();
   if(ts-t0<620)requestAnimationFrame(step);else if(window.MRT_PTS_REDRAW)window.MRT_PTS_REDRAW();})(0);
 }
 document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  var f=t.closest('#dv-fold');if(!f)return;
  var b=document.querySelector('#P .dv-body');setSolo(!(b&&b.classList.contains('dv-solo')),true);
 });
 function clear(P){
  if(!on)return;on=0;
  P.classList.remove('fit');P.style.minHeight='';P.style.paddingTop='';
 }
 function fit(){
  raf=0;if(busy)return;busy=1;
  try{
   var P=$('P');if(!P)return;
   var hc=document.documentElement.classList;
   if(window.innerWidth<=768||!P.offsetParent){clear(P);return;}
   var cap=hc.contains('mwrt-capsule')||hc.contains('mwrt-catcap');
   P.classList.add('fit');on=1;
   P.style.minHeight='';P.style.paddingTop='';
   /* 视口坐标会随页面滚动变化(侧栏固定不动), 所以换算成"没滚动时"的 top, 否则滚下去再触发一次就把上边距算成负数大的值 */
   var so=0,pe=P.parentElement;while(pe){so+=pe.scrollTop||0;pe=pe.parentElement;}
   var top=P.getBoundingClientRect().top+so;
   var sb=document.querySelector('.main-left'),sr=sb&&sb.getBoundingClientRect();
   /* 胶囊 / 猫胶囊: 对齐侧栏上下沿; 三个经典主题: 侧栏是整条贴边的, 只按可视区底边(右侧滚动区的底)留 14px */
   var useSb=cap&&sr&&sr.height>300&&sr.bottom>top+200;
   var mr=document.querySelector('.main-right'),mb=mr?mr.getBoundingClientRect().bottom:window.innerHeight;
   var bottom=useSb?sr.bottom:Math.min(window.innerHeight,mb||window.innerHeight)-14;
   var padTop=useSb&&top<=sr.top+2?Math.max(0,Math.round(sr.top-top)):10;
   if(cap&&document.body.classList.contains('mwrt-sb-collapsed')){/*patch26*/
    var gp=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mwrt-fl-gap'))||12;
    bottom=Math.min(window.innerHeight,mb||window.innerHeight)-gp;padTop=top<=gp+2?Math.max(0,Math.round(gp-top)):10;
   }
   var mh=Math.max(0,Math.floor(bottom-top));
   P.style.paddingTop=padTop+'px';P.style.minHeight=mh+'px';
  }finally{busy=0;}
 }
 function sched(){if(!raf)raf=requestAnimationFrame(fit);}
 function init(){
  try{localStorage.removeItem(KEY);}catch(e){}
  fit();
  window.addEventListener('resize',sched);
  window.addEventListener('load',sched);
  if(window.ResizeObserver){
   var ro=new ResizeObserver(sched);ro.observe(document.documentElement);
   ['hero-w','hero-sys'].forEach(function(id){var e=$(id);if(e)ro.observe(e);});
   var g=document.querySelector('#P .gauges');if(g)ro.observe(g);
  }
  if(window.MutationObserver)new MutationObserver(sched).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  setInterval(sched,3000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
 window.MRT_FIT={run:fit,solo:setSolo};
})();
/* s123 迷你播放器区域在「不能放音乐」(没接 USB 声卡)时的信息播报: 一张「雪山海报」, 矢量低多边形雪山全景(内联 SVG, 不依赖外网)当底, 标题压在天空上,
 * 轮播 时间 / 系统运行 / 蜂窝 / WiFi / 网络出口 / 存储固件 / 接口外设 七屏; 切屏时镜头平移, 远中近三层山按不同速度错开(视差)。
 * 悬停暂停、点击画面下一屏、点圆点跳转、两侧箭头。数据全部取自首页已有的 MRT_R3D(router3d-data)和蜂窝 hero 的 DOM, 不新增任何请求。
 * 只有播报开着且迷你区可见时才走定时器; 对外 window.MRT_TV={on:function(b){...},next,prev,go,slides} */
(function(){
 var SL=6500,PAN=70,T={el:null,i:-1,cur:'',list:[],tm:0,run:0,pause:0,acc:0,last:0,rt:0,rate:{rx:null,tx:null,at:0,cur:[0,0]},inited:0};
 function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function $(i){return document.getElementById(i);}
 function z(n){return (n<10?'0':'')+n;}
 function fmtKB(k){k=+k||0;return k>=1048576?(k/1048576).toFixed(1)+' GB':k>=1024?Math.round(k/1024)+' MB':Math.round(k)+' KB';}
 function fmtRate(b){b=+b||0;return b>=1048576?[(b/1048576).toFixed(b>=10485760?0:1),'MB/s']:b>=1024?[Math.round(b/1024),'KB/s']:[Math.round(b),'B/s'];}
 function R(){return window.MRT_R3D||{};}
 function pct(a,b){return b>0?Math.max(0,Math.min(100,Math.round(a*100/b))):null;}
 function cpuP(d){var c=d.cpu||{},l=+c.load1,n=+c.ncpu||1;return c.load1!=null&&isFinite(l)?Math.max(0,Math.min(100,Math.round(l/n*100))):null;}
 function memP(d){var m=d.mem||{};return m.total>0?Math.round((m.total-m.avail)*100/m.total):null;}
 function upTx(d){var u=parseInt(d.uptime)||0;if(u<=0)return '--';var dd=Math.floor(u/86400),hh=Math.floor(u%86400/3600),mi=Math.floor(u%3600/60);return dd?dd+' 天 '+hh+' 时':hh?hh+' 时 '+mi+' 分':mi+' 分';}
 function txt(id){var e=$(id);return e?String(e.textContent||'').replace(/\s+/g,' ').trim():'';}
 /* ---- 实时速率: 取 wan_rx/wan_tx 累计字节的差 ---- */
 function sample(){
  var d=R(),r=T.rate;if(d.wan_rx==null||d.wan_tx==null)return;
  var now=Date.now(),rx=+d.wan_rx||0,tx=+d.wan_tx||0;
  if(r.rx!=null&&now-r.at>=1500&&rx>=r.rx&&tx>=r.tx){var dt=(now-r.at)/1000;r.cur=[(rx-r.rx)/dt,(tx-r.tx)/dt];r.rx=rx;r.tx=tx;r.at=now;}
  else if(r.rx==null||rx<r.rx){r.rx=rx;r.tx=tx;r.at=now;}
 }
 /* ---- 雪山: 种子随机, 每次打开都是同一幅; 每座山 = 亮面 a + 暗面 b + 雪冠亮面 c + 雪冠暗面 d, 低多边形扁平画法 ---- */
 function rng(s){return function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
 function f1(n){return (Math.round(n*10)/10).toString();}
 function pt(x,y){return f1(x)+','+f1(y);}
 function mtn(px,py,w,H,tc,r){
  var h=H-py,cx=px+w*(0.06+r()*0.14),o='';
  o+='<path class="a" d="M'+pt(px-w,H)+'L'+pt(px,py)+'L'+pt(cx,H)+'Z"/><path class="b" d="M'+pt(px,py)+'L'+pt(px+w,H)+'L'+pt(cx,H)+'Z"/>';
  if(tc>0){
   var L=[px-w*tc,py+h*tc],Rr=[px+w*tc,py+h*tc],k=5,v=[L],i,m=0,best=1e9;
   for(i=1;i<=k;i++){var x=L[0]+(Rr[0]-L[0])*i/(k+1),y=py+h*tc*(0.72+(i%2?0.4:0.05)+r()*0.18);v.push([x,y]);}
   v.push(Rr);
   for(i=1;i<=k;i++){var xc=px+(cx-px)*((v[i][1]-py)/h),dx=Math.abs(v[i][0]-xc);if(dx<best){best=dx;m=i;}}
   v[m][0]=px+(cx-px)*((v[m][1]-py)/h);
   var lit=pt(px,py),sh=pt(px,py),j;
   for(j=0;j<=m;j++)lit+='L'+pt(v[j][0],v[j][1]);
   sh+='L'+pt(v[m][0],v[m][1]);for(j=m+1;j<v.length;j++)sh+='L'+pt(v[j][0],v[j][1]);
   o+='<path class="c" d="M'+lit+'Z"/><path class="d" d="M'+sh+'Z"/>';}
  return o;
 }
 function range(seed,W,H,wMin,wMax,hMin,hMax,tcMin,tcMax,gap){
  var r=rng(seed),ms=[],x=-wMin*0.4;
  while(x<W+wMax*0.4){var w=wMin+r()*(wMax-wMin),py=H-(hMin+r()*(hMax-hMin)),tc=tcMax>0?tcMin+r()*(tcMax-tcMin):0;ms.push([x,py,w,tc]);x+=w*(gap+r()*0.5);}
  ms.sort(function(a,b){return b[1]-a[1];});
  var o='',i;for(i=0;i<ms.length;i++)o+=mtn(ms[i][0],ms[i][1],ms[i][2],H,ms[i][3],r);
  return o;
 }
 function scene(){
  var W=1300,H=100,sv=function(cls,seed,wMin,wMax,hMin,hMax,tcMin,tcMax,gap){return '<div class="tv-ly '+cls+'"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMinYMax meet" aria-hidden="true">'+range(seed,W,H,wMin,wMax,hMin,hMax,tcMin,tcMax,gap)+'</svg></div>';};
  var cl='<i class="tv-ck" style="--k:.14;left:34%;top:20%;width:54px"></i><i class="tv-ck" style="--k:.2;left:78%;top:36%;width:40px"></i><i class="tv-ck" style="--k:.1;left:112%;top:16%;width:62px"></i><i class="tv-ck" style="--k:.16;left:150%;top:30%;width:46px"></i>';
  return '<div class="tv-sc" id="tv-sc"><i class="tv-sun"></i>'+cl+
   sv('f',11,90,150,34,62,0.3,0.4,0.75)+sv('m',23,100,170,46,78,0.3,0.42,0.8)+sv('n',37,120,200,52,96,0.34,0.46,0.85)+'</div>';
 }
 /* ---- 各屏: ok(d) 为假就跳过; html(d) 的每个直接子元素按顺序淡入。大标题 + 一条短线 + 小字, 同参考海报的版式 ---- */
 function hs(h,s){return '<b class="po-h">'+h+'</b><i class="po-ru"></i>'+s;}
 var SLIDES=[
  {id:'clock',t:'时间 · TIME',ok:function(){return true;},html:function(d){var n=new Date(),W='日一二三四五六'.charAt(n.getDay());
    return '<b class="po-h big" id="tv-big">'+z(n.getHours())+'<i>:</i>'+z(n.getMinutes())+'</b><i class="po-ru"></i>'+
     '<span class="po-s">'+(n.getMonth()+1)+' 月 '+n.getDate()+' 日 · 星期'+W+'</span><span class="po-s fl-note">已运行 '+esc(upTx(d))+' · <span class="'+(d.wan_ip?'ok':'no')+'">'+(d.wan_ip?'已联网':'未联网')+'</span></span>';}},
  {id:'sys',t:'系统运行 · SYSTEM',ok:function(d){return !!(d.cpu||d.mem||d.temp!=null);},html:function(d){var c=cpuP(d),m=memP(d),t=d.temp!=null?Math.round(+d.temp):null;
    function cell(l,v,u){return '<div><small>'+l+'</small><b>'+(v==null?'--':v)+'<u>'+u+'</u></b></div>';}
    return '<div class="po-cols">'+cell('CPU',c,'%')+cell('内存',m,'%')+cell('温度',t,'℃')+'</div><i class="po-ru"></i>'+
     '<span class="po-s">负载 '+((d.cpu&&d.cpu.load1!=null)?(+d.cpu.load1).toFixed(2):'--')+' / '+((d.cpu&&d.cpu.ncpu)||'--')+' 核</span>';}},
  {id:'cell',t:'蜂窝网络 · CELLULAR',ok:function(d){return !!(d.modem&&d.modem.present)&&txt('h-op')&&txt('h-op')!=='--';},html:function(){
    var op=txt('h-op'),bd=txt('h-bdg'),band=txt('h-band'),bs=txt('h-band-s'),e=document.querySelector('#h-ring .v'),rsrp=e?String(e.textContent).trim():'',lv=txt('h-lv'),
     q=function(id){var x=document.querySelector('#'+id+' .h-mv .n');return x?String(x.textContent).trim():'--';},
     sub=[bd,band&&band!=='--'?band:'',bs&&bs!=='--'?bs.split(' · ')[0]:''].filter(Boolean).join(' · ');
    return hs(esc(op)+(bd?'<small>'+esc(bd)+'</small>':''),
     '<span class="po-s">RSRP '+esc(rsrp||'--')+' dBm'+(lv?' · '+esc(lv):'')+'</span><span class="po-s">'+(band&&band!=='--'?esc(band)+' · ':'')+'RSRQ '+esc(q('hm-rsrq'))+' · SINR '+esc(q('hm-sinr'))+'</span>');}},
  {id:'wifi',t:'WiFi 接入 · WI-FI',ok:function(d){var w=d.wifi||{};return !!((w.bands&&w.bands.length)||w.ssid);},html:function(d){
    var w=d.wifi||{},GV={BE:'Wi-Fi 7',AX:'Wi-Fi 6'},BL={'2g':'2.4G','5g':'5G','6g':'6G'},bs=Array.isArray(w.bands)?w.bands:[],rows='';
    bs.slice(0,3).forEach(function(b){var on=+b.on!==0&&b.ssid;rows+='<span class="po-s">'+(BL[b.b]||esc(b.b))+'　'+(on?esc(b.ssid):'已关闭')+'</span>';});
    if(!rows&&w.ssid)rows='<span class="po-s">'+esc(w.ssid)+'</span>';
    return hs((GV[w.gen]||'WiFi')+'<small>'+(d.clients!=null?+d.clients:0)+' 台在线</small>',rows);}},
  {id:'net',t:'网络出口 · NETWORK',ok:function(d){return d.wan_ip!=null||d.egress!=null;},html:function(d){
    var K={wired:'有线 WAN',wifi:'WiFi 桥接',cell:'蜂窝',tether:'手机共享'},k=(d.egress&&d.egress.kind)||'',r=T.rate,dn=fmtRate(r.cur[0]),up=fmtRate(r.cur[1]);
    return '<b class="po-h mono">'+esc(d.wan_ip||'未联网')+'</b><i class="po-ru"></i>'+
     '<span class="po-s">'+esc(K[k]||'出口')+' · 活动连接 '+(d.conns!=null?esc(d.conns):'--')+'</span><span class="po-s">↓ '+dn[0]+' '+dn[1]+'　↑ '+up[0]+' '+up[1]+'</span>';}},
  {id:'sto',t:'存储与固件 · SYSTEM',ok:function(d){return !!(d.fw||d.storage);},html:function(d){
    var s=d.storage||{},sp=pct(s.used,s.total),fw=String(d.fw||''),m=fw.match(/^(.+?)\s*@([^\s@-]+)-(\S+)$/),mdl=(($('dv-name')||{}).textContent||d.board||d.model||'').trim();
    return hs(esc(m?m[1]+' '+m[3]:(fw||'--')),'<span class="po-s">'+esc(mdl)+(d.kernel?' · Linux '+esc(d.kernel):'')+'</span>'+
     (sp!=null?'<span class="po-s">存储 '+fmtKB(s.used)+' / '+fmtKB(s.total)+' · '+sp+'%</span>':''));}},
  {id:'port',t:'接口与外设 · PORTS',ok:function(d){return Array.isArray(d.ports)||Array.isArray(d.usb);},html:function(d){
    var ps=(d.ports||[]).slice(0,4),us=(Array.isArray(d.usb)?d.usb:[]).filter(function(u){return u.type!=='hub';}),h='';
    ps.forEach(function(p){var up=+p.carrier?1:0,sp=+p.speed||0;h+='<span class="po-pp'+(up?' up':'')+'">'+esc(p.role==='WAN'?'WAN':(p.name||'LAN'))+'<small>'+(up?(sp>=1000?(sp/1000)+'G':sp?sp+'M':'已连接'):'未连接')+'</small></span>';});
    return '<b class="po-h">'+(h||'网口')+'</b><i class="po-ru"></i>'+
     '<span class="po-s">USB '+(us.length?esc((us[0].name||us[0].type||'设备')+(us.length>1?' 等 '+us.length+' 台':'')):'未接入')+'</span>';}}
 ];
 function build(){
  var el=T.el;if(!el||T.inited)return;T.inited=1;
  el.innerHTML='<div class="tv-bz" tabindex="0" role="group" aria-label="信息播报">'+scene()+'<div class="tv-fg"><div class="tv-hd"><span class="tv-tt" id="tv-tt"></span><span class="tv-ch" id="tv-ch"></span></div>'+
   '<div class="tv-vw" id="tv-vw"></div></div><div class="tv-ft"><span class="tv-dots" id="tv-dots"></span></div>'+
   '<button type="button" class="tv-nv p" aria-label="上一屏">‹</button><button type="button" class="tv-nv n" aria-label="下一屏">›</button></div>';
  var bz=el.firstChild;
  bz.addEventListener('mouseenter',function(){T.pause=1;});
  bz.addEventListener('mouseleave',function(){T.pause=0;});
  bz.addEventListener('focusin',function(){T.pause=1;});bz.addEventListener('focusout',function(){T.pause=0;});
  bz.addEventListener('click',function(e){var t=e.target,b=t.closest&&t.closest('.tv-nv'),g=t.closest&&t.closest('.tv-dots i');
   if(g){go(+g.getAttribute('data-i'));return;}if(b){step(b.classList.contains('p')?-1:1);return;}step(1);});
  bz.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){step(1);e.preventDefault();}else if(e.key==='ArrowLeft'){step(-1);e.preventDefault();}});
 }
 function avail(){var d=R();return SLIDES.filter(function(s){try{return s.ok(d);}catch(e){return false;}});}
 function kids(n){Array.prototype.forEach.call(n.children,function(c,k){c.style.setProperty('--i',k);});}
 function show(i,dir){
  var vw=$('tv-vw');if(!vw)return;var d=R(),L=T.list=avail();if(!L.length)return;
  i=((i%L.length)+L.length)%L.length;var s=L[i];T.i=i;T.cur=s.id;T.acc=0;
  var old=vw.querySelector('.tv-sl:not(.out)'),n=document.createElement('div');
  n.className='tv-sl';n.setAttribute('data-id',s.id);
  try{n.innerHTML=s.html(d);}catch(e){n.innerHTML='';}
  kids(n);
  if(old){old.classList.add('out');setTimeout(function(){if(old.parentNode)old.parentNode.removeChild(old);},420);}
  vw.appendChild(n);
  var ct=$('tv-ch'),tt=$('tv-tt'),dt=$('tv-dots'),sc=$('tv-sc');
  if(sc)sc.style.setProperty('--pan',i*PAN);
  if(ct)ct.textContent=z(i+1)+' / '+z(L.length);if(tt)tt.textContent=s.t;
  if(dt){var h='';for(var k=0;k<L.length;k++)h+='<i data-i="'+k+'" class="'+(k===i?'on':'')+'"></i>';dt.innerHTML=h;}
 }
 function step(dir){show(T.i+dir,dir);}
 function go(i){show(i,i<T.i?-1:1);}
 function tick(){
  if(!T.run)return;var now=Date.now(),dt=T.last?now-T.last:0;T.last=now;
  var el=T.el;if(!el||!el.offsetParent||document.hidden){return;}
  var big=$('tv-big');if(big){var n2=new Date(),b=z(n2.getHours())+'<i>:</i>'+z(n2.getMinutes());if(big.innerHTML!==b)big.innerHTML=b;}
  if(!T.pause)T.acc+=dt;
  if(T.acc>=SL)step(1);
  T.rt+=dt;if(T.rt>=2000){T.rt=0;sample();
   /* 当前屏上的数据变了就原地刷新(不重放入场动画); 时间屏只刷新最后一行 */
   var cur=T.list[T.i],v=$('tv-vw'),so=v&&v.querySelector('.tv-sl:not(.out)');
   if(cur&&so&&!T.pause){var nh;try{nh=cur.html(R());}catch(e){nh=null;}
    if(nh!=null){var tmp=document.createElement('div');tmp.innerHTML=nh;var cm=so.querySelector('.fl-note'),nm=tmp.querySelector('.fl-note');
     if(cur.id==='clock'){if(cm&&nm&&cm.innerHTML!==nm.innerHTML)cm.innerHTML=nm.innerHTML;}
     else if(so._h!==undefined&&so._h!==nh){so.classList.add('st');so.innerHTML=nh;kids(so);}
     so._h=nh;}}}
 }
 function start(){
  if(T.run)return;T.run=1;T.last=0;build();sample();
  if(T.i<0)show(0,1);
  T.tm=setInterval(tick,100);
 }
 function stop(){T.run=0;if(T.tm){clearInterval(T.tm);T.tm=0;}}
 function on(b){
  if(!T.el)T.el=$('dv-tv');if(!T.el)return;
  if(b)start();else stop();
 }
 /* 播报没开时也静默记速率(每 2 秒一次, 页面隐藏时不跑), 这样一开就有数 */
 function boot(){T.el=$('dv-tv');setInterval(function(){if(!document.hidden&&!T.run)sample();},2000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 window.MRT_TV={on:on,next:function(){step(1);},prev:function(){step(-1);},go:go,slides:function(){return avail().map(function(s){return s.id;});}};
})();
// Wind particles
function initWind(){
const w=document.getElementById('fan-wind');if(w){
const syms=['~','~','~','-','-','·','·','›','›','»'];
let html='';for(let i=0;i<24;i++){const top=5+Math.random()*80;const delay=Math.random()*6;const dur=1.5+Math.random()*3;const sym=syms[i%syms.length];const size=8+Math.random()*6;html+=`<i style="top:${top}%;left:-12px;--wd:${dur}s;--dd:${delay}s;font-size:${size}px">${sym}</i>`;}
w.innerHTML=html;}
const sk=document.getElementById('fan-streaks');if(sk){
let h='';for(let i=0;i<10;i++){const top=8+Math.random()*80;const sw=30+Math.random()*60;const delay=Math.random()*4;const dur=1.5+Math.random()*2;h+=`<div class="fan-streak" style="top:${top}%;width:${sw}px;--sd:${dur}s;animation-delay:${delay}s"></div>`;}
sk.innerHTML=h;}
}
function updateWindSpeed(pct){
const w=document.getElementById('fan-wind');if(w){w.querySelectorAll('i').forEach(el=>{const base=0.6+((100-pct)/100)*3;el.style.setProperty('--wd',base+'s');});}
const sk=document.getElementById('fan-streaks');if(sk){const spd=0.4+((100-pct)/100)*2.5;sk.querySelectorAll('.fan-streak').forEach(s=>{s.style.setProperty('--sd',spd+'s');});}
}
window.tc=tc;window.fanSet=fanSet;window.fanFree=fanFree;window.fanSlider=fanSlider;window.scrSet=scrSet;window.scrBright=scrBright;window.scrDim=scrDim;window.loadScrStatus=loadScrStatus;
// Screen control
function scrSet(screen,label){document.getElementById('scr-mode').textContent=label;updateScrBtns(label);toast('屏幕: '+label);XHR.get('/cgi-bin/luci/admin/display/set_screen',{screen:String(screen)},function(){});}
function scrBright(val){document.getElementById('scr-bright').textContent=val+'%';document.getElementById('scr-range-val').textContent=val+'%';updateScrRing(val);toast('亮度: '+val+'%');XHR.get('/cgi-bin/luci/admin/display/set_brightness',{percent:String(val)},function(){});}
function updateScrBtns(label){var btns=document.querySelectorAll('.sc-btn');for(var i=0;i<btns.length;i++){btns[i].classList.remove('active');}if(label==='Mwrt面板')document.getElementById('sc-mwrt').classList.add('active');else if(label==='文本显示')document.getElementById('sc-text').classList.add('active');else if(label==='API模式')document.getElementById('sc-api').classList.add('active');else if(label==='图片视频')document.getElementById('sc-media').classList.add('active');else if(label==='蜂窝信息')document.getElementById('sc-cell').classList.add('active');}
function scrDim(p){p=Math.max(0,Math.min(100,parseInt(p)||0));document.documentElement.style.setProperty('--scb',(p===0?0.05:0.2+0.8*p/100).toFixed(3));}
function updateScrRing(pct){scrDim(pct);var Cr=2*Math.PI*46;var fg=document.getElementById('scr-ring-fg');if(fg){fg.style.strokeDasharray=Cr;fg.style.strokeDashoffset=Cr-(pct/100)*Cr;}}
function loadScrStatus(){if(!document.getElementById('scr-card'))return;XHR.get('/cgi-bin/luci/admin/display/status',{},function(x,d){if(!d)return;var screen=parseInt(d.screen)||5;var pct=parseInt(d.percent)||72;var modes={5:'Mwrt面板',6:'文本显示',7:'API模式',8:'图片视频',9:'蜂窝信息'};var label=modes[screen]||'Mwrt面板';document.getElementById('scr-mode').textContent=label;document.getElementById('scr-bright').textContent=pct+'%';document.getElementById('scr-range').value=pct;document.getElementById('scr-range-val').textContent=pct+'%';document.getElementById('scr-status').textContent=d.enabled==='0'?'已关闭':'运行中';updateScrBtns(label);updateScrRing(pct);});}

/* ===================== WiFi 设置浮窗 =====================
   这页在此之前**全是只读**的 XHR.get, 这是唯一一处写操作, 所以多了两件别处
   没有的事: 一个 POST(带 CSRF token), 和一套提交前的本地校验。

   为什么写操作用 POST 而不是跟风这页其它 XHR.get: LuCI 的 dispatcher 只对
   POST 校验 token(dispatcher.lua 的 test_post_security), GET 不校验。
   改无线这种事必须挡住跨站请求 —— 否则别的网页可以拿着用户的会话 cookie
   偷偷改掉 SSID 和密码。token 从 L.env.token 取, 和 zmode/smsc.htm 的
   post() 一样的做法(那是这棵树里唯一的现成范例)。

   读当前值走 GET(wifi_get) —— 只读不改, 不需要 token。
   **密码不回传。** wifi_get 不给 key 字段, 输入框留空 = 不修改,
   后端只在收到非空 key 时才写。页面上永远不出现现有无线密码。 */
var WIFI_GET='/cgi-bin/luci/admin/modem/wifi_get';
var WIFI_SET='/cgi-bin/luci/admin/modem/wifi_set';
/* s63 第1项: 卡槽快速切换浮窗用的两个端点(读清单 / 切卡)。 */
var SIM_SLOTS='/cgi-bin/luci/admin/modem/simslots';
var SIM_SET='/cgi-bin/luci/admin/modem/simset';
/* s63 无线网桥: 扫描 / 状态 / 加入 / 断开。 */
var WLB_SCAN='/cgi-bin/luci/admin/modem/wlbridge_scan';
var WLB_STATUS='/cgi-bin/luci/admin/modem/wlbridge_status';
var WLB_JOIN='/cgi-bin/luci/admin/modem/wlbridge_join';
var WLB_LEAVE='/cgi-bin/luci/admin/modem/wlbridge_leave';
/* s111 无线设置浮窗: 双频合一。
   模式 wfmMode: 'both' = 2.4G 与 5G 同名同密码(只显示一组输入框 + 提示); '2g' / '5g' = 分别编辑(顶部分段切换)。
   打开时一次读两个频段(band=both), 服务端比较 SSID/加密/密码是否一致给出 merged, 一致就直接进合一模式。
   密码不回传: 留空 = 不修改; 但"分开 → 合一"时两边密码本来就不同, 必须填新密码(wfmNeedKey)。 */
var wfmMode='';       /* 'both' | '2g' | '5g' */
var wfmBusy=false;    /* 保存中: 挡住重复提交 */
var wfmEncCur='';     /* 当前模式打开时的加密方式, 用来判断"原本就没密码" */
var wfmMerged=false;  /* 服务端读到的初始状态: 两个频段是否本来就合一 */
var wfmNeedKey=false; /* 分开 → 合一: 没有哪个"原密码"可以保留, 必须填 */
var wfmSolo=false;    /* 只有一个频段的机器: 不显示合一开关 */
var wfmData=null,wfmDraft={};

function wfmEl(id){return document.getElementById(id);}

/* 加密方式下拉: 设备上可能是下拉里没列的写法(psk、wpa-mixed 之类), 不能默默改成 psk-mixed ——
   那等于用户一打开再点保存就被偷偷降级。把原值作为一条额外选项插进去并选中, 原样保留。 */
function wfmEncSet(v){
 var sel=wfmEl('wfm-enc'),hit=false,i;
 for(i=sel.options.length-1;i>=0;i--){if(sel.options[i].getAttribute('data-x'))sel.remove(i);}
 for(i=0;i<sel.options.length;i++){if(sel.options[i].value===v){sel.selectedIndex=i;hit=true;break;}}
 if(!hit){
  var op=document.createElement('option');
  op.value=v;op.setAttribute('data-x','1');op.textContent='当前: '+v+' (保持不变)';
  sel.appendChild(op);sel.selectedIndex=sel.options.length-1;
 }
}

/* s112 无线高级设置: 信道 / 模式与带宽 / 发射功率 (每个频段各一组) + 隐藏名称 / 终端隔离 (两频段共用一个开关)。
   取值范围全部来自服务端 adv(驱动报出的信道表和带宽表); 只提交改过的项。 */
var waOrig={},waSwOrig={};
function waModeTxt(m){
 var r=/^(EHT|HE|VHT|HT)(\d+)$/.exec(m);if(!r)return m;
 return {EHT:'Wi-Fi 7',HE:'Wi-Fi 6',VHT:'Wi-Fi 5',HT:'Wi-Fi 4'}[r[1]]+' · '+r[2]+' MHz';
}
function waRank(m){var r=/^(EHT|HE|VHT|HT)(\d+)$/.exec(m);return r?({EHT:4,HE:3,VHT:2,HT:1}[r[1]]*1000+(+r[2])):0;}
/* 当前值不在列表里(例如 DFS 信道)时补一条「当前: x」并选中, 不偷偷改掉 */
function waSelect(id,opts,cur){
 var s=wfmEl(id),i,hit=false,o;
 s.innerHTML='';
 for(i=0;i<opts.length;i++){
  o=document.createElement('option');o.value=opts[i][0];o.textContent=opts[i][1];s.appendChild(o);
  if(opts[i][0]===cur){hit=true;o.selected=true;}
 }
 if(!hit){o=document.createElement('option');o.value=cur;o.textContent='当前: '+cur;s.appendChild(o);o.selected=true;}
}
function waFill(b){
 var d=wfmData&&wfmData.bands&&wfmData.bands[b],a=d&&d.adv,i;
 if(!a)return;
 var ch=[['auto','自动']],tx=[['100','100%'],['75','75%'],['50','50%'],['25','25%']];
 var ht=(a.htmodes||[]).slice().sort(function(x,y){return waRank(y)-waRank(x);}).map(function(m){return [m,waModeTxt(m)];});
 for(i=0;i<(a.channels||[]).length;i++)ch.push([String(a.channels[i]),String(a.channels[i])]);
 var cur={ch:String(a.channel),ht:String(a.htmode),tx:String(a.txpower)};
 waSelect('wa-ch-'+b,ch,cur.ch);waSelect('wa-ht-'+b,ht,cur.ht);waSelect('wa-tx-'+b,tx,cur.tx);
 waOrig[b]=cur;
}
function waView(mode){
 var both=mode==='both';
 ['2g','5g'].forEach(function(b){
  var el=wfmEl('wa-band-'+b);
  el.hidden=!waOrig[b]||!(both||b===mode);el.classList.toggle('one',!both);
 });
}
function waSwSet(id,on){wfmEl(id).setAttribute('aria-checked',on?'true':'false');}
function waSwGet(id){return wfmEl(id).getAttribute('aria-checked')==='true';}
function waSw(id){waSwSet(id,!waSwGet(id));}
function waWide(){return !!(window.matchMedia&&matchMedia('(min-width:821px)').matches);}
function waToggle(){
 if(waWide())return;   /* 电脑宽屏下高级设置固定展开, 不折叠 */
 var b=wfmEl('wa-b'),open=b.hidden;
 b.hidden=!open;wfmEl('wa-t').setAttribute('aria-expanded',open?'true':'false');
}
function waReset(){
 waOrig={};waSwOrig={};
 var b=wfmEl('wa-b');if(b){var w=waWide();b.hidden=!w;wfmEl('wa-t').setAttribute('aria-expanded',w?'true':'false');}
}

/* 切换到某个模式并把输入框填成该模式的内容。切走前把当前的名称/加密记成草稿(密码从不记), 切回来不丢。 */
function wfmShow(mode){
 var curSsid=wfmEl('wfm-ssid').value,prev=wfmMode;
 if(prev)wfmDraft[prev]={ssid:curSsid,enc:wfmEl('wfm-enc').value,hid:waSwGet('wa-hid'),iso:waSwGet('wa-iso')};
 wfmMode=mode;
 var both=mode==='both',B=wfmData.bands,src=both?(B['2g']||B['5g']):B[mode],dr=wfmDraft[mode];
 wfmEl('wfm-ssid').value=dr?dr.ssid:(both&&prev?curSsid:src.ssid);
 wfmEncSet(dr?dr.enc:src.encryption);
 wfmEl('wfm-key').value='';wfmEl('wfm-key').type='password';
 wfmEl('wfm-eye').innerHTML='<i class="fas fa-eye"></i>';
 wfmNeedKey=both&&!wfmMerged&&!wfmSolo;
 wfmEncCur=wfmNeedKey?'':src.encryption;
 wfmEl('wfm-sw').setAttribute('aria-checked',both?'true':'false');
 wfmEl('wfm-tabs').hidden=both||wfmSolo;
 wfmEl('wfm-mh').hidden=!both;
 var tb=wfmEl('wfm-tabs').querySelectorAll('button'),i;
 for(i=0;i<tb.length;i++)tb[i].classList.toggle('on',tb[i].getAttribute('data-b')===mode);
 wfmEl('wfm-sub').textContent=both?'2.4G + 5G 同步修改'
  :(src.device||'')+(src.disabled?' · 当前已关闭':'')||'--';
 wfmEl('wfm-kh').textContent=wfmNeedKey?'合为一组后需要设置一个新密码, 8 - 63 个字符'
  :'8 - 63 个字符。留空则保留原密码不变';
 var adv=wfmEl('wfm-adv');
 if(adv)adv.href=(adv.getAttribute('data-u')||'')+'?mwrt_edit='+(both?'2g':mode);
 var sa=src.adv||{};
 waSwOrig[mode]={hid:!!sa.hidden,iso:!!sa.isolate};
 waSwSet('wa-hid',dr&&dr.hid!==undefined?dr.hid:!!sa.hidden);
 waSwSet('wa-iso',dr&&dr.iso!==undefined?dr.iso:!!sa.isolate);
 wfmEl('wa').hidden=!src.adv;
 waView(mode);
 wfmEnc();
}

function wfmMerge(){if(wfmData&&!wfmBusy&&!wfmSolo)wfmShow(wfmMode==='both'?'2g':'both');}
function wfmTab(b){if(wfmData&&!wfmBusy&&b!==wfmMode)wfmShow(b);}

function wfmOpen(band){
 var m=wfmEl('wfm');if(!m)return;
 wfmBusy=false;wfmData=null;wfmDraft={};wfmMode='';wfmSolo=false;wfmMerged=false;waReset();
 wfmEl('wfm-sub').textContent='读取当前配置…';
 /* 先清空再填: 上一次打开的残留值会让人以为读到的是这次的 */
 wfmEl('wfm-ssid').value='';wfmEl('wfm-key').value='';wfmEl('wfm-key').type='password';
 wfmEl('wfm-eye').innerHTML='<i class="fas fa-eye"></i>';
 wfmEl('wfm-ok').disabled=true;
 /* 罩只盖右侧内容区, 不连左边菜单栏一起盖; 取内容区实际左沿, 每次打开量一次 */
 var host=document.querySelector('.main-right')||document.getElementById('maincontent');
 var left=0;
 if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
 m.style.setProperty('--wfm-l',left+'px');try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
 m.classList.add('open');m.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 var want=band==='5g'?'5g':'2g';
 XHR.get(WIFI_GET,{band:'both'},function(x,d){
  if(d&&d.ok&&d.bands){
   wfmData=d;wfmMerged=!!d.merged;
   waFill('2g');waFill('5g');
   wfmEl('wfm-ok').disabled=false;
   wfmShow(wfmMerged?'both':want);
   return;
  }
  /* 读不到两个频段(只有单频段的机器): 退回只编辑被点的那个, 不显示合一开关 */
  XHR.get(WIFI_GET,{band:want},function(x2,s){
   if(!s||!s.ok){wfmEl('wfm-sub').textContent=(s&&s.error)||(d&&d.error)||'读取失败, 请稍后重试';return;}
   var bb={};bb[want]=s;wfmData={bands:bb};wfmSolo=true;
   waFill(want);
   wfmEl('wfm-ok').disabled=false;
   wfmShow(want);
  });
 });
}

function wfmClose(){
 var m=wfmEl('wfm');if(!m)return;
 if(wfmBusy)return;   /* 正在保存: 不让关, 免得用户以为没提交 */
 m.classList.remove('open');m.setAttribute('aria-hidden','true');
 document.body.style.overflow='';
 wfmEl('wfm-key').value='';   /* 别把输入过的密码留在 DOM 里 */
}

function wfmEye(){
 var i=wfmEl('wfm-key'),b=wfmEl('wfm-eye');if(!i||!b)return;
 var show=i.type==='password';
 i.type=show?'text':'password';
 b.innerHTML=show?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';
}

/* 选了"不加密"就没有密码可填。开放网络是真实的安全后果, 警告措辞要比"重连一下"重。 */
function wfmEnc(){
 var sel=wfmEl('wfm-enc'),key=wfmEl('wfm-key'),warn=wfmEl('wfm-warn-t');
 if(!sel||!key)return;
 var open=sel.value==='none';
 key.disabled=open;
 key.placeholder=open?'开放网络无需密码':(wfmNeedKey?'请输入新密码':'留空表示不修改');
 if(open)key.value='';
 if(warn)warn.innerHTML=open
  ?'<b>开放网络不加密</b>: 任何人都能连接, 无线上的数据也能被旁人抓取。仅建议临时使用。保存后无线会重启, 已连接的设备需要重新接入。'
  :'保存后无线会重启, 已连接的设备需要重新接入。如果你正通过 WiFi 访问本页面, 连接会中断, 请改用新名称和密码重连。';
}

function wfmSave(){
 if(wfmBusy||!wfmMode)return;
 var ssid=(wfmEl('wfm-ssid').value||'').trim(),key=wfmEl('wfm-key').value||'',enc=wfmEl('wfm-enc').value;
 /* 本地先挡明显不合法的(后端同样校验)。SSID 上限是 32 字节, 中文每字 3 字节, 按字节数算 */
 if(!ssid){toast('网络名称不能为空');return;}
 if(unescape(encodeURIComponent(ssid)).length>32){toast('网络名称不能超过 32 字节(中文每字约 3 字节)');return;}
 if(enc!=='none'&&key&&(key.length<8||key.length>63)){toast('无线密码需要 8 - 63 个字符');return;}
 if(enc!=='none'&&!key&&(wfmNeedKey||wfmEncCur==='none')){
  toast(wfmNeedKey?'合为双频合一需要设置一个新密码':'从开放网络改为加密, 需要设置无线密码');return;}
 wfmBusy=true;
 var ok=wfmEl('wfm-ok');
 ok.disabled=true;ok.innerHTML='<i class="fas fa-spinner fa-spin"></i> 正在应用…';
 var fields={band:wfmMode,ssid:ssid,encryption:enc,key:key,token:(window.L&&L.env&&L.env.token)||''};
 /* 高级项只提交改过的: 没动的不写, 也就不会因为列表里没有的旧值被拒 */
 (wfmMode==='both'?['2g','5g']:[wfmMode]).forEach(function(b){
  if(!waOrig[b])return;
  ['ch','ht','tx'].forEach(function(k){
   var v=wfmEl('wa-'+k+'-'+b).value;if(v!==waOrig[b][k])fields[k+'_'+b]=v;
  });
 });
 var so=waSwOrig[wfmMode];
 if(so){
  if(waSwGet('wa-hid')!==so.hid)fields.hidden=waSwGet('wa-hid')?'1':'0';
  if(waSwGet('wa-iso')!==so.iso)fields.isolate=waSwGet('wa-iso')?'1':'0';
 }
 /* 165 信道只有 20 MHz; 后端同样会拦, 这里省一次来回 */
 if(waOrig['5g']&&(wfmMode==='both'||wfmMode==='5g')){
  var c5=wfmEl('wa-ch-5g').value,h5=wfmEl('wa-ht-5g').value,w5=+((/(\d+)$/.exec(h5)||[])[1]||0);
  if(c5==='165'&&w5>20){wfmBusy=false;ok.disabled=false;ok.innerHTML='<i class="fas fa-check"></i> 保存并应用';toast('5G 的 165 信道只能使用 20 MHz 带宽');return;}
 }
 var body=[],k;
 for(k in fields)body.push(encodeURIComponent(k)+'='+encodeURIComponent(fields[k]));
 var xhr=new XMLHttpRequest();
 xhr.open('POST',WIFI_SET,true);
 xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 xhr.onreadystatechange=function(){
  if(xhr.readyState!=4)return;
  wfmBusy=false;
  ok.disabled=false;ok.innerHTML='<i class="fas fa-check"></i> 保存并应用';
  var rv=null;try{rv=JSON.parse(xhr.responseText);}catch(e){}
  if(xhr.status===403){toast('会话已过期, 请刷新页面后重试');return;}
  if(!rv||!rv.ok){toast((rv&&rv.error)||'保存失败 (HTTP '+xhr.status+')');return;}
  toast('无线设置已保存, 正在重启无线…');
  wfmClose();   /* 页面上的值等无线起来后由正常轮询刷新, 不自己改 */
 };
 xhr.send(body.join('&'));
}

/* === s111 第2项: 网口卡片上的 WAN / LAN 设置浮窗 ===
   沿用 wfm 浮窗壳。WAN 参照 mwrt-portsw.js 的「上网方式」三选一(DHCP / 宽带拨号 / 静态 IP),
   LAN 给地址 + 掩码 + DHCP 服务(起始 / 数量 / 租期)。后端是 wan_get/wan_set、lan_get/lan_set,
   写入必须 POST 且带 CSRF token;宽带密码不回传,留空 = 不修改。 */
var PC_URL={
 wg:'/cgi-bin/luci/admin/modem/wan_get',
 ws:'/cgi-bin/luci/admin/modem/wan_set',
 lg:'/cgi-bin/luci/admin/modem/lan_get',
 ls:'/cgi-bin/luci/admin/modem/lan_set'};
var PC_PD={dhcp:'自动从上级路由器或光猫获取地址，大多数家庭宽带选这个。',
 pppoe:'光猫是桥接模式时，在这里填运营商提供的宽带账号和密码拨号上网。',
 static:'上级网络要求固定地址时填写，参数请向网络管理员确认。'};
var pcBusy={w:false,l:false},pcSeq=0,pcProtoCur='dhcp',pcHasPass=false,pcRedir=0;
function pcIp4(s){var m=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);if(!m)return null;var n=0,i,v;
 for(i=1;i<5;i++){v=+m[i];if(v>255)return null;n=n*256+v;}return n;}
function pcBits(s){var n=pcIp4(s),b;if(n===null)return -1;
 for(b=0;b<=32;b++)if(n===4294967296-Math.pow(2,32-b))return b;return -1;}
function pcErr(k,msg){
 var e=wfmEl('pc'+k+'-err'),t=wfmEl('pc'+k+'-err-t');if(!e)return;
 t.textContent=msg||'';e.classList.toggle('show',!!msg);
 if(!msg){var bad=document.querySelectorAll('#pc'+k+' input.bad'),i;for(i=0;i<bad.length;i++)bad[i].classList.remove('bad');}
}
function pcBad(k,id,msg){
 pcErr(k,msg);var e=wfmEl('pc'+k+'-'+id);if(e){e.classList.add('bad');try{e.focus();}catch(x){}}
}
function pcOpenBox(k){
 var m=wfmEl('pc'+k);if(!m)return null;
 wfmEl('pc'+k+'-win').classList.remove('done');
 /* 罩只盖右侧内容区,和 wfmOpen 同一套量法 */
 var host=document.querySelector('.main-right')||document.getElementById('maincontent'),left=0;
 if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
 m.style.setProperty('--wfm-l',left+'px');try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
 pcErr(k,'');
 m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
 return m;
}
function pcClose(k){
 if(pcBusy[k])return;   /* 正在保存: 不让关 */
 var m=wfmEl('pc'+k);if(!m)return;
 m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';
 if(k==='w')wfmEl('pcw-pass').value='';   /* 别把输入过的密码留在 DOM 里 */
 if(pcRedir){clearInterval(pcRedir);pcRedir=0;}
}
function pcPost(url,fields,cb){
 fields.token=(window.L&&L.env&&L.env.token)||'';
 var body=[],k;for(k in fields)body.push(encodeURIComponent(k)+'='+encodeURIComponent(fields[k]));
 var x=new XMLHttpRequest();x.open('POST',url,true);x.timeout=20000;
 x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 x.onreadystatechange=function(){if(x.readyState!=4)return;
  var rv=null;try{rv=JSON.parse(x.responseText);}catch(e){}cb(rv,x.status);};
 x.send(body.join('&'));
}
function pcEye(){
 var i=wfmEl('pcw-pass'),b=wfmEl('pcw-eye');if(!i||!b)return;var s=i.type==='password';
 i.type=s?'text':'password';b.innerHTML=s?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';
}
/* ---- WAN ---- */
function pcProto(p){
 if(pcBusy.w)return;pcProtoCur=p;pcErr('w','');
 var b=document.querySelectorAll('#pcw .wfm-tabs button'),i;
 for(i=0;i<b.length;i++){var on=b[i].getAttribute('data-p')===p;b[i].classList.toggle('on',on);b[i].setAttribute('aria-checked',on?'true':'false');}
 wfmEl('pcw-pd').textContent=PC_PD[p]||'';
 wfmEl('pcw-f-pppoe').hidden=p!=='pppoe';
 wfmEl('pcw-f-static').hidden=p!=='static';
}
/* s130: WAN=蜂窝模组(wwan0)——没有 PPPoE/DHCP/静态可配, 弹窗改只读信息
   + 「前往移动网络」, 不再进宽带拨号表单(在本机必然保存失败)。 */
function pcWanCell(d,m){
 var T=function(id,v){var e=wfmEl(id);if(e)e.textContent=(v==null||v==='')?'--':v;};
 T('pcw-cell-state',d.state);T('pcw-cell-op',d.operator);
 T('pcw-cell-rat',(d.rat||'--')+(d.band?' · band '+d.band:''));
 T('pcw-cell-apn',d.apn);T('pcw-cell-ip',d.ip);
 T('pcw-cell-rsrp',(d.rsrp!=null?Math.round(d.rsrp)+' dBm':'--'));
 var cb=m.querySelector('#pcw-cell');if(cb)cb.hidden=false;
 ['pcw-f-pppoe','pcw-f-static'].forEach(function(id){var e=wfmEl(id);if(e)e.hidden=true;});
 var tabs=m.querySelector('.wfm-tabs');if(tabs)tabs.hidden=true;
 var pd=wfmEl('pcw-pd');if(pd)pd.hidden=true;
 var warn=m.querySelector('.pc-main .wfm-warn');if(warn)warn.hidden=true;
 var ok=wfmEl('pcw-ok');if(ok){ok.disabled=true;ok.hidden=true;}
 wfmEl('pcw-sub').textContent=(d.device||'wwan0')+' · '+(d.state||'蜂窝');
}
function pcWanOpen(){
 var m=pcOpenBox('w');if(!m)return;
 /* 重置蜂窝信息块与被隐藏的表单区（上次打开可能进过蜂窝分支） */
 var cb0=m.querySelector('#pcw-cell');if(cb0)cb0.hidden=true;
 var tabs0=m.querySelector('.wfm-tabs');if(tabs0)tabs0.hidden=false;
 var pd0=wfmEl('pcw-pd');if(pd0)pd0.hidden=false;
 var warn0=m.querySelector('.pc-main .wfm-warn');if(warn0)warn0.hidden=false;
 var ok0=wfmEl('pcw-ok');if(ok0){ok0.hidden=false;ok0.disabled=true;}
 var my=++pcSeq,ids=['user','pass','ip','mask','gw','dns'],i;
 for(i=0;i<ids.length;i++)wfmEl('pcw-'+ids[i]).value='';
 wfmEl('pcw-pass').type='password';wfmEl('pcw-eye').innerHTML='<i class="fas fa-eye"></i>';
 wfmEl('pcw-sub').textContent='读取当前配置…';wfmEl('pcw-ok').disabled=true;
 XHR.get(PC_URL.wg,{},function(x,d){
  if(my!==pcSeq)return;
  if(d&&d.cellular){pcWanCell(d,m);return;}
  if(!d||!d.ok){wfmEl('pcw-sub').textContent=(d&&d.error)||'读取失败，请稍后重试';return;}
  var st=d.proto==='static',PN={dhcp:'DHCP',pppoe:'宽带拨号',static:'静态 IP'};
  pcHasPass=!!d.has_pass;
  wfmEl('pcw-sub').textContent=(d.device||'WAN')+' · 当前为 '+(PN[d.proto]||d.proto);
  wfmEl('pcw-user').value=d.username||'';
  wfmEl('pcw-pass').placeholder=pcHasPass?'已保存，留空表示不修改':'请输入宽带密码';
  wfmEl('pcw-ip').value=st?(d.ipaddr||''):'';
  wfmEl('pcw-mask').value=(st&&d.netmask)||'255.255.255.0';
  wfmEl('pcw-gw').value=st?(d.gateway||''):'';
  wfmEl('pcw-dns').value=d.dns||'223.5.5.5 119.29.29.29';
  pcProto(PC_PD[d.proto]?d.proto:'dhcp');
  wfmEl('pcw-ok').disabled=false;
 });
}
/* 本地先挡一遍,文案和后端一致;真正的闸门在后端 */
function pcWanCheck(f){
 if(f.proto==='pppoe'){
  if(!f.username)return['user','请填写宽带账号。'];
  if(!f.password&&!pcHasPass)return['pass','请填写宽带密码。'];
 }else if(f.proto==='static'){
  var n=pcIp4(f.ipaddr),o1=n===null?0:Math.floor(n/16777216);
  if(n===null||o1===0||o1===127||o1>=224)return['ip','请填写正确的 IP 地址。'];
  if(pcBits(f.netmask)<1)return['mask','请填写正确的子网掩码。'];
  if(f.gateway&&pcIp4(f.gateway)===null)return['gw','请填写正确的网关地址。'];
  var d=f.dns.split(/[\s,，]+/).filter(Boolean),i;
  for(i=0;i<d.length;i++)if(pcIp4(d[i])===null)return['dns','DNS 服务器地址不正确：'+d[i]];
 }
 return null;
}
function pcWanSave(){
 if(pcBusy.w)return;
 var f={proto:pcProtoCur,username:wfmEl('pcw-user').value.trim(),password:wfmEl('pcw-pass').value,
  ipaddr:wfmEl('pcw-ip').value.trim(),netmask:wfmEl('pcw-mask').value.trim(),
  gateway:wfmEl('pcw-gw').value.trim(),dns:wfmEl('pcw-dns').value.trim()};
 var bad=pcWanCheck(f);if(bad){pcBad('w',bad[0],bad[1]);return;}
 pcErr('w','');
 if(f.proto!=='pppoe'){f.username='';f.password='';}
 if(f.proto!=='static'){f.ipaddr=f.netmask=f.gateway=f.dns='';}
 pcBusy.w=true;var ok=wfmEl('pcw-ok');ok.disabled=true;ok.innerHTML='<i class="fas fa-spinner fa-spin"></i> 正在应用…';
 pcPost(PC_URL.ws,f,function(rv,st){
  pcBusy.w=false;ok.disabled=false;ok.innerHTML='<i class="fas fa-check"></i> 保存并应用';
  if(st===403){pcErr('w','会话已过期，请刷新页面后重试。');return;}
  if(st===0){pcErr('w','没有收到路由器的回应。网络可能正在重新加载，请稍候刷新页面确认。');return;}
  if(!rv||!rv.ok){pcErr('w',(rv&&rv.error)||('保存失败（HTTP '+st+'）'));return;}
  var T={dhcp:'届时自动从上级路由或光猫获取地址。',pppoe:'届时用宽带账号拨号上网。',static:'届时使用填写的静态地址上网。'};
  wfmEl('pcw-done-t').textContent='网络正在重新加载，约 10 秒后生效，'+(T[f.proto]||'')+(rv.failover?'网关存活已跟随更新。':'');
  wfmEl('pcw-win').classList.add('done');wfmEl('pcw-pass').value='';
 });
}
/* ---- LAN ---- */
var pcLanOld='',pcLanDhcp=true;
function pcDhcp(){
 if(pcBusy.l)return;pcLanDhcp=!pcLanDhcp;
 wfmEl('pcl-sw').setAttribute('aria-checked',pcLanDhcp?'true':'false');
 wfmEl('pcl-dh').hidden=!pcLanDhcp;pcLanSync();
}
/* 地址池预览: 按「网络地址 + 起始」算出第一个和最后一个,超出网段就提示 */
function pcLanSync(){
 var r=wfmEl('pcl-rng'),n=pcIp4(wfmEl('pcl-ip').value.trim()),b=pcBits(wfmEl('pcl-mask').value.trim());
 var s=parseInt(wfmEl('pcl-start').value,10),l=parseInt(wfmEl('pcl-limit').value,10);
 if(!pcLanDhcp||n===null||b<16||b>30||!(s>=1)||!(l>=1)){r.textContent='填好地址、掩码、起始和数量后，这里显示实际的地址范围。';return;}
 var k=Math.pow(2,32-b),base=Math.floor(n/k)*k;
 if(s+l-1>k-2){r.textContent='地址池超出了这个网段的范围（最多 '+(k-2)+' 个地址）。';return;}
 function dot(v){return[Math.floor(v/16777216)%256,Math.floor(v/65536)%256,Math.floor(v/256)%256,v%256].join('.');}
 r.innerHTML='地址范围 <b>'+dot(base+s)+'</b> – <b>'+dot(base+s+l-1)+'</b>，共 '+l+' 个';
}
function pcLanOpen(){
 var m=pcOpenBox('l');if(!m)return;
 var my=++pcSeq,b=wfmEl('pcl-done-b');
 b.textContent='完成';b.onclick=function(){pcClose('l');};
 wfmEl('pcl-sub').textContent='读取当前配置…';wfmEl('pcl-ok').disabled=true;
 XHR.get(PC_URL.lg,{},function(x,d){
  if(my!==pcSeq)return;
  if(!d||!d.ok){wfmEl('pcl-sub').textContent=(d&&d.error)||'读取失败，请稍后重试';return;}
  pcLanOld=d.ipaddr;pcLanDhcp=!!d.dhcp;
  wfmEl('pcl-sub').textContent='当前地址 '+d.ipaddr+(d.dhcp?' · DHCP 已开启':' · DHCP 已关闭');
  wfmEl('pcl-ip').value=d.ipaddr;wfmEl('pcl-mask').value=d.netmask||'255.255.255.0';
  wfmEl('pcl-start').value=d.start;wfmEl('pcl-limit').value=d.limit;
  var sel=wfmEl('pcl-lease');sel.value=d.leasetime;if(sel.value!==d.leasetime)sel.value='12h';
  wfmEl('pcl-sw').setAttribute('aria-checked',pcLanDhcp?'true':'false');wfmEl('pcl-dh').hidden=!pcLanDhcp;
  pcLanSync();wfmEl('pcl-ok').disabled=false;
 });
}
function pcLanCheck(f){
 var n=pcIp4(f.ipaddr);
 if(n===null)return['ip','请填写正确的 LAN IP 地址。'];
 var o1=Math.floor(n/16777216),o2=Math.floor(n/65536)%256;
 if(!(o1===10||(o1===172&&o2>=16&&o2<=31)||(o1===192&&o2===168)))return['ip','局域网地址请用私有网段：10.x.x.x、172.16~31.x.x 或 192.168.x.x。'];
 var b=pcBits(f.netmask);
 if(b<16||b>30)return['mask','子网掩码不正确，请用 255.255.0.0 到 255.255.255.252 之间的掩码。'];
 var k=Math.pow(2,32-b);
 if(n%k===0||n%k===k-1)return['ip','这个 IP 是网段的网络地址或广播地址，不能给路由器用。'];
 if(f.dhcp==='1'){
  var s=+f.start,l=+f.limit;
  if(!(s>=1)||s!==Math.floor(s))return['start','地址池起始位置不正确。'];
  if(!(l>=1)||l!==Math.floor(l))return['limit','地址池数量不正确。'];
  if(s+l-1>k-2)return['limit','地址池超出了这个网段的范围（最多 '+(k-2)+' 个地址），请减小起始位置或数量。'];
 }
 return null;
}
function pcLanSave(){
 if(pcBusy.l)return;
 var f={ipaddr:wfmEl('pcl-ip').value.trim(),netmask:wfmEl('pcl-mask').value.trim(),dhcp:pcLanDhcp?'1':'0',
  start:wfmEl('pcl-start').value.trim(),limit:wfmEl('pcl-limit').value.trim(),leasetime:wfmEl('pcl-lease').value};
 var bad=pcLanCheck(f);if(bad){pcBad('l',bad[0],bad[1]);return;}
 pcErr('l','');
 pcBusy.l=true;var ok=wfmEl('pcl-ok');ok.disabled=true;ok.innerHTML='<i class="fas fa-spinner fa-spin"></i> 正在应用…';
 pcPost(PC_URL.ls,f,function(rv,st){
  pcBusy.l=false;ok.disabled=false;ok.innerHTML='<i class="fas fa-check"></i> 保存并应用';
  if(st===403){pcErr('l','会话已过期，请刷新页面后重试。');return;}
  if(st===0){pcErr('l','没有收到路由器的回应。网络可能正在重新加载，请稍候刷新页面确认。');return;}
  if(!rv||!rv.ok){pcErr('l',(rv&&rv.error)||('保存失败（HTTP '+st+'）'));return;}
  var t=wfmEl('pcl-done-t'),b=wfmEl('pcl-done-b');
  if(rv.changed_ip){
   /* 路由器地址变了: 当前这条连接会断,倒计时后改去新地址;访问者本来就用别的名字(域名/其它地址)时同样处理 */
   var left=10,url=location.protocol+'//'+rv.ipaddr+location.pathname;
   var go=function(){location.href=url;};
   b.textContent='立即前往新地址';b.onclick=go;
   var tick=function(){t.textContent='路由器地址已改为 '+rv.ipaddr+'，网络正在重新加载。'+left+' 秒后自动跳转到新地址；若设备没有自动获取到新网段的地址，请重新连接网络或拔插网线后访问 '+rv.ipaddr+'。';};
   tick();pcRedir=setInterval(function(){left--;if(left<=0){clearInterval(pcRedir);pcRedir=0;go();return;}tick();},1000);
  }else{
   t.textContent='局域网正在重新加载，约 10 秒后生效，已连接的设备会重新获取地址。';
  }
  wfmEl('pcl-win').classList.add('done');
 });
}
window.pcWanOpen=pcWanOpen;window.pcLanOpen=pcLanOpen;window.pcClose=pcClose;window.pcProto=pcProto;window.pcEye=pcEye;
window.pcWanSave=pcWanSave;window.pcLanSave=pcLanSave;window.pcDhcp=pcDhcp;window.pcLanSync=pcLanSync;

/* Esc 关窗: 浮窗类控件的常规约定。挂在 document 上一次就够,
   没开的时候 classList 判断直接短路。 */
document.addEventListener('keydown',function(e){
 if(e.key!=='Escape')return;
 var m=wfmEl('wfm');
 if(m&&m.classList.contains('open')){wfmClose();return;}
 var c=wfmEl('caw');
 if(c&&c.classList.contains('open')){caClose();return;}
 var sm=wfmEl('sim');
 if(sm&&sm.classList.contains('open')){simClose();return;}
 var wb=wfmEl('wlb');
 if(wb&&wb.classList.contains('open')){wlbClose();return;}
 var pa=wfmEl('pcw');if(pa&&pa.classList.contains('open')){pcClose('w');return;}
 var pb=wfmEl('pcl');if(pb&&pb.classList.contains('open'))pcClose('l');
});

/* === s63 第2项: 频段卡(#hm-band)点击 → 载波聚合浮窗(caPop) ===
   复用 WiFi 设置那套 .caw 浮窗壳(和 wfm 同一套 fixed+--wfm-l 居中罩), 内容区塞
   cxCaHtml(true) 的 ca-hd + ca-grid。cellx 30 秒一刷, 点开时先用手头的 cellx 立即
   渲染, 再 cxLoad 拉一次最新的覆盖 —— 不让用户对着过期数据。 */
function cawLeft(m){
 /* 和 wfmOpen 同一套: 只让罩盖住右侧内容区, 不连菜单栏一起盖。窄屏下 left=0 即全屏居中。 */
 var host=document.querySelector('.main-right')||document.getElementById('maincontent');
 var left=0;
 if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
 m.style.setProperty('--wfm-l',left+'px');try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
}
function caPaint(){
 var body=wfmEl('caw-body');if(!body)return;
 var hasCa=cellx&&cellx.supported&&Array.isArray(cellx.ca)&&cellx.ca.filter(function(c){return c&&c.band!=null&&c.band!=='';}).length;
 if(hasCa){body.innerHTML='<div class="clb clb-tall" style="max-height:none;margin-top:0">'+cxCaHtml(true)+'</div>';}
 else{body.innerHTML='<div class="caw-empty"><i class="fas fa-wave-square"></i><span>'+
  (cellx&&cellx.supported?'当前未拨号或暂无载波数据':'本模组不提供载波聚合信息')+'</span></div>';}
}
function caPop(){
 var m=wfmEl('caw');if(!m)return;
 cawLeft(m);
 m.classList.add('open');m.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 caPaint();                 /* 先用手头数据画, 不等请求 */
 cxLoad(function(){ if(m.classList.contains('open'))caPaint(); });  /* 再拉最新覆盖 */
}
function caClose(){
 var m=wfmEl('caw');if(!m)return;
 m.classList.remove('open');m.setAttribute('aria-hidden','true');
 document.body.style.overflow='';
}

/* === s63 第1项: 卡槽 SIM 卡(#hm-sim)点击 → 快速切卡浮窗(simPop) ===
   复用 WiFi 设置那套 .caw 浮窗壳, 不跳转到「卡槽/UI」页。可切的卡槽清单由后端
   admin/modem/simslots 给(判据与 cbi/modem5700 一致: C2000 三卡槽 0/6/1, 其余机型
   只有"机身卡槽" 6), 当前卡槽高亮。选一个点"切换"→ POST admin/modem/simset(带 CSRF
   token), 后端写 simsel+commit 再后台跑 mt5700m.sh(~30s); 浮窗转入"切换中", 轮询
   simstat 的 busy, 完成后收尾 + toast。切卡是硬件敏感动作, 全部闸门在服务端白名单。 */
var simOk=0;            /* s157 内置卡确认标记(非 5700 模组切内置卡要先确认原装) */
var simBusy=false;      /* 正在切卡: 挡住重复提交, 也不让关窗 */
var simSlots=[];        /* 本机型可切的卡槽清单 [{v,label}] */
var simCur='';          /* 打开时的当前卡槽值 */
var simPoll=null;       /* 切换中轮询 simstat 的定时器 */
function simStop(){ if(simPoll){clearInterval(simPoll);simPoll=null;} }
function simPaint(){
 var body=wfmEl('sim-body');if(!body)return;
 if(!simSlots.length){
  body.innerHTML='<div class="caw-empty"><i class="fas fa-sim-card"></i><span>本模组不支持在此页切卡</span></div>';
  return;
 }
 var h='<div class="sim-list" role="radiogroup" aria-label="选择卡槽">';
 simSlots.forEach(function(s){
  var on=s.v===simCur;
  h+='<button type="button" class="sim-opt'+(on?' cur':'')+'" role="radio" aria-checked="'+(on?'true':'false')+'" data-v="'+s.v+'" onclick="simPick(this)">'
   +'<span class="sim-ic"><i class="fas fa-sim-card"></i></span>'
   +'<span class="sim-tx"><b>'+s.label+'</b><small>'+(on?'当前使用中':'点击切换到此卡槽')+'</small></span>'
   +'<span class="sim-ck"><i class="fas fa-'+(on?'check-circle':'circle')+'"></i></span>'
   +'</button>';
 });
 h+='</div>';
 body.innerHTML=h;
}
function simPick(btn){
 if(simBusy)return;
 var v=btn.getAttribute('data-v');if(v==null)return;
 if(v===simCur){ toast('已经在该卡槽, 无需切换'); return; }
 var sl=null;simSlots.forEach(function(x){if(x.v===v)sl=x;});
 simOk=0;
 if(sl&&sl.confirm){if(!window.confirm(sl.confirm))return;simOk=1;}
 simDo(v,btn.querySelector('.sim-tx b')?btn.querySelector('.sim-tx b').textContent:v);
}
function simPop(){
 var m=wfmEl('sim');if(!m)return;
 simBusy=false;simStop();
 cawLeft(m);
 m.classList.add('open');m.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 var body=wfmEl('sim-body');
 if(body)body.innerHTML='<div class="caw-empty"><i class="fas fa-circle-notch fa-spin"></i><span>读取中…</span></div>';
 var sub=wfmEl('sim-sub');if(sub)sub.textContent='读取可用卡槽…';
 XHR.get(SIM_SLOTS,{},function(x,d){
  if(!m.classList.contains('open'))return;
  if(!d||typeof d!=='object'){ if(body)body.innerHTML='<div class="caw-empty"><i class="fas fa-triangle-exclamation"></i><span>读取失败, 请稍后重试</span></div>'; return; }
  simSlots=(d.supported&&Array.isArray(d.slots))?d.slots:[];
  /* 当前卡槽优先用 GPIO 权威源(simstat 的 slot 对应值), 后端 current 作兜底。
     simstat 报的是中文槽名, 和清单的值对不上, 所以直接信后端 current(= uci simsel)。 */
  simCur=d.current||'';
  if(sub)sub.textContent=d.supported?(d.is_c2000?'本机为 C2000 三卡槽':'本机单卡槽'):'当前模组不支持切卡';
  simPaint();
 });
}
function simClose(){
 var m=wfmEl('sim');if(!m)return;
 if(simBusy)return;   /* 切卡中不让关, 免得用户以为没提交 */
 simStop();
 m.classList.remove('open');m.setAttribute('aria-hidden','true');
 document.body.style.overflow='';
}
/* 切卡本体: POST simset → 转入"切换中" → 轮询 simstat busy 到完成。 */
function simDo(target,label){
 if(simBusy)return;
 simBusy=true;
 var body=wfmEl('sim-body');
 if(body)body.innerHTML='<div class="caw-empty sim-prog"><i class="fas fa-circle-notch fa-spin"></i>'
  +'<span>正在切换到「'+label+'」…</span><small>约需 30 秒, 期间请勿断电或拔卡</small></div>';
 var fields={slot:target,confirm:simOk?'1':'0',token:(window.L&&L.env&&L.env.token)||''};
 var b=[],k;for(k in fields)b.push(encodeURIComponent(k)+'='+encodeURIComponent(fields[k]));
 var xhr=new XMLHttpRequest();
 xhr.open('POST',SIM_SET,true);
 xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 xhr.onreadystatechange=function(){
  if(xhr.readyState!=4)return;
  var rv=null;try{rv=JSON.parse(xhr.responseText);}catch(e){}
  if(xhr.status===403){simBusy=false;toast('会话已过期, 请刷新页面后重试');simPaint();return;}
  if(!rv||!rv.ok){simBusy=false;toast((rv&&rv.error)||'切换失败 (HTTP '+xhr.status+')');simPaint();return;}
  if(rv.noop){simBusy=false;simCur=target;toast('已经在该卡槽');simPaint();return;}
  simCur=target;
  /* 切卡脚本已在后台跑, 轮询 simstat 看 busy: 先置 1(切换中)再回 0(完成)。
     设一个最长等待, 超时就当完成收尾, 不把用户永远卡在转圈。 */
  var waited=0,sawBusy=false;
  simStop();
  simPoll=setInterval(function(){
   if(!wfmEl('sim')||!wfmEl('sim').classList.contains('open')){simStop();return;}
   XHR.get('/cgi-bin/luci/admin/modem/simstat',{},function(x,d){
    waited+=2000;
    if(d&&+d.busy){sawBusy=true;return;}
    /* busy 已回 0: 若之前见过 busy(确实切过)或已等够引导时间, 判定完成 */
    if(sawBusy||waited>=36000){
     simStop();simBusy=false;
     if(d&&d.slot&&wfmEl('sim-sub'))wfmEl('sim-sub').textContent='当前: '+d.slot;
     simPaint();
     toast('卡槽已切换' + (d&&d.text?(' · '+d.text):''));
     slotLoad(heroExtra); /* 立刻刷新首页那格 */
    }
   });
  },2000);
 };
 xhr.send(b.join('&'));
}

/* === s63 无线网桥(STA/apcli 桥接上游 WiFi)===
   WiFi 小标题行「无线网桥」按钮点开本浮窗(复用 .caw 壳)。两步:
     1) 扫描列表: 2.4G/5G 频段切换, 列出扫到的 SSID, 点一行进入加入表单;
     2) 加入表单: 上游 SSID(只读) + 密码 + 「设为主路由并开启网关存活」勾选 + 警告,
        点「连接并应用」POST join, 转「连接中」轮询 status 看 apcli 是否关联+拿到 IP。
   桥接成功后: WiFi 按钮变「已桥接」高亮、广域网卡片出一枚徽章。断开走 leave 还原。
   风险高(改无线/网络/防火墙/路由), 应用后端已异步化, 前端强警告 + 失败可断开撤销。 */
var wlbBand='2g';        /* 当前扫描频段 */
var wlbBusy=false;       /* 加入中: 挡重复提交, 不让关窗 */
var wlbPoll=null;        /* 连接中轮询 status 的定时器 */
var wlbState=null;       /* 最近一次 status 快照 */
function wlbStop(){if(wlbPoll){clearInterval(wlbPoll);wlbPoll=null;}}
/* 本闭包里没有 esc()(那个在设备总览那块 IIFE 里), 自带一个 HTML 转义 */
function wlbEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
/* 信号格: quality 0-100 → 4 格点亮数 */
function wlbSig(q){
 q=+q||0;var on=q>=75?4:q>=50?3:q>=25?2:q>0?1:0,h=[7,11,15,19],s='';
 for(var i=0;i<4;i++)s+='<i class="'+(i<on?'on':'')+'" style="height:'+h[i]+'px"></i>';
 return s;
}
/* 加密 → 中文徽章 */
function wlbEncTxt(e){return e==='none'?'开放':e==='sae'?'WPA3':e==='psk-mixed'?'WPA/WPA2':e==='psk2'?'WPA2':e==='psk'?'WPA':e==='wep'?'WEP(不支持)':'未知';}
function wlbOpen(){
 var m=wfmEl('wlb');if(!m)return;
 wlbBusy=false;wlbStop();wlbCache={};
 cawLeft(m);
 m.classList.add('open');m.setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 /* 已桥接 → 先给"当前桥接 + 断开"视图; 未桥接 → 直接进扫描 */
 if(wlbState&&wlbState.bridged){wlbShowCurrent();}
 else{wlbBand='2g';wlbView();}
}
function wlbClose(){
 var m=wfmEl('wlb');if(!m)return;
 if(wlbBusy)return;
 wlbStop();
 m.classList.remove('open');m.setAttribute('aria-hidden','true');
 document.body.style.overflow='';
}
/* 扫描结果缓存(按频段): 返回/切页签直接复用, 不重复扫描; 打开浮窗和断开桥接时清空 */
var wlbCache={};
function wlbTabs(){
 return '<div class="wlb-tabs">'+
  '<button type="button" class="wlb-tab'+(wlbBand==='2g'?' on':'')+'" onclick="wlbSetBand(\'2g\')">2.4G</button>'+
  '<button type="button" class="wlb-tab'+(wlbBand==='5g'?' on':'')+'" onclick="wlbSetBand(\'5g\')">5G</button></div>';
}
function wlbListHtml(l){
 var h='<div class="wlb-list">';
 l.forEach(function(a){
  var name=a.hidden?'(隐藏网络)':a.ssid;
  var dis=(!a.joinable)?' disabled title="该加密方式不支持桥接"':'';
  h+='<button type="button" class="wlb-ap"'+dis+' onclick="wlbPick('+wlbJ(a)+')">'+
   '<span class="wlb-sig">'+wlbSig(a.quality)+'</span>'+
   '<span class="wlb-apx"><b>'+wlbEsc(name)+'</b><small>信道 '+wlbEsc(a.channel)+' · '+wlbEncTxt(a.enc)+' · '+wlbEsc(a.bssid||'')+'</small></span>'+
   (a.joinable?'<span class="wlb-join">加入</span>':'<span class="wlb-tag">不支持</span>')+
   '</button>';
 });
 return h+'</div>';
}
/* 只画界面, 绝不触发扫描: 有缓存就显示列表, 没有就提示"点按钮才扫描" */
function wlbView(){
 var body=wfmEl('wlb-body');if(!body)return;
 var sub=wfmEl('wlb-sub');if(sub)sub.textContent='选择要桥接的上游 WiFi';
 var nm=wlbBand==='2g'?'2.4G':'5G',l=wlbCache[wlbBand];
 if(l){
  body.innerHTML=wlbTabs()+(l.length?wlbListHtml(l):'<div class="caw-empty"><i class="fas fa-wifi"></i><span>该频段未扫描到可用 WiFi</span></div>')+
   '<div class="wfm-act"><button type="button" onclick="wlbScan()"><i class="fas fa-rotate"></i> 重新扫描 '+nm+'</button></div>';
  return;
 }
 body.innerHTML=wlbTabs()+'<div class="caw-empty"><i class="fas fa-wifi"></i><span>点击下方按钮开始扫描 '+nm+' 频段</span><small>扫描时该频段无线会短暂中断</small></div>'+
  '<div class="wfm-act"><button type="button" class="pri" onclick="wlbScan()"><i class="fas fa-magnifying-glass"></i> 开始扫描 '+nm+'</button></div>';
}
/* 真正扫描某频段: 只由用户点按钮触发 */
function wlbScan(){
 var body=wfmEl('wlb-body');if(!body)return;
 var band=wlbBand,nm=band==='2g'?'2.4G':'5G';
 body.innerHTML=wlbTabs()+'<div class="caw-empty"><i class="fas fa-circle-notch fa-spin"></i><span>正在扫描 '+nm+' 频段…</span></div>';
 var sub=wfmEl('wlb-sub');if(sub)sub.textContent='选择要桥接的上游 WiFi';
 XHR.get(WLB_SCAN,{band:band},function(x,d){
  var m=wfmEl('wlb');if(!m||!m.classList.contains('open')||wlbBand!==band)return;
  if(!d||!d.ok){body.innerHTML=wlbTabs()+'<div class="caw-empty"><i class="fas fa-triangle-exclamation"></i><span>'+((d&&d.error)||'扫描失败, 请稍后重试')+'</span></div><div class="wfm-act"><button type="button" class="pri" onclick="wlbScan()"><i class="fas fa-rotate"></i> 重试</button></div>';return;}
  wlbCache[band]=Array.isArray(d.list)?d.list:[];
  wlbView();
 });
}
function wlbSetBand(b){if(wlbBand===b)return;wlbBand=b;wlbView();}
/* 把 ap 对象安全地塞进 onclick(转义成 JSON 属性) */
function wlbJ(a){return "'"+encodeURIComponent(JSON.stringify({ssid:a.ssid,bssid:a.bssid,enc:a.enc,band:wlbBand,quality:a.quality}))+"'";}
function wlbPick(enc){
 var a;try{a=JSON.parse(decodeURIComponent(enc));}catch(e){return;}
 wlbForm(a);
}
/* 加入表单 */
function wlbForm(a){
 var body=wfmEl('wlb-body');if(!body)return;
 var sub=wfmEl('wlb-sub');if(sub)sub.textContent='输入上游 WiFi 密码';
 var needKey=a.enc!=='none';
 var h='<div class="wlb-cur"><button type="button" class="wlb-back" onclick="wlbView()"><i class="fas fa-chevron-left"></i> 返回列表</button></div>'+
  '<div class="wfm-f"><label>上游网络</label><div class="wlb-sel"><i class="fas fa-wifi"></i><b>'+wlbEsc(a.ssid)+'</b><span>'+wlbEncTxt(a.enc)+' · '+(a.band==='2g'?'2.4G':'5G')+'</span></div></div>';
 if(needKey){
  h+='<div class="wfm-f"><label for="wlb-key">上游 WiFi 密码</label>'+
   '<span class="wfm-pw"><input type="password" id="wlb-key" maxlength="63" autocomplete="new-password" spellcheck="false" placeholder="输入被桥接 WiFi 的密码"><button type="button" id="wlb-eye" onclick="wlbEye()" title="显示 / 隐藏密码"><i class="fas fa-eye"></i></button></span>'+
   '<span class="wfm-hint">8 - 63 个字符</span></div>';
 }
 h+='<div class="wfm-f"><label>所属防火墙区域</label><div class="wlb-ro"><i class="fas fa-shield-halved"></i>WAN（上游当作广域网，自动套用 NAT）</div></div>'+
  '<label class="wlb-chk"><input type="checkbox" id="wlb-primary" checked><span>设为主路由并开启「网关存活」<small>桥接网卡作为主要上网出口，断线时自动切回原线路</small></span></label>'+
  '<div class="wfm-warn"><i class="fas fa-exclamation-triangle"></i><span>连接会切换本机上网出口并重载无线，约十几秒内可能短暂断网。如果你正用本机 WiFi 访问本页，重连后请刷新。</span></div>'+
  '<div class="wfm-act"><button type="button" onclick="wlbView()">取消</button><button type="button" class="pri" id="wlb-ok" onclick="wlbJoin('+wlbJ(a)+')"><i class="fas fa-link"></i> 连接并应用</button></div>';
 body.innerHTML=h;
}
function wlbEye(){var i=wfmEl('wlb-key'),b=wfmEl('wlb-eye');if(!i||!b)return;var s=i.type==='password';i.type=s?'text':'password';b.innerHTML=s?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';}
function wlbJoin(enc){
 if(wlbBusy)return;
 var a;try{a=JSON.parse(decodeURIComponent(enc));}catch(e){return;}
 var needKey=a.enc!=='none';
 var key=needKey?((wfmEl('wlb-key')||{}).value||''):'';
 if(needKey&&(key.length<8||key.length>63)){toast('上游 WiFi 密码需要 8 - 63 个字符');return;}
 var primary=(wfmEl('wlb-primary')||{}).checked?'1':'0';
 wlbBusy=true;
 var body=wfmEl('wlb-body');
 if(body)body.innerHTML='<div class="caw-empty sim-prog"><i class="fas fa-circle-notch fa-spin"></i><span>正在连接「'+wlbEsc(a.ssid)+'」…</span><small>建立桥接并获取地址，约十几秒</small></div>';
 var fields={band:a.band,ssid:a.ssid,bssid:a.bssid||'',key:key,enc:a.enc,primary:primary,token:(window.L&&L.env&&L.env.token)||''};
 var b=[],k;for(k in fields)b.push(encodeURIComponent(k)+'='+encodeURIComponent(fields[k]));
 var xhr=new XMLHttpRequest();
 xhr.open('POST',WLB_JOIN,true);
 xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 xhr.onreadystatechange=function(){
  if(xhr.readyState!=4)return;
  var rv=null;try{rv=JSON.parse(xhr.responseText);}catch(e){}
  if(xhr.status===403){wlbBusy=false;toast('会话已过期, 请刷新页面后重试');wlbView();return;}
  if(!rv||!rv.ok){wlbBusy=false;toast((rv&&rv.error)||'桥接失败 (HTTP '+xhr.status+')');wlbView();return;}
  /* 后端已后台 wifi reload + ifup, 这里轮询 status 看 apcli 是否关联 + 拿到 IP */
  var waited=0;
  wlbStop();
  wlbPoll=setInterval(function(){
   XHR.get(WLB_STATUS,{},function(x,d){
    waited+=2500;
    if(d&&typeof d==='object')wlbState=d;
    if(d&&d.associated&&d.ip){
     wlbStop();wlbBusy=false;
     toast('已桥接「'+wlbEsc(d.ssid||a.ssid)+'」· '+wlbEsc(d.ip));
     wlbRefreshBadge();wlbShowCurrent();
     return;
    }
    if(waited>=30000){
     wlbStop();wlbBusy=false;
     /* 超时: 可能密码错或信号差, 让用户看当前状态并可断开重来 */
     toast(d&&d.associated?'已连接, 正在获取地址…':'连接超时, 请检查密码或信号后重试');
     wlbRefreshBadge();wlbShowCurrent();
    }
   });
  },2500);
 };
 xhr.send(b.join('&'));
}
/* 已桥接视图: 显示当前上游 + 断开按钮 */
function wlbShowCurrent(){
 var body=wfmEl('wlb-body');if(!body)return;
 var s=wlbState||{};
 var sub=wfmEl('wlb-sub');if(sub)sub.textContent=s.bridged?'当前桥接状态':'扫描并桥接上游 WiFi';
 if(!s.bridged){wlbBand='2g';wlbView();return;}
 var okCls=s.associated?'ok':'warn';
 var line=s.associated?('已连接'+(s.ip?' · '+wlbEsc(s.ip):' · 获取地址中')):'未连接(密码错误或信号弱)';
 body.innerHTML='<div class="wlb-done '+okCls+'">'+
  '<div class="wlb-done-ic"><i class="fas fa-'+(s.associated?'link':'link-slash')+'"></i></div>'+
  '<div class="wlb-done-x"><b>'+wlbEsc(s.ssid||'(未知)')+'</b><small>'+(s.band==='2g'?'2.4G':'5G')+' 频段 · '+line+'</small>'+
  (s.primary_on?'<small class="wlb-done-p"><i class="fas fa-route"></i> 已设为主路由 · 网关存活开启</small>':'')+'</div></div>'+
  '<div class="wfm-warn"><i class="fas fa-exclamation-triangle"></i><span>断开会移除桥接并把上网出口切回原线路，同样会短暂重载无线。</span></div>'+
  '<div class="wfm-act"><button type="button" onclick="wlbRescan()"><i class="fas fa-rotate"></i> 重新扫描</button><button type="button" class="pri danger" id="wlb-leave" onclick="wlbLeave()"><i class="fas fa-link-slash"></i> 断开桥接</button></div>';
}
function wlbRescan(){wlbBand='2g';wlbScan();}
function wlbLeave(){
 if(wlbBusy)return;
 wlbBusy=true;
 var body=wfmEl('wlb-body');
 if(body)body.innerHTML='<div class="caw-empty sim-prog"><i class="fas fa-circle-notch fa-spin"></i><span>正在断开桥接…</span><small>还原上网出口并重载无线</small></div>';
 var fields={token:(window.L&&L.env&&L.env.token)||''};
 var b=[];for(var k in fields)b.push(encodeURIComponent(k)+'='+encodeURIComponent(fields[k]));
 var xhr=new XMLHttpRequest();
 xhr.open('POST',WLB_LEAVE,true);
 xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 xhr.onreadystatechange=function(){
  if(xhr.readyState!=4)return;
  var rv=null;try{rv=JSON.parse(xhr.responseText);}catch(e){}
  wlbBusy=false;
  if(xhr.status===403){toast('会话已过期, 请刷新页面后重试');return;}
  if(!rv||!rv.ok){toast((rv&&rv.error)||'断开失败');return;}
  wlbState={bridged:false};
  toast('已断开无线桥接');
  wlbRefreshBadge();
  /* 给驱动几秒重载, 再回扫描视图 */
  setTimeout(function(){wlbState={bridged:false};if(wfmEl('wlb').classList.contains('open')){wlbBand='2g';wlbCache={};wlbView();}},1500);
 };
 xhr.send(b.join('&'));
}
/* 拉一次状态并刷新按钮高亮 + 广域网徽章。页面轮询和打开时都调。 */
function wlbRefreshBadge(){
 XHR.get(WLB_STATUS,{},function(x,d){
  if(d&&typeof d==='object')wlbState=d;
  var btn=wfmEl('wlb-btn'),bt=wfmEl('wlb-btn-t');
  var on=!!(d&&d.bridged&&d.associated);
  if(btn)btn.classList.toggle('on',on);
  if(bt)bt.textContent=on?'已桥接':'无线网桥';
  /* 广域网卡片徽章 */
  var slot=wfmEl('wlb-wan-badge');
  if(slot){
   if(on){var q=d.signal!=null?(' · 信号 '+d.signal+'dBm'):'';
    slot.innerHTML='<span class="wlb-badge"><i class="fas fa-link"></i>经 WiFi 桥接 · '+wlbEsc(d.ssid||'')+q+'</span>';
    slot.style.display='';}
   else{slot.innerHTML='';slot.style.display='none';}
  }
  /* 产品图左上角的上网方式标识归设备总览那段按出口画, 这里桥接状态变了顺手让它刷新一次 */
  if(window.MRT_NETB)MRT_NETB();
 });
}

/* === s63 第3项: 内存圆环双击 → 内存清理 + "占用→0→新占用"动画 ===
   功能等价"状态 - 释放内存"(后端 memfree 跑 sync+drop_caches), 但不跳转页面。
   动画参考常见的内存清理: 数字先从当前占用飙到 0(视觉上"清空"), 再升到释放后的
   真实占用, 圆环同步扫动, 结束 toast 报回收量。

   圆环平时显示的是"剩余%", 这里动画按"占用%"叙事(0=已清空更直观), 所以动画期间
   把中心小标签临时改成"占用", 并置 window.MRT_MEMCLEAN=1 挡住 dev() 那轮把数字冲掉;
   动画收尾时复位标签、撤门控, 交回正常轮询。 */
var memCleanBusy=false;
function memSetRing(usedPct){
 /* 圆环的 .ga-fg 用 rng() 画: rng 的入参是"进度百分比", 平时喂剩余%。
    清理动画按占用叙事, 进度条也画占用(越满=占用越高), 配色按占用高低红/黄/绿反过来。 */
 var g=document.getElementById('g-mem');
 var col=usedPct>=80?'#f87171':usedPct>=55?'#fbbf24':'#34d399';
 rng(g,usedPct,col);
}
function memAnimTo(fromU,toU,label,done){
 var v=document.getElementById('gv-mem');if(!v){if(done)done();return;}
 var steps=16,i=0,d=(toU-fromU)/steps;
 var x=setInterval(function(){
  i++;var cur=Math.round(fromU+d*i);
  if(i>=steps)cur=toU;
  v.textContent=cur+'%';
  memSetRing(cur);
  if(i>=steps){clearInterval(x);if(done)done();}
 },28);
}
function memClean(){
 if(memCleanBusy)return;
 memCleanBusy=true;window.MRT_MEMCLEAN=1;
 var gm=document.getElementById('ga-mem'),v=document.getElementById('gv-mem');
 var sEl=gm?gm.querySelector('.ga-s'):null,sOld=sEl?sEl.textContent:'';
 /* 当前占用% = 100 - 剩余%(圆环现在显示的是剩余) */
 var curRemain=parseInt(v?v.textContent:'')||0,curUsed=Math.max(0,Math.min(100,100-curRemain));
 if(gm)gm.classList.add('mem-cleaning');
 if(sEl)sEl.textContent='占用';
 /* 第一段: 当前占用 → 0(视觉清空), 同时请求后端真正清理 */
 var resp=null;
 XHR.get('/cgi-bin/luci/admin/fancontrol/memfree',{},function(x,d){resp=d||{};});
 memAnimTo(curUsed,0,'占用',function(){
  /* 到 0 后停一拍, 等后端回包; 回来后升到真实的释放后占用 */
  var waited=0;
  (function wait(){
   if(resp||waited>=4000){
    var after=(resp&&resp.ok&&typeof resp.after==='number')?resp.after:curUsed;
    var freed=(resp&&resp.ok&&resp.freed_kib)?resp.freed_kib:0;
    memAnimTo(0,after,'占用',function(){
     /* 收尾: 标签还原"剩余", 数字/圆环切回剩余口径, 撤门控交回轮询 */
     if(sEl)sEl.textContent=sOld||'剩余';
     var remain=100-after;
     if(v)v.textContent=remain+'%';
     memSetRing(after); /* 保持占用配色一帧, 下轮 dev() 会用剩余口径重画 */
     rng(document.getElementById('g-mem'),remain); /* 立即切回剩余进度, 配色下轮刷新 */
     if(gm)gm.classList.remove('mem-cleaning');
     window.MRT_MEMCLEAN=0;memCleanBusy=false;
     if(resp&&resp.ok){
      toast(freed>0?('内存已清理 · 释放 '+memFmtKiB(freed)):'内存已清理');
     }else{
      toast('内存清理失败, 请稍后重试');
     }
    });
    return;
   }
   waited+=120;setTimeout(wait,120);
  })();
 });
}
function memFmtKiB(k){k=+k||0;if(k<=0)return '0';var m=k/1024;return m>=1024?(m/1024).toFixed(1)+' GB':(m<10?m.toFixed(1):Math.round(m))+' MB';}

/* 内联 onclick 只认全局, 而这整段在 IIFE 里 —— 必须显式挂到 window。
   和上面 window.tc / window.fanSet 那行同一个原因。 */
window.wfmOpen=wfmOpen;window.wfmClose=wfmClose;window.wfmEye=wfmEye;
window.toast=toast;   /* s64: 供别的闭包(设备总览 IIFE 的 HQoS)也能弹同一个 toast */
window.wfmEnc=wfmEnc;window.wfmSave=wfmSave;window.wfmMerge=wfmMerge;window.wfmTab=wfmTab;window.waToggle=waToggle;window.waSw=waSw;
window.caPop=caPop;window.caClose=caClose;window.memClean=memClean;
window.simPop=simPop;window.simClose=simClose;window.simPick=simPick;
window.wlbOpen=wlbOpen;window.wlbClose=wlbClose;window.wlbScan=wlbScan;window.wlbView=wlbView;window.wlbSetBand=wlbSetBand;window.wlbPick=wlbPick;window.wlbEye=wlbEye;window.wlbJoin=wlbJoin;window.wlbLeave=wlbLeave;window.wlbRescan=wlbRescan;

// Realtime traffic chart
class TrafficChart{
constructor(canvasId){this.canvas=document.getElementById(canvasId);this.ctx=this.canvas.getContext('2d');this.rxData=[];this.txData=[];this.maxPoints=60;this.lastRx=0;this.lastTx=0;this.first=true;for(let i=0;i<this.maxPoints;i++){this.rxData.push(0);this.txData.push(0);}this.resize();window.addEventListener('resize',()=>this.resize());}
resize(){const r=window.devicePixelRatio||1;const rect=this.canvas.parentElement.getBoundingClientRect();this.canvas.width=rect.width*r;this.canvas.height=rect.height*r;this.ctx.scale(r,r);this.w=rect.width;this.h=rect.height;this.draw();}
push(rx,tx){if(this.first){this.lastRx=rx;this.lastTx=tx;this.first=false;return;}
let drx=(rx-this.lastRx)/2;let dtx=(tx-this.lastTx)/2;if(drx<0)drx=0;if(dtx<0)dtx=0;this.lastRx=rx;this.lastTx=tx;this.rxData.push(drx);this.txData.push(dtx);if(this.rxData.length>this.maxPoints)this.rxData.shift();if(this.txData.length>this.maxPoints)this.txData.shift();
// Update speed display
const fmt=(b)=>{if(b>1048576)return[(b/1048576).toFixed(1),'MB/s'];if(b>1024)return[(b/1024).toFixed(0),'KB/s'];return[b.toFixed(0),'B/s'];};
const[rv,ru]=fmt(drx);const[tv,tu]=fmt(dtx);
const re=document.getElementById('cv-rx'),rue=document.getElementById('cv-rxu');if(re)re.textContent=rv;if(rue)rue.textContent=ru;
const te=document.getElementById('cv-tx'),tue=document.getElementById('cv-txu');if(te)te.textContent=tv;if(tue)tue.textContent=tu;
this.draw();}
draw(){const ctx=this.ctx,w=this.w,h=this.h;ctx.clearRect(0,0,w,h);
const max=Math.max(1024,...this.rxData,...this.txData)*1.2;
// Grid lines
/* s87: 不画网格线 */
// Draw area + line
const drawLine=(data,color,alpha)=>{const step=w/(this.maxPoints-1);ctx.beginPath();ctx.moveTo(0,h);
for(let i=0;i<data.length;i++){const x=i*step;const y=h-(data[i]/max)*h*0.9;if(i===0)ctx.lineTo(x,y);else{const px=(i-1)*step;const py=h-(data[i-1]/max)*h*0.9;const cx=(px+x)/2;ctx.bezierCurveTo(cx,py,cx,y,x,y);}}
ctx.lineTo(w,h);ctx.closePath();const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,color.replace('1)',alpha+')'));grad.addColorStop(1,color.replace('1)','0)'));ctx.fillStyle=grad;ctx.fill();
// Line on top
ctx.beginPath();for(let i=0;i<data.length;i++){const x=i*step;const y=h-(data[i]/max)*h*0.9;if(i===0)ctx.moveTo(x,y);else{const px=(i-1)*step;const py=h-(data[i-1]/max)*h*0.9;const cx=(px+x)/2;ctx.bezierCurveTo(cx,py,cx,y,x,y);}}
ctx.strokeStyle=color.replace('1)','0.95)');ctx.lineWidth=1.25;ctx.lineJoin='round';ctx.stroke();};
const lt=document.getElementById('P').classList.contains('L');drawLine(this.rxData,lt?'rgba(5,150,105,1)':'rgba(52,211,153,1)',0.2);drawLine(this.txData,lt?'rgba(217,119,6,1)':'rgba(251,191,36,1)',0.14);}
}


function sigLvl(type,val){const v=parseFloat(val);if(isNaN(v))return{pct:0,cls:'poor',desc:'--'};if(/rsrp/i.test(type)){if(v>=-80)return{pct:90,cls:'good',desc:'优秀'};if(v>=-90)return{pct:70,cls:'good',desc:'良好'};if(v>=-100)return{pct:50,cls:'fair',desc:'一般'};return{pct:25,cls:'poor',desc:'较差'};}
if(/rsrq/i.test(type)){if(v>=-10)return{pct:85,cls:'good',desc:'优秀'};if(v>=-15)return{pct:55,cls:'fair',desc:'一般'};return{pct:25,cls:'poor',desc:'较差'};}
if(/sinr/i.test(type)){if(v>=20)return{pct:95,cls:'good',desc:'优秀'};if(v>=13)return{pct:75,cls:'good',desc:'良好'};if(v>=5)return{pct:45,cls:'fair',desc:'一般'};return{pct:20,cls:'poor',desc:'较差'};}
if(/rssi/i.test(type)){if(v>=-65)return{pct:85,cls:'good',desc:'优秀'};if(v>=-75)return{pct:65,cls:'good',desc:'良好'};if(v>=-85)return{pct:40,cls:'fair',desc:'一般'};return{pct:20,cls:'poor',desc:'较差'};}
return{pct:50,cls:'fair',desc:'--'};}
const BAND_FREQ={'1':'2100MHz','2':'1900MHz','3':'1800MHz','4':'AWS','5':'850MHz','7':'2600MHz','8':'900MHz','12':'700MHz','13':'700MHz','17':'700MHz','20':'800MHz','25':'1900MHz','26':'850MHz','28':'700MHz','34':'2100MHz TDD','38':'2600MHz TDD','39':'1900MHz TDD','40':'2300MHz TDD','41':'2500MHz TDD','42':'3500MHz TDD','46':'5GHz TDD','48':'CBRS','66':'AWS-3','71':'600MHz','n1':'2100MHz','n2':'1900MHz','n3':'1800MHz','n5':'850MHz','n7':'2600MHz','n8':'900MHz','n20':'800MHz','n28':'700MHz','n38':'2600MHz','n40':'2300MHz','n41':'2500MHz','n66':'AWS-3','n71':'600MHz','n77':'3.3-4.2GHz','n78':'3.5GHz','n79':'4.4-5.0GHz'};
function bandFreq(b){if(!b)return'';const m=String(b).match(/n?\d+/i);if(!m)return'';const k=m[0].toLowerCase();return BAND_FREQ[k]||BAND_FREQ[k.replace('n','')]||'';}
// MT5700(hisilicon) 的 SA 小区信息只给 ARFCN 不给 Band, 按 3GPP 38.104/36.101 下行频点反推频段。
// ≥100000 当 NR-ARFCN(FR1 最小的 n71 也在 12 万以上), 否则当 LTE EARFCN; n77/n78、n20/n28 重叠段按国内实际取 n78/n28。
function arfcnBand(v){const a=parseInt(v,10);if(!(a>=0))return'';let R,x=a;if(a>=100000){x=a<600000?a*0.005:3000+(a-600000)*0.015;R=[['n28',758,803],['n20',791,821],['n8',925,960],['n3',1805,1880],['n1',2110,2170],['n40',2300,2400],['n41',2496,2690],['n78',3300,3800],['n77',3800,4200],['n79',4400,5000]];}else R=[['B1',0,599],['B3',1200,1949],['B5',2400,2649],['B8',3450,3799],['B20',6150,6449],['B28',9210,9659],['B34',36200,36349],['B38',37750,38249],['B39',38250,38649],['B40',38650,39649],['B41',39650,41589]];for(const r of R)if(x>=r[1]&&x<=r[2])return r[0];return'';}

/* 蜂窝数据抖动兜底(2026-09-20):AT 口被占用时后端会整段丢掉"基站信息",
   直接渲染就会反复跳 "等待小区注册/未连接/无信号"。STICKY_MS 内沿用上一次
   拿全的数据,只补缺失项,不覆盖新值;超过这个窗口才认账显示真实状态。 */
/* ==================== 5700 结构化小区信息 (载波聚合 / 附近小区 / 签约速率) ====================
   数据来自 admin/modeminfo/cellx,它只读 /usr/bin/mwrt-cellinfo 写的
   /tmp/mwrt_cellinfo.json 缓存。采集器由 cron 每分钟跑一次并独立持串口锁 ——
   页面这条路完全不碰 ttyUSB1,所以可以和上面 4 秒一轮的 modem_ctrl 并存。

   cellx 在非 5700 模组上返回 {"supported":false},下面所有板块整段不渲染。 */
var cellx = null;      /* 最近一次拿到的快照,给 SIM 卡片和两张新卡共用 */

/* QCI 的含义。QCI 是 3GPP 标准化的承载质量等级,不是厂商自定义值,所以这张表
   可以写死。resource: GBR 有保障速率(语音/实时),Non-GBR 尽力而为(上网)。 */
var QCI_TAB = {
  1:{t:'会话语音',    r:'GBR',    p:2, d:'100ms',  x:'VoLTE 语音承载'},
  2:{t:'会话视频',    r:'GBR',    p:4, d:'150ms',  x:'实时视频通话'},
  3:{t:'实时游戏',    r:'GBR',    p:3, d:'50ms',   x:'低延迟交互'},
  4:{t:'非会话视频',  r:'GBR',    p:5, d:'300ms',  x:'流媒体缓冲播放'},
  5:{t:'IMS 信令',    r:'Non-GBR',p:1, d:'100ms',  x:'VoLTE 信令通道'},
  6:{t:'视频/TCP',    r:'Non-GBR',p:6, d:'300ms',  x:'优先级高的上网业务'},
  7:{t:'语音/视频流', r:'Non-GBR',p:7, d:'100ms',  x:'交互式业务'},
  8:{t:'TCP 业务',    r:'Non-GBR',p:8, d:'300ms',  x:'一般上网业务'},
  9:{t:'默认承载',    r:'Non-GBR',p:9, d:'300ms',  x:'普通上网数据(最常见)'}
};

/* kbps -> 人类可读。运营商签约速率动辄 300000 kbps,写成 300 Mbps 才有意义。 */
function rateFmt(kbps){
  var v = parseFloat(kbps);
  if (isNaN(v) || v <= 0) return null;
  if (v >= 1000000) return {n:(v/1000000).toFixed(v%1000000?1:0), u:'Gbps'};
  if (v >= 1000)    return {n:String(Math.round(v/1000)),           u:'Mbps'};
  return {n:String(Math.round(v)), u:'kbps'};
}

/* 邻区 RSRP 的条长。sigLvl() 是给主界面那几个信号表盘用的四档判据,-100 dBm
   以下一律 25% —— 邻区几乎全在这条线以下(本站 -101 到 -157),用它画出来十几
   条一样长的条,等于没画。这里改成 -140~-70 dBm 的连续映射,弱强差异才看得见;
   下限留 3% 是为了让 -157 这种极弱邻区仍有一小截可见,不至于看着像缺数据。
   颜色/文字描述仍然沿用 sigLvl(),两边判档一致。 */
function nbPct(rsrp){
  var v = parseFloat(rsrp);
  if (isNaN(v)) return 0;
  var p = (v + 140) / 70 * 100;
  return Math.max(3, Math.min(100, Math.round(p)));
}

/* kHz -> MHz,给载波中心频点用。773000 kHz 显示成 773 MHz。 */
function freqMhz(khz){
  var v = parseFloat(khz);
  if (isNaN(v) || v <= 0) return '';
  var m = v / 1000;
  return (m >= 1000 ? (m/1000).toFixed(2) + ' GHz' : Math.round(m) + ' MHz');
}

/* 签约速率 + QCI。用户要求把这两项归入"SIM卡信息",所以返回的是 HTML 片段,
   由 render() 拼到那张卡的最前面,而不是单独开卡。 */
function cxSubHtml(){
  if (!cellx || !cellx.supported) return '';
  var h = '';
  var dl = rateFmt(cellx.ambr_dl), ul = rateFmt(cellx.ambr_ul);
  if (dl || ul) {
    h += '<div class="sub-rate">';
    h += '<div class="sr-i dl"><div class="sr-l"><i class="fas fa-download"></i> 签约下行速率</div>'
       + '<div class="sr-v"><span class="n">' + (dl ? dl.n : '--') + '</span>'
       + '<span class="u">' + (dl ? dl.u : '') + '</span></div>'
       + '<div class="sr-s">网络侧 AMBR 上限' + (cellx.apn ? ' · APN ' + cellx.apn : '') + '</div></div>';
    h += '<div class="sr-i ul"><div class="sr-l"><i class="fas fa-upload"></i> 签约上行速率</div>'
       + '<div class="sr-v"><span class="n">' + (ul ? ul.n : '--') + '</span>'
       + '<span class="u">' + (ul ? ul.u : '') + '</span></div>'
       + '<div class="sr-s">网络侧 AMBR 上限</div></div>';
    h += '</div>';
  }
  var q = cellx.qci;
  if (q !== null && q !== undefined && q !== '') {
    var info = QCI_TAB[q];
    h += '<div class="qci-row"><span class="qci-b"><span class="lb">QCI</span><span class="nv">' + q + '</span></span>'
       + '<div class="qci-m"><span class="qci-t">' + (info ? info.t : '等级 ' + q) + '</span>'
       + '<span class="qci-d">' + (info ? info.x : '未收录的承载等级') + '</span></div>';
    if (info) {
      h += '<div class="qci-x"><span>' + info.r + '</span><span>优先级 ' + info.p + '</span>'
         + '<span>时延预算 ' + info.d + '</span></div>';
    }
    /* 有多条承载时把其余的也列出来:cid 1 是用户数据,cid 5 通常是 IMS 信令。 */
    if (cellx.bearers && cellx.bearers.length > 1) {
      var extra = cellx.bearers.filter(function(b){ return String(b.qci) !== String(q); })
        .map(function(b){ return 'CID ' + b.cid + ' → QCI ' + b.qci; });
      if (extra.length) h += '<div class="qci-x"><span>' + extra.join('</span><span>') + '</span></div>';
    }
    h += '</div>';
  }
  return h;
}

/* 载波聚合卡。ca_count 是真实成分载波数(已剔除 HFREQINFO 尾部的全零填充组)。
   bare=true 时只返回内部的 ca-hd + ca-grid, 不套折叠卡外壳 —— 给 s63 的
   频段卡点击浮窗(caPop)复用, 那里不需要可折叠的标题行。 */
function cxCaHtml(bare){
  if (!cellx || !cellx.supported) return '';
  var ca = cellx.ca || [];
  if (!ca.length) return '';

  var dlSum = 0, ulSum = 0, dlMax = 0;
  ca.forEach(function(c){
    dlSum += (+c.dl_bw || 0); ulSum += (+c.ul_bw || 0);
    if ((+c.dl_bw || 0) > dlMax) dlMax = (+c.dl_bw || 0);
  });
  var n = cellx.ca_count || ca.length;
  /* 只有一个载波时说"未聚合"而不是"1 载波聚合" —— 后者读起来是自相矛盾的。 */
  var title = n > 1 ? (n + ' 载波聚合') : '单载波 · 未聚合';
  var sub = ca.map(function(c){
    return (/NR/i.test(c.rat) ? 'n' : 'B') + c.band;
  }).join('  +  ');

  var h = '<div class="ca-hd"><div class="ca-big"><span class="n">' + n + '</span><span class="u">CC</span></div>'
        + '<div class="ca-hd-meta"><span class="ca-hd-t">' + title + '</span>'
        + '<span class="ca-hd-s">' + sub + '</span></div>'
        + '<div class="ca-sum">'
        + '<div class="ca-sum-i"><span class="l">聚合下行带宽</span><span class="v">' + dlSum + '<small>MHz</small></span></div>'
        + '<div class="ca-sum-i"><span class="l">聚合上行带宽</span><span class="v">' + ulSum + '<small>MHz</small></span></div>'
        + '</div></div>';

  h += '<div class="ca-grid">' + ca.map(function(c){
    var pfx = /NR/i.test(c.rat) ? 'n' : 'B';
    var fr = bandFreq(pfx + c.band);
    var isP = (c.role === 'PCC');
    /* 上行 EARFCN 与频点同时为 0 = 该载波只做下行,采集器已把 ul_bw 归零。
       这里显式写"未使用",比显示 0 MHz 更准确。 */
    var ulVoid = (!(+c.ul_earfcn) && !(+c.ul_freq));
    var dlPct = dlMax ? Math.round((+c.dl_bw || 0) / dlMax * 100) : 0;
    var ulPct = dlMax ? Math.round((+c.ul_bw || 0) / dlMax * 100) : 0;
    var s = '<div class="ca-c' + (isP ? ' pcc' : '') + '">'
      + '<div class="ca-c-hd"><span class="ca-band">' + pfx + c.band
      + (fr ? '<span class="fr">' + fr + '</span>' : '') + '</span>'
      + '<span class="ca-role">' + (isP ? '主载波 PCC' : '辅载波 SCC') + '</span></div>'
      + '<div class="ca-bw">'
      + '<div class="ca-bw-i dl"><span class="l"><i class="fas fa-download"></i> 下行带宽</span>'
      + '<span class="v">' + (+c.dl_bw || 0) + '<small>MHz</small></span>'
      + '<span class="ca-bw-t"><i style="width:' + dlPct + '%"></i></span></div>'
      + '<div class="ca-bw-i ul' + (ulVoid ? ' void' : '') + '"><span class="l"><i class="fas fa-upload"></i> 上行带宽</span>'
      + '<span class="v">' + (ulVoid ? '未使用' : ((+c.ul_bw || 0) + '<small>MHz</small>')) + '</span>'
      + (ulVoid ? '' : '<span class="ca-bw-t"><i style="width:' + ulPct + '%"></i></span>') + '</div>'
      + '</div><div class="ca-kv">';
    s += '<div><span class="k">下行频点</span><span class="v">' + (c.dl_earfcn != null ? c.dl_earfcn : '--') + '</span></div>';
    s += '<div><span class="k">下行中心频率</span><span class="v">' + (freqMhz(c.dl_freq) || '--') + '</span></div>';
    if (!ulVoid) {
      s += '<div><span class="k">上行频点</span><span class="v">' + (c.ul_earfcn != null ? c.ul_earfcn : '--') + '</span></div>';
      s += '<div><span class="k">上行中心频率</span><span class="v">' + (freqMhz(c.ul_freq) || '--') + '</span></div>';
    } else {
      s += '<div><span class="k">链路方向</span><span class="v">仅下行</span></div>';
    }
    s += '</div></div>';
    return s;
  }).join('') + '</div>';

  if (bare) return h;
  var age = (cellx.age != null && cellx.age > 90)
    ? '<span class="cx-age">' + cellx.age + 's 前</span>' : '';
  return '<div class="cd" data-mx="ca"><div class="clh" onclick="tc(this)">'
    + '<div class="cd-t"><i class="fas fa-layer-group"></i> 载波聚合 · CA</div>' + age
    + '<i class="fas fa-chevron-down cla"></i></div>'
    + '<div class="clb clb-tall">' + h + '</div></div>';
}

/* 附近小区。信号最强的三个做成卡片,其余落进紧凑表格 —— 这个站点能看到十个
   邻区,全做成卡片会把页面撑散,而尾部那些 -157 dBm 的弱邻区也不值一张卡。 */
function cxNbHtml(){
  /* s137: 原来这里一进门就判 !cellx.supported 直接返回空串 —— 「附近小区」磁贴因此永远是灰的
     （按钮 disabled 取决于有没有这张卡）。SY108 的邻区来自 udx.cellular status 的 cells[]，
     服务端已经在 supported:false 的同时把 neighbours[] 填好了（签约速率/载波聚合两块仍按
     supported 隐藏，那两块 SY108 确实没有数据）。所以这里只认 neighbours 有没有内容。 */
  if (!cellx) return '';
  var nb = cellx.neighbours || [];
  if (!nb.length) return '';
  var servFcn = cellx.serving ? String(cellx.serving.arfcn) : '';

  /* 按 RSRP 从强到弱排。缺 RSRP 的排到末尾。 */
  var list = nb.slice().sort(function(a, b){
    var x = (a.rsrp == null ? -999 : a.rsrp), y = (b.rsrp == null ? -999 : b.rsrp);
    return y - x;
  });
  var top = list.slice(0, 3), rest = list.slice(3);

  var cards = top.map(function(c){
    var isNR = /NR/i.test(c.rat || '');
    var same = servFcn && String(c.earfcn) === servFcn;
    var lv = sigLvl('rsrp', c.rsrp);
    var col = lv.cls === 'good' ? '#34d399' : lv.cls === 'fair' ? '#fbbf24' : '#f87171';
    var sub = '';
    if (c.rsrq != null) sub += '<div><span class="k">RSRQ</span><span class="v">' + c.rsrq + '</span></div>';
    if (c.sinr != null) sub += '<div><span class="k">SINR</span><span class="v">' + c.sinr + '</span></div>';
    return '<div class="nb-c' + (same ? ' same' : '') + '">'
      + '<div class="nb-hd"><span class="nb-pci"><span class="lb">物理小区 PCI</span>'
      + '<span class="nv">' + (c.pci != null ? c.pci : '--') + '</span></span>'
      + '<span class="nb-tags">'
      + '<span class="nb-rat' + (isNR ? ' nr' : '') + '">' + (c.rat || '--') + (c.band ? ' · ' + String(c.band).replace(/[<>&"]/g, '') : '') + '</span>'
      + (same ? '<span class="nb-same">同频邻区</span>' : '') + '</span></div>'
      + '<div class="nb-main"><span class="l">参考信号接收功率 RSRP</span>'
      + '<div class="row"><span><span class="nv" style="color:' + col + '">'
      + (c.rsrp != null ? c.rsrp : '--') + '</span><span class="u">dBm</span></span>'
      + '<span class="nb-lvl ' + lv.cls + '">' + lv.desc + '</span></div>'
      + '<span class="nb-bar"><i style="width:' + nbPct(c.rsrp) + '%;background:' + col + '"></i></span></div>'
      + (sub ? '<div class="nb-sub">' + sub + '</div>' : '')
      + '<div class="nb-fcn"><span class="k">下行频点 ARFCN</span><span class="v">'
      + (c.earfcn != null ? c.earfcn : '--') + '</span></div>'
      + '</div>';
  }).join('');

  var h = '<div class="nb-top">' + cards + '</div>';

  if (rest.length) {
    /* 序号接着前三张卡继续数(第 4 名起),这样"卡片 + 表格"读起来是一份连续的
       强弱排行,而不是两组互不相干的数据。 */
    var rows = rest.map(function(c, i){
      var lv = sigLvl('rsrp', c.rsrp);
      var col = lv.cls === 'good' ? '#34d399' : lv.cls === 'fair' ? '#fbbf24' : '#f87171';
      var isNR = /NR/i.test(c.rat || '');
      var same = servFcn && String(c.earfcn) === servFcn;
      return '<tr><td class="rk">' + (i + 4) + '</td>'
        + '<td><span class="pci">' + (c.pci != null ? c.pci : '--') + '</span>'
        + (same ? '<span class="nb-same2">同频</span>' : '') + '</td>'
        + '<td><span class="nb-rat2' + (isNR ? ' nr' : '') + '">' + (c.rat || '--') + (c.band ? ' · ' + String(c.band).replace(/[<>&"]/g, '') : '') + '</span></td>'
        + '<td class="fcn">' + (c.earfcn != null ? c.earfcn : '--') + '</td>'
        + '<td><span class="nb-sig"><span class="nb-sb">'
        + '<i style="width:' + nbPct(c.rsrp) + '%;background:' + col + '"></i></span>'
        + '<span class="nb-sv">'
        + (c.rsrp != null ? c.rsrp : '--') + '</span></span></td>'
        + '<td>' + (c.rsrq != null ? c.rsrq : '--') + '</td>'
        + '<td>' + (c.sinr != null ? c.sinr : '--') + '</td></tr>';
    }).join('');
    /* 列宽固定:序号/PCI/制式/频点窄,RSRP 吃掉剩下的宽度用来画条。 */
    h += '<div class="nb-rest"><div class="nb-rest-h">'
      + '<span class="nb-rest-t"><i class="fas fa-list-ul"></i> 其余 ' + rest.length + ' 个邻区</span>'
      + '<span class="nb-rest-n">按参考信号接收功率排序</span></div>'
      + '<table class="nb-tb"><colgroup><col style="width:40px"><col style="width:86px">'
      + '<col style="width:96px"><col style="width:86px"><col><col style="width:72px">'
      + '<col style="width:72px"></colgroup>'
      + '<thead><tr><th>#</th><th>PCI</th><th>制式</th><th>ARFCN</th>'
      + '<th>RSRP<span class="sm"> dBm</span></th><th>RSRQ<span class="sm"> dB</span></th>'
      + '<th>SINR<span class="sm"> dB</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  var age = (cellx.age != null && cellx.age > 90)
    ? '<span class="cx-age">' + cellx.age + 's 前</span>' : '';
  return '<div class="cd" data-mx="nb"><div class="clh" onclick="tc(this)">'
    + '<div class="cd-t"><i class="fas fa-broadcast-tower"></i> 附近小区 · ' + list.length + ' 个邻区</div>' + age
    + '<i class="fas fa-chevron-down cla"></i></div>'
    + '<div class="clb clb-tall">' + h + '</div></div>';
}

/* 真实卡槽。qmodem 报的 "SIM Slot" 是模组自报的逻辑槽位,在这块板子上
   并不等于机身实际在用哪个卡槽 —— 卡槽是 GPIO(cpe-sel0)切的,权威源是
   /tmp/sim_sel,由 simstat.sh 报出来。这里拿它盖掉模组那个值。 */
/* 卡槽 SIM 状态: 客户端也做缓存 + 粘滞, 和 hero 一个思路。
   用户没切卡时不该看到"读取中/未读到卡槽/模组无响应"这种闪烁 —— 一旦拿到过正常状态,
   后续某轮因 AT 口被占读空/读错, 一律沿用上一次的正常值, 只有两种情况才更新显示:
     ① busy=1(真的在切卡, 要显示"切换中");
     ② 读到新的正常状态(有 slot、有有效 text、非无响应)。
   首次进页面先从 localStorage 恢复上次正常值, 秒显, 不卡"读取中"。 */
var simSlot = null, slotTried = false;
var SIM_CACHE_KEY = 'mrt-sim-TR3000';
/* 「SIM卡信息」卡片里的「SIM卡号码」行。号码来自 simstat 的 phone(AT+CNUM):
   数字/+ = 号码;"-" = 卡里没存号码(很多运营商的卡不写本机号码,这是常态);
   空 = 还没读到,有卡才显示"读取中…",无卡/切卡中整行不出。 */
function simPhoneRow(){
  var d = simSlot;
  if(!d || (+d.busy) || !/^(1|11|12)$/.test(String(d.code))) return '';
  var p = String(d.phone == null ? '' : d.phone), v;
  if(/^\+?\d{3,}$/.test(p)) v = '<span style="font-family:\'SF Mono\',\'JetBrains Mono\',monospace;font-size:11px">' + p + '</span>';
  else if(p === '-') v = '<span style="color:var(--t2)">卡内未存储号码</span>';
  else v = '<span style="color:var(--t2)">读取中…</span>';
  return '<div class="ir"><span class="ik">SIM卡号码</span><span class="iv">' + v + '</span></div>';
}
function simIsGood(d){
  return d && typeof d === 'object' && d.slot && !(+d.busy) &&
         d.text && !/无响应|读取中|未读到/.test(String(d.text));
}
function simRestore(){
  try{
    var raw=localStorage.getItem(SIM_CACHE_KEY);if(!raw)return;
    var c=JSON.parse(raw);
    /* 1 小时内的缓存才认; 恢复后标 slotTried, 这样即使网络没回也不会显示"读取中" */
    if(c&&c.d&&c.t&&(Date.now()-c.t)<3600000){simSlot=c.d;slotTried=true;}
  }catch(e){}
}
function simSave(d){try{localStorage.setItem(SIM_CACHE_KEY,JSON.stringify({t:Date.now(),d:d}));}catch(e){}}
function slotLoad(cb){
  XHR.get('/cgi-bin/luci/admin/modem/simstat', {}, function(x, d){
    slotTried = true;
    if (d && typeof d === 'object') {
      if (+d.busy) {
        simSlot = d;                 // 真·切卡中, 如实显示"切换中"
      } else if (simIsGood(d)) {
        simSlot = d; simSave(d);     // 新的正常状态, 更新 + 存缓存
      }
      /* 其余(读空 / 无响应 / 未读到): 不动 simSlot, 保住上一次的正常值, 不降级闪烁 */
    }
    if (cb) cb();
  });
}

function cxLoad(cb){
  XHR.get('/cgi-bin/luci/admin/modeminfo/cellx', {}, function(x, d){
    if (d && typeof d === 'object') cellx = d;
    if (cb) cb();
  });
}

/* s41 hero 的「频段」「卡槽 SIM」两格。
   - 频段: 5700 有 cellx(和下面「载波聚合」卡同一个数据源、同一套 n/B 命名), 有成分载波就列出各载波频段
     + 下行总带宽, 聚合时右上角角标标 nCC; 非 5700 / cellx 未就绪 / 没拨号时, 用 heroUp 按 qmodem info 算的单频段兜底。
   - 卡槽 SIM: 主值 = 机身实际在用的卡槽(simstat 的 slot, GPIO 权威源), 副值 = SIM 卡实际状态 + ICCID 尾 4 位;
     原来的小区 PCI/CID/TAC 挪进悬停提示。
   info 4 秒一刷, cellx/simstat 30 秒一刷, 两边谁先到谁调这里, 所以单独成函数。
   heroCell 由 heroUp 写: bv/bs = 兜底频段文案, cell = 小区标识, online/warming 同 heroUp。 */
var heroCell = {};
function heroExtra(){
  var $ = function(id){ return document.getElementById(id); };
  var bdE = $('h-band'), bsE = $('h-band-s'), caE = $('h-ca'), bm = $('hm-band');
  var ca = (heroCell.online && cellx && cellx.supported && Array.isArray(cellx.ca))
    ? cellx.ca.filter(function(c){ return c && c.band != null && c.band !== ''; }) : [];
  if (ca.length) {
    var n = cellx.ca_count || ca.length, dl = 0, seen = {}, names = [];
    ca.forEach(function(c){
      var b = (/NR/i.test(c.rat) ? 'n' : 'B') + c.band;
      if (!seen[b]) { seen[b] = 1; names.push(b); }   // 同频段带内聚合只写一次, 载波数看角标
      dl += (+c.dl_bw || 0);
    });
    if (bdE) bdE.textContent = names.join('+');
    if (bsE) bsE.textContent = '';   // s127: 只显示频段名 + nCC 角标
    if (caE) { caE.style.display = n > 1 ? '' : 'none'; caE.textContent = n + 'CC'; caE.classList.toggle('on', n > 1); }
    if (bm) bm.title = ca.map(function(c){
      return (c.role || '') + ' ' + (/NR/i.test(c.rat) ? 'n' : 'B') + c.band + (c.dl_bw ? ' ' + c.dl_bw + 'MHz' : '');
    }).join('  /  ');
  } else if (heroCell.bv !== undefined) {
    if (bdE) bdE.textContent = heroCell.bv;
    if (bsE) bsE.textContent = '';
    if (caE) caE.style.display = 'none';
    if (bm) bm.removeAttribute('title');
  }

  var pEl = $('h-pci'), cEl = $('h-cellid'), s = simSlot;
  if (!pEl || !cEl) return;
  var cls = '', txt;
  if (!s) {
    pEl.textContent = '--';
    txt = slotTried ? '未读到卡槽' : '读取中…';
  } else if (+s.busy) {
    pEl.textContent = '切换中';
    txt = s.text || '正在切换卡槽…'; cls = 'busy';
  } else {
    pEl.textContent = String(s.slot).replace(/卡槽$/, '');
    var t = String(s.text || '');
    cls = /正常工作|初始化完成|已插入/.test(t) ? 'ok' : /未插入|锁|失效|移除|错误|无响应/.test(t) ? 'bad' : '';
    txt = cls === 'ok' ? '正常' : t.replace(/^SIM卡?/, '');
  }
  cEl.textContent = txt;
  cEl.className = 'h-ms h-sim' + (cls ? ' ' + cls : '');
  cEl.title = [s && s.text, heroCell.cell].filter(Boolean).join(' · ');
}

const STICKY_MS=120000,WARM_MS=15000;
/* s84 N5000: 转接板可拔, 缓存要等 router3d-data 首次确认模组在位(MRT_N5K_OK)后才用, 免得拔板后刷新一小时内仍闪蜂窝 */
const N5K_HOLD=('TR3000'==='N5000'||'TR3000'==='TR3000');
class UI{
constructor(){this.sel=document.getElementById('modem_selector_select');this.sec=document.getElementById('mrt-sec');this.cfg=null;this.good=null;this.goodT=0;this.t0=Date.now();this.lastBdg='';this.lastSt='';this.sel.addEventListener('change',e=>{this.cfg=e.target.value;this.cacheRestore();this.modem();});
/* s64 秒开: 构造时立刻用上次缓存的蜂窝数据把 hero + 卡片画出来, 不等两次网络请求(先取模组列表再取 info)。
   之后真·轮询回来再覆盖。避免打开半天卡在"读取中 / 等待网络注册"。 */
simRestore();this.cacheRestore();this.poll();}
/* 缓存 key 按机型隔离(多模组/换卡各一份); 存 this.good(已过滤的干净非 stale 数据)+ 时间戳 + opV。 */
cacheKey(){return 'mrt-hero-TR3000';}
cacheSave(){try{var op=this.good.find(e=>/互联网服务提供商|operator|isp/i.test(e.full_name||e.key));localStorage.setItem(this.cacheKey(),JSON.stringify({t:this.goodT,opV:op?(op.value||'').trim():'',data:this.good}));}catch(e){}}
cacheRestore(){
 if(N5K_HOLD&&!window.MRT_N5K_OK)return;
 try{
  var raw=localStorage.getItem(this.cacheKey());if(!raw)return;
  var c=JSON.parse(raw);if(!c||!Array.isArray(c.data)||!c.data.length)return;
  /* 太旧的缓存不认(超 1 小时), 免得拿半天前的信号糊脸; 其余照画, 标签会显示"Xs 前的读数" */
  var age=Math.round((Date.now()-(c.t||0))/1000);
  if(age>3600)return;
  this.good=c.data;this.goodT=c.t||0;
  /* 给每条打上 stale=age(秒): 这样 render 的 srvStale>0, 不会把缓存当"刚拿到的新数据"而把
     goodT 重置成 now(那样会假显示"实时读数")。打了 stale, heroUp 会诚实标"Xs 前的读数"。 */
  var tagged=c.data.map(function(e){var o={};for(var k in e)o[k]=e[k];if(o.stale==null)o.stale=age;return o;});
  this.render(tagged);
 }catch(e){}
}
poll(){XHR.poll(5,'/cgi-bin/luci/admin/modem/qmodem/get_modem_cfg',{},(x,d)=>{if(d&&d.cfgs&&Array.isArray(d.cfgs)){this.sel.innerHTML='';d.cfgs.forEach(c=>{const o=document.createElement('option');o.value=c.cfg;o.textContent=c.name;this.sel.appendChild(o);});if(!this.cfg&&d.cfgs.length){this.cfg=d.cfgs[0].cfg;this.modem();}}});}
/* 走本包的 modem_ctrl(不是 qmodem 那个):服务端在这里做了粘滞缓存 + 2 秒合流,
   页面/屏保/手机端不会各自去抢 ttyUSB1。 */
modem(){XHR.get('/cgi-bin/luci/admin/fancontrol/modem_ctrl',{cfg:this.cfg||'',action:'info',translate:'1'},(x,d)=>this.render(d));}
isCell(e){return /基站信息|Cell Information/i.test((e.class||'')+(e.class_origin||''));}
/* key 和 full_name 都要试: full_name 是翻译过的,中文语言包没装时它还是英文
   ("Reference Signal Received Power"),只按 full_name 找会整片读不到,看起来跟没信号一样 */
mt(e,re){return re.test(e.key||'')||re.test(e.full_name||'');}
okVal(v){return v!==null&&v!==undefined&&String(v).trim()!==''&&String(v).trim()!=='--'&&!/CME ERROR|CMS ERROR/i.test(String(v));}
hasCell(d){return d.some(e=>this.isCell(e)&&this.okVal(e.value));}
/* 只把这次缺的 key 从上一次好数据里补回来,已经拿到的一律以新值为准 */
mergeGood(d){const seen={};d.forEach(e=>{if(e&&e.key)seen[e.key]=1;});return d.concat(this.good.filter(e=>e&&e.key&&!seen[e.key]));}
gw(){XHR.get('/cgi-bin/luci/admin/network/mwrt_assurance_status',{},(x,d)=>{if(!d)return;const u=(id,v)=>{const e=document.getElementById(id);if(!e)return;const on=/在线|Online/i.test(v);e.textContent=v||'--';e.className='ch-s '+(on?'on':'off');const dot=document.getElementById(id+'-d');if(dot)dot.className='ch-d '+(on?'on':'off');};u('ch-w',d["宽带接口状态"]);u('ch-c',d["蜂窝接口状态"]);const g=document.getElementById('gw-v');if(g)g.textContent=d["当前网关"]||'--';const f=document.getElementById('if-v');if(f)f.textContent=d["当前物理接口"]||'--';});}
dev(){XHR.get('/cgi-bin/luci/admin/fancontrol/devinfo',{},(x,d)=>{if(!d)return;const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v||'--';};
/* 设备规格卡。原来这里还给 #hdr-title(标题栏的品牌字)、#f-mem、#f-stor 赋值,
   那三个元素随标题栏/彩色磁贴一起删掉了, 赋值也跟着删 —— s() 有 if(!el) 兜底,
   留着不会报错, 但是死代码。内存剩余在圆环里, 存储已用/总量在 dv-stats 磁贴里。
   f-cores 恢复成原版: 它是独立一块磁贴(.fc.fo「核心数」), 所以值就是"4 核",
   不带前缀分隔点; 读不到时给 '--' 和其它磁贴一致(空串会让那块卡只剩标签)。 */
const model=d["设备型号"]?.name||d["设备型号"]||'';
s('f-model',model);s('f-host',d["主机名"]);s('f-fw',d["固件版本"]);s('f-kernel',d["内核版本"]);s('f-cpu',d["CPU型号"]);s('f-cores',d["CPU核心数"]?d["CPU核心数"]+' 核':'--');
// WiFi - show hint if unknown
const w24=d["2.4G无线信号名称"],w5=d["5G无线信号名称"];
const wifiWrap=document.getElementById('wifi-wrap');
if((!w24||w24==='未知')&&(!w5||w5==='未知')){if(wifiWrap)wifiWrap.innerHTML='<div class="empty-hint"><i class="fas fa-info-circle"></i> 当前设备未检测到无线网卡硬件</div>';}
/* 重写 innerHTML 是因为上一分支可能已经把这里换成空态提示了, 得把两块卡放回来。
   结构必须和模板里那两块 .fc 逐字一致(含 fb/fp 两个配色类、.fc-c 那层包着
   标签+值的容器, 以及 has-edit 类和右上角那个 .fc-edit 编辑键), 否则空态恢复
   之后这两块会掉成无底色的裸文字, 或者编辑键整个消失 —— 只要 devinfo 有一轮
   回了"未知"再恢复, 用户就再也点不到编辑了。
   **这里只在内容真的变了的时候重写。** 原先每轮(2 秒)无条件重写一次:
   编辑键有 hover 显形和 :focus-visible 描边, 每 2 秒连同整块 DOM 被换掉的话,
   鼠标悬停状态和键盘焦点每轮都丢一次, 浮窗开着时底下还在不停重建。
   用 dataset 存上一轮的值做比较, 和页面别处 .lastBdg 那种做法同源。 */
else if(wifiWrap){
 var wsig=(w24||'')+'\u0000'+(w5||'');
 if(wifiWrap.dataset.sig!==wsig||!document.getElementById('f-wifi24')){
  wifiWrap.innerHTML='<div class="fc fb has-edit"><div class="fc-i"><i class="fas fa-wifi"></i></div><div class="fc-c"><div class="fc-l">2.4G 无线网络</div><div class="fc-v" id="f-wifi24">--</div></div><button type="button" class="fc-edit" data-band="2g" onclick="wfmOpen(\'2g\')" title="修改 2.4G 无线设置" aria-label="修改 2.4G 无线设置"><i class="fas fa-pen"></i></button></div><div class="fc fp has-edit"><div class="fc-i"><i class="fas fa-wifi"></i></div><div class="fc-c"><div class="fc-l">5G 无线网络</div><div class="fc-v" id="f-wifi5">--</div></div><button type="button" class="fc-edit" data-band="5g" onclick="wfmOpen(\'5g\')" title="修改 5G 无线设置" aria-label="修改 5G 无线设置"><i class="fas fa-pen"></i></button></div>';
  wifiWrap.dataset.sig=wsig;
 }
 s('f-wifi24',w24);s('f-wifi5',w5);
}
// WAN
s('f-wan',d["WAN状态"]);s('f-proto',d["WAN协议"]);s('f-wanip',d["WAN_IP"]);s('f-wtime',d["WAN在线时长"]);s('f-gw',d["默认网关"]);s('f-lan',d["LAN_IP"]);s('f-dns',d["DNS服务器"]);s('f-wdev',d["WAN接口"]);
// WAN status dot
const wanEl=document.getElementById('f-wan');const wanDot=document.getElementById('f-wan-d');if(wanEl&&wanDot){const on=/已连接/i.test(d["WAN状态"]);wanEl.className='ch-s '+(on?'on':'off');wanDot.className='ch-d '+(on?'on':'off');}
// Traffic
s('f-rx',d["WAN下行流量"]);s('f-tx',d["WAN上行流量"]);
// Chart - use raw bytes if available
if(window._chart&&d["WAN下行字节"]&&d["WAN上行字节"]){window._chart.push(parseInt(d["WAN下行字节"])||0,parseInt(d["WAN上行字节"])||0);}
/* 三个圆环的数值 + 环形动画(按用户要求还原, 和改动前逐字一致)。
   av() 做数字滚动, rng() 算 stroke-dashoffset 转出环形进度; 两者都有 if(!el)return。
   rng() 的描边颜色按温度分档: >70℃ 红, >50℃ 黄, 否则青。
   温度这个值下面风扇那段还要用(同一个 d["设备温度"]), 不要重复请求。

   原先同一轮还删了 #qs-* 快捷统计, 那四项不还原 —— 它们嵌在 #hero-w 里,
   没插卡时会跟蜂窝一起被 .hid 隐藏(真缺陷), 现已改由设备总览的连接信息出。 */
let cpu=parseInt(d["CPU占用"])||0;av(document.getElementById('gv-cpu'),cpu,'%');rng(document.getElementById('g-cpu'),cpu);
/* s63 第3项: 内存清理动画进行时(memClean), 别让这轮轮询把圆环数字冲掉 —— 动画
   自己会在结束时用最新值收尾。门控只盖内存这一格, CPU/温度照常刷。 */
let mem=parseInt(d["剩余内存百分比"])||0;if(!window.MRT_MEMCLEAN){av(document.getElementById('gv-mem'),mem,'%');rng(document.getElementById('g-mem'),mem);}
/* 内存卡内环 = 虚拟内存(swap)已用%, 后端 d["虚拟内存"] 全是 KiB, 没挂 swap 就没这个键(撤掉 .sw)。
   内环半径 31, 周长和外环的 C 不同, 所以不走 rng()。绝对值/zram/SD 明细在悬停浮层里(MRT_POP)。 */
{const gm=document.getElementById('ga-mem'),sw=d["虚拟内存"],on=!!(sw&&sw.total>0);
 if(gm){gm.classList.toggle('sw',on);gm.classList.toggle('sd',on&&sw.disk_used>0);
  if(on){const f=gm.querySelector('.ga-sfg'),sc=2*Math.PI*31,p=Math.min(100,sw.used/sw.total*100);
   if(f){f.style.strokeDasharray=sc;f.style.strokeDashoffset=sc-(p/100)*sc;}}}}
/* s54: 温度圆环默认显示 WiFi 芯片温度(d["WiFi温度"], 后端 10 秒读一次 iwpriv), 读不到才回落 CPU(d["设备温度"])。
   标签按用户要求只写"温度", 不注明来源; 来源在悬停浮层里分行列出。风扇卡还是 CPU 温度。 */
const wtv=parseInt(d["WiFi温度"]);
let tmp=!isNaN(wtv)?wtv:(parseInt(d["设备温度"])||0);
av(document.getElementById('gv-tmp'),tmp,'℃');rng(document.getElementById('g-tmp'),Math.min(tmp,100));{const gt=document.getElementById('ga-tmp');if(gt)gt.className='ga '+(tmp>70?'mr':tmp>50?'mo':'mcy');}
/* 悬停浮层(CPU 各核 / 内存明细 / 温度)直接吃这一轮 devinfo, 不另发请求; 放在温度卡换完色之后, 浮层抄色才是新的 */
window.MRT_DEV=d;if(window.MRT_POP)MRT_POP.upd('dev');
// Fan
const fanPct=parseInt(d["风扇转速百分比"])||0;const fanPwm=d["风扇PWM"]||'0';const fanTemp=parseInt(d["设备温度"])||0;
s('fan-pct',fanPct+'%');s('fan-temp',fanTemp?fanTemp+'℃':'--');s('fan-mode',d["风扇模式"]);s('fan-pwm',fanPwm+'/255');
updateFanBtns(d["风扇模式"]||'');
// Sync slider value
const rng2=document.getElementById('fan-range'),rv2=document.getElementById('fan-range-val');
if(rng2&&!rng2.matches(':active')){rng2.value=fanPwm;if(rv2)rv2.textContent=fanPwm;}
// Ring color based on temp
const fanRing=document.getElementById('fan-ring-fg');
const ringClr=fanTemp>70?'#f87171':fanTemp>50?'#fbbf24':'#22d3ee';
if(fanRing){const c=2*Math.PI*46;fanRing.style.strokeDasharray=c;fanRing.style.strokeDashoffset=c-(fanPct/100)*c;fanRing.style.stroke=ringClr;}
// Fan SVG animation + glow
const fanSvg=document.getElementById('fan-svg');const fanCard=document.getElementById('fan-card');
if(fanSvg){
if(fanPct>0){fanSvg.classList.remove('off');fanSvg.style.animationDuration=Math.max(0.2,2.5-fanPct/45)+'s';fanSvg.classList.toggle('fast',fanPct>=70);fanSvg.classList.toggle('hot',fanTemp>65);}
else{fanSvg.classList.add('off');fanSvg.classList.remove('fast','hot');}
}
// Card background glow based on temp
if(fanCard){fanCard.classList.remove('fan-hot','fan-warm','fan-cool');if(fanTemp>65)fanCard.classList.add('fan-hot');else if(fanTemp>45)fanCard.classList.add('fan-warm');else fanCard.classList.add('fan-cool');
// Blowing state + wind speed
if(fanPct>0){fanCard.classList.add('blowing');updateWindSpeed(fanPct);}else{fanCard.classList.remove('blowing');}
// Fan blade color
const blades=fanSvg?fanSvg.querySelectorAll('path'):[];const bladeClr=fanTemp>65?'#f87171':fanTemp>50?'#fbbf24':'#22d3ee';blades.forEach(p=>p.setAttribute('fill',bladeClr));
}
});}
render(data){
const now=Date.now(),fresh=Array.isArray(data)&&data.length>0;
/* 后端补上的条目自带 stale(秒)。带 stale 的不能算"新拿到的",否则前端会拿它
   再起一个 120 秒窗口,两层叠起来最长能糊 4 分钟的旧数据。 */
const srvStale=fresh?data.reduce((m,e)=>Math.max(m,(e&&parseInt(e.stale))||0),0):0;
if(fresh&&!srvStale&&this.hasCell(data)){this.good=data.filter(e=>e&&this.okVal(e.value));this.goodT=now;this.cacheSave();}
else if(this.good&&now-this.goodT<STICKY_MS){data=fresh?this.mergeGood(data.filter(e=>e&&this.okVal(e.value))):this.good;}
/* 数据落后了多少秒(-1=本次会话还没拿到过),给 heroUp 决定要不要提示 */
this.stale=srvStale||(this.goodT?Math.round((now-this.goodT)/1000):-1);
if(!data||!Array.isArray(data)||!data.length){if(window.MRT_HERO)MRT_HERO.set('sys');else document.getElementById('hero-w').classList.add('hid');var _empty='<div class="cd" data-mx="empty"><div class="empty-hint"><i class="fas fa-sim-card"></i> 此设备未安装蜂窝模组，或模组未被识别</div></div>';if(this.sec._h!==_empty){this.sec.innerHTML=_empty;this.sec._h=_empty;}return;}
/* s64 跳顶修复: 不再每轮 innerHTML='' 清空再重建 —— 那会让 #mrt-sec 瞬间塌高, Safari/部分手机
   浏览器滚动位置超出文档高度就被夹回顶部(用户"滑到下面自动回顶")。改成先拼进本地串 secHtml,
   末尾只有内容真变了才写 DOM(内容没变就一个字节不动, 滚动位置纹丝不动)。 */
let secHtml='';const base=[],sim=[],cell=[],w=[];
const st=this.sel.options[this.sel.selectedIndex]?.text||'';if(st)base.push({full_name:'模组型号',value:st});
const op=data.find(e=>/互联网服务提供商|operator|isp/i.test(e.full_name||e.key));let opV=op?(op.value||'').trim():'';
data.forEach(e=>{if(e.type==='warning_message'){w.push(e);return;}const c=(e.class||'')+(e.class_origin||'');if(/SIM卡信息|SIM Information/i.test(c)){sim.push(e);return;}if(/基站信息|Cell Information/i.test(c)){cell.push(e);return;}if(/基本信息|Base Information/i.test(c)){base.push(e);return;}});
if(window.MRT_HERO)MRT_HERO.set(data.some(e=>e&&e.type!=='warning_message')?'cell':'sys');else document.getElementById('hero-w').classList.remove('hid');this.heroUp(data,opV);
/* RSRP 兜底也认 RxLev: 4G(LTE)下 MT5700 用 RxLev 报参考信号接收功率(同量纲 dBm),
   不加的话 4G 时「信号质量监测」卡里 RSRP 表盘是空的。 */
const sigKeys=[{re:/^RSRP$|参考信号接收功率|^RxLev$|接收电平/i,name:'RSRP',sub:'参考信号接收功率',unit:'dBm',type:'rsrp'},{re:/^RSRQ$|参考信号接收质量/i,name:'RSRQ',sub:'参考信号接收质量',unit:'dB',type:'rsrq'},{re:/^SINR$|信噪比/i,name:'SINR',sub:'信号噪声比',unit:'dB',type:'sinr'},{re:/^RSSI$|接收信号强度/i,name:'RSSI',sub:'接收信号强度',unit:'dBm',type:'rssi'}];
const sigItems=sigKeys.map(sk=>{const e=[...cell,...base].find(x=>sk.re.test(x.key||'')||sk.re.test(x.full_name||''));return{...sk,value:e?e.value:null};});
if(sigItems.some(s=>s.value!==null&&s.value!==undefined&&s.value!=='--')){const html=sigItems.filter(s=>s.value!==null&&s.value!==undefined&&String(s.value).trim()!==''&&s.value!=='--').map(s=>{const lvl=sigLvl(s.type,s.value);const r=24,c=2*Math.PI*r,off=c-(lvl.pct/100)*c;const stk=lvl.cls==='good'?'#34d399':lvl.cls==='fair'?'#fbbf24':'#f87171';const dispVal=(s.value!==null&&s.value!==undefined&&s.value!=='--')?String(s.value).replace(/[^0-9.\-]/g,'')||'--':'--';return`<div class="sig-gauge"><div class="sg-w"><svg viewBox="0 0 60 60"><circle class="sg-bg" cx="30" cy="30" r="${r}"/><circle class="sg-fg" cx="30" cy="30" r="${r}" stroke="${stk}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg><div class="sg-c"><span class="sv">${dispVal}</span><span class="su">${s.unit}</span></div></div><div class="sg-name">${s.name}</div><div class="sg-sub">${s.sub}</div><span class="sg-desc ${lvl.cls}">${lvl.desc}</span></div>`;}).join('');/* s87: 「信号质量监测」卡已撤(RSRP/RSRQ/SINR 在顶部 hero 里) */}
if(base.length){const netE=data.find(e=>this.mt(e,/^mode$|^network_?mode$|网络模式|network mode|network type/i));const connE=data.find(e=>this.mt(e,/connect|connection|连接状态/i));const bandE=[...cell,...base].find(e=>this.mt(e,/^band$|频段/i));const findF=(rx)=>base.find(e=>rx.test(e.key||'')||rx.test(e.full_name||''));const nameE=findF(/^name$|名称/i);const mfgE=findF(/^manufacturer$|制造商|厂商/i);const revE=findF(/^revision$|^firmware|固件版本/i);const atE=findF(/at_port|AT端口/i);const tempE=findF(/^temperature$|温度/i);let tags='';const nv=netE?netE.value:'';if(nv){const is5g=/5g|NR/i.test(nv);const is4g=/4g|LTE/i.test(nv);tags+=`<span class="net-tag ${is5g?'t-5g':is4g?'t-4g':'t-mode'}"><i class="fas fa-broadcast-tower"></i> ${nv}</span>`;}if(bandE&&bandE.value)tags+=`<span class="net-tag t-band"><i class="fas fa-wave-square"></i> ${bandE.value}${bandFreq(bandE.value)?' · '+bandFreq(bandE.value):''}</span>`;let connHtml='';if(connE){const co=/yes|up|connected|在线/i.test(connE.value);connHtml=`<span class="conn-pill ${co?'on':'off'}"><span class="dot"></span>${co?'链路已连接':'链路断开'}</span>`;}let modCells='';if(nameE)modCells+=`<div class="mod-cell"><div class="mod-cell-l"><i class="fas fa-microchip"></i> 模组型号</div><div class="mod-cell-v lg">${nameE.value||'--'}</div></div>`;if(mfgE)modCells+=`<div class="mod-cell"><div class="mod-cell-l"><i class="fas fa-industry"></i> 制造商</div><div class="mod-cell-v">${mfgE.value||'--'}</div></div>`;if(revE)modCells+=`<div class="mod-cell"><div class="mod-cell-l"><i class="fas fa-code-branch"></i> 固件版本</div><div class="mod-cell-v">${revE.value||'--'}</div></div>`;let metaParts=[];if(atE)metaParts.push(`<span class="at-port-chip"><i class="fas fa-plug"></i> ${atE.value||'--'}</span>`);let tempHtml='';if(tempE){const tNum=parseFloat((tempE.value||'').replace(/[^\d.\-]/g,''));if(!isNaN(tNum)){const tMin=20,tMax=85,tPct=Math.max(0,Math.min(100,(tNum-tMin)/(tMax-tMin)*100));const tColor=tNum<50?'#34d399':tNum<65?'#fbbf24':tNum<75?'#fb923c':'#f87171';tempHtml=`<div class="mod-cell" style="grid-column:span 2"><div class="mod-cell-l"><i class="fas fa-thermometer-half"></i> 模组温度</div><div style="display:flex;align-items:baseline;gap:6px"><span class="mod-cell-v lg" style="color:${tColor}">${tNum}</span><span class="mod-cell-sub">°C</span></div><div class="temp-bar"><div class="temp-bar-track"><div class="temp-bar-mark" style="left:${tPct}%"></div></div><div class="temp-bar-scale"><span>20°</span><span>50°</span><span>85°</span></div></div></div>`;}else{tempHtml=`<div class="mod-cell"><div class="mod-cell-l"><i class="fas fa-thermometer-half"></i> 模组温度</div><div class="mod-cell-v">${tempE.value||'--'}</div></div>`;}}const skipKeys=/^name$|名称|^manufacturer$|制造商|厂商|^revision$|^firmware|固件版本|at_port|AT端口|^temperature$|温度|^mode$|网络模式|network type|connect|connection|连接状态|operator|运营商|isp|^band$|频段/i;const rows=base.filter(e=>!skipKeys.test(e.key||e.full_name||'')&&e.type!=='progress_bar'&&!/RSRP|RSRQ|SINR|RSSI|参考信号/i.test(e.full_name||e.key||'')).map(e=>`<div class="ir"><span class="ik">${e.full_name||e.key}</span><span class="iv">${e.value||'--'}</span></div>`).join('');secHtml+=`<div class="cd" data-mx="mod"><div class="cd-t"><i class="fas fa-microchip"></i> 蜂窝模组</div>${tags||connHtml?`<div class="net-tags">${tags}${connHtml}</div>`:''}${modCells||tempHtml?`<div class="mod-grid">${modCells}${tempHtml}</div>`:''}${metaParts.length?`<div class="mod-meta">${metaParts.join('')}</div>`:''}${rows}</div>`;}
if(sim.length){const r=sim.map(e=>{let v=e.value||'--';const kn=(e.full_name||e.key||'');
/* 卡槽以设备侧为准:模组只知道自己被接到了哪路,不知道机身把 GPIO 拨到了哪个槽。 */
if(/SIM.?Slot|插槽|卡槽/i.test(kn)&&simSlot&&simSlot.slot)v=simSlot.slot;if(/status|状态/i.test(e.full_name||e.key))v=/ready/i.test(v)?'<span style="color:var(--gn);font-weight:700">●&nbsp;'+v+'</span>':'<span style="color:var(--rd);font-weight:700">●&nbsp;'+v+'</span>';if(/ICCID|IMSI|IMEI|号码/i.test(e.full_name||e.key))v=`<span style="font-family:'SF Mono','JetBrains Mono',monospace;font-size:11px">${v}</span>`;return`<div class="ir"><span class="ik">${e.full_name||e.key}</span><span class="iv">${v}</span></div>`;}).join('')+simPhoneRow();secHtml+=`<div class="cd" data-mx="sim"><div class="clh" onclick="tc(this)"><div class="cd-t"><i class="fas fa-id-card"></i> SIM卡信息</div><i class="fas fa-chevron-down cla"></i></div><div class="clb">${cxSubHtml()}<div class="sim-grid">${r}</div></div></div>`;}
if(cell.length){const keyMap=[{re:/^Band$|频段/i,label:'频段',icon:'fa-wave-square'},{re:/^EARFCN$|^NR.?ARFCN$|频点/i,label:'频点',icon:'fa-broadcast-tower'},{re:/^PCI$|物理小区/i,label:'物理小区',icon:'fa-cube'},{re:/Cell.?ID|小区ID|^CID$/i,label:'小区ID',icon:'fa-broadcast-tower'},{re:/Bandwidth|带宽/i,label:'带宽',icon:'fa-arrows-alt-h'},{re:/^TAC$|^LAC$/i,label:'区位码',icon:'fa-map-marker-alt'}];const gridItems=keyMap.map(km=>{const e=cell.find(x=>this.mt(x,km.re));if(!e)return'';let note='';if(/Band|频段/i.test(km.label)){const f=bandFreq(e.value);if(f)note=f;}return`<div class="cell-item"><div class="ci-label"><i class="fas ${km.icon}"></i> ${km.label}</div><div class="ci-value">${e.value||'--'}</div>${note?`<div class="ci-note">${note}</div>`:''}</div>`;}).filter(Boolean).join('');const sigBars=cell.filter(e=>/RSRP|RSRQ|SINR|RSSI/i.test((e.key||'')+' '+(e.full_name||''))).map(e=>{const nm=((e.key||'')+' '+(e.full_name||'')).match(/RSRP|RSRQ|SINR|RSSI/i)?.[0]||(e.full_name||e.key);const tp=nm.toLowerCase();const lvl=sigLvl(tp,e.value);const cls=lvl.cls;return`<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;margin-bottom:4px;border-radius:8px;background:var(--c2)"><span style="font-size:10px;font-weight:700;color:var(--t1);min-width:42px">${nm}</span><div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden"><div style="height:100%;border-radius:3px;width:${lvl.pct}%;background:${cls==='good'?'#34d399':cls==='fair'?'#fbbf24':'#f87171'};transition:width 0.6s"></div></div><span style="font-size:11px;font-weight:700;color:var(--t1);min-width:74px;text-align:right;font-family:monospace">${e.value||'--'}</span><span class="sg-desc ${cls}" style="margin-top:0;min-width:34px;text-align:center">${lvl.desc}</span></div>`;}).join('');const otherRows=cell.filter(e=>!keyMap.some(km=>this.mt(e,km.re))&&!/RSRP|RSRQ|SINR|RSSI/i.test((e.key||'')+' '+(e.full_name||''))).map(e=>`<div class="ir"><span class="ik">${e.full_name||e.key}</span><span class="iv">${e.value||'--'}</span></div>`).join('');secHtml+=`<div class="cd" data-mx="cell"><div class="clh" onclick="tc(this)"><div class="cd-t"><i class="fas fa-broadcast-tower"></i> 基站信息 · 主服务小区</div><i class="fas fa-chevron-down cla"></i></div><div class="clb">${gridItems?`<div class="cell-grid">${gridItems}</div>`:''}${sigBars?`<div style="margin-top:8px">${sigBars}</div>`:''}${otherRows}</div></div>`;}
/* 5700 专属:载波聚合 + 附近小区。cellx 未就绪或非 5700 时两者都返回空串。 */
secHtml+=cxCaHtml()+cxNbHtml();
/* 只有整段 HTML 真的变了才写 DOM。没变就不动 —— 避免每 4 秒清空重建导致的塌高/滚动跳顶,
   也顺带保住折叠卡(SIM/基站)的展开态和里面的滚动位置。 */
if(this.sec._h!==secHtml){this.sec.innerHTML=secHtml;this.sec._h=secHtml;}
if(w.length)toast(w.map(x=>(x.full_name||x.key)+': '+x.value).join(' | '));}
heroUp(data,opV){const $=id=>document.getElementById(id),hs=$('hero-sig'),logo=$('h-logo'),brand=$('h-brand'),opN=$('h-op');
/* 刚进页面、服务端缓存也是冷的那几秒:说"读取中"而不是甩一个"等待…"给用户 */
const warming=(this.stale<0)&&(Date.now()-this.t0<WARM_MS);
// 没拨号就谈不上运营商: 后端 connect_status 严格是 Yes/No,没走到 network_info 时这一项干脆不存在,两种都按未拨号处理。
const csE=data.find(e=>/^connect_status$/i.test(e.key||'')||/connect status|连接状态/i.test(e.full_name||''));
const dialed=/^yes$/i.test(((csE&&csE.value)||'').toString().trim());
// 但 connect_status 是 generic.sh 拿 AT+CGACT?/CGPADDR 现查的, AT 口被别的进程占着就会报 No。右栏「蜂窝联网」(#ch-c)
// 是主备守护进程看的真实接口, 它说在线就一定在线 —— 两边任一说在线都算在线。
// (旧徽章拿 /connect|connection/ 去撞 key, 撞到的未必是这一项, 于是出现过"有 RSRP 却显示未连接"。)
const chc=$('ch-c'),chcTxt=chc?(chc.textContent||''):'';
const chcOn=/在线|Online/i.test(chcTxt),chcOff=/离线|断开|Offline/i.test(chcTxt);
/* online 粘滞: dialed(connect_status)和 chc(网关守护)谁说在线都算在线。
   但这两个都会因 AT 口被占而瞬时读空 → 不能一读空就翻脸报"未连接/等待注册"。
   规则: 明确在线 → online 且记住 lastOnline; 既没明确在线、chc 也没"明确离线"时,
   若本会话曾在线(lastOnline)就继续当在线(沿用上次运营商名), 把偶发空读糊过去;
   只有 chc 明确"离线"才真判离线。真掉线会由网关守护稳定报离线, 不会误判。 */
/* online 粘滞——但要"跟真实变化走", 不能一味粘旧值(切卡/真掉线后不该还显示在线):
   · 明确在线(dialed 或网关守护说在线)→ online, 记时间戳 lastOnlineT;
   · 真·离线信号(网关守护"离线", 或这轮确实读到了 connect_status 且=No)→ 立即清粘滞, 不糊;
   · 只有"这轮啥都没读到"(csE 不存在 = AT 被占空读)才用粘滞, 且只在上次确认在线后
     STICKY_MS 窗口内有效, 超时就老实翻未连接。这样偶发空读被糊过去, 但真变化会跟上。 */
let online=dialed||chcOn;
var realNeg=chcOff||(csE&&!dialed);         // 确凿的离线/未拨号(有新读数, 非空读)
if(online){this.lastOnline=true;this.lastOnlineT=Date.now();}
else if(realNeg){this.lastOnline=false;this.lastOp='';}
else if(this.lastOnline&&(Date.now()-(this.lastOnlineT||0))<STICKY_MS){online=true;}
else{this.lastOnline=false;}
const mR=/^MCC$|^MMC$|Mobile Country Code|移动国家/i,nR=/^MNC$|Mobile Network Code|移动网络/i,iR=/^IMSI$|International Mobile Subscriber|国际移动用户/i;
const mccE=data.find(e=>mR.test(e.key||'')||mR.test(e.full_name||''));
const mncE=data.find(e=>nR.test(e.key||'')||nR.test(e.full_name||''));
const imsiE=data.find(e=>iR.test(e.key||'')||iR.test(e.full_name||''));
const mcc=mccE?(mccE.value||'').toString().trim():'';
const mnc=mncE?(mncE.value||'').toString().trim().padStart(2,'0'):'';
const imsi=imsiE?(imsiE.value||'').toString().replace(/\s/g,''):'';
const imsiPlmn=imsi.length>=5?imsi.substring(0,5):'';
let src='',nm='';
const detect=(s)=>{if(/移动|CM|Mobile|46000|46002|46004|46007|46008/i.test(s))return['/logo/chinamobile.png','中国移动'];if(/联通|CU|United|46001|46006|46009/i.test(s))return['/logo/chinaunicom.png','中国联通'];if(/电信|CHN-CT|Telecom|CT|46003|46005|46011/i.test(s))return['/logo/ctc.png','中国电信'];if(/广电|CBN|46015/i.test(s))return['/logo/cbn.png','中国广电'];return['',''];};
if(imsiPlmn){const r0=detect(imsiPlmn);if(r0[0]){src=r0[0];nm=r0[1];}}
if(!nm){const r1=detect(opV);if(r1[0]){src=r1[0];nm=r1[1];}}
if(!nm&&mcc&&mnc){const r2=detect(mcc+mnc);if(r2[0]){src=r2[0];nm=r2[1];}}
// 必须显式清掉: 读不到 IMSI 时返回的 "+CME ERROR: 10" 会被压成 "+CMEE",
// 而 detect() 的 /CM/i 正好命中它 —— 这就是没插卡也显示中国移动的原因。
if(!online){src='';nm='';}
/* s137 原版 logo 回来了：/logo/*.png 四张 200x62 横版透明图，从 MWRT 原包里取回，
   随本包安装到 /www/logo/（原包放在 /usr/share/modem/logo/，web 不可见，所以复制一份到 web 根）。
   之前设备上没有这四张图，<img> 404 而 heroUp 每 4 秒又把 has-logo 加回来 → 品牌块空白
   （用户「运营商的图标不显示了」）。图补上即可。
   下面这组包围盒是各家"图形"在原图里的位置 [x,y,w,h]，按 clip 边长等比放大后居中裁出来。
   2026-11-19 用 alpha 通道重测过一遍（原来的值会切掉图形边缘，联通的还会带出下面的文字）：
     移动 图形在左 x0..62；电信 图形在左 x0..57 / y5..59；广电 图形在左 x16..77；
     联通版式相反 —— 图形在右上 x92..153 / y0..46，文字在下面 y50+，所以框高只取 36 把文字挡掉。 */
const EMB={chinamobile:[0,0,63,62],ctc:[0,5,58,55],cbn:[16,0,62,61],chinaunicom:[92,0,62,36]};
const showLogo=s=>{if(!logo||!brand)return;
if(!s){brand.classList.remove('has-logo');delete logo.dataset.op;logo.removeAttribute('src');logo.style.display='none';return;}
if(logo.dataset.op!==s){logo.dataset.op=s;delete logo.dataset.bad;logo.onerror=()=>{brand.classList.remove('has-logo');logo.style.display='none';logo.dataset.bad='1';};logo.src=s;}
/* 图真的加载失败过就不要再挂 has-logo —— 否则兜底的基站图标被藏掉、品牌块变空白 */
if(logo.dataset.bad==='1')return;
logo.style.display='';brand.classList.add('has-logo');
const b=EMB[(s.match(/([a-z]+)\.png$/i)||[])[1]],S=logo.parentNode.clientWidth||28;
if(b){const k=S/Math.max(b[2],b[3]);logo.style.width=(200*k)+'px';logo.style.height=(62*k)+'px';logo.style.left=(-b[0]*k+(S-b[2]*k)/2)+'px';logo.style.top=(-b[1]*k+(S-b[3]*k)/2)+'px';}
else{logo.style.width=logo.style.height='100%';logo.style.left=logo.style.top='0';logo.style.objectFit='contain';}};
showLogo(src||(online&&logo&&logo.dataset.op)||'');
if(opN){
  /* 运营商名也粘滞: 在线时一旦解析出名字(nm/opV/PLMN)就记进 lastOp;
     在线但这轮没读到名字(AT 空读)→ 沿用 lastOp, 不回退到"等待网络注册"。 */
  var nameNow=nm||((opV&&opV.length>0&&opV!=='--')?opV:'')||(imsiPlmn?('PLMN '+imsiPlmn):'')||((mcc&&mnc)?('PLMN '+mcc+'-'+mnc):'');
  if(!online){opN.textContent=(warming&&!csE)?'读取中…':'等待网络注册';}
  else if(nameNow){opN.textContent=nameNow;this.lastOp=nameNow;}
  else{opN.textContent=this.lastOp||'等待网络注册';}
}
/* 状态行: 圆点 + 已拨号/未连接 + 制式原文。这次读不到就沿用上一次, 别闪"读取中" */
let st=online?'已拨号':(csE&&this.okVal(csE.value))?'未连接':'';
if(st)this.lastSt=st;else st=this.lastSt||(warming?'读取中…':'未连接');
const opS=$('h-op-status');if(opS)opS.textContent=st;
if(hs){hs.classList.toggle('is-up',st==='已拨号');hs.classList.toggle('is-down',st==='未连接');}
const cellF=re=>data.find(e=>this.mt(e,re)&&this.okVal(e.value));
const modeE=cellF(/^mode$|^network_?mode$|网络模式|network mode|network type/i);
const mv=modeE?String(modeE.value).trim():'';
/* 制式徽章: 只留一颗(5G SA / 5G NSA / 4G LTE), 连接状态已经由状态行的圆点说了 */
const bw=$('h-bdg');if(bw){if(!mv&&this.lastBdg){bw.innerHTML=this.lastBdg;}else{
const g=/NSA|EN-?DC/i.test(mv)?['bdg-5g','5G NSA']:/5g|NR/i.test(mv)?['bdg-5g',/SA/i.test(mv)?'5G SA':'5G']:/4g|lte/i.test(mv)?['bdg-4g','4G LTE']:/wcdma|umts|3g/i.test(mv)?['bdg-4g','3G']:['',''];
// 制式读不到就不画徽章(空灰胶囊比没有更难看)
bw.innerHTML=g[0]?`<span class="bdg ${g[0]}"><i class="fas fa-signal"></i>${g[1]}</span>`:'';if(mv)this.lastBdg=bw.innerHTML;}}
/* 四格指标。档位/百分比都走 sigLvl(), 和下面基站信息卡的信号条同一套判据 */
const num=v=>String(v==null?'':v).replace(/[^0-9.\-]/g,'');
const met=(id,type,re)=>{const box=$(id);if(!box)return;const e=cellF(re),n=e?num(e.value):'',L=n!==''?sigLvl(type,n):null;
box.classList.remove('lv-good','lv-fair','lv-poor');if(L)box.classList.add('lv-'+L.cls);
box.querySelector('.h-mv .n').textContent=n!==''?n:'--';box.querySelector('.h-mk b').textContent=L?L.desc:'--';box.querySelector('.h-mb>span').style.width=(L?L.pct:0)+'%';};
met('hm-rsrq','rsrq',/^RSRQ$|参考信号接收质量/i);met('hm-sinr','sinr',/^SINR$|信噪比/i);
const isNR=/5g|NR/i.test(mv),bandE=cellF(/^Band$|_BAND$|^频段$/i),arE=cellF(/ARFCN|EARFCN|频点/i);
let bv=bandE?String(bandE.value).trim():'';if(/^\d+$/.test(bv))bv=(isNR?'n':'B')+bv;if(!bv&&arE)bv=arfcnBand(arE.value);
// 先找下行带宽: generic.sh 里 UL Bandwidth 排在 DL 前面, 直接 /带宽/ 会先撞到上行
const bwE=cellF(/^DL.?Bandwidth$|下行带宽/i)||cellF(/^Bandwidth$|^带宽$/i);let bwv=bwE?String(bwE.value).trim():'';if(/^\d+(\.\d+)?$/.test(bwv))bwv+='MHz';
const bs=[bandFreq(bv),bwv].filter(Boolean);if(bs.length<2&&arE)bs.push('ARFCN '+arE.value);
/* s41: 频段格的最终落笔交给 heroExtra() —— 5700 有载波聚合数据时用 cellx, 否则用这里按 info 算的单频段 */
heroCell.bv=bv||'--';heroCell.bs=bs.length?bs.slice(0,2).join(' · '):(warming?'读取中…':'--');heroCell.online=online;
/* s41: 原「小区 PCI / CID」格改成「卡槽 SIM」(用户要求), 小区标识只留在悬停提示里 */
const pciE=cellF(/Physical Cell|^PCI$|物理小区/i),cidE=cellF(/^cell.?id$|^小区ID$|^CID$/i),tacE=cellF(/^TAC$|^LAC$|tracking area/i);
heroCell.cell=[pciE&&'PCI '+pciE.value,cidE&&'CID '+cidE.value,tacE&&'TAC '+tacE.value,arE&&'ARFCN '+arE.value].filter(Boolean).join(' · ');
heroExtra();
/* 信号舱: 环、档位字、五格柱、舱体光晕(--lvr)全按 RSRP 档位上色。
   环的填充改成 -130..-70 dBm 线性映射(rp() 是五级台阶, 环上看着一跳一跳的) */
const ring=$('h-ring'),rv=ring&&ring.querySelector('.v'),lv=$('h-lv'),bars=$('h-bars'),slEl=$('h-sl');
const LVR={good:'52,211,153',fair:'251,191,36',poor:'248,113,113'},BC={good:'g',fair:'o',poor:'r'},RC={good:'#34d399',fair:'#fbbf24',poor:'#f87171'};
const paint=(n,L)=>{const p=n===''?0:Math.max(4,Math.min(100,Math.round((parseFloat(n)+130)/60*100)));
rng(ring,p,L?RC[L.cls]:'#f87171');if(rv)rv.textContent=n===''?'--':n;
if(lv){lv.textContent=L?L.desc:'--';lv.className='sig-lv'+(L?' '+L.cls:'');}
if(hs){if(L)hs.style.setProperty('--lvr',LVR[L.cls]);else hs.style.removeProperty('--lvr');}
if(bars){const k=L?Math.max(1,Math.ceil(p/20)):0,c=L?BC[L.cls]:'';bars.innerHTML=[1,2,3,4,5].map(i=>`<span style="height:${i*4+5}px" class="${i<=k?c:''}"></span>`).join('');}};
/* 4G(LTE)下 MT5700 不吐 RSRP, 只给 RxLev(同样是参考信号接收功率/dBm, 量纲一致),
   所以 RSRP 读不到时兜底认 RxLev —— 否则 4G 下信号环一直空 `--`(用户反馈"蜂窝显示不全")。 */
const rsrp=cellF(/RSRP|参考信号接收功率/i)||cellF(/^RxLev$|接收电平/i);
/* s138: RSRP 显示取整。udx.cellular 给的是 -107.45 这种两位小数（AT 模组只给整数），
   6 个字符塞进信号环圆心会溢出圆圈 —— 用户 2026-11-19 截图反馈。档位判定仍用原值。 */
if(rsrp){const n0=num(rsrp.value),nf=parseFloat(n0);
const n=(isFinite(nf)&&n0!=='')?String(Math.round(nf)):n0;paint(n,n!==''?sigLvl('rsrp',n0):null);
/* 信号刷新落后了就轻提示一句,别让用户以为数字是死的 */
if(slEl)slEl.textContent=(this.stale>30&&this.stale<=STICKY_MS/1000)?(this.stale+'s 前的读数'):'实时读数';}
// 粘滞窗口都过完还是读不到: 别再端着一个冻住的 dBm 配"等待小区注册",一起归零
else if(!warming&&this.stale>STICKY_MS/1000){paint('',null);if(slEl)slEl.textContent='暂无信号读数';}
else if(warming&&slEl)slEl.textContent='读取中…';}
}
window.onload=()=>{
const pg=document.getElementById('P');
/* 默认白天模式。原先是"localStorage 里存着 light 才加 .L", 也就是没存过值
   (首次访问、清过站点数据)时走深色。现在反过来: 只有明确存了 'dark' 才深色,
   其余一律浅色。
   注意顺序 —— 模板里 #t-ico 写死的是 fa-moon(配默认浅色: 图标表示"点我去夜间"),
   所以这里加完 .L 之后还要按实际状态把图标对一遍。不然"存过 dark"的老用户
   刷新进来是深色配月亮图标, 点一下才会跳对。 */
/* s107: 首页日夜与整站并轨 —— .L(浅色)跟 html[data-darkmode] 走, 偏好由 mwrt-aurora-boot.js 的
   window.MwrtTheme 统一管理(localStorage 的 mwrt-theme, 旧键 mrt-t 已由它迁移并回写)。
   没有 MwrtTheme(boot.js 没加载)时回退旧逻辑: 只有存过 mrt-t=dark 才深色。 */
const hasMT=!!(window.MwrtTheme&&typeof window.MwrtTheme.toggle==='function');
const rootDark=()=>hasMT?document.documentElement.getAttribute('data-darkmode')==='true':localStorage.getItem('mrt-t')==='dark';
const syncTheme=()=>{
pg.classList.toggle('L',!rootDark());
const ti=document.getElementById('t-ico');
if(ti)ti.className=pg.classList.contains('L')?'fas fa-moon':'fas fa-sun';
};
syncTheme();
if(hasMT){
try{new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-darkmode']});}catch(e){}
}
document.getElementById('t-btn').addEventListener('click',()=>{
if(hasMT){window.MwrtTheme.toggle();syncTheme();return;}
pg.classList.toggle('L');
localStorage.setItem('mrt-t',pg.classList.contains('L')?'light':'dark');
document.getElementById('t-ico').className=pg.classList.contains('L')?'fas fa-moon':'fas fa-sun';
});
const ui=new UI();window.MRT_UI=ui; /* s99: 给 HERO 用(HERO 在另一个 IIFE 里, 看不到这个 const) */
/* 先把 cellx 快照拿到手再渲染一次,否则首屏那一轮 render 里
   cxCaHtml()/cxNbHtml() 都是空的,两张卡要等 4 秒后的下一轮才出现。 */
slotLoad(heroExtra);cxLoad(()=>{heroExtra();ui.modem();});
ui.modem();ui.gw();ui.dev();
window._chart=new TrafficChart('traffic-canvas');
initWind();
loadScrStatus();
wlbRefreshBadge();   /* 无线网桥: 首屏拉一次状态, 点亮按钮/广域网徽章 */
setInterval(()=>{ui.gw();ui.dev();},2000);
/* 蜂窝信息单独放慢到 4 秒,且页面切走时不轮询:每次 info 都要抢 ttyUSB1,
   打太勤反而读不到东西(就是"有信号却显示未连接"的来源),回到页面立刻补一次 */
setInterval(()=>{if(!document.hidden)ui.modem();},4000);
/* 载波聚合/邻区 30 秒一刷就够:采集器本身是 cron 一分钟一拍,刷得再勤也拿不到
   更新的数,而且这些量(频段、聚合结构、邻区列表)本来就变得慢。
   这个请求只读 /tmp 的 JSON,不占串口,所以不用跟着 4 秒那轮走。 */
/* s140: 邻区/卡槽 30 秒 → 10 秒（用户要求，配合 cellulard 的 neighbors_refresh 60→10）。
   卡片本身还是跟着 ui.modem() 每 4 秒重绘，但只有这里拉到新数据才会真的变。 */
setInterval(()=>{if(!document.hidden){cxLoad(heroExtra);slotLoad(heroExtra);}},10000);
/* 无线网桥状态 30 秒刷一次(和卡槽同频), 但浮窗正开着/加入中时不插手, 免得和它自己的轮询打架 */
setInterval(()=>{if(!document.hidden&&!wlbBusy){var m=wfmEl('wlb');if(!m||!m.classList.contains('open'))wlbRefreshBadge();}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ui.modem();});
};
})();

;

/* Device Overview panel — polls免鉴权 /cgi-bin/router3d-data (只读 /sys,无 AT) */
(function(){
var IMG={Ultra:'/luci-static/router3d/ultra.png',MAX:'/luci-static/router3d/max.png',E87N:'/luci-static/router3d/e87n.png?v=s111f',H5000M:'/luci-static/router3d/h5000m.png',N5000:'/luci-static/router3d/n5000.png',TR3000:'/luci-static/router3d/udx710.svg'};
var NAMES={Ultra:'NRadio C2000 Ultra',MAX:'NRadio C2000 MAX',E87N:'EdgePi E87N',H5000M:'Hiveton H5000M',N5000:'NRadio N5000',TR3000:'本设备（5G模组udx710）'};
var IS_E87N=false;
// 网口格的「切换 WAN/LAN」按钮:只有单网口的 C2000 MAX 有(浮窗和后端接口也只在 MAX 上存在)
var PORTSW=false;
// 本机机型(服务端判定,固定不变)+ 该机型的自定义整机图(存在才非空)。
// 自定义图按机型隔离(custom_<机型>.png),换机型互不影响。
var DEV_MODEL='TR3000';
var DEV_NAME="本设备（5G模组udx710）";
var CUSTOM_IMG='';
var UP_URL='/cgi-bin/luci/admin/fancontrol/devimg_upload/TR3000';
var RST_URL='/cgi-bin/luci/admin/fancontrol/devimg_reset/TR3000';
var SHOT_URL='/cgi-bin/luci/admin/display/screenshot';
var overrideSrc=CUSTOM_IMG;  // 当前生效的自定义图 URL(空=用默认图);上传/恢复时更新
var $=function(id){return document.getElementById(id);};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
/* 把一个 IPv4 拆成「四段数字 + 弱化分隔点 + 末尾子网前缀徽章」, 见 CSS .is-ipx。
   pfx 是前缀位数(router3d-data 的 wan_pfx/lan_pfx), 0 或缺就不显示徽章。
   不是四段的(IPv6、异常值)原样回落成一段, 不硬拆。 */
function ipx(ip,pfx){
 var s=String(ip==null?'':ip),segs=s.split('.');
 var body;
 if(segs.length===4&&segs.every(function(x){return /^\d{1,3}$/.test(x);})){
  body=segs.map(function(x){return '<span class="seg">'+x+'</span>';}).join('<span class="dot">.</span>');
 }else{ body='<span class="seg">'+esc(s)+'</span>'; }
 var p=parseInt(pfx,10);
 var tag=(p>0&&p<=32)?'<span class="pfx">/'+p+'</span>':'';
 return '<span class="ipx">'+body+tag+'</span>';
}
function speedTxt(p){if(p>=1000)return (p/1000)+'G';if(p>0)return p+'M';return '—';}
function fmtKB(kb){kb=+kb||0;if(kb>=1048576)return (kb/1048576).toFixed(1)+'G';if(kb>=1024)return Math.round(kb/1024)+'M';return kb+'K';}
function pct(u,t){return t>0?Math.round(u*100/t):0;}
function barColor(p){return p>=85?'#f87171':(p>=65?'#f59e0b':'#34d399');}
/* 原本这里还有个 tempInfo(c) —— 按温度返回磁贴的渐变底色和进度条色。
   它只被"SoC 温度"那块磁贴用, 温度磁贴撤掉之后就没有调用方了, 一并删掉。
   风扇卡**不**走这个函数, 它有自己的内联阈值(1159/1172 行的 fanTemp>70/>50),
   阈值也和这里不同(70/50 vs 80/60), 所以删它不影响风扇卡。 */
/* s44: 原来的 tile()/tileBar() 两个磁贴构造器已并入 chip() —— 系统状态两块(CPU/存储)现在和连接信息六格是同一种格子(.dv-cell), 见 CSS 侧 .dv-side 注释。 */
/* 连接信息的一格。按 .fc 规格卡那套彩色玻璃卡片的语言做: 图标进 20px 淡调圆角
   徽章、标签 9px 大写在旁、值 15px/800 占第二行(尺寸和右栏的 .dv-stat 同档)。

   tone 是六套强调色之一(mb/mp/mg/mpk/mcy/mo) —— 一格一色。之前那版六格共用
   同一块紫底, 堆起来是"色块墙"; 各自一色之后底板读作分类标识, 能按颜色记位置。
   详见 CSS 侧 .dv-cell 那段。

   extra 是可选的第三行(趋势线等), 没有就不占位。 */
function chip(tone,icon,k,v,extra){return '<div class="dv-cell '+tone+'"'+(extra&&extra.pop?' data-pop="'+extra.pop+'"':'')+(extra&&extra.style?' style="'+extra.style+'"':'')+'><span class="ck"><i class="fas '+icon+'"></i><em>'+k+'</em>'+(extra&&extra.badge||'')+'</span><span class="cv2">'+v+'</span>'+(extra&&extra.below||'')+'</div>';}


/* s124 右栏磁贴(CPU / 存储 / WAN / LAN / 出口IP / HNAT)共用的格子 .tl, 原位更新而不是整块重写 innerHTML:
   条的宽度有过渡、数值变了跃动一下、悬停和键盘焦点不会被每 1.8 秒的刷新抹掉。
   list 每项: k 稳定键, ic 图标类, lb 标题, x 右上角 html, v 数值 html, b 条的百分比数组, bt 条的悬停提示, cls 附加类, lv 0/1/2(越大越告警), pop 浮层键, sc 自定义字号变量 */
function tlSet(box,list,em){
 var ch=box.children,i,j,t,el,fresh,keys={},bw,bs,bl,bi,ic,lb,xs,vv,cl,xh,ti;
 for(i=ch.length-1;i>=0;i--)if(!ch[i].getAttribute('data-k'))box.removeChild(ch[i]);
 for(i=0;i<list.length;i++)keys[list[i].k]=1;
 for(i=ch.length-1;i>=0;i--)if(!keys[ch[i].getAttribute('data-k')])box.removeChild(ch[i]);
 if(!list.length){box.innerHTML='<div class="empty-hint"><i class="fas fa-info-circle"></i> '+em+'</div>';return;}
 for(i=0;i<list.length;i++){
  t=list[i];el=null;
  for(j=0;j<ch.length;j++)if(ch[j].getAttribute('data-k')===t.k){el=ch[j];break;}
  fresh=!el;
  if(fresh){
   el=document.createElement('div');el.setAttribute('data-k',t.k);el.style.setProperty('--d',(i*70)+'ms');
   el.innerHTML='<div class="tl-h"><i class="tl-i"></i><em class="tl-l"></em><span class="tl-x"></span></div><div class="tl-v"></div><div class="tl-b"></div>';
  }
  if(ch[i]!==el)box.insertBefore(el,ch[i]||null);
  cl='tl'+(t.cls?' '+t.cls:'');if(el._c!==cl){el.className=cl;el._c=cl;}
  if(t.pop)el.setAttribute('data-pop',t.pop);else el.removeAttribute('data-pop');
  el.setAttribute('data-lv',t.lv||0);
  if(t.sc&&el._sc!==t.sc){el.style.setProperty('--sc',t.sc);el._sc=t.sc;}
  ic=el.firstChild.firstChild;lb=ic.nextSibling;xs=lb.nextSibling;vv=el.children[1];
  cl='tl-i fas '+t.ic;if(ic._c!==cl){ic.className=cl;ic._c=cl;}
  if(lb._t!==t.lb){lb.textContent=t.lb;lb._t=t.lb;}
  xh=t.x||'';if(xs._h!==xh){xs.innerHTML=xh;xs._h=xh;}
  if(vv._h!==t.v){
   vv.innerHTML=t.v;
   if(vv._h!=null){vv.classList.remove('bump');void vv.offsetWidth;vv.classList.add('bump');}
   vv._h=t.v;
  }
  bw=el.children[2];bs=bw.children;bl=t.b||[];
  while(bs.length<bl.length){bi=document.createElement('i');bi.style.setProperty('--p',0);bw.appendChild(bi);void bi.offsetWidth;}
  while(bs.length>bl.length)bw.removeChild(bw.lastChild);
  for(j=0;j<bl.length;j++){
   bs[j].style.setProperty('--p',Math.max(0,Math.min(100,+bl[j]||0)));
   ti=(t.bt&&t.bt[j])||'';if(bs[j].title!==ti)bs[j].title=ti;
  }
 }
}

/* === 连接信息里两格的历史采样 ===
   "386 条"这种数字单看一眼什么也说明不了 —— 得有个参照才有意义(刚才是多少?
   在涨还是在落?)。在线设备和活动连接这两格因此各带一条最近 40 点的趋势线
   和一枚环比增减标记。

   数据来自已有的 router3d-data 轮询(1.8 秒一轮), 存在闭包里, **不新增任何请求**。
   做法和页面底部那个流量图(TrafficChart)一致, 那边也是客户端自己攒增量。
   40 点 ≈ 72 秒, 刚好是一屏能看出趋势又不至于把瞬时波动抹平的窗口。 */
var HIST={clients:[],conns:[]};
function histPush(k,v){
 var a=HIST[k];if(!a)return a;
 if(v==null||isNaN(v))return a;
 a.push(+v);if(a.length>40)a.shift();
 return a;
}
/* s98: 趋势曲线引擎(第二版)。
   第一版的毛病: 曲线的横向位置绑在"数据到达"上 —— 每来一个点就把计时清零、整条线重新排布并重算纵向范围,
   轮询间隔稍有快慢线就会跳一下再停(机械的"抖"); 刚打开页面只有一两个点, 线也只占右边一小段。
   现在的做法:
     1. 每个点记下到达时间, 横轴是真实时间, 整条线随时间匀速左移(约 60 秒铺满), 与数据何时到达无关;
     2. 画出来的右缘是"当前时间往前 SPK_DLY 毫秒"处, 保证右缘两侧总有已知点可插值 —— 新点到来时曲线是顺着往那个值延伸,
        不会有任何一帧发生跳变; 数据晚到就保持最后值(平着走), 不抽搐;
     3. 点之前/之后用首值/末值水平延伸, 刚开页就是满宽的一条线(左端本来就渐隐);
     4. 纵向范围用 0.7 秒时间常数缓动, 极值进出窗口时是慢慢拉伸的;
     5. 最近 60 秒的采样存 sessionStorage, 切页/刷新后接着画, 不从零开始。
   曲线 <svg> 只建一次, #dv-meta 每 1.8 秒重写 innerHTML 后由 sparkMount 挪回占位处; 线用单调三次贝塞尔(不会过冲出假峰值)。
   数据仍来自已有的 router3d-data 轮询, 不新增请求; 页面不可见时 rAF 自动暂停, 屏外的曲线跳过绘制, 约 30 帧/秒。 */
var SPK={},SPK_H=38,SPK_PAD=6,SPK_ID=0,SPK_RAF=0,SPK_LAST=0,SPK_WIN=60000,SPK_DLY=2400,SPK_KEY='mwrt.spk.v1';
function spkRestore(o,k){
 try{
  var st=JSON.parse(sessionStorage.getItem(SPK_KEY)||'{}'),a=st[k],now=performance.now(),w=Date.now(),i,age;
  if(!Array.isArray(a))return;
  for(i=0;i<a.length;i++){
   age=w-a[i][0];
   if(age>=0&&age<SPK_WIN&&isFinite(a[i][1]))o.pts.push({t:now-age,v:+a[i][1],sv:+a[i][1]});
  }
 }catch(e){}
}
function spkSave(o,k){
 try{
  var st=JSON.parse(sessionStorage.getItem(SPK_KEY)||'{}'),now=performance.now(),w=Date.now();
  st[k]=o.pts.map(function(p){return [Math.round(w-(now-p.t)),p.v];});
  sessionStorage.setItem(SPK_KEY,JSON.stringify(st));
 }catch(e){}
}
function spkEnsure(k){
 var o=SPK[k];if(o)return o;
 var id='spkg'+(SPK_ID++),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('class','spk');svg.setAttribute('aria-hidden','true');svg.setAttribute('data-sk',k);
 svg.innerHTML='<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'+
  '<path class="spk-b"/><path class="spk-a" fill="url(#'+id+')" stroke="none"/><path class="spk-l"/>';
 o=SPK[k]={svg:svg,a:svg.querySelector('.spk-a'),l:svg.querySelector('.spk-l'),b:svg.querySelector('.spk-b'),pts:[],w:0,mn:0,mx:1,init:0};
 spkRestore(o,k);
 return o;
}
/* 纵向范围: 取窗口内数据的最小/最大, 至少留出 max(4, 12%) 的跨度并居中 ——
   否则 3→4 台这种一两个单位的抖动会被拉成满格的陡峭折线, 夸大了变化 */
function spkDomain(P){
 var mn=Infinity,mx=-Infinity,i;
 for(i=0;i<P.length;i++){if(P[i].sv<mn)mn=P[i].sv;if(P[i].sv>mx)mx=P[i].sv;}
 var c=(mn+mx)/2,sp=Math.max(mx-mn,4,mx*0.12),lo=c-sp/2,hi=c+sp/2;
 if(lo<0&&mx>mn){hi-=lo;lo=0;}   /* 完全平稳(含恒为 0)时不夹到 0, 线落在中线读作"平稳", 不贴底 */
 return [lo,hi];
}
/* 单调三次贝塞尔(Fritsch-Butland, 支持不等间距): 经过每个采样点, 相邻点之间不会鼓出更高/更低的假峰 */
function spkPath(X,Y){
 var n=X.length,H=[],D=[],M=[],j,d;
 for(j=0;j<n-1;j++){H[j]=X[j+1]-X[j];D[j]=(Y[j+1]-Y[j])/H[j];}
 for(j=0;j<n;j++){
  if(j===0)M[j]=D[0];else if(j===n-1)M[j]=D[n-2];
  else if(D[j-1]*D[j]<=0)M[j]=0;
  else M[j]=3*(H[j-1]+H[j])/((2*H[j]+H[j-1])/D[j-1]+(H[j]+2*H[j-1])/D[j]);
 }
 d='M'+X[0].toFixed(1)+' '+Y[0].toFixed(1);
 for(j=0;j<n-1;j++){
  var k=H[j]/3;
  d+='C'+(X[j]+k).toFixed(1)+' '+(Y[j]+M[j]*k).toFixed(1)+' '+(X[j+1]-k).toFixed(1)+' '+(Y[j+1]-M[j+1]*k).toFixed(1)+' '+X[j+1].toFixed(1)+' '+Y[j+1].toFixed(1);
 }
 return d;
}
function spkDraw(o,now){
 var W=o.svg.clientWidth,SH=o.svg.clientHeight||SPK_H,P=o.pts,n=P.length;   /* 高度取实际值(手机 32px, PC 38px), viewBox 与元素同尺寸才不会被等比缩窄 */
 if(!W||!n)return;
 if(W!==o.w||SH!==o.h){o.w=W;o.h=SH;o.svg.setAttribute('viewBox','0 0 '+W+' '+SH);o.b.setAttribute('d','M0 '+(SH-0.5)+'H'+W);}
 var rt=now-SPK_DLY,pps=W/SPK_WIN,rg=(o.mx-o.mn)||1,h=SH-SPK_PAD*2,X=[],Y=[],j;
 for(j=0;j<n;j++){X.push(W-(rt-P[j].t)*pps);Y.push(SH-SPK_PAD-((P[j].sv-o.mn)/rg)*h);}
 /* 两端水平延伸: 最新点还没走到右缘就保持末值; 最早点没走到左缘就用首值铺满 */
 if(X[n-1]<W+8){X.push(W+40);Y.push(Y[n-1]);}
 if(X[0]>-8){X.unshift(-40);Y.unshift(Y[0]);}
 var d=spkPath(X,Y),m=X.length-1;
 o.l.setAttribute('d',d);
 o.a.setAttribute('d',d+'L'+X[m].toFixed(1)+' '+SH+'L'+X[0].toFixed(1)+' '+SH+'Z');
}
function spkFrame(now){
 SPK_RAF=requestAnimationFrame(spkFrame);
 if(now-SPK_LAST<33)return;
 var dt=Math.min(100,now-SPK_LAST),k,o,r,dm,f;SPK_LAST=now;
 for(k in SPK){
  o=SPK[k];
  if(!o.pts.length||!o.svg.isConnected)continue;
  r=o.svg.getBoundingClientRect();
  if(!r.width||r.bottom<0||r.top>window.innerHeight)continue;
  /* 显示值 = 三点加权平均(1,2,1)/4 的目标, 再用 0.4 秒时间常数缓动过去: 真实连接数的锯齿(涨一阵骤降)棱角被磨圆,
     新点到来时它前一个点的显示值也是渐变而不是跳变; 最新点保持原值, 趋势不滞后 */
  f=1-Math.exp(-dt/400);
  for(var j=0,P=o.pts,tg;j<P.length;j++){
   tg=(j>0&&j<P.length-1)?(P[j-1].v+2*P[j].v+P[j+1].v)/4:P[j].v;
   P[j].sv+=(tg-P[j].sv)*f;
  }
  dm=spkDomain(o.pts);
  if(!o.init){o.mn=dm[0];o.mx=dm[1];o.init=1;}
  else{f=1-Math.exp(-dt/700);o.mn+=(dm[0]-o.mn)*f;o.mx+=(dm[1]-o.mx)*f;}
  spkDraw(o,now);
 }
}
/* 新采样: 只追加一个带到达时间的点(0.4 秒内的重复调用当作同一个点改写), 不动任何动画状态 */
function spkPush(k,v){
 var o=spkEnsure(k),now=performance.now(),P=o.pts,last=P[P.length-1];
 if(last&&now-last.t<400)last.v=v;else P.push({t:now,v:v,sv:v});
 while(P.length>2&&P[1].t<now-SPK_WIN-SPK_DLY)P.shift();
 spkSave(o,k);
 if(!SPK_RAF)SPK_RAF=requestAnimationFrame(spkFrame);
}
/* 格子 HTML 里只放占位 <svg data-sk>; innerHTML 写完后由 sparkMount 换成常驻节点。 */
function sparkline(k,arr){
 if(!arr||!arr.length)return '';
 spkPush(k,arr[arr.length-1]);
 return '<svg class="spk" data-sk="'+k+'" aria-hidden="true"></svg>';
}
function sparkMount(){
 var box=document.getElementById('dv-meta');if(!box)return;
 var ph=box.querySelectorAll('svg.spk[data-sk]'),i,o;
 for(i=0;i<ph.length;i++){
  o=SPK[ph[i].getAttribute('data-sk')];
  if(o&&ph[i]!==o.svg){
   ph[i].parentNode.replaceChild(o.svg,ph[i]);
   if(!o.init){var dm=spkDomain(o.pts);o.mn=dm[0];o.mx=dm[1];o.init=1;}
   if(!o.w)spkDraw(o,performance.now());
  }
 }
}
/* 环比标记: 和上一个采样点比的增减量。
   不着色、只用箭头表方向 —— 连接数变多既不是好事也不是坏事, 染成绿/红
   会凭空给它加一层褒贬。数据不足两点时显示一个淡化的"—"占位, 这样标签行
   的高度从第一轮起就是稳定的, 不会等线出现时整格跳一下。 */
function deltaBadge(arr){
 if(!arr||arr.length<2)return '<span class="dl dl-f">—</span>';
 var d=arr[arr.length-1]-arr[arr.length-2];
 if(d===0)return '<span class="dl dl-f"><i class="fas fa-minus"></i></span>';
 return '<span class="dl"><i class="fas fa-caret-'+(d>0?'up':'down')+'"></i>'+Math.abs(d)+'</span>';
}
/* 双向流量那格。一格里并排放下行/上行两栏, 下面压一条按两者比例分段的细条,
   再加一行"合计 + 下行占比"。

   为什么要这三样:
     比例条   回答"这条线主要在收还是在发" —— 单看两个数字得心算;
     合计     两个量级不同的数(41.2G / 3.8G)相加也要心算;
     占比     把比例条上那个视觉比例给出确数。
   三样都是从同两个字节数算出来的, 没有新增数据源。

   总量为 0 时(刚开机还没流量)条和占比都不画, 否则是一条意义不明的半截色块
   和一个 NaN%。 */
function chipDuplex(tone,icon,k,rx,tx,rxb,txb){
 var tot=rxb+txb,rp=tot>0?Math.round(rxb*100/tot):0;
 return '<div class="dv-cell '+tone+'"><span class="ck"><i class="fas '+icon+'"></i><em>'+k+'</em>'+
   (tot>0?'<span class="dl dl-f dl-tot">'+fmtKB(Math.round(tot/1024))+'</span>':'')+'</span>'+
  '<span class="cv-split">'+
   '<span class="cvp"><span class="cvp-k"><i class="fas fa-arrow-down cv-dl"></i>下行</span><span class="cv2 cv-dl">'+rx+'</span></span>'+
   '<span class="cvp"><span class="cvp-k"><i class="fas fa-arrow-up cv-ul"></i>上行</span><span class="cv2 cv-ul">'+tx+'</span></span>'+
  '</span>'+
  (tot>0?'<span class="dv-bar" title="下行 '+rp+'% · 上行 '+(100-rp)+'%"><i style="width:'+rp+'%;background:var(--gn)"></i><i style="width:'+(100-rp)+'%;background:var(--og)"></i></span>':'')+
  '</div>';
}
/* s71 产品图接口标注(样式说明见 .dv-pts)。坐标是产品图原图像素(w×h 是量坐标时那张图的尺寸),
   按图片实际显示的大小等比换算, 所以 PC/手机、改窗口大小都对得上。上传了自定义整机图就不画(坐标对不上)。
   N5000: 左下=WAN、中间=LAN、右上=USB (s91 实机核对后对调; 物理口和 eth0/eth1 的对应不对就改这张表)。
   网口按 router3d-data 的 role 归位(network.wan.device 那个口是 WAN), 不按 eth 名。
   s72: 每个口给的是开口中心 + 半宽 + 半高(量 n5000.png 黑色开口得到); e = 接口面横向(图上 LAN→USB 方向),
   d = 插入轴(垂直接口面, 指向镜头右下, 即设备左沿到下顶点的方向), 竖向就是屏幕竖直。 */
var PORTMAP={
 /* TR3000(s165, 用户给的 20.png 831x798): 接口面朝左下(同 H5000M), 口从左到右 USB3.0 / LAN / 2.5G WAN; 坐标按图量取, e=口排方向, d=插入轴(朝镜头左下); USB 竖置; 旁边的 Type-C 是供电口不画 */
 TR3000:{w:831,h:798,e:[0.865,0.5],d:[-0.85,0.53],p:{USB:[105,511,12,26],LAN:[185,570,31,24],WAN:[246,601,32,24]}},
 N5000:{w:797,h:618,e:[0.814,-0.58],d:[0.818,0.575],p:{USB:[622,306,16,8.2],WAN:[530,379,16.3,10],LAN:[578,344,16.3,10]}},
 /* Ultra: 右前面两个网口, 左=WAN(eth0 2.5G)、右=LAN(eth1) 按图猜的; 图上那个 USB-C 是供电口, 不画 USB */
 Ultra:{w:797,h:618,e:[0.87,-0.493],d:[0.87,0.493],p:{WAN:[487,502,14.9,11.6],LAN:[534,476,13.8,11.2]}},
 /* MAX: 只有左前面一个 2.5G 口, s55 能把它切成 WAN 或 LAN, 两个角色都落在这个口上; 插入轴朝镜头左下(镜像) */
 MAX:{w:600,h:400,e:[0.919,0.395],d:[-0.86,0.51],p:{WAN:[167.5,249.4,14.7,9.2],LAN:[167.5,249.4,14.7,9.2]}},
 /* H5000M: 长面朝左下, 两个网口并排; 出厂接线 LAN=eth0、WAN=eth1, 按序号猜成左=LAN、右=WAN, 对不上就对调这两项; 开口按 h5000m.png 白框量得; 插入轴朝左下(与 MAX 同向); 前面板的 USB-C 是供电口, 不画 USB */
 H5000M:{w:797,h:618,e:[0.906,0.424],d:[-0.86,0.51],p:{LAN:[206,336,30,17],WAN:[280,371,30,17]}},
 /* E87N 背面(s111e, 用户的 8.png): 接口朝向镜头, e = 口宽方向(随机身略向右下倾, 约 2.7°), d = 插头朝镜头伸出的方向(屏幕上向下偏左, 能看见右侧面);
    flat:1 = 胶囊排在设备图下方一行(ptsFlat, 不压设备); ins:1 = 走 E87N 专用的斜向插头 ptPlugI(头部嵌进接口开口, 保留插入角度); 只在背面视角下画(见 ptsDraw 的 E87N 门控)。
    左=LAN/eth0、中=WAN/eth1 只是按序号猜的, 对不上就对调这两项的坐标; 第三个口是 USB(电源 Type-C 不画) */
 E87N:{w:327,h:208,e:[0.999,0.047],d:[-0.5,0.32],flat:1,ins:1,cd:22,p:{LAN:[71.3,143.7,15,11.3],WAN:[116,146,15,11.3],USB:[162.7,148,11.8,5.5]}}};
var UT={modem:['fas fa-broadcast-tower','蜂窝模组'],net:['fas fa-network-wired','USB 网卡'],nic:['fas fa-ethernet','USB 网卡'],tether:['fas fa-mobile-alt','手机共享'],storage:['fas fa-hdd','存储设备'],hid:['fas fa-keyboard','键盘/鼠标'],hub:['fas fa-sitemap','USB 集线器'],audio:['fas fa-volume-up','USB 声卡'],video:['fas fa-video','摄像头'],camera:['fas fa-video','摄像头'],capture:['fas fa-compress-arrows-alt','采集卡'],display:['fas fa-desktop','USB 显示器'],printer:['fas fa-print','打印机'],bt:['fab fa-bluetooth-b','蓝牙适配器'],other:['fas fa-plug','USB 设备']};
function usbVer(v){v=+v||0;return v>=10000?'USB 3.2':v>=5000?'USB 3.0':v>=480?'USB 2.0':v>0?'USB 1.1':'';}
function usbCap(mb){mb=+mb||0;return mb<=0?'':mb>=1048576?(mb/1048576).toFixed(1).replace(/\.0$/,'')+'TB':mb>=1024?Math.round(mb/1024)+'GB':mb+'MB';}
window.MRT_USB={T:UT,ver:usbVer,cap:usbCap};
var PT={prev:null,d:null,m:''};
/* s72 插头(SVG): 在接口面上按等轴测画小立体。P(a,b,z) = 开口中心 + a·半宽·e + b·半高·竖直 + z·d(原图像素, 再乘缩放 s)。
   看得见的是 侧面(sa: N5000/Ultra 是左侧 a=-1; MAX 接口面朝左下, 是右侧 a=+1)、顶面(b=-1)、尾端面(z=末端) 三个面, 投影互不遮挡, 按这个顺序画即可;
   z=0 的截面正好是开口, 所以插头画上去刚好盖住黑洞, 看起来就是插在里面。
   网口: 水晶头(8 根金针 + 卡扣) z 0-18 → 绿色护套 z 18-38(收窄, 三道防滑纹);
   USB(s85): 金属壳 z 0-12 → 石板灰护套 z 12-34(比开口大, 顶面压印 USB 标识) → 青色收口环 → 深色尾套 z 36-43。
   线从尾端中心顺插入轴出来再往下垂, 描边用渐变淡出(另叠一条细白高光当圆柱感)。u 只用来区分渐变 id(拖影那份)。 */
var PT_FX='<svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0-11v-6M7.8-7.8l4.2-4.2M11 0h6M-7.8-7.8l-4.2-4.2M-11 0h-6M7.8 7.8l4.2 4.2M-7.8 7.8l-4.2 4.2"/></svg>';
/* s84 USB 口旁的小徽标(24px 圆角底 + 青色线条, 不带阴影)。s85 重画, 三枚图标同一套语言(24 格, 1.5 线宽, 外形半透明填 14% + 实心细节):
   摄像头=网络摄像头(圆形机头 + 同心镜头 + 高光点 + 底座); USB 转 HDMI=显示器 + HDMI-A 公头(兼当支架); 采集卡=卡片 + 输入箭头。
   高光点用 var(--bb) 挖出来(徽标里是徽标底色, 胶囊里是图标底色), 所以图标里不许写死底色 */
var PT_BD_CAM='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9.6" r="6.9" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="9.6" r="3.8" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="9.6" r="1.9" fill="currentColor"/><circle cx="12.8" cy="8.8" r=".6" fill="var(--bb)"/><path d="M12 16.5v2.3M7.6 20.6h8.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
var PT_BD_DSP='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="11.6" rx="2.3" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5"/><path d="M6.6 11.6l3.4-3.4M10.4 11.6l2.2-2.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/><path d="M12 15.1v2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.4 17.6h9.2v2.1l-1.5 2.1H8.9l-1.5-2.1z" fill="currentColor"/></svg>';
var PT_BD_CAP='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5"/><path d="M6.8 12h7.6M11.4 8.8l3.4 3.2-3.4 3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="12" r="1" fill="currentColor"/></svg>';
/* 胶囊里的类型图标: 摄像头/显示适配器/采集卡用上面的自绘 SVG, 其它类型仍是 UT 表里的 Font Awesome(悬停浮层只读 UT, 不受影响) */
var PT_BD_NIC='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v9.2h-3v2.6h-2.6v-2.6H9.1v2.6H6.5v-2.6h-3z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 10v2.6M10.7 10v2.6M13.3 10v2.6M16 10v2.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
var PT_BD_THR='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5"/><path d="M10.2 5.4h3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.1" fill="currentColor"/><path d="M9.6 10.6a3.4 3.4 0 0 1 4.8 0M10.9 12.7a1.6 1.6 0 0 1 2.2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
var PT_BD_AUD='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.4h3.3L11.6 5.2v13.6l-4.8-4.2H3.5z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7.6" cy="12" r="1.15" fill="currentColor"/><path d="M15.2 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.8 7.8 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
var PT_IC={camera:PT_BD_CAM,video:PT_BD_CAM,display:PT_BD_DSP,capture:PT_BD_CAP,nic:PT_BD_NIC,tether:PT_BD_THR,audio:PT_BD_AUD};
/* s88 USB 网卡 / 手机共享的角色小标 */
var NIC_ROLE={pending:'待选择',lan:'LAN',wan:'WAN'};
/* role 为空串 = 后端没有这台设备的记录(USB 网口检测开关关闭), 不出任何角色标签 */
function nicRole(u){return u.type==='tether'?(u.role==='tether'?'手机共享':''):u.type==='nic'?(NIC_ROLE[u.role]||''):'';}
window.MRT_USB.role=nicRole;
/* 代表设备优先级(胶囊与 hero 共用): 手机共享/网卡 > 摄像头/显示/声卡 > 第一台 */
window.MRT_USB.pick=function(l){l=l||[];return l.filter(function(u){return u.type==='tether'||u.type==='nic';})[0]||l.filter(function(u){return u.type==='camera'||u.type==='video'||u.type==='display'||u.type==='audio';})[0]||l[0];};
/* s118 JBL 战将2(PartyBox Encore 2, 0ecb:2118): 接了它: USB 胶囊(图标+名称)换成产品图右上角的照片(.pt-jbl), 插头和引导线照旧; 悬停/点按弹声卡浮层 */
window.MRT_USB.isJbl=function(u){return !!u&&u.type==='audio'&&(String(u.vid||'').toLowerCase()==='0ecb'||/jbl|partybox|encore/i.test((u.name||'')+' '+(u.mfr||'')));};
function ptIc(ty,fa){return PT_IC[ty]||'<i class="'+fa+'"></i>';}
function ptPlugI(x,map,s,u){
 var e=map.e,v=map.d,usb=x.k==='USB',id='pi'+x.k+u,sa=e[1]>0?1:-1,hw=x.hw,hh=x.hh,xr=0,xl=1e9,yt=1e9,yb=0,defs='',h='',
  ext=function(p){if(p[0]>xr)xr=p[0];if(p[0]<xl)xl=p[0];if(p[1]>yb)yb=p[1];if(p[1]<yt)yt=p[1];return p;},
  P=function(a,b,z,w,t){return ext([+(x.px+(a*w*e[0]+z*v[0])*s).toFixed(1),+(x.py+(a*w*e[1]+b*t+z*v[1])*s).toFixed(1)]);},
  poly=function(q,f,ex){return '<path d="M'+q.join('L')+'Z" fill="'+f+'"'+(ex||'')+'/>';},
  ln=function(p,q,c,w){return '<path d="M'+p+'L'+q+'" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';},
  ST=' stroke="rgba(15,23,42,.3)" stroke-width=".6" stroke-linejoin="round"',
  gd=function(n,p,q,c){defs+='<linearGradient id="'+id+n+'" gradientUnits="userSpaceOnUse" x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'">'+c.map(function(k,i){return '<stop offset="'+(i/(c.length-1)).toFixed(2)+'" stop-color="'+k+'"/>';}).join('')+'</linearGradient>';return 'url(#'+id+n+')';},
  /* 一段棱台 z0→z1, 截面 (a0,b0)→(a1,b1) 相对口半宽/半高; c = [侧面渐变色组, 顶面渐变色组, 尾端面色]; ex(A) 在顶面上加细节 */
  box=function(n,z0,a0,b0,z1,a1,b1,c,ex){var A=function(a,b,z){var t=(z-z0)/(z1-z0);return P(a,b,z,hw*(a0+(a1-a0)*t),hh*(b0+(b1-b0)*t));},mz=(z0+z1)/2;
   return poly([A(sa,-1,z0),A(sa,-1,z1),A(sa,1,z1),A(sa,1,z0)],gd(n+'s',A(sa,0,z0),A(sa,0,z1),c[0]),ST)+poly([A(-1,-1,z0),A(1,-1,z0),A(1,-1,z1),A(-1,-1,z1)],gd(n+'t',A(-1,-1,mz),A(1,-1,mz),c[1]),ST)+
    poly([A(-1,-1,z1),A(1,-1,z1),A(1,1,z1),A(-1,1,z1)],c[2],ST)+(ex?ex(A):'');},
  lip=function(A,z1){return poly([A(-1,-1,0),A(1,-1,0),A(1,-1,z1),A(-1,-1,z1)],'rgba(0,0,0,.32)');},z1,col=usb?'#1b2230':'#2f5f93';
 /* 开口: 比插头略大的暗色四边形(插头"掉进"里面), 下沿一条亮边是口沿 */
 var k1=usb?1.1:1.14,k2=usb?1.24:1.16;
 h+=poly([P(-1,-1,0,hw*k1,hh*k2),P(1,-1,0,hw*k1,hh*k2),P(1,1,0,hw*k1,hh*k2),P(-1,1,0,hw*k1,hh*k2)],'#03050a',' opacity=".94"')+ln(P(-1,1,0,hw*k1,hh*k2),P(1,1,0,hw*k1,hh*k2),'rgba(255,255,255,.2)',.8);
 if(!usb){
  /* RJ45: 透明塑壳(能看到里面的线序) + 卡扣台阶 + 深蓝护套(同网线颜色) */
  h+=box('a',0,.86,.8,15,.86,.8,[['#566170','#b5bfcc','#dbe2ea'],['#aab5c3','#f4f7fa','#c7d0db','#e6ebf1','#98a4b3'],'#8e9aab'],function(A){
   var cs=['#f59e0b','#3b82f6','#22c55e','#a16207'],o='';
   [-.6,-.2,.2,.6].forEach(function(a,i){o+=ln(A(a,-1,6.5),A(a,-1,15),cs[i],.7).replace('stroke-linecap','opacity=".6" stroke-linecap');});
   return lip(A,4.5)+o+ln(A(-1,-1,9),A(1,-1,9),'rgba(51,65,85,.55)',.6)+ln(A(-.7,-1,2),A(.7,-1,2),'rgba(255,255,255,.55)',.5)+ln(A(-1,-1,0.2),A(1,-1,0.2),'rgba(255,255,255,.35)',.5);});
  h+=box('b',15,.8,.74,36,.5,.54,[['#0f1f36','#2c5586','#0c1a2d'],['#1f4572','#6d9fd2','#26507f','#1a3a62'],'#0c1a2d'],function(A){return [19.5,24,28.5,33].map(function(z){return ln(A(-.9,-1,z),A(.9,-1,z),'rgba(255,255,255,.22)',.6);}).join('')+ln(A(-.55,-1,15.5),A(-.4,-1,35),'rgba(255,255,255,.28)',.6);});
  z1=36;
 }else{
  /* USB-A: 拉丝钢壳(两侧各一个小定位孔) + 黑色注塑尾套, 不再有彩色装饰 */
  h+=box('a',0,.9,.7,9,.9,.7,[['#586273','#cfd6df','#e9edf2'],['#8b97a7','#fcfdfe','#b9c3cf','#eef1f5','#7a8697'],'#8f9aaa'],function(A){return lip(A,4)+[-.5,.5].map(function(a){return poly([A(a-.16,-1,5.2),A(a+.16,-1,5.2),A(a+.16,-1,7.4),A(a-.16,-1,7.4)],'#2b3442');}).join('')+ln(A(-1,-1,.3),A(1,-1,.3),'rgba(255,255,255,.4)',.5)+ln(A(-.8,-1,8.6),A(.8,-1,8.6),'rgba(30,41,59,.45)',.6);});
  h+=box('b',9,1.1,1.2,30,1.0,1.1,[['#0a0d12','#262f3c','#080b0f'],['#171d27','#4a566b','#222b38','#141a22'],'#0a0d12'],function(A){return [14,17.5,21,24.5].map(function(z){return ln(A(-.85,-1,z),A(.85,-1,z),'rgba(255,255,255,.14)',.6);}).join('')+ln(A(-.7,-1,9.4),A(-.7,-1,29),'rgba(255,255,255,.22)',.6);});
  h+=box('c',30,.94,1.04,32.5,.7,.82,[['#07090d','#1d2530','#06080b'],['#10151c','#343e4f','#10151c'],'#07090d']);
  h+=box('d',32.5,.56,.7,40,.36,.5,[['#07090d','#1d2530','#06080b'],['#10151c','#2e3847','#10151c'],'#07090d']);
  z1=40;
 }
 var c0=P(0,0,z1,0,0),mid=P(0,0,z1*.45,0,0),K=function(a,b){return [+(c0[0]+a*s).toFixed(1),+(c0[1]+b*s).toFixed(1)];},
  cd=map.cd==null?54:map.cd,c1=K(v[0]*30,v[1]*30),c2=K(v[0]*58,v[1]*58+cd*.3),c3=K(v[0]*84,v[1]*84+cd),pd='M'+c0+'C'+c1+' '+c2+' '+c3,cw=(usb?2.4:3.2)*s,
  bz=function(t){var q=1-t;return [q*q*q*c0[0]+3*q*q*t*c1[0]+3*q*t*t*c2[0]+t*t*t*c3[0],q*q*q*c0[1]+3*q*q*t*c1[1]+3*q*t*t*c2[1]+t*t*t*c3[1]];},
  gr=function(n,c,o){return '<linearGradient id="'+id+n+'" gradientUnits="userSpaceOnUse" x1="'+c0[0]+'" y1="'+c0[1]+'" x2="'+c3[0]+'" y2="'+c3[1]+'"><stop offset="0" stop-color="'+c+'" stop-opacity="'+o[0]+'"/><stop offset=".4" stop-color="'+c+'" stop-opacity="'+o[1]+'"/><stop offset="1" stop-color="'+c+'" stop-opacity="0"/></linearGradient>';};
 ext(bz(.7));
 h='<defs>'+defs+gr('k',col,[1,.85])+gr('o','#020617',[.55,.4])+gr('w','#fff',[.55,.3])+'</defs>'+h+
  '<path d="'+pd+'" fill="none" stroke="url(#'+id+'o)" stroke-width="'+(cw+1.2).toFixed(1)+'" stroke-linecap="round"/>'+
  '<path d="'+pd+'" fill="none" stroke="url(#'+id+'k)" stroke-width="'+cw.toFixed(1)+'" stroke-linecap="round"/>'+
  '<path d="'+pd+'" fill="none" stroke="url(#'+id+'w)" stroke-width="'+(cw*.28).toFixed(1)+'" stroke-linecap="round" transform="translate('+(-cw*.18).toFixed(1)+' '+(-cw*.2).toFixed(1)+')"/>';
 return {h:h,xr:xr+cw/2,xl:xl-cw/2,yt:yt-cw/2,yb:yb+cw/2,lead:[+x.px.toFixed(1),+(x.py-hh*s*.95).toFixed(1)],end:c3,bot:c3,mid:mid,r:Math.max(11,Math.max(hw,hh)*s*1.6)};
}
function ptPlug(x,map,s,u){
 if(map.ins)return ptPlugI(x,map,s,u);
 var e=map.e,v=map.d,usb=x.k==='USB',id='ptg'+x.k+u,h='',xr=0,xl=1e9,yt=1e9,yb=0,z1,col,lead,sa=e[1]>0?1:-1,
  ext=function(p){if(p[0]>xr)xr=p[0];if(p[0]<xl)xl=p[0];if(p[1]>yb)yb=p[1];if(p[1]<yt)yt=p[1];return p;},
  P=function(a,b,z,hw,hh){return ext([+(x.px+(a*hw*e[0]+z*v[0])*s).toFixed(1),+(x.py+(a*hw*e[1]+b*hh+z*v[1])*s).toFixed(1)]);},
  poly=function(q,f,ex){return '<path d="M'+q.join('L')+'Z" fill="'+f+'"'+(ex||'')+'/>';},
  ST=' stroke="rgba(15,23,42,.22)" stroke-width=".6" stroke-linejoin="round"',
  ln=function(p,q,c,w){return '<path d="M'+p+'L'+q+'" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';},
  /* z0→z1 一段棱台, 截面从 (a0·半宽, b0·半高) 线性收到 (a1, b1); c = [左侧面, 顶面, 尾端面] 的颜色; ex 在顶面上加细节; st 换描边(深色件用浅描边) */
  box=function(z0,a0,b0,z1,a1,b1,c,ex,st){var A=function(a,b,z){var t=(z-z0)/(z1-z0);return P(a,b,z,x.hw*(a0+(a1-a0)*t),x.hh*(b0+(b1-b0)*t));};
   return poly([A(sa,-1,z0),A(sa,-1,z1),A(sa,1,z1),A(sa,1,z0)],c[0],st||ST)+poly([A(-1,-1,z0),A(1,-1,z0),A(1,-1,z1),A(-1,-1,z1)],c[1],st||ST)+
    poly([A(-1,-1,z1),A(1,-1,z1),A(1,1,z1),A(-1,1,z1)],c[2],st||ST)+(ex?ex(A):'');};
 if(!usb){col='#10b981';
  h+=box(0,.97,.97,18,.97,.97,['rgba(200,214,232,.72)','rgba(248,251,255,.86)','rgba(222,232,244,.8)'],function(A){var r='';
   for(var i=0;i<8;i++){var a=-.78+i*1.56/7;r+=ln(A(a,-1,1.4),A(a,-1,6.4),'#d4a43a',.9);}
   return r+poly([A(-.3,-1,8.5),A(.3,-1,8.5),A(.3,-1,16.5),A(-.3,-1,16.5)],'rgba(100,116,139,.28)');});
  h+=box(18,.86,.86,38,.44,.56,['#059669','#34d399','#047857'],function(A){return [24,29,34].map(function(z){return ln(A(-1,-1,z),A(1,-1,z),'rgba(255,255,255,.42)',.7);}).join('');});
  z1=38;lead=P(-sa,-1,4,x.hw*.97,x.hh*.97);}
 else{col='#06b6d4';
  /* s85 USB-A 公头: 冷灰金属壳 z 0-12(顶面两个小方孔 = 卡位孔) → 石板灰塑料护套 z 12-34(顶面压印青色 USB 三叉戟标识) →
     青色收口环 z 34-36 → 深色尾套 z 36-43 → 青色线。护套用深色件 + 浅描边, 银色机身上和深色页面底上都分得开; 渐变都是平涂, 不带影 */
  var hw=x.hw,hh=x.hh,SQ=' stroke="rgba(226,232,240,.26)" stroke-width=".6" stroke-linejoin="round"',
   gd=function(n,p,q,ca,cb,cc){return '<linearGradient id="'+id+n+'" gradientUnits="userSpaceOnUse" x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'"><stop offset="0" stop-color="'+ca+'"/><stop offset=".5" stop-color="'+cb+'"/><stop offset="1" stop-color="'+cc+'"/></linearGradient>';};
  h+='<defs>'+gd('mt',P(-1,-1,0,hw,hh*.95),P(1,-1,0,hw,hh*.95),'#f6f8fb','#d3dbe6','#eef2f7')+gd('ms',P(sa,0,0,hw,hh*.95),P(sa,0,12,hw,hh*.95),'#c4cdd9','#a9b5c5','#8f9db0')+
   gd('st',P(-1,-1,12,hw*1.14,hh*1.3),P(1,-1,12,hw*1.14,hh*1.3),'#71809a','#576680','#4a5870')+gd('ss',P(sa,0,12,hw*1.14,hh*1.3),P(sa,0,34,hw*1.04,hh*1.18),'#4a586e','#3d495c','#344154')+'</defs>';
  h+=box(0,1,.95,12,1,.95,['url(#'+id+'ms)','url(#'+id+'mt)','#c4ccd8'],function(A){
   return [-.5,.5].map(function(a){return poly([A(a-.2,-1,2.4),A(a+.2,-1,2.4),A(a+.2,-1,5.4),A(a-.2,-1,5.4)],'#586476');}).join('');});
  h+=box(12,1.14,1.3,34,1.04,1.18,['url(#'+id+'ss)','url(#'+id+'st)','#273142'],function(A){
   /* USB 三叉戟(压印在顶面): p = 沿插入轴的 z, q = 横向像素量(÷半宽还原成 a, 这样在等轴测面上形状不走样);
      尾端实心圆 → 主干 → 箭头指向接口; 两条折枝, 一条尾圆、一条尾方块 */
   var T=function(p,q){return A(q*.94/(hw*1.1),-1,12+(p-8)*.92);},tc='#67e8f9',sw=Math.max(.8,1.5*s).toFixed(2),
    pl=function(a){return '<path d="M'+a.map(function(t){return T(t[0],t[1]);}).join('L')+'" fill="none" stroke="'+tc+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';},
    fl=function(a){return poly(a.map(function(t){return T(t[0],t[1]);}),tc);},
    ci=function(p,q,r){var a=[];for(var i=0;i<10;i++)a.push([p+r*Math.cos(i*Math.PI/5),q+r*Math.sin(i*Math.PI/5)]);return fl(a);};
   return poly([A(-1,-1,12),A(1,-1,12),A(1,-1,13.4),A(-1,-1,13.4)],'rgba(255,255,255,.12)')+
    pl([[27,0],[15,0]])+fl([[11.6,0],[15.6,-2.5],[15.6,2.5]])+ci(27.4,0,2.3)+
    pl([[22.6,0],[20,-6.5],[16.6,-6.5]])+ci(14.8,-6.5,1.9)+
    pl([[19.6,0],[17.4,6.5],[14.6,6.5]])+fl([[14.2,4.9],[11.2,4.9],[11.2,8.1],[14.2,8.1]]);},SQ);
  h+=box(34,.96,1.08,36,.76,.9,['#0891b2','#22d3ee','#0e7490']);
  h+=box(36,.6,.78,43,.38,.52,['#3d495c','#566580','#273142'],0,SQ);
  z1=43;lead=P(-sa,-1,14,hw*1.1,hh*1.25);}
 var c0=P(0,0,z1,0,0),mid=P(0,0,z1*.45,0,0),bot=P(0,1,2,x.hw,x.hh*(usb?1.43:.97)),K=function(a,b){return ext([+(c0[0]+a*s).toFixed(1),+(c0[1]+b*s).toFixed(1)]);},
  c1=K(v[0]*18,v[1]*18),c2=K(v[0]*32,v[1]*32+12),c3=K(v[0]*36,v[1]*36+54),pd='M'+c0+'C'+c1+' '+c2+' '+c3,cw=(usb?6:8)*s,
  gr=function(n,c,o0,o1,m){return '<linearGradient id="'+n+'" gradientUnits="userSpaceOnUse" x1="'+c0[0]+'" y1="'+c0[1]+'" x2="'+c3[0]+'" y2="'+c3[1]+'"><stop offset="0" stop-color="'+c+'" stop-opacity="'+o0+'"/><stop offset="'+m+'" stop-color="'+c+'" stop-opacity="'+o1+'"/><stop offset="1" stop-color="'+c+'" stop-opacity="0"/></linearGradient>';};
 h='<defs>'+gr(id,col,1,.7,.5)+gr(id+'h','#fff',.55,.12,.45)+'</defs>'+h+
  '<path d="'+pd+'" fill="none" stroke="url(#'+id+')" stroke-width="'+cw.toFixed(1)+'" stroke-linecap="round"/>'+
  '<path d="'+pd+'" fill="none" stroke="url(#'+id+'h)" stroke-width="'+(cw*.28).toFixed(1)+'" stroke-linecap="round" transform="translate('+(-cw*.18).toFixed(1)+' '+(-cw*.2).toFixed(1)+')"/>';
 /* xl/xr/yt/yb = 插头加垂线的外框(给胶囊让位); mid/r = 悬停热区圆心和半径; bot = 开口下沿(胶囊排到设备下方时引线从这里出) */
 return {h:h,xr:xr+cw/2,xl:xl-cw/2,yt:yt-cw/2,yb:yb+cw/2,lead:lead,bot:bot,mid:mid,r:Math.max(11,Math.max(x.hw,x.hh)*s*1.6)};
}
/* s74 产品图轮廓: 读一次图片 alpha, 记下每一列不透明部分的上沿/下沿(原图像素)。胶囊落位时拿它判断会不会压到设备本体。
   图片和页面同源, 读得到像素; 万一读不到(canvas 被污染之类)返回 null, 落位退回只看展台边界的老办法 */
function ptSil(img){
 var k=img.currentSrc||img.src;if(PT.sk===k)return PT.sil;PT.sk=k;PT.sil=null;
 try{var w=img.naturalWidth,hh=img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=hh;var g=c.getContext('2d');g.drawImage(img,0,0);
  var a=g.getImageData(0,0,w,hh).data,t=new Int16Array(w),b=new Int16Array(w);t.fill(-1);b.fill(-1);
  for(var X=0;X<w;X++)for(var Y=0;Y<hh;Y++)if(a[(Y*w+X)*4+3]>40){if(t[X]<0)t[X]=Y;b[X]=Y;}
  PT.sil={w:w,t:t,b:b};}catch(e){}
 return PT.sil;
}
/* s111 E87N 屏幕预览贴合: 把 428x142 的局部盒用 matrix3d(单应变换)映射到整机图上屏幕玻璃的四边形。
   四角是 e87n.png(980x625, 用户自己抠的图)里量得的屏幕内层显示区(左上、右上、右下、左下)。
   图换了尺寸/窗口缩放/侧栏收放都会改 img 的 offsetWidth/Left/Top, 每次轮询和 resize/load 都按这三个量重算(没变就不碰 DOM)。
   上传了自定义整机图(overrideSrc)就隐藏这层(坐标对不上)。 */
var SCRQ=[[145,274],[566,308],[567,475],[144,436]];
function scrFit(){
 if(!IS_E87N)return;
 var w=$('dv-scr'),img=$('dv-img');if(!w||!img)return;
 try{bkSync();}catch(e){}
 if(!img._scl){img._scl=1;img.addEventListener('load',scrFit);window.addEventListener('resize',scrFit);if(window.ResizeObserver)try{new ResizeObserver(scrFit).observe(img);}catch(e){}}
 if(overrideSrc||!img.naturalWidth||!img.offsetWidth||img.style.display==='none'){if(w._k!=='x'){w._k='x';w.style.visibility='hidden';}return;}
 var s=img.offsetWidth/980,ox=0,oy=0,k=s.toFixed(4)+'|'+ox+'|'+oy;
 if(w._k===k)return;w._k=k;
 var q=SCRQ.map(function(p){return [ox+p[0]*s,oy+p[1]*s];}),x0=q[0][0],y0=q[0][1],x1=q[1][0],y1=q[1][1],x2=q[2][0],y2=q[2][1],x3=q[3][0],y3=q[3][1],
  dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,den=dx1*dy2-dy1*dx2,g=0,h=0;
 if(Math.abs(dx3)>1e-9||Math.abs(dy3)>1e-9){g=(dx3*dy2-dy3*dx2)/den;h=(dx1*dy3-dy1*dx3)/den;}
 var a=x1-x0+g*x1,b=x3-x0+h*x3,c=x0,dd=y1-y0+g*y1,e=y3-y0+h*y3,f=y0,W=428,H=142;
 w.style.transform='matrix3d('+[a/W,dd/W,0,g/W,b/H,e/H,0,h/H,0,0,1,0,c,f,0,1].map(function(n){return +n.toFixed(6);}).join(',')+')';
 w.style.visibility='inherit';
}
/* s111d E87N 背面视图: #dv-img-b 贴到和正面 #dv-img 同一个矩形; 视角存 localStorage(mwrt_dv_view), 默认正面。
   背面四个口(量自 e87n_b.png, 980x625 画布): 左起 LAN1/LAN2/USB/电源。 LAN=左一口、WAN=左二口只是按序号猜的, 对不上就对调 BKJ 里 LAN 和 WAN 的坐标。 */
var BKJ={LAN:[215,374,100,68],WAN:[341,394,100,68],USB:[475,420,75,38]},BK={v:'f',prev:null,sig:''};
try{if(localStorage.getItem('mwrt_dv_view')==='b')BK.v='b';}catch(e){}
function bkSync(){
 var sh=document.querySelector('.dv-shot'),a=$('dv-img'),b=$('dv-img-b'),f=$('dv-flip');if(!sh||!a||!b)return;
 var off=!!overrideSrc||!a.offsetWidth||a.style.display==='none';
 if(f)f.style.display=overrideSrc?'none':'';
 var v=off?'f':BK.v;if(sh.getAttribute('data-v')!==v)sh.setAttribute('data-v',v);
 if(f&&f.getAttribute('data-v')!==v){f.setAttribute('data-v',v);[].forEach.call(f.querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',x.getAttribute('data-v')===v?'true':'false');});}
 var sc=$('dv-scr');if(sc){sc.tabIndex=v==='b'?-1:0;}
 if(off)return;
 [b,$('dv-scrw')].forEach(function(e){if(!e)return;e.style.left=a.offsetLeft+'px';e.style.top=a.offsetTop+'px';e.style.width=a.offsetWidth+'px';e.style.height=a.offsetHeight+'px';});
}
function bkView(v,ev){
 var sh=document.querySelector('.dv-shot'),f=$('dv-flip');if(!sh)return;
 if(f){f.classList.remove('bump');void f.offsetWidth;f.classList.add('bump');
  if(ev&&ev.currentTarget&&ev.currentTarget.getBoundingClientRect){var bt=ev.currentTarget,r=bt.getBoundingClientRect(),sp=document.createElement('span');sp.className='rp';
   sp.style.left=(ev.clientX-r.left)+'px';sp.style.top=(ev.clientY-r.top)+'px';bt.appendChild(sp);setTimeout(function(){if(sp.parentNode)sp.parentNode.removeChild(sp);},700);}}
 if(v===BK.v)return;
 BK.v=v;try{localStorage.setItem('mwrt_dv_view',v);}catch(e){}
 sh.classList.remove('fl-f','fl-b');void sh.offsetWidth;sh.classList.add('fl-'+v);
 clearTimeout(BK.t);BK.t=setTimeout(function(){sh.classList.remove('fl-f','fl-b');},1100);
 BK.sig='';bkSync();PT.prev=null;if(PT.d)ptsDraw(PT.d,PT.m);
 if(window.MRT_POP&&MRT_POP.close)try{MRT_POP.close();}catch(e){}
}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#dv-flip button');if(b)bkView(b.getAttribute('data-v'),{currentTarget:b,clientX:e.clientX,clientY:e.clientY});});
function ptsFlat(box,on,s,img,W,X0){
 var oy=img.offsetTop,ib=$('dv-img-b'),sil=(ib&&ib.naturalWidth&&ib.offsetWidth)?ptSil(ib):null,low=img.offsetHeight,sh=box.parentNode,svg='',its=[],i,pass,tot,ok=false;
 if(sil){var m=0,ss=ib.offsetWidth/sil.w;for(i=0;i<sil.w;i++)if(sil.b[i]>m)m=sil.b[i];low=Math.round((m+1)*ss);}
 var top=oy+low;on.forEach(function(x){if(x.pl.yb>top)top=x.pl.yb;});top=Math.round(top)+10;
 on.forEach(function(x){var el=box.querySelector('.pt-c[data-k="'+x.k+'"]');if(el)its.push({x:x,el:el});});
 its.sort(function(a,b){return a.x.ax-b.x.ax;});
 var ox=img.offsetLeft,iw=img.offsetWidth,cx0=ox+iw*.45;
 its.forEach(function(t){t.w=t.el.offsetWidth;});
 var GL=its.filter(function(t){return t.x.ax<cx0;}),GR=its.filter(function(t){return t.x.ax>=cx0;}),
  mw=function(a){return a.reduce(function(m,t){return Math.max(m,t.w);},0);};
 if(mw(GL)<=ox-X0-14&&mw(GR)<=W-4-(ox+iw)-14){
  /* 引线一律从接口/插头根部出发, 不接线尾(线尾是渐隐的)。放得下: 胶囊排在设备图左右两侧(不压设备, 不贴着网线), 引线 = 接口顶沿 → 竖直上去 → 横向接到胶囊内侧边;
     越靠外的口胶囊越靠下, 里面的口抬高一档, 这样横线不会穿过别的口的竖线 */
  var hh2=its.length?its[0].el.offsetHeight/2:12;
  its.forEach(function(t){var x=t.x,lf=x.ax<cx0,g=lf?GL:GR,kk=lf?g.indexOf(t):g.length-1-g.indexOf(t),jt=Math.round(x.py-x.hh*s),
    cy=Math.round(jt-16-kk*(hh2*2+8)),cl=lf?Math.round(ox-10-t.w):Math.round(ox+iw+10),ex=lf?cl+t.w-1:cl+1,
    col=x.k==='USB'?'#22d3ee':'#34d399',f=x.f?' '+x.f:'';
   t.el.style.left=cl+'px';t.el.style.top=cy+'px';
   svg+='<path class="pt-ln'+f+'" pathLength="1" style="--pc:'+col+'" d="M'+x.ax+' '+jt+' L'+x.ax+' '+cy+' L'+ex+' '+cy+'"/>'+
    '<circle class="pt-ld'+f+'" cx="'+x.ax+'" cy="'+jt+'" r="1.8" fill="'+col+'"/>';});
  box.querySelector('.pt-lns').innerHTML=svg;sh.style.setProperty('--ex','0px');return;
 }
 for(pass=0;pass<3&&!ok;pass++){
  if(pass===1)its.forEach(function(t){var sm=t.el.querySelector('small');if(sm)sm.style.display='none';});
  if(pass===2)its.forEach(function(t){var b=t.el.querySelector('b');if(b)b.style.maxWidth='64px';});
  tot=0;its.forEach(function(t){t.w=t.el.offsetWidth;tot+=t.w;});ok=tot+(its.length-1)*6<=W-X0-4;
 }
 var hh=its.length?its[0].el.offsetHeight/2:12,cy=top+hh,pv=X0,lim=W-4;
 its.forEach(function(t){t.l=Math.max(Math.round(t.x.ax-t.w/2),pv);pv=t.l+t.w+6;});
 for(i=its.length-1;i>=0;i--){if(its[i].l+its[i].w>lim)its[i].l=lim-its[i].w;lim=its[i].l-6;}
 pv=X0;its.forEach(function(t){if(t.l<pv)t.l=pv;pv=t.l+t.w+6;});
 its.forEach(function(t){var x=t.x,L=x.pl.mid,col=x.k==='USB'?'#22d3ee':'#34d399',f=x.f?' '+x.f:'',
   ex=Math.round(Math.max(t.l+8,Math.min(t.l+t.w-8,L[0]))),lx=Math.round(L[0]),ly=Math.round(L[1]);
  t.el.style.left=t.l+'px';t.el.style.top=cy+'px';
  svg+='<path class="pt-ln'+f+'" pathLength="1" style="--pc:'+col+'" d="M'+lx+' '+ly+' L'+ex+' '+Math.round(cy-hh+1)+'"/>'+
   '<circle class="pt-ld'+f+'" cx="'+lx+'" cy="'+ly+'" r="1.8" fill="'+col+'"/>';});
 box.querySelector('.pt-lns').innerHTML=svg;
 sh.style.setProperty('--ex',Math.max(0,Math.ceil(cy+hh+4-(oy+img.offsetHeight+10)))+'px');
}
/* patch28 E87N(flat 机型)也显示 JBL 战将2 照片: 摆在产品图右上角; 正面只有照片, 背面照片 + 插头引导线(线接到照片下沿) */
function ptsJblHtml(f){return '<span class="pt-jbl'+(f?' '+f:'')+'" data-pop="audio" role="button" tabindex="0" aria-label="JBL 战将2 已接入, 打开声卡设置"><span class="jb-gl" aria-hidden="true"></span><img class="jb-im" src="/luci-static/router3d/jbl-encore2.png" width="320" height="260" alt="" draggable="false"><small>JBL 战将2</small></span>';}
function ptsJblPut(box,img,X0,W){var je=box.querySelector('.pt-jbl');if(!je)return null;var stg=box.closest('.dv-stage'),rb=box.getBoundingClientRect(),jw=je.offsetWidth,jh=je.offsetHeight,ia=img.getBoundingClientRect(),st0=stg?stg.getBoundingClientRect():null,ymin=st0?Math.round(st0.top-rb.top)+42:2,x0=Math.round(ia.right-rb.left-jw*0.42)+38,y0=Math.round(ia.top-rb.top-jh*0.5)-24;
 x0=Math.max(X0,Math.min(x0,W-jw-4));y0=Math.max(ymin,Math.min(y0,box.offsetHeight-jh-4));je.style.left=x0+'px';je.style.top=y0+'px';return [x0,y0,jw,jh];}
function ptsDraw(d,model){
 /* s132: 本设备按 5G 模组 UDX710 显示（模组工艺图, 无实体网口可指），
    WAN/LAN 热点整段跳过；PORTMAP.TR3000 保留给将来换实物图用。 */
 if(DEV_MODEL==='TR3000'&&!CUSTOM_IMG)return;
 PT.d=d;PT.m=model;
 var box=$('dv-pts'),img=$('dv-img');if(!box||!img)return;
 if(!img._ptl){img._ptl=1;img.addEventListener('load',function(){box._s=null;if(PT.d)ptsDraw(PT.d,PT.m);});window.addEventListener('resize',function(){if(PT.d)ptsDraw(PT.d,PT.m);});}
 var map=PORTMAP[model];
 if(model==='E87N'){
  var jbu=(Array.isArray(d.usb)?d.usb:[]).filter(function(u){return window.MRT_USB&&window.MRT_USB.isJbl(u);})[0];
  if(jbu&&BK.v!=='b'&&!overrideSrc&&img.naturalWidth&&img.offsetWidth){
   box.classList.add('jf');
   if(box._cl){clearTimeout(box._cl);box._cl=0;}
   var Wf=box.offsetWidth,Xf=4,sgf=box.closest('.dv-stage');if(sgf){var rbf=box.getBoundingClientRect(),rsf=sgf.getBoundingClientRect();if(rsf.width){Wf=Math.min(Wf,Math.round(rsf.right-rbf.left)-6);Xf=Math.max(Xf,Math.round(rsf.left-rbf.left)+6);}}
   var sgn='jf|'+Wf+'|'+img.offsetLeft+'|'+img.offsetTop+'|'+img.offsetWidth+'|'+img.offsetHeight;
   PT.ox=img.offsetLeft;box.style.translate='';/*patch30*/
   if(box._s!==sgn){var frf=!box._s;box._s=sgn;PT.prev=null;box.innerHTML=ptsJblHtml(frf?'f0':'');ptsJblPut(box,img,Xf,Wf);}
   return;}
  box.classList.remove('jf');
  if(BK.v!=='b'||overrideSrc){if(box._s!==''&&!box._cl)box._cl=setTimeout(function(){box.innerHTML='';box._s='';box._cl=0;PT.prev=null;try{box.parentNode.style.removeProperty('--ex');}catch(e){}},450);return;}
  if(box._cl){clearTimeout(box._cl);box._cl=0;}
 }
 if(!map||overrideSrc||!img.naturalWidth||img.style.display==='none'||!img.offsetWidth){if(box._s!==''){box.innerHTML='';box._s='';}return;}
 var cur={};
 (d.ports||[]).forEach(function(p){var r=p.role==='WAN'?'WAN':'LAN';if(!cur[r])cur[r]={car:+p.carrier?1:0,cnt:+p.cnt||0,spd:+p.speed||0};});
 var usb=Array.isArray(d.usb)?d.usb:[],u0=window.MRT_USB.pick(usb);
 /* s84 徽标: 接了摄像头(含旧 video)/ USB 转 HDMI 显示适配器时, USB 口旁叠一枚小徽标; 采集卡不当显示器, 不画徽标 */
 var bd=usb.some(function(u){return u.type==='camera'||u.type==='video';})?'':usb.some(function(u){return u.type==='display';})?'dsp':'';
 cur.USB=u0?{car:1,key:(u0.bus||u0.dev||'')+'|'+u0.vid+':'+u0.pid,ks:usb.map(function(x){return (x.bus||x.dev||'')+'|'+x.vid+':'+x.pid;}),u:u0,n:usb.length,bd:bd}:{car:0};
 /* 和上一轮比: in = 刚插上(网口插线次数变大 / 换了一个 USB 设备), out = 刚拔掉(链路 1→0 / USB 设备没了)。
    第一轮只记不放动画。拔掉的口这一轮还要用上一轮的数据画飞走的插头和淡出的胶囊(x.g) */
 var prev=PT.prev,fresh={};PT.prev=cur;
 Object.keys(cur).forEach(function(k){var c=cur[k],o=prev&&prev[k];if(!o)return;
  if(c.car){if(k==='USB'?(!o.car||c.ks.some(function(x){return (o.ks||[]).indexOf(x)<0;})):(!o.car||c.cnt>o.cnt))fresh[k]='in';}
  else if(o.car)fresh[k]='out';});
 var s=img.offsetWidth/map.w,ox=img.offsetLeft,oy=img.offsetTop,W=box.offsetWidth;
 /* 右边界取展台(.dv-stage, overflow 裁切)的可见右沿, 覆盖层本身可能比它宽 */
 var X0=4,stg=box.closest('.dv-stage');if(stg){var rb=box.getBoundingClientRect(),rs=stg.getBoundingClientRect();if(rs.width){W=Math.min(W,Math.round(rs.right-rb.left)-6);X0=Math.max(X0,Math.round(rs.left-rb.left)+6);}}
 var it=[];
 ['USB','WAN','LAN'].forEach(function(k){var p=map.p[k],c=cur[k];if(!p||!c)return;
  var px=ox+p[0]*s,py=oy+p[1]*s;
  /* MAX 的 WAN/LAN 是同一个物理口: 两个角色都有数据时只画有链路(或正在变化)的那个 */
  var dup=it.filter(function(y){return y.px===px&&y.py===py;})[0];
  if(dup){if(dup.c.car||dup.f||!(c.car||fresh[k]))return;it.splice(it.indexOf(dup),1);}
  it.push({k:k,c:c,f:fresh[k]||'',g:fresh[k]==='out'?prev[k]:null,px:px,py:py,ax:Math.round(px),ay:Math.round(py),hw:p[2],hh:p[3]});});
 var sig=JSON.stringify(it.map(function(x){var c=x.c;return [x.k,x.ax,x.ay,c.car,c.spd,c.key,c.n,c.bd,c.u&&[c.u.name,c.u.mfr,c.u.type,c.u.mb,c.u.sub,c.u.role,c.u.dev]];}))+W;
 if(box._s===sig&&!Object.keys(fresh).length)return;
 /* 只有页面上第一次画出来时整体淡入; 之后某个口变了重画, 其他口的胶囊原样不动(不重放淡入, 否则会闪) */
 var first=!box._s;box._s=sig;PT.ox=img.offsetLeft;box.style.translate='';
 /* 胶囊排成一列: 放在最右边那个口再往右, 而且要让开所有插头和垂下来的线; 竖向按接口高度, 挨太近就往下错开一档。
    插入轴朝左(MAX)时插头和线都往左下走, 胶囊改排在它们左边(colX 是右对齐线), 左边放不下再回到右边 */
 var lf=map.d[0]<0,on=it.filter(function(x){return x.c.car||x.f==='out';}),colX=lf?1e9:0,lastY=-99,h='',
  mv='--mx:'+(map.d[0]*52*s).toFixed(1)+'px;--my:'+(map.d[1]*52*s).toFixed(1)+'px';
 on.forEach(function(x){x.pl=ptPlug(x,map,s,'');if(x.k==='USB'&&x.c.car&&x.c.bd){x.bx=Math.round(Math.max(X0,Math.min(x.pl.mid[0]-12,W-28)));x.by=Math.round(Math.max(2,x.pl.yt-26));}colX=lf?Math.min(colX,x.ax-26,Math.round(x.pl.xl)-10):Math.max(colX,x.ax+26,Math.round(x.pl.xr)+10);});
 on.forEach(function(x){var cu=(x.c.car?x.c:x.g);x.jbl=x.k==='USB'&&!!(cu&&cu.u)&&window.MRT_USB.isJbl(cu.u);});
 on.sort(function(a,b){return a.ay-b.ay;}).forEach(function(x){x.cy=Math.max(x.ay,lastY+28);if(!x.jbl)lastY=x.cy;});
 /* 插头; 刚插上的多垫一层拖影(同一个插头, 更糊、慢半拍), 插入/拔出都在接口处放一圈波纹 */
 on.forEach(function(x){var col=x.k==='USB'?'#22d3ee':'#34d399';
  if(x.f==='in')h+='<svg class="pt-pl gh" aria-hidden="true" style="'+mv+'">'+ptPlug(x,map,s,'g').h+'</svg>';
  h+='<svg class="pt-pl'+(x.f?' '+x.f:'')+'" aria-hidden="true" style="'+mv+'">'+x.pl.h+'</svg>';
  if(x.bx!=null)h+='<span class="pt-bd '+x.c.bd+(x.f==='in'?' in':first?' f0':'')+'" aria-hidden="true" style="left:'+x.bx+'px;top:'+x.by+'px">'+(x.c.bd==='cam'?PT_BD_CAM:PT_BD_DSP)+'</span>';
  if(x.f)h+='<span class="pt-fx '+x.f+'" style="left:'+x.ax+'px;top:'+x.ay+'px;--pc:'+col+'">'+(x.f==='in'?PT_FX:'')+'</span>';});
 on.forEach(function(x){if(x.jbl){var ju=(x.c.car?x.c:x.g).u;h+='<span class="pt-jbl'+(x.f?' '+x.f:first?' f0':'')+'" data-pop="audio"'+(x.f==='out'?' aria-hidden="true"':' role="button" tabindex="0" aria-label="JBL 战将2 已接入, 打开声卡设置"')+'><span class="jb-gl" aria-hidden="true"></span><img class="jb-im" src="/luci-static/router3d/jbl-encore2.png" width="320" height="260" alt="" draggable="false"><small>JBL 战将2</small></span>';return;}var c=x.c.car?x.c:x.g,cls='pt-c'+(x.k==='USB'?' u':'')+(x.f?' '+x.f:first?' f0':''),body,attr='';
  if(x.k==='USB'){var u=c.u,t=UT[u.type]||UT.other,sub=usbCap(u.mb)||(u.type==='hub'&&+u.sub?'下挂 '+(+u.sub)+' 台':t[1]);
   body='<span class="ic">'+ptIc(u.type,t[0])+'</span><b>'+esc(u.name||u.mfr||t[1])+'</b><small>'+esc(u.type==='tether'&&nicRole(u)?'':sub)+'</small>'+(nicRole(u)?'<em class="rl r-'+(u.type==='tether'?'tether':esc(u.role))+'">'+nicRole(u)+'</em>':'')+(c.n>1?'<em>+'+(c.n-1)+'</em>':'');
   attr=x.f==='out'?' aria-hidden="true"':' data-pop="usb" aria-label="USB 口已接入'+esc(t[1]+' '+(u.name||'')+(nicRole(u)?' '+nicRole(u):''))+'"';}
  else{body='<span class="ic"><i class="fas fa-ethernet"></i></span><b>'+x.k+'</b><small>'+speedTxt(c.spd)+'</small>';
   attr=x.f==='out'?' aria-hidden="true"':' data-pop="eth-'+x.k+'" aria-label="'+x.k+' 口已接入网线 '+speedTxt(c.spd)+'"';}
  h+='<span class="'+cls+'" data-k="'+x.k+'"'+attr+' style="left:'+(lf?0:colX)+'px;top:'+x.cy+'px">'+body+'</span>';});
 /* 插头上盖一块透明圆当悬停热区(插头 SVG 本身不接鼠标), 和胶囊弹同一个浮层 */
 on.forEach(function(x){if(!x.c.car)return;var m=x.pl.mid,r=x.pl.r;
  h+='<span class="pt-hs'+(x.k==='USB'?' u':'')+'" data-pop="'+(x.k==='USB'?(window.MRT_USB.isJbl(x.c.u)?'audio':'usb'):'eth-'+x.k)+'" aria-hidden="true" style="left:'+Math.round(m[0]-r)+'px;top:'+Math.round(m[1]-r)+'px;width:'+Math.round(r*2)+'px;height:'+Math.round(r*2)+'px"></span>';});
 h+='<svg class="pt-lns" aria-hidden="true"></svg>';
 box.innerHTML=h;
 if(map.flat){ptsFlat(box,on,s,img,W,X0);
  var jf=on.filter(function(x){return x.jbl;})[0],jq=jf&&ptsJblPut(box,img,X0,W),ln=box.querySelector('.pt-lns');
  if(jq&&ln){var Lf=jf.pl.lead,ff=jf.f?' '+jf.f:'';ln.innerHTML+='<path class="pt-ln'+ff+'" pathLength="1" style="--pc:#22d3ee" d="M'+Lf[0]+' '+Lf[1]+' L'+Math.round(jq[0]+jq[2]*0.5)+' '+(jq[1]+jq[3]-1)+'"/><circle class="pt-ld'+ff+'" cx="'+Lf[0]+'" cy="'+Lf[1]+'" r="1.8" fill="#22d3ee"/>';}
  return;}
 /* s74 胶囊落位: 不许压住设备本体(用户: MAX 的 LAN 胶囊挡在机身正中)。量出胶囊宽度后按顺序试几个位置, 取第一个合格的:
    ① 原来那列(插头右边; MAX 插头朝左时排左边) ② 插头另一边 ③ 设备下沿下方(插头右侧 / 正下 / 左侧三个横向位置)。
    合格 = 在展台可见范围内 + 跟产品图轮廓(ptSil)交叠不超过 6px + 不碰任何插头和垂线、已放好的胶囊、左上角上网方式标识。
    都不行就先收掉副字再试一遍, 还不行才退回老办法(贴右边界, 截短名称)。
    引线: 侧边落位 = 插头角 → 折一下 → 胶囊近边; 下方落位 = 开口下沿竖直下来 → 拐到胶囊近边 */
 var svg='',sil=ptSil(img),ss=sil?img.offsetWidth/sil.w:0,Hb=box.offsetHeight,used=[],rb0=box.getBoundingClientRect();
 var bw=$('dv-wlb');if(bw&&bw.offsetWidth){var q=bw.getBoundingClientRect();used.push([q.left-rb0.left-6,q.top-rb0.top-6,q.right-rb0.left+6,q.bottom-rb0.top+6]);}
 on.forEach(function(x){used.push([x.pl.xl,x.pl.yt,x.pl.xr,x.pl.yb]);if(x.bx!=null)used.push([x.bx-2,x.by-2,x.bx+26,x.by+26]);});
 function cols(x0,x1,f){if(!sil)return;for(var X=Math.max(0,Math.floor((x0-ox)/ss)),Z=Math.min(sil.w-1,Math.ceil((x1-ox)/ss));X<=Z;X++)if(sil.t[X]>=0)f(oy+sil.t[X]*ss,oy+sil.b[X]*ss);}
 function occ(r){var n=0;cols(r[0],r[2],function(t,b){if(b>r[1]&&t<r[3])n++;});return n*ss;}
 function low(x0,x1){var m=-1;cols(x0,x1,function(t,b){if(b>m)m=b;});return m;}
 function hit(r){return used.some(function(u){return r[0]<u[2]&&r[2]>u[0]&&r[1]<u[3]&&r[3]>u[1];});}
 /* s118 JBL 战将2: 照片放在产品图右上角(外侧, 让开右上角工具键一行), 插头照旧, 引导线从插头连到照片下沿 */
 var jx=on.filter(function(x){return x.jbl;})[0],je=jx&&box.querySelector('.pt-jbl');
 if(je){var jw=je.offsetWidth,jh=je.offsetHeight,ia=img.getBoundingClientRect(),jx0=Math.round(ia.right-rb0.left-jw*0.42),jy0=Math.round(ia.top-rb0.top-jh*0.5),
   st0=stg?stg.getBoundingClientRect():null,ymin=st0?Math.round(st0.top-rb0.top)+42:2;
  jx0=Math.max(X0,Math.min(jx0,W-jw-4));jy0=Math.max(ymin,Math.min(jy0,Hb-jh-4));
  je.style.left=jx0+'px';je.style.top=jy0+'px';used.push([jx0,jy0,jx0+jw,jy0+jh]);
  var L0=jx.pl.lead,jf=jx.f?' '+jx.f:'';
  svg+='<path class="pt-ln'+jf+'" pathLength="1" style="--pc:#22d3ee" d="M'+L0[0]+' '+L0[1]+' L'+Math.round(jx0+jw*0.5)+' '+(jy0+jh-1)+'"/><circle class="pt-ld'+jf+'" cx="'+L0[0]+'" cy="'+L0[1]+'" r="1.8" fill="#22d3ee"/>';}
 on.forEach(function(x){var el=box.querySelector('.pt-c[data-k="'+x.k+'"]');if(!el)return;
  var pl=x.pl,hh=el.offsetHeight/2,pick=null,w;
  for(var pass=0;pass<2&&!pick;pass++){
   if(pass){var sm0=el.querySelector('small');if(!sm0)break;sm0.style.display='none';}
   w=el.offsetWidth;
   var c=lf?[[colX-w,x.cy,'s'],[Math.round(pl.xr)+10,x.cy,'s']]:[[colX,x.cy,'s'],[Math.round(pl.xl)-10-w,x.cy,'s']];
   if(sil)[pl.xr+6,x.ax-w/2,pl.xl-6-w].forEach(function(cx){cx=Math.round(cx);var lb=low(cx,cx+w);c.push([cx,Math.round(Math.max(x.ay+hh+6,(lb<0?x.ay:lb)+hh+6)),'b']);});
   for(var i=0;i<c.length&&!pick;i++){var r=[c[i][0],c[i][1]-hh,c[i][0]+w,c[i][1]+hh];
    if(r[0]>=X0&&r[2]<=W-4&&r[1]>=2&&r[3]<=Hb-2&&occ(r)<=6&&!hit(r))pick=c[i];}
  }
  var cx,cy,mode='s';
  if(pick){cx=pick[0];cy=pick[1];mode=pick[2];}
  else{cx=lf?colX-w:colX;cy=x.cy;if(lf&&cx<X0)cx=Math.round(pl.xr)+10;
   if(cx+w>W-4){cx=Math.max(x.ax+8,W-4-w);
    /* 手机上挪到接口边上还放不下: 名称按超出量截短(省略号), 最少留 40px */
    var over=cx+el.offsetWidth-(W-4),b=el.querySelector('b');
    if(over>0&&b)b.style.maxWidth=Math.max(40,b.offsetWidth-over)+'px';}}
  el.style.left=cx+'px';el.style.top=cy+'px';w=el.offsetWidth;used.push([cx,cy-hh,cx+w,cy+hh]);
  var col=x.k==='USB'?'#22d3ee':'#34d399',f=x.f?' '+x.f:'',L,pd;
  if(mode==='b'){L=pl.bot;var ex=L[0]<cx?cx+1:L[0]>cx+w?cx+w-1:0;
   pd=ex?'M'+L[0]+' '+L[1]+' L'+L[0]+' '+cy+' L'+ex+' '+cy:'M'+L[0]+' '+L[1]+' L'+L[0]+' '+(cy-hh+1);}
  else{L=pl.lead;var ex2=cx+w/2<L[0]?cx+w-1:cx+1,mx=Math.round(L[0]+(ex2-L[0])*0.45);pd='M'+L[0]+' '+L[1]+' L'+mx+' '+cy+' L'+ex2+' '+cy;}
  svg+='<path class="pt-ln'+f+'" pathLength="1" style="--pc:'+col+'" d="'+pd+'"/>'+
   '<circle class="pt-ld'+f+'" cx="'+L[0]+'" cy="'+L[1]+'" r="1.8" fill="'+col+'"/>';});
 box.querySelector('.pt-lns').innerHTML=svg;
}
/* s122 收起 / 展开右栏时产品图随展台变宽左右平移: 每帧把整个覆盖层按产品图的位移量平移(translate, 不重建 DOM, 动画不被打断), 动画结束再按新宽度完整重排一次 */
window.MRT_PTS_FOLLOW=function(){var box=$('dv-pts'),img=$('dv-img');if(!box||!img||PT.ox==null||!img.offsetWidth)return;box.style.translate=(img.offsetLeft-PT.ox)+'px 0px';[$('dv-img-b'),$('dv-scrw')].forEach(function(e){if(e)e.style.left=img.offsetLeft+'px';});};
window.MRT_PTS_REDRAW=function(){var box=$('dv-pts');try{bkSync();}catch(e){}if(box)box.style.translate='';if(PT.d)try{ptsDraw(PT.d,PT.m);}catch(e){}};
/* s74 产品图左上角「当前上网方式」: 按 router3d-data 的 egress.kind 分 WiFi 桥接 / 有线 WAN / 蜂窝 / 未联网。
   只显示类型(图标 + 类型名), 不放 SSID、速率、运营商之类的详细信息(用户要求简约)。
   类型没变不碰 DOM, 换类型时重放一次入场动画 */
var NETK={wifi:['fas fa-wifi','WiFi 桥接'],wired:['fas fa-ethernet','有线 WAN'],cell:['fas fa-signal','蜂窝'],tether:['fas fa-mobile-alt','手机共享'],none:['fas fa-unlink','未联网']};
function netBadge(){
 var el=$('dv-wlb'),d=window.MRT_R3D;if(!el||!d)return;
 var eg=d.egress||{},k=NETK[eg.kind]?eg.kind:'none',t=NETK[k];
 if(el._k===k)return;
 var kc=!!el._k;el._k=k;
 el.className='dv-wlb k-'+k;
 if(kc){el.style.animation='none';void el.offsetWidth;el.style.animation='';}
 var ic=$('dv-wlb-i');if(ic)ic.className=t[0];
 var kk=$('dv-wlb-k');if(kk)kk.textContent=t[1];
 if(k==='wifi'){el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label','当前上网方式：WiFi 桥接，点击打开无线网桥');}
 else{el.setAttribute('role','status');el.removeAttribute('tabindex');el.setAttribute('aria-label','当前上网方式：'+t[1]);}
 el.style.display='';
}
window.MRT_NETB=netBadge;
/* s91 全屏层(音乐播放器 / 网络拓扑)的可用范围: 不盖侧栏、手机顶栏(带菜单键)和底部导航。
   把内容区左沿、顶栏下沿、底栏上沿量成三个 CSS 变量挂在 <html> 上, 两个覆盖层的 fixed 边距引用它们;打开前和窗口尺寸变化时重量 */
function ovBox(){
 var de=document.documentElement,vw=window.innerWidth,vh=window.innerHeight,l=0,t=0,r0=0,b=0,mr=document.querySelector('.main-right')||$('P'),hd=document.querySelector('header'),nv=$('mwrt-bottomnav'),r;
 /* 浮层范围 = 内容区(.main-right)与视口的交集, 再让开手机顶栏和底部导航; 四边都量, 不再只量左边 */
 if(mr){r=mr.getBoundingClientRect();if(r.width>0){l=Math.max(0,Math.round(r.left));r0=Math.max(0,Math.round(vw-r.right));t=Math.max(0,Math.round(r.top));if(r.bottom<vh-1)b=Math.round(vh-r.bottom);}}
 if(hd){r=hd.getBoundingClientRect();if(r.height>0)t=Math.max(t,Math.round(r.bottom));}
 if(nv){r=nv.getBoundingClientRect();if(r.height>0&&r.top>vh/2&&r.top<vh)b=Math.max(b,Math.round(vh-r.top));}
 de.style.setProperty('--mwrt-ov-l',l+'px');de.style.setProperty('--mwrt-ov-t',t+'px');de.style.setProperty('--mwrt-ov-r',r0+'px');de.style.setProperty('--mwrt-ov-b',b+'px');
}
window.MRT_OVBOX=ovBox;
window.addEventListener('resize',function(){try{ovBox();}catch(e){}});
/* s91 声音入口: 喇叭键(有 USB 声卡才显示) + 左上角"正在播放"胶囊(d.aplay.s==='playing')。
   只改 hidden / 文字, 内容没变不碰 DOM; 胶囊点击交给音乐播放器模块(window.MRT_AUD, 稍后才定义, 点击时再取) */
function audUi(d){
 var b=$('dv-aud'),pl=$('dv-aplay');if(!d)return;
 if(b){var has=Array.isArray(d.usb)&&d.usb.some(function(x){return x&&x.type==='audio';});
  var jb=has&&d.usb.some(function(x){return window.MRT_USB&&window.MRT_USB.isJbl(x);}),sh=has&&!jb;
  if(b.hidden===sh)b.hidden=!sh;
  if(window.MRT_AUD)window.MRT_AUD.card(has);}
 if(pl){var ap=d.aplay,on=!!(ap&&ap.s==='playing'),t=on?(ap.t||'正在播放'):'';
  if(window.MRT_AUD)window.MRT_AUD.pill(on);
  if(pl.hidden===on){pl.hidden=!on;if(on){pl.style.animation='none';void pl.offsetWidth;pl.style.animation='';}}
  var tx=$('dv-aplay-t');if(tx&&on&&tx.textContent!==t){tx.textContent=t;pl.title='正在播放：'+t+'（点击打开音乐播放器）';}}
}
/* 胶囊的标记在这段脚本之后才出现, 用委托绑定 */
document.addEventListener('click',function(e){var pl=e.target.closest&&e.target.closest('#dv-aplay');if(pl&&window.MRT_AUD)window.MRT_AUD.open(pl);});
function render(d){
 try{HERO.feed(d);}catch(e){}
 window.MRT_R3D=d;
 try{netBadge();}catch(e){}
 try{audUi(d);}catch(e){}
 // model + image:优先信 CGI 的 d.model,认不出则回落服务端判定的 DEV_MODEL。
 // 自定义图(overrideSrc)优先于内置默认图;每次轮询都据此复位,防止被默认图冲掉。
 var model=d.model;
 if(model!=='E87N'&&model!=='MAX'&&model!=='Ultra'&&model!=='H5000M'&&model!=='N5000'&&model!=='TR3000')model=DEV_MODEL;
 var base=IMG[model]||IMG[DEV_MODEL];
 var src=overrideSrc||base;
 var img=$('dv-img');if(img&&src){if(img.getAttribute('data-src')!==src){img.src=src;img.setAttribute('data-src',src);img.style.display='';}}
 try{scrFit();}catch(e){}
 // s41: 机型名拆成 品牌(细) + 型号(粗) 两段, 和模板首屏输出同一结构; 名字没变就不重写
 var nm=String(NAMES[model]||DEV_NAME||model||''),ne=$('dv-name');
 if(ne&&ne.getAttribute('data-n')!==nm){var k=nm.indexOf(' ');ne.innerHTML=k>0?'<span class="dv-brand">'+esc(nm.slice(0,k))+'</span>'+esc(nm.slice(k+1)):esc(nm);ne.setAttribute('data-n',nm);}
 /* System stats。圆环还原之后这里要和圆环分工, 否则同一个数在首屏出现两次 ——
    用户说的"有些信息和设备总览冲突"正是这件事。划法是"圆环给不了的才留在磁贴":

      内存占用  撤掉 → 圆环「内存 · 剩余%」在出同一个数(一个说占用一个说剩余,
                       是同一件事的两种说法, 并排摆只会让人以为是两个指标)
      SoC 温度  撤掉 → 圆环「设备温度」在出, 且下面风扇卡还会再出一次温度
      CPU 负载  留下 → 圆环出的是**瞬时占用百分比**, 这里出的是 load1 **负载均值**,
                       量纲不同(0.42 这种带小数的平均值, 不是百分比), 不重复
      存储占用  留下 → 圆环里没有存储; 已用/总量的绝对量是圆环给不了的

    .dv-stats 的 grid 写死 1fr 1fr 两列, 剩下两块正好一行摆满, 不会留空格。

    撤掉温度磁贴之后 tempInfo() 没有调用方了, 已在函数定义处一并删掉(见那里的注释)。
    两块磁贴一块走 tile()、一块走 tileBar(), 后者多一条 .dv-bar 进度条,
    所以 CPU 那块会比存储那块矮一截 —— .dv-stat 已经是 align-items:center 的 flex,
    等高由 grid 行拉平, 不会错位。 */

 var st=[];
 var cpu=d.cpu||{},nc=cpu.ncpu||1,l1=(cpu.load1!=null&&isFinite(+cpu.load1))?+cpu.load1:null,lp=l1!=null?Math.min(100,Math.round(l1/nc*100)):0;
 st.push({k:'cpu',ic:'fa-microchip',lb:'CPU 负载',x:nc+' 核',v:(l1!=null?l1.toFixed(2):'—')+'<small>1 分钟</small>',b:[lp],bt:['负载约占 '+nc+' 核的 '+lp+'%'],lv:lp>=85?2:(lp>=65?1:0),pop:'cputop'});
 var sto=d.storage||{};
 if(sto.total>0){var sp=pct(sto.used,sto.total);
  st.push({k:'sto',ic:'fa-hdd',lb:'存储占用',x:fmtKB(sto.used)+' / '+fmtKB(sto.total),v:sp+'<small>%</small>',b:[sp],bt:['已用 '+fmtKB(sto.used)+'，共 '+fmtKB(sto.total)],lv:sp>=85?2:(sp>=65?1:0),pop:'storage'});}
 tlSet($('dv-stats'),st,'无系统数据');
 // Ports

 var pw=$('dv-ports');var ports=d.ports||[];
 var psw=PORTSW&&ports.length===1;
 pw.className='dv-ports'+(ports.length<=1?' single':'');
 tlSet(pw,ports.map(function(p,ix){
  var link=!!p.carrier,spd=+p.speed||0,role=p.role||'',lan=(role==='LAN'),cog=(role==='LAN'||role==='WAN');
  /* s130: SY108 没有以太网 PHY —— wwan0 是蜂窝数据口, br-usb 是 USB 桥。
     speed=-1 是内核对无 PHY 口的真实值, 原样渲染会变成 "-1 Mbps"。 */
  var isCell=(p.id==='wwan0'),vv,bb,tt;
  if(!link){vv='<small class="dn">未接入</small>';bb=0;tt='未接入';}
  else if(isCell){vv='<small>蜂窝</small>';bb=100;tt='蜂窝数据已接入';}
  else if(spd>0){vv=(spd>=1000?(spd/1000)+'<small>Gbps</small>':spd+'<small>Mbps</small>');bb=Math.max(6,Math.min(100,spd/25));tt='链路速率 '+speedTxt(spd);}
  else{vv='<small>已接入</small>';bb=60;tt='链路已接入';}
  return {k:'p'+ix,ic:'fa-ethernet',lb:role||'网口',cls:link?'on':'off',
   x:'<em class="pid">'+esc(p.id||'')+'</em>'+
    (psw?'<button type="button" class="psw" onclick="pwmOpen()" title="切换网口角色（当前 '+esc(role)+'）" aria-label="切换网口角色（当前 '+esc(role)+'）"><i class="fas fa-exchange-alt" aria-hidden="true"></i></button>':'')+
    (cog?'<button type="button" class="pcfg" onclick="'+(lan?'pcLanOpen()':'pcWanOpen()')+'" title="'+esc(role)+' 口设置" aria-label="'+esc(role)+' 口设置"><i class="fas fa-cog" aria-hidden="true"></i></button>':''),
   v:'<span class="lk"></span>'+vv,
   b:[bb],bt:[tt]};
 }),'无网口数据');
 /* Connectivity: 只放下方蜂窝区块没有的独有信息(不重复模组/SIM)。
    「内核」那一格去掉了 —— 内核版本是静态规格, 已经在设备规格卡里, 不属于"连接信息"。
    SSID 也不放这里: router3d-data 的返回里没有 ssid 字段(只有 devinfo 给),
    而这块是每 1.8 秒整条 innerHTML 重写的, 塞进来会被下一轮冲掉。 */
 /* 六格**按高度分两组**摆, 不按配色或语义相邻摆。
    原因是 grid 的同一行会被最高的那格拉平: 三个单值格只有"标签+值"两行,
    而带趋势线的和双向流量那格多出第三行。混着排的话第一行会是"短短高",
    两个短格各顶着一块空白。按高度分组之后:

      第一行  WAN IP(蓝) / 内网网关(青) / 运行时间(紫)   —— 单值, 两行高
      第二行  在线设备(绿) / 活动连接(粉) / WAN 流量(橙) —— 带第三行, 等高

    顺带两个地址还是挨着的, 读起来仍然成组。

    用两个数组再 concat, 而不是按顺序往一个数组里 push: 这几项都是条件渲染的
    (没拨号时 wan_ip 为空、conns 可能缺), 顺序 push 一旦少一项, 后面的格子就会
    往前挤一列, 高矮分组当场失效。分组装再拼接, 缺哪项都只是那组少一格。 */
 var flat=[],tall=[],ips=[];
 /* is-ipx / is-dur: s56 二轮按内容结构重排的三张单值卡(分段 IP + 前缀徽章 / 大数字 + 弱化单位),
    值左对齐、与图标标签同一条左边线。--sc 由两格里较长那个地址的字符数算出同一个缩放字号,
    短地址不会被按最坏情况缩过小(见 CSS .is-ipx .seg)。 */
 /* --sc = 格内宽 ÷ 整组字符当量。整组 = 数字(每位约 0.6em) + 3 个点组(每组约 0.86em)
    + 末尾徽章(约 3.2em)。按两格里较长那个地址的数字位数算, 两格同一个字号;
    留一点余量免得贴边。不带徽章(IPv6 回落)也按这个算, 只会偏小一点, 不会溢出。 */

 var dig=Math.max((String(d.wan_ip||'').match(/\d/g)||[]).length,7);
 var units=dig*0.6+3*0.86+0.4;
 /* s93: 标题「出口IP」, 右角一枚小图标标出出口走的方式(蜂窝/WiFi 桥接/有线/手机共享), 图标同 NETK, 悬停有文字; s124: 子网前缀挪进右上角小字, 数值只留四段数字 */
 var egk=NETK[(d.egress||{}).kind]&&d.egress.kind!=='none'?NETK[d.egress.kind]:null;
 var wpf=parseInt(d.wan_pfx,10);
 if(d.wan_ip)ips.push({k:'ip',ic:'fa-globe',lb:'出口IP',cls:'ip fl',sc:'calc(100cqi / '+units.toFixed(2)+')',
  x:(wpf>0&&wpf<=32?'<em>/'+wpf+'</em>':'')+(egk?'<span class="ek" title="出口方式：'+egk[1]+'" aria-label="'+egk[1]+'"><i class="'+egk[0]+'"></i></span>':''),
  v:ipx(d.wan_ip,0),b:[100],bt:[egk?egk[1]:'已联网']});
 /* s64: 硬件加速 HNAT: 加速类型 + PPE 绑定占比, 点开看详情; Full Cone NAT(全锥)= 游戏加速, 单独点出来。数据来自 HNAT_D(hnatFetch 5 秒一轮)。
    s124: 数值取总占比, 底部细条按 PPE 分段(一条 PPE 一段, 悬停看绑定数) */
 /* s142 11-22: 原「信号强度」卡与顶部信号环/蜂窝屏的 RSRP/RSRQ/SINR 重复(用户反馈),
    改为「签约速率」——显示运营商签约的上下行 + 承载等级 5QI/QCI。
    数据仍走 devpop?k=hnat (服务端读 udx.cellular status 的 qos, 5 秒一轮):
    qos.down_kbps / qos.up_kbps (kbps) + qos.qci / qos.kind。
    真机: 下行 500000 kbps=500M, 上行 100000 kbps=100M, qci=8/kind=5qi。 */
  var hn=window.MRT_HNAT||HNAT_D;
  var qo=hn&&hn.qos?hn.qos:null;
  function spd(kb){kb=+kb||0;return kb>=1000000?(kb/1000000).toFixed(1)+'G':(kb>=1000?(kb/1000)+'M':(kb>0?kb+'K':'--'));}
  if(qo&&(+qo.down_kbps>0||+qo.up_kbps>0)){
   var lvl=(qo.kind==='5qi'?'5QI':'QCI')+' '+(qo.qci!=null?qo.qci:'--');
   var pctBar=Math.max(4,Math.min(100,Math.round(+qo.down_kbps/1000)));  /* 500M -> 50%, 只做视觉条；注意别遮蔽全局 pct(a,b) */
   ips.push({k:'hnat',ic:'fa-gauge-high',lb:'签约速率',x:'<span class="tg">'+esc(lvl)+'</span>',
    v:spd(qo.down_kbps)+'<small>↓</small> '+spd(qo.up_kbps)+'<small>↑</small>',pop:'hnat',
    b:[pctBar],
    bt:['签约下行 '+spd(qo.down_kbps)+' / 上行 '+spd(qo.up_kbps)+' · '+esc(lvl)+' 承载']});
  }else if(hn&&(hn.noready||qo)){
   ips.push({k:'hnat',ic:'fa-gauge-high',lb:'签约速率',x:'',v:'--<small>无承载</small>',b:[0],pop:'hnat'});
  }else{
   ips.push({k:'hnat',ic:'fa-gauge-high',lb:'签约速率',x:'',v:'—<small>读取中…</small>',b:[0],pop:'hnat'});
  }
  /* 在线设备 / 活动连接: 带趋势线和环比标记。
    线色取各自格子的强调色(绿/粉), 和徽章同色系, 不另引入第七种颜色。
    深浅两色共用这两个十六进制值 —— 线是 1.5px 细描边, 在白底上
    #34d399/#f472b6 的对比度够用; 真正在白底上发飘的是大面积色罩和
    cv-dl/cv-ul 那种要分辨语义的色, 那两处已在 .P.L 里单独压深。 */
 var hc=histPush('clients',d.clients!=null?d.clients:0);
 tall.push(chip('mg','fa-network-wired','在线设备',(d.clients!=null?d.clients:0)+' <small>台</small>',
  {badge:deltaBadge(hc),below:sparkline('clients',hc),pop:'clients'}));
 if(d.conns!=null){var hn=histPush('conns',parseInt(d.conns)||0);
  tall.push(chip('mpk','fa-project-diagram','活动连接',esc(d.conns)+' <small>条</small>',
   {badge:deltaBadge(hn),below:sparkline('conns',hn),pop:'conns'}));}
 /* 流量走 chipDuplex: 原先是把 ↓x ↑y 两个值塞进同一行 14px 文本里, 挤且分不清主次。
    现在并排两栏各带方向箭头和方向色, 底下一条比例条, 标签行右端给合计。
    传的是**字节数**原值, 让它自己算比例和合计 —— 格式化后的 "41.2G"/"3.8G"
    是字串, 算不了。 */
 /* s87: 「WAN 流量」格已撤 */
 $('dv-meta').innerHTML=flat.concat(tall).join('');
 sparkMount();
 var ipw=$('dv-ips');if(ipw)tlSet(ipw,ips,'');
 try{ptsDraw(d,model);}catch(e){}
 if(window.MRT_POP)MRT_POP.upd('r3d');
}
/* ---- s44 二轮: hero 区域的"蜂窝 / 系统信息"二选一 ----
   UI.render()(蜂窝轮询, 4 秒一次)拿到模组数据 → MRT_HERO.set('cell'); 拿不到(含粘滞窗口也过期)→ set('sys')。
   本 IIFE 的 render(d)(设备轮询, 1.8 秒一次)每轮 MRT_HERO.feed(d) 把系统数据喂进来, 系统版 hero 靠它刷新。
   两边谁先到都不会闪: 要显示系统版必须同时满足 want==='sys' 且已经拿到过一次 router3d-data;
   router3d-data 自己说 modem.present===0(根本没配模组)时不等蜂窝轮询, 直接 want='sys'。
   节点原位改文字/样式, 不重写 innerHTML —— 环的 dashoffset 才有过渡。 */
/* s111 有无模组: 判据 = lsusb 关键词(与「其他设定」页「当前模组」同源), 缓存键与侧栏共用 */
var MP={st:-1,u:'/cgi-bin/luci/admin/modem/modem_present',
 set:function(v){var s=v?1:0;if(MP.st===s)return;MP.st=s;
  document.documentElement.classList.toggle('mrt-nomod',s===0);
  try{localStorage.setItem('mwrt_modem_present',String(s));}catch(e){}
  if(window.mwrtMenu&&window.mwrtMenu.syncMenu)window.mwrtMenu.syncMenu();
  if(window.MRT_HERO&&window.MRT_HERO.d)window.MRT_HERO.feed(window.MRT_HERO.d);},
 poll:function(){if(document.hidden)return;
  fetch(MP.u,{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;})
   .then(function(j){if(j&&typeof j.present==='boolean')MP.set(j.present);}).catch(function(){});},
 init:function(){var v=null;try{v=localStorage.getItem('mwrt_modem_present');}catch(e){}
  if(v==='0'||v==='1')MP.set(v==='1');
  MP.poll();setInterval(MP.poll,15000);
  document.addEventListener('visibilitychange',MP.poll);}};
var HERO={want:'',d:null,
 C:2*Math.PI*38,
 put:function(id,h){var e=$(id);if(e&&e.getAttribute('data-h')!==h){e.innerHTML=h;e.setAttribute('data-h',h);}},
 set:function(w){if(w==='cell'&&HERO.nomod)return;if(HERO.want===w)return;HERO.want=w;HERO.apply();},
 /* s84 N5000: present===0(转接板上没有蜂窝模组)就强制系统版, 并清掉 UI 的缓存与粘滞; 恢复为 1 后交回 UI.render 决定。
    首次拿到 router3d-data 才放行 cacheRestore。其他机型走原逻辑。 */
 n5k:function(d){
  var pr=d.modem?+d.modem.present:-1;
  if(pr===0){HERO.nomod=true;HERO.want='sys';
   try{var U=window.MRT_UI;U.good=null;U.goodT=0;localStorage.removeItem(U.cacheKey());}catch(e){}}
  else{HERO.nomod=false;}
  if(!window.MRT_N5K_OK){window.MRT_N5K_OK=true;if(pr!==0){try{window.MRT_UI.cacheRestore();}catch(e){}}}
 },
 feed:function(d){HERO.d=d;
  if(MP.st>=0)HERO.mp(d);
  else if(DEV_MODEL==='N5000'||DEV_MODEL==='TR3000')HERO.n5k(d);
  else HERO.nm(d);
  HERO.apply();},
 /* s111 按 lsusb 判定: 无模组强制系统版并清蜂窝缓存; 有模组放行, 由蜂窝轮询(UI.render)决定显示蜂窝版 */
 mp:function(){
  if(MP.st===0){HERO.nomod=true;HERO.want='sys';
   try{var U=window.MRT_UI;U.good=null;U.goodT=0;localStorage.removeItem(U.cacheKey());}catch(e){}}
  else{HERO.nomod=false;}
  if(!window.MRT_N5K_OK){window.MRT_N5K_OK=true;if(MP.st===1){try{window.MRT_UI.cacheRestore();}catch(e){}}}
 },
 /* s99 其他机型(非 N5000)的"没有可显示的蜂窝模组"提示。判据只用 router3d-data 的 modem 字段, 不认机型名:
      · present===0(没有 /tmp/modconf.conf), 或
      · modconf 文字是"未知模块/未接入"(modem 初始化没认出任何模组时写的占位串, 例如 E87N 无模组时)。
    和 N5000 的区别: 这里只是"提示", 不设 nomod 阻断 —— 蜂窝轮询(UI.render)真拿到模组数据时仍可切回蜂窝版,
    所以 modconf 判断出错也不会把有数据的模组盖住。
    want 不是 cell 时直接切系统版; want 已是 cell 时只在页面刚打开 10 秒内、且这个 cell 是旧缓存撑起来的(ui.stale>0, 不是实时数据)
    才纠正成系统版并清缓存, 免得拔掉模组后一小时内刷新仍显示旧蜂窝读数。运行中途 modconf 抖动不会动粘滞窗口里的 cell。 */
 nm:function(d){
  var m=d.modem||{},pr=m.present==null?-1:+m.present,none=pr===0||/未知模块|未接入/.test(String(m.modconf||''));
  if(!none)return;
  if(HERO.want!=='cell'){HERO.want='sys';return;}
  var U=window.MRT_UI,young=false,live=false;try{live=U.stale===0;young=Date.now()-U.t0<10000;}catch(e){}
  if(young&&!live){HERO.want='sys';try{U.good=null;U.goodT=0;localStorage.removeItem(U.cacheKey());}catch(e){}}
 },
 apply:function(){
  var w=$('hero-w'),c=$('hero-sig'),y=$('hero-sys');if(!w||!c||!y)return;
  var sc=HERO.want==='cell',ss=HERO.want==='sys'&&!!HERO.d,lite=true; /* s99: 所有机型的无模组 hero 都用简约版(原先只有 N5000), 旧的四磁贴+负载环版不再被启用 */
  y.classList.toggle('hs-lite',lite);c.classList.toggle('hc-lite',true);w.classList.toggle('hw-lite',lite&&ss);
  w.classList.toggle('hid',!(sc||ss));c.classList.toggle('hid',!sc);y.classList.toggle('hid',!ss);
  if(ss)(lite?HERO.fillLite:HERO.fill)(HERO.d);
 },
 /* s85 N5000 路由器样式: 整条一行。左 = 在线点 + 机型名 │ 联网状态 · 上网方式; 右 = USB / WiFi(各频段, 世代跟着频段走) / 无线桥接。
    USB chip 打 data-pop="usb", 悬停就是产品图上那个 USB 浮层(含摄像头画面); 桥接按钮直接开「无线网桥」扫描浮窗(wlbOpen)。 */
 fillLite:function(d){
  var y=$('hero-sys'),model=d.model;
  if(model!=='E87N'&&model!=='MAX'&&model!=='Ultra'&&model!=='H5000M'&&model!=='N5000'&&model!=='TR3000')model=DEV_MODEL;
  var hn=String(NAMES[model]||DEV_NAME||d.board||model||''),hk=hn.indexOf(' ');
  HERO.put('hl-name',hk>0?'<span class="b">'+esc(hn.slice(0,hk))+'</span>'+esc(hn.slice(hk+1)):esc(hn));
  var online=!!d.wan_ip,kd=d.egress&&d.egress.kind,KN={wired:'以太网',wifi:'无线桥接',cell:'蜂窝',tether:'手机共享'};
  y.classList.toggle('is-up',online);y.classList.toggle('is-down',!online);
  HERO.put('hl-sub',online?'<span class="st">已联网</span>'+(KN[kd]?' · '+KN[kd]:''):'<span class="st">未联网</span>');
  var wf=d.wifi||{},wb=d.wlb||{},UT0=(window.MRT_USB||{}).T||{},RL=(window.MRT_USB||{}).role||function(){return '';},h='';
  /* USB: 集线器和模组不算(模组在位时本条根本不显示), 其余按顺序取第一台, 多的记 +N */
  var us=(Array.isArray(d.usb)?d.usb:[]).filter(function(u){return u.type!=='modem'&&u.type!=='hub';});
  if(us.length){var u0=(window.MRT_USB||{}).pick?window.MRT_USB.pick(us):us[0],t=UT0[u0.type]||UT0.other||['fas fa-plug','USB 设备'];
   h+='<span class="hl-c hl-usb" data-pop="usb" tabindex="0" aria-label="USB 口已接入'+esc(t[1])+'"><i class="'+t[0]+'" aria-hidden="true"></i><b>USB</b><span class="ss">'+esc(u0.name||t[1])+(RL(u0)?' · '+RL(u0):'')+'</span>'+(us.length>1?'<em>+'+(us.length-1)+'</em>':'')+'</span>';}
  else h+='<span class="hl-c hl-usb off"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="2.6" cy="8" r="1.3" fill="currentColor" stroke="none"/><path d="M3.9 8h8.6M12 6.2L14.2 8 12 9.8M5.5 8l1.7-3H9M7.5 8l1.5 3h1.2"/><circle cx="10.6" cy="5" r="1.1"/><rect x="10.6" y="10" width="2" height="2" rx=".3" fill="currentColor" stroke="none"/></svg><b>USB</b><span class="mu">未接入</span></span>';
  /* WiFi: 一个 chip 里排出每个频段(2.4G / 5G / 6G)及它的 SSID; 世代标在最前面, 某个频段世代和最高的不同才在频段后单标 */
  var GV={BE:'7',AX:'6'},BL={'2g':'2.4G','5g':'5G','6g':'6G'},gn=GV[wf.gen]||'',bs=Array.isArray(wf.bands)?wf.bands:[],
   WSVG='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M1.5 6a9.5 9.5 0 0 1 13 0"/><path d="M4 8.8a6 6 0 0 1 8 0"/><path d="M6.4 11.5a2.6 2.6 0 0 1 3.2 0"/><circle cx="8" cy="13.6" r="0.6" fill="currentColor"/></svg>';
  var hw='',HASWF=!!(bs.length||gn||wf.ssid);
  if(bs.length){
   hw+='<span class="hl-c hl-wf">'+WSVG+'<b>WiFi'+(gn?' '+gn:'')+'</b><span class="hl-bds">'+bs.map(function(b){var on=+b.on!==0&&b.ssid,bg=GV[b.gen];
    var ed=(b.b==='2g'||b.b==='5g')?' onclick="wfmOpen(\''+b.b+'\')" title="修改 '+BL[b.b]+' 无线设置"':'',
     ek=ed?' class="ss ed" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();wfmOpen(\''+b.b+'\')}"':' class="ss"';
    return '<span class="hl-bd'+(on?'':' off')+'"'+ed+'><span'+ek+'>'+(on?esc(b.ssid):'已关闭')+'</span><em class="bt bt-'+esc(b.b)+'">'+(BL[b.b]||esc(b.b))+(bg&&bg!==gn?'<u>'+bg+'</u>':'')+'</em></span>';}).join('')+'</span></span>';}
  else if(gn)hw+='<span class="hl-c hl-wf">'+WSVG+'<b>WiFi '+gn+'</b>'+(wf.ssid?'<span class="hl-bd"><span class="ss">'+esc(wf.ssid)+'</span></span>':'')+'</span>';
  /* 无线桥接: 没桥接 = 「扫描桥接」按钮(开扫描浮窗); 已桥接 = 绿点 + 上游 SSID(开当前桥接视图, 里面可断开); 桥接了但没连上 = 黄点 */
  if(+wb.bridged===1){var br=+wb.associated===1;
   h+='<button type="button" class="hl-c hl-br '+(br?'on':'wt')+'" onclick="wlbOpen()" title="无线网桥 · 查看或断开"><i class="dt"></i><b>'+(br?'已桥接':'桥接中')+'</b>'+(wb.ssid?'<span class="ss">'+esc(wb.ssid)+'</span>':'')+'</button>';}
  else if(HASWF)h+='<button type="button" class="hl-c hl-br" onclick="wlbOpen()" title="扫描并桥接上游 WiFi"><span class="ic"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M1.5 6a9.5 9.5 0 0 1 13 0"/><path d="M4 8.8a6 6 0 0 1 8 0"/><path d="M6.4 11.5a2.6 2.6 0 0 1 3.2 0"/><circle cx="8" cy="13.6" r="0.6" fill="currentColor"/></svg></span><b>扫描桥接</b></button>';
  try{var qb=document.getElementById('wlb-btn'),qp=qb&&qb.parentNode;if(qp)qp.style.display=(HASWF||+wb.bridged===1)?'':'none';}catch(e){}
  HERO.put('hl-chips',h+hw);
 },
 fill:function(d){
  var y=$('hero-sys'),model=d.model;
  if(model!=='E87N'&&model!=='MAX'&&model!=='Ultra'&&model!=='H5000M'&&model!=='N5000'&&model!=='TR3000')model=DEV_MODEL;
  /* 品牌(细) + 型号(粗), 和设备总览的机型名同一写法 */
  var hn=String(NAMES[model]||DEV_NAME||d.board||model||''),hk=hn.indexOf(' ');
  HERO.put('hs-name',hk>0?'<span class="b">'+esc(hn.slice(0,hk))+'</span>'+esc(hn.slice(hk+1)):esc(hn));
  var online=!!d.wan_ip;
  y.classList.toggle('is-up',online);y.classList.toggle('is-down',!online);
  HERO.put('hs-st',online?'已联网':'未联网');
  /* 固件串 "Mwrt @Manper-5.1.1151-24" 拆成 发行名 / 作者 / 版本号(样式说明见 .fw-b) */
  var fw=String(d.fw||''),fm=fw.match(/^(.+?)\s*@([^\s@-]+)-(\S+)$/),fh='';
  if(fm)fh='<span class="fw-b"><span class="k"><i class="fas fa-layer-group" aria-hidden="true"></i>'+esc(fm[1])+'</span><span class="v">'+esc(fm[3])+'</span></span>';
  else if(fw)fh='<span class="fw-b"><span class="k">'+esc(fw)+'</span></span>';
  if(d.kernel)fh+='<span class="fw-b fw-k"><span class="k"><i class="fab fa-linux" aria-hidden="true"></i>Linux</span><span class="v">'+esc(d.kernel)+'</span></span>';
  if(fm)fh+='<span class="fw-a">@'+esc(fm[2])+'</span>';
  HERO.put('hs-fw',fh||'--');
  /* s71: 原先这里有「未安装蜂窝模组 / 蜂窝读取中 / 蜂窝暂无数据」徽章, 用户嫌多余, 已删 */
  var up=parseInt(d.uptime)||0;
  if(up>0){var dd=Math.floor(up/86400),hh=Math.floor(up%86400/3600),mi=Math.floor(up%3600/60),bt=new Date(Date.now()-up*1000),z=function(n){return (n<10?'0':'')+n;};
   HERO.put('hs-up-v',(dd?dd+'<small>天</small> ':'')+hh+'<small>时</small> '+(dd?'':mi+'<small>分</small>'));
   HERO.put('hs-up-s','开机于 '+z(bt.getMonth()+1)+'-'+z(bt.getDate())+' '+z(bt.getHours())+':'+z(bt.getMinutes()));}
  else{HERO.put('hs-up-v','--');HERO.put('hs-up-s','--');}
  HERO.put('hs-cl-v',(d.clients!=null?esc(d.clients):'--')+'<small>台</small>');
  HERO.put('hs-cl-s',d.conns!=null?esc(d.conns)+' 条活动连接':'--');
  if(d.wan_rx!=null&&d.wan_tx!=null){var rx=+d.wan_rx||0,tx=+d.wan_tx||0;
   HERO.put('hs-wan-v',fmtKB(Math.round((rx+tx)/1024))+'<small>累计</small>');
   HERO.put('hs-wan-s','↓ '+fmtKB(Math.round(rx/1024))+' · ↑ '+fmtKB(Math.round(tx/1024)));}
  else{HERO.put('hs-wan-v','--');HERO.put('hs-wan-s','--');}
  var sto=d.storage||{};
  if(sto.total>0){var sp=pct(sto.used,sto.total),L=sp>=90?['lv-poor','告急']:sp>=70?['lv-fair','偏满']:['lv-good','充裕'];
   var sb=$('hs-sto');sb.classList.remove('lv-good','lv-fair','lv-poor');sb.classList.add(L[0]);
   $('hs-sto-b').textContent=L[1];HERO.put('hs-sto-v',sp+'<small>%</small>');
   HERO.put('hs-sto-s',fmtKB(sto.used)+' / '+fmtKB(sto.total));$('hs-sto-bar').style.width=sp+'%';}
  /* 右侧舱: 环 = load1 / 核数(满环=每核都满载), 环心 = load1 原值, 档位字和五格柱跟着档位上色 */
  var cpu=d.cpu||{},ld=+cpu.load1,nc=+cpu.ncpu||1,has=cpu.load1!=null&&isFinite(ld);
  var ratio=has?ld/nc:0,p=has?Math.max(4,Math.min(100,Math.round(ratio*100))):0;
  var lvl=!has?null:ratio<0.7?{c:'good',t:'轻松',r:'52,211,153',h:'#34d399',k:'g'}:ratio<1?{c:'fair',t:'适中',r:'251,191,36',h:'#fbbf24',k:'o'}:{c:'poor',t:'繁忙',r:'248,113,113',h:'#f87171',k:'r'};
  var fg=$('hs-ring').querySelector('.sr-fg');
  if(fg){fg.style.strokeDasharray=HERO.C;fg.style.strokeDashoffset=HERO.C-(p/100)*HERO.C;fg.style.stroke=lvl?lvl.h:'#8891a5';}
  $('hs-rv').textContent=has?ld.toFixed(2):'--';
  var lv=$('hs-lv');lv.textContent=lvl?lvl.t:'--';lv.className='sig-lv'+(lvl?' '+lvl.c:'');
  if(lvl)y.style.setProperty('--lvr',lvl.r);else y.style.removeProperty('--lvr');
  var k=lvl?Math.max(1,Math.ceil(p/20)):0,bh='';
  for(var i=1;i<=5;i++)bh+='<span style="height:'+(i*4+5)+'px" class="'+(lvl&&i<=k?lvl.k:'')+'"></span>';
  HERO.put('hs-bars',bh);
  var mem=d.mem||{},mp=mem.total>0?Math.round((mem.total-mem.avail)*100/mem.total):null;
  HERO.put('hs-sl',nc+' 核 · 内存 '+(mp!=null?mp+'%':'--')+(d.temp!=null?' · '+esc(d.temp)+'℃':''));
 }
};
window.MRT_HERO=HERO;MP.init();
function offline(){}
function poll(){
 var xhr=new XMLHttpRequest();
 xhr.open('GET','/cgi-bin/router3d-data?_='+Date.now(),true);xhr.timeout=8000;
 xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;
  if(xhr.status===200){try{render(JSON.parse(xhr.responseText));}catch(e){offline();}}else{offline();}};
 xhr.ontimeout=xhr.onerror=offline;
 xhr.send();
}
// E87N 屏幕实时预览:轮询 display 的 /screenshot(读 framebuffer 出 BMP,不发 AT)。
// framebuffer 未就绪(驱动未加载/无 fb0)时端点返回空,probe onerror 保留占位。
function startPreview(){
 if(!IS_E87N)return;
 var img=$('mp-screen-img'),ph=$('mp-screen-ph');
 if(!img||!ph)return;
 function shot(){var p=new Image();p.onload=function(){img.src=p.src;img.style.display='block';ph.style.display='none';};p.onerror=function(){};p.src=SHOT_URL+'?_='+Date.now();}
 var m=$('scrm'),pi=$('scrm-img'),pp=$('scrm-ph'),tm=0,sc=$('dv-scr');
 function pull(el,eph){var p=new Image();p.onload=function(){el.src=p.src;el.style.display='block';if(eph)eph.style.display='none';};p.onerror=function(){};p.src=SHOT_URL+'?_='+Date.now();}
 function scrmClose(){if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';clearInterval(tm);tm=0;}
 function scrmOpen(){
  var host=document.querySelector('.main-right')||$('maincontent'),left=0;
  if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
  m.style.setProperty('--wfm-l',left+'px');try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
  if(img.src&&img.style.display!=='none'){pi.src=img.src;pi.style.display='block';pp.style.display='none';}
  m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  pull(pi,pp);clearInterval(tm);tm=setInterval(function(){if(!document.hidden)pull(pi,pp);},1500);
 }
 if(sc){sc.onclick=(m&&pi)?scrmOpen:shot;if(m&&pi){sc.setAttribute('role','button');sc.tabIndex=0;sc.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();scrmOpen();}};}}
 if(m){var rg=$('scr-range'),rv=$('scr-range-val');if(rg&&rv&&window.MutationObserver){var fillSync=function(){rg.style.setProperty('--pct',(rg.value||0)+'%');};new MutationObserver(fillSync).observe(rv,{childList:true,characterData:true,subtree:true});fillSync();}
  var xb=$('scrm-x');if(xb)xb.onclick=scrmClose;m.addEventListener('click',function(e){if(e.target===m)scrmClose();});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('open'))scrmClose();});}
 shot();setInterval(shot,3000);
}
// 自定义整机图:右上角小图标 → 选图上传替换(仅当前机型),或恢复默认。
// 上传走 LuCI 鉴权 action(devimg_upload/<机型>),写 custom_<机型>.png。
function applyImg(src){
 var img=$('dv-img');if(!img)return;
 var url=(src||(IMG[DEV_MODEL]||''));
 /* 自定义图文件名固定(custom_<机型>.png), 不加缓存戳的话浏览器会一直拿旧缓存,
    表现成"上传后不刷新、要清缓存才显示"。给自定义图带上时间戳, 且把带戳的 URL 存进
    overrideSrc —— 下面轮询(render)复位 img.src 时用的就是它, 否则又被无戳 URL 盖回旧缓存。 */
 if(src)url+=(src.indexOf('?')<0?('?t='+Date.now()):'');
 overrideSrc=src?url:'';
 img.src=url;img.setAttribute('data-src',url);img.style.display='';
}
function toggleResetBtn(){var rb=$('dv-reset');if(rb)rb.style.display=overrideSrc?'flex':'none';}
function initDevImg(){
 var fi=$('dv-file'),eb=$('dv-edit'),rb=$('dv-reset');
 if(!fi||!eb)return;
 toggleResetBtn();
 eb.onclick=function(){fi.value='';fi.click();};
 fi.onchange=function(){
  var f=fi.files&&fi.files[0];if(!f)return;
  var isPng=(f.type==='image/png')||/\.png$/i.test(f.name||'');
  if(!isPng){alert('只支持 PNG 格式的图片，请重新上传。');fi.value='';return;}
  if(f.size>1024*1024){alert('图片过大（限 1MB 以内），请压缩后重新上传。');fi.value='';return;}
  eb.disabled=true;eb.classList.add('busy');
  var fd=new FormData();fd.append('image',f,f.name||'device.png');
  var xhr=new XMLHttpRequest();xhr.open('POST',UP_URL,true);
  xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;
   eb.disabled=false;eb.classList.remove('busy');
   var ok=false,r=null;try{r=JSON.parse(xhr.responseText);ok=r&&r.ok;}catch(e){}
   if(xhr.status===200&&ok){applyImg(r.url);toggleResetBtn();}
   else{alert('上传失败'+(r&&r.err?('：'+r.err):'')+'，请重试。');}
  };
  xhr.onerror=function(){eb.disabled=false;eb.classList.remove('busy');alert('上传失败，请重试。');};
  xhr.send(fd);
 };
 if(rb)rb.onclick=function(){
  if(!overrideSrc)return;
  if(!confirm('恢复该机型的默认整机图？'))return;
  rb.disabled=true;
  var xhr=new XMLHttpRequest();xhr.open('POST',RST_URL,true);
  xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;rb.disabled=false;
   applyImg('');toggleResetBtn();};
  xhr.onerror=function(){rb.disabled=false;applyImg('');toggleResetBtn();};
  xhr.send();
 };
}
/* s64: 硬件加速 HNAT 数据(替换原「运行时间」卡)。走 devpop?k=hnat(本地 ubus 读
   turboacc 的 PPE 表 + Full Cone / FastPath 类型), 5 秒一轮缓存进 HNAT_D, render() 的
   卡片和 MRT_POP 的详情都读它。不占串口、不联网。 */
var HNAT_D=null;
var HNAT_URL='/cgi-bin/luci/admin/fancontrol/devpop';
function hnatFetch(){XHR.get(HNAT_URL,{k:'hnat'},function(x,d){if(d&&typeof d==='object'){HNAT_D=d;window.MRT_HNAT=d;}});}

/* s64: 智能 HQoS 的前端(状态轮询 + 配置浮窗 + hqosOpen/Save 等)已整体撤除。
   原因:当前专有 mtkhnat 驱动没接通 DSCP→QDMA 队列绑定, 往 qdma_txq 写限速是空转
   (实测下载 200M 不限), 会误导用户。后端 fancontrol 的 hqos_get/hqos_set 入口留着不动,
   eqos 包也保留, 等拿到联发科完整 QoS SDK 把"按流绑队列"补上后, 把这段 UI 接回来即可。 */

function start(){poll();setInterval(poll,1800);startPreview();initDevImg();hnatFetch();setInterval(function(){if(!document.hidden){hnatFetch();}},5000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

;
/* s107: 首屏就按整站深浅给 .P 定色(不等 onload), 免得浅色下先闪一下深色 */(function(){try{if(window.MwrtTheme&&document.documentElement.getAttribute('data-darkmode')!=='true')document.getElementById('P').classList.add('L');}catch(e){}})();
;
(function(){var b=document.getElementById("ph-btn");if(!b)return;var busy=false;function sync(){var u=window.MwrtUi;if(u&&u.phone===1)b.hidden=false}function openNow(){var p=window.MwrtPhone;if(p&&typeof p.open==="function"){try{p.open()}catch(e){}return true}return false}b.addEventListener("click",function(e){e.preventDefault();if(openNow()||busy)return;var u=window.MwrtUi,src=u&&typeof u.phoneSrc==="string"?u.phoneSrc:"";if(!src){b.hidden=true;return}busy=true;var s=document.createElement("script");s.src=src+(src.indexOf("?")<0?"?":"&")+"t="+Math.floor(Date.now()/3600000);s.async=true;s.onload=function(){busy=false;if(!openNow())b.hidden=true};s.onerror=function(){busy=false;b.hidden=true;if(s.parentNode)s.parentNode.removeChild(s)};(document.head||document.documentElement).appendChild(s)});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync);else sync();window.addEventListener("load",sync)})();
;

/* s125 PC 且右栏展开时, 产品图右上角的工具键(#dv-tools)搬进右栏头部 .dv-acts 与拨号/向导/日夜同排; 手机宽度回产品图右上角; 右栏收起右栏时这排按钮留在原位(s129)。按钮都按 id 取, 搬家不影响各自的浮窗和状态 */
(function(){
 var mq=window.matchMedia('(min-width:769px)');
 function place(){
  var t=document.getElementById('dv-tools'),a=document.querySelector('#P .dv-acts'),s=document.querySelector('#P .dv-stage'),b=document.querySelector('#P .dv-body');
  if(!t||!a||!s||!b)return;
  var want=mq.matches?a:s;
  if(t.parentNode===want)return;
  if(want===a)a.insertBefore(t,a.firstChild);else s.appendChild(t);
 }
 place();
 if(mq.addEventListener)mq.addEventListener('change',place);else if(mq.addListener)mq.addListener(place);
 var b=document.querySelector('#P .dv-body');
 if(b&&window.MutationObserver)new MutationObserver(place).observe(b,{attributes:true,attributeFilter:['class']});
})();

;

(function(){
 function $(i){return document.getElementById(i);}
 function open(chat){
  var m=$('rpw');if(!m)return;
  var w=$('wfm');
  if(w&&w.parentNode&&m.parentNode!==w.parentNode)w.parentNode.insertBefore(m,w);
  var host=document.querySelector('.main-right')||$('maincontent'),left=0;
  if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
  m.style.setProperty('--wfm-l',left+'px');
  try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
  if(chat&&window.MRT_RC_FOCUS)window.MRT_RC_FOCUS();
  m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  var b=$('dv-rp');if(b)b.classList.add('on');
  try{if(window.MRT_RP_REFRESH)window.MRT_RP_REFRESH();}catch(e){}
  try{if(window.MRT_RC_SYNC)window.MRT_RC_SYNC();}catch(e){}
  if(!chat){var x=$('rpw-x');if(x)try{x.focus({preventScroll:true});}catch(e){}}
 }
 function close(){
  var m=$('rpw');if(!m||!m.classList.contains('open'))return;
  m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';
  var b=$('dv-rp');if(b){b.classList.remove('on');try{b.focus({preventScroll:true});}catch(e){}}
  try{if(window.MRT_RC_SYNC)window.MRT_RC_SYNC();}catch(e){}
 }
 document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  if(t.closest('#dv-rp')){e.preventDefault();var m=$('rpw');if(m&&m.classList.contains('open'))close();else open(false);return;}
  if(t.closest('#rpw-x')){close();return;}
  if(t.id==='rpw')close();
 });
 document.addEventListener('keydown',function(e){
  var m=$('rpw');if(e.key==='Escape'&&m&&m.classList.contains('open'))close();
 });
 window.MRT_RP={open:open,close:close};
 /* 通知卡/外链 设置页 #mwrt-chat 深链: 首页同样认, 直接弹出本窗并聚焦输入框 */
 function hashGo(){
  if(location.hash!=='#mwrt-chat')return;
  open(true);
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
 }
 window.addEventListener('hashchange',hashGo);
 if(document.readyState==='complete')setTimeout(hashGo,0);else window.addEventListener('load',function(){setTimeout(hashGo,0);});
})();

;

(function(){
  var $=function(i){return document.getElementById(i)};
  var RPU="/cgi-bin/luci/admin/mwrtrepair/";
  function TOKV(){return (window.L&&L.env&&L.env.token)||"";}
  function isOpen(){var o=$("rpw");return !!(o&&o.classList.contains("open"));}
  if(!$("rp")) return;
  var remain=0, tick=null, poll=null, busy=false;
  var ERR={no_frpc:"设备缺少远程协助组件，请联系维护人员处理",busy:"操作太快，请几秒后再试",nobin:"功能组件缺失，请联系维护人员",gen:"生成报修码失败，请重试",method:"请求被拒绝，请刷新页面后重试"};
  function say(t,c){var m=$("rp-msg");m.textContent=t||"";m.style.color=c||"";}
  function fmt(s){if(s<=0)return"已过期";var h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>0?(h+" 小时 "+m+" 分"):(m+" 分 "+(s%60)+" 秒");}
  function post(act,cb){
    var x=new XMLHttpRequest();
    x.open("POST",RPU+act,true);
    x.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
    x.timeout=20000;
    x.onreadystatechange=function(){if(x.readyState!==4)return;var r=null;try{r=JSON.parse(x.responseText)}catch(e){}cb(r);};
    x.send("token="+encodeURIComponent(TOKV()));
  }
  function get(cb){
    var x=new XMLHttpRequest();
    x.open("GET",RPU+"status"+"?_="+Date.now(),true);
    x.timeout=10000;
    x.onreadystatechange=function(){if(x.readyState!==4)return;var r=null;try{r=JSON.parse(x.responseText)}catch(e){}cb(r);};
    x.send();
  }
  function chip(t,c){var e=$("rp-chip");e.textContent=t;e.className="rp-chip"+(c?" "+c:"");}
  function render(r){
    if(!r||!r.ok){chip("异常","err");return;}
    var act=(r.state==="active");
    $("rp-idle").style.display=act?"none":"";
    $("rp-act").style.display=act?"":"none";
    if(r.state==="expired"){chip("已过期","err");say("上一个报修码已过期，需要的话请重新申请。","#c0392b");}
    if(!act){chip(r.state==="expired"?"已过期":"未开启",r.state==="expired"?"err":"");remain=0;stopTimers();return;}
    $("rp-code").textContent=r.code;
    remain=r.remain;
    var ttl=r.ttl||43200;
    $("rp-fill").style.width=Math.max(0,Math.min(100,remain*100/ttl))+"%";
    $("rp-left").textContent="剩余有效时间 "+fmt(remain);
    var d=$("rp-dot"),t=$("rp-sttxt");
    if(r.connected){chip("维护人员已连接","on");d.className="rp-dot on";t.textContent="维护人员已连接，正在协助处理。处理完成后可点「结束报修」。";}
    else if(r.error==="nonet"){chip("连接服务器失败","err");d.className="rp-dot err";t.textContent="连不上维护服务器，请检查设备的网络；网络恢复后会自动重连。";}
    else{chip("等待维护人员确认","wait");d.className="rp-dot";t.textContent="报修码已发出，等待维护人员输入确认…";}
    startTimers();
  }
  function startTimers(){
    if(!tick)tick=setInterval(function(){if(remain>0){remain--;$("rp-left").textContent="剩余有效时间 "+fmt(remain);}},1000);
    if(!poll)poll=setInterval(function(){if(isOpen())refresh();},4000);
  }
  function stopTimers(){if(tick){clearInterval(tick);tick=null;}if(poll){clearInterval(poll);poll=null;}}
  function refresh(){get(render);}
  function lock(v){busy=v;["rp-apply","rp-renew","rp-stop"].forEach(function(i){var e=$(i);if(e)e.disabled=v;});}
  function act(name,okmsg){
    if(busy)return;lock(true);say("请稍候…");
    post(name,function(r){
      lock(false);
      if(!r){say("操作失败：设备没有响应","#c0392b");return;}
      if(r.ok===false){say(ERR[r.error]||("操作失败："+r.error),"#c0392b");return;}
      say(okmsg,"#14a085");render(r);
    });
  }
  var NOTICE="点击确定后，本设备会主动连接维护服务器，维护人员输入报修码后可以远程查看并维护本设备。\n报修码 12 小时内有效，随时可以点「结束报修」断开。\n\n确定要申请故障处理吗？";
  $("rp-apply").onclick=function(){if(confirm(NOTICE))act("apply","报修码已生成，请把它发给维护人员。");};
  $("rp-renew").onclick=function(){if(confirm("重新生成后，旧的报修码会立刻作废，并断开已有连接。\n确定重新生成吗？"))act("apply","已生成新的报修码，旧码已作废。");};
  $("rp-stop").onclick=function(){if(confirm("结束后会立即断开维护人员的连接，报修码作废。\n确定结束报修吗？"))act("stop","报修已结束，连接已断开。");};
  $("rp-copy").onclick=function(){
    var t=$("rp-code").textContent;
    function ok(){say("报修码已复制："+t,"#14a085");}
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(ok,function(){say("复制失败，请手动选中报修码复制","#c0392b");});}
    else{var a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy");ok();}catch(e){say("复制失败，请手动选中报修码复制","#c0392b");}document.body.removeChild(a);}
  };
  window.MRT_RP_REFRESH=refresh;
  refresh();
})();

;

(function(){
  var $=function(i){return document.getElementById(i)};
  var RPU="/cgi-bin/luci/admin/mwrtrepair/";
  if(!$("rc")) return;
  var MAXC=500,MAXL=12,GAP=300;
  var ERR={empty:"消息不能为空",toolong:"消息太长，最多 500 字、12 行",full:"本次会话的消息数量已达上限",rate:"发送太快了，请稍后再试",ended:"本次报修已结束，无法再发送",nocode:"本次报修已结束，无法再发送",nonet:"连不上维护服务器，请稍后重试",busy:"请求过于频繁，请稍后重试",cid:"发送失败，请重试",nobin:"功能组件缺失，请联系维护人员",method:"请求被拒绝，请刷新页面后重试"};
  var QUICK=["设备无法上网","WiFi 连不上","网速很慢","页面打不开","请联系我"];
  var S={code:"",last:0,srv:[],loc:[],ids:{},peerRead:0,online:false,link:false,state:"none",active:false,seen:0,acked:0,ackAt:0,fails:0,auth:false,inflight:false,fast:false,timer:null,stick:true,dirty:true,tipT:null,loaded:false,needEnter:false,divAt:0,scrollTo:"",nodes:{},built:false,focusIn:false,copyT:null};
  var Q=[],qBusy=false,ackBusy=false;
  var baseTitle=document.title.replace(/^\(\d+\)\s/,"");

  /* 静态图标(只放固定 SVG 路径，不含任何消息文本) */
  var IC={
    check:'<path d="M20 6 9 17l-5-5"/>',
    check2:'<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    spin:'<path d="M21 12a9 9 0 1 1-6.2-8.55"/>',
    warn:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    retry:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    down:'<path d="M12 5v14M19 12l-7 7-7-7"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    head:'<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M20 20c0 1.5-2 2-5 2"/>'
  };
  function svg(n,sz,sw){return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(sw||2)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';}
  function ico(n,sz){var s=document.createElement("span");s.className="rc-i";s.innerHTML=svg(n,sz||14);return s;}

  /* 空状态插画(固定 SVG，颜色走 CSS 类) */
  var ILL={
    chat:'<svg class="rc-ill" viewBox="0 0 168 110" aria-hidden="true"><ellipse class="tint" cx="84" cy="60" rx="76" ry="44"/><rect class="bub" x="18" y="18" width="78" height="34" rx="12"/><rect class="ln" x="30" y="29" width="50" height="5" rx="2.5"/><rect class="ln" x="30" y="38" width="32" height="5" rx="2.5"/><rect class="acc" x="64" y="62" width="88" height="34" rx="12"/><rect class="lnw" x="76" y="73" width="58" height="5" rx="2.5"/><rect class="lnw" x="76" y="82" width="38" height="5" rx="2.5"/><g class="dots"><circle class="acc2" cx="116" cy="29" r="3"/><circle class="acc2" cx="127" cy="29" r="3"/><circle class="acc2" cx="138" cy="29" r="3"/></g></svg>',
    wait:'<svg class="rc-ill" viewBox="0 0 168 110" aria-hidden="true"><ellipse class="tint" cx="84" cy="60" rx="76" ry="44"/><circle class="ring" cx="84" cy="52" r="28"/><circle class="acc" cx="84" cy="52" r="26"/><g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(70 38) scale(1.17)"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M20 20c0 1.5-2 2-5 2"/></g><rect class="dash" x="40" y="86" width="88" height="16" rx="8"/><g class="dots"><circle class="acc2" cx="74" cy="94" r="2.6"/><circle class="acc2" cx="84" cy="94" r="2.6"/><circle class="acc2" cx="94" cy="94" r="2.6"/></g></svg>',
    done:'<svg class="rc-ill" viewBox="0 0 168 110" aria-hidden="true"><ellipse class="tint" cx="84" cy="60" rx="76" ry="44"/><rect class="bub" x="34" y="20" width="100" height="62" rx="14"/><rect class="ln" x="50" y="34" width="52" height="5" rx="2.5"/><rect class="ln" x="50" y="44" width="36" height="5" rx="2.5"/><circle class="acc" cx="118" cy="76" r="17"/><path d="m110 76 6 6 11-12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function lsGet(k){try{return window.localStorage.getItem(k)}catch(e){return null}}
  function lsSet(k,v){try{window.localStorage.setItem(k,v)}catch(e){}}
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
  function p2(n){return n<10?"0"+n:""+n}
  function hm(ts){var d=new Date(ts*1000);return p2(d.getHours())+":"+p2(d.getMinutes());}
  function dkey(ts){var d=new Date(ts*1000);return d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate();}
  function dlabel(ts){
    var d=new Date(ts*1000),n=new Date();
    var a=new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime(),b=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
    var diff=Math.round((a-b)/86400000);
    if(diff===0)return"今天";if(diff===1)return"昨天";
    if(d.getFullYear()===n.getFullYear())return(d.getMonth()+1)+"月"+d.getDate()+"日";
    return d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日";
  }
  function nchars(s){return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"x").length;}
  function newCid(){
    var a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",s="w",i,v;
    try{v=new Uint8Array(11);window.crypto.getRandomValues(v);for(i=0;i<11;i++)s+=a.charAt(v[i]%62);}
    catch(e){s="w";for(i=0;i<11;i++)s+=a.charAt(Math.floor(Math.random()*62));}
    return s;
  }
  function pageVis(){return !document.hidden;}
  /* 卡片真正可见：皮肤用 visibility:hidden + data-tab-active=false 隐藏未选中的标签页(offsetParent 仍非空)，三项都要查 */
  function cardVis(){var o=$("rpw");return !!(o&&o.classList.contains("open"));}
  function fmtCode(c){return c.length===8?c.slice(0,4)+"-"+c.slice(4):c;}

  /* ---- 网络 ---- */
  function req(method,act,body,timeout,cb){
    var x=new XMLHttpRequest(),u=RPU+act,done=false;
    if(method==="GET")u+="?"+body+"&_="+Date.now();
    x.open(method,u,true);
    if(method==="POST")x.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
    x.timeout=timeout;
    function fin(){if(done)return;done=true;var r=null;try{r=JSON.parse(x.responseText)}catch(e){}cb(r,x.status);}
    x.onreadystatechange=function(){if(x.readyState===4)fin();};
    x.ontimeout=fin;x.onerror=fin;
    x.send(method==="POST"?body:null);
  }
  function tok(){return "token="+encodeURIComponent((window.L&&L.env&&L.env.token)||"");}

  /* ---- 数据 ---- */
  function seenKey(){return "mwrt.rc.seen."+S.code;}
  function loadSeen(){S.seen=parseInt(lsGet(seenKey())||"0",10)||0;S.acked=S.seen;}
  function resetAll(){S.srv=[];S.loc=[];S.ids={};S.last=0;S.peerRead=0;S.seen=0;S.acked=0;S.stick=true;S.dirty=true;S.divAt=0;S.loaded=false;S.built=false;S.nodes={};$("rc-list").innerHTML="";Q=[];}
  function addSrv(m){
    if(!m||typeof m.id!=="number"||m.id<=0||S.ids[m.id])return false;
    if(m.side!=="dev"&&m.side!=="adm"&&m.side!=="sys")return false;
    S.ids[m.id]=1;S.srv.push({id:m.id,ts:m.ts||0,side:m.side,text:String(m.text==null?"":m.text),cid:m.cid||""});
    if(m.side==="dev"&&m.cid){for(var i=0;i<S.loc.length;i++){if(S.loc[i].cid===m.cid){S.loc.splice(i,1);break;}}}
    return true;
  }
  function byId(a,b){return a.id-b.id;}
  function maxAdm(){var n=0;for(var i=0;i<S.srv.length;i++){if(S.srv[i].side==="adm"&&S.srv[i].id>n)n=S.srv[i].id;}return n;}
  function firstUnread(){
    for(var i=0;i<S.srv.length;i++){if(S.srv[i].side==="adm"&&S.srv[i].id>S.seen)return S.srv[i].id;}
    return 0;
  }
  function unread(){
    if(S.state!=="approved")return 0;
    var n=0;for(var i=0;i<S.srv.length;i++){if(S.srv[i].side==="adm"&&S.srv[i].id>S.seen)n++;}
    return n;
  }
  function apply(r){
    var code=r.code||"";
    if(code&&S.code&&code!==S.code){resetAll();S.code=code;loadSeen();S.fast=true;paint();return;}
    if(code&&!S.code){S.code=code;loadSeen();}
    var ms=r.msgs||[],add=false,i;
    for(i=0;i<ms.length;i++){if(addSrv(ms[i]))add=true;}
    if(add){S.srv.sort(byId);S.dirty=true;}
    if(typeof r.last==="number"&&r.last>S.last)S.last=r.last;
    if(S.peerRead!==r.peer_read){S.peerRead=r.peer_read||0;S.dirty=true;}
    S.online=!!r.peer_online;S.link=!!r.link;S.active=!!r.active;
    if(S.state!==r.state){S.state=r.state||"none";S.dirty=true;}
    S.loaded=true;
    syncVis(true); /* 页面直接停在本页签(LuCI 记住了上次的页签)时没有点击事件，靠轮询兜底发现「变为可见」 */
    if(S.needEnter&&cardVis()&&pageVis())enterNow();
    else if(add&&S.state==="approved"&&!S.divAt&&cardVis()&&pageVis()&&!nearBottom())S.divAt=firstUnread();
    paint();
  }

  /* ---- 进入页签：定位到第一条未读，并画「以下为新消息」分隔线 ---- */
  function enterNow(){
    S.needEnter=false;
    if(S.code)S.seen=Math.max(S.seen,parseInt(lsGet(seenKey())||"0",10)||0);
    S.divAt=S.state==="approved"?firstUnread():0;
    S.scrollTo=S.divAt?"div":"bottom";
    S.stick=!S.divAt;S.dirty=true;
    if(S.focusIn){S.focusIn=false;focusInput();}
  }
  function focusInput(){
    var t=$("rc-ta");
    try{if(!t.disabled)t.focus({preventScroll:true});else $("rc-list").focus({preventScroll:true});}catch(e){}
  }

  /* ---- 轮询 ---- */
  function interval(){
    if(S.fails>=3)return 5000;
    if(!(pageVis()&&cardVis()))return(S.state==="none"||!S.state)?15000:6000;
    return S.state==="none"?3000:1500;
  }
  function schedule(ms){clearTimeout(S.timer);S.timer=setTimeout(poll,ms==null?interval():ms);}
  function poll(){
    if(S.inflight)return;
    S.inflight=true;
    req("GET","chat","since="+S.last,8000,function(r,st){
      S.inflight=false;
      if(!r||r.ok!==true){S.fails++;S.auth=(st===401||st===403);paint();schedule();return;}
      S.fails=0;S.auth=false;
      apply(r);
      if(S.fast){S.fast=false;schedule(0);}else schedule();
    });
  }

  /* ---- 已读：页面在前台、卡片可见且滚到底才记 ---- */
  function nearBottom(){var b=$("rc-list");if(!b.clientHeight)return S.stick;return b.scrollHeight-b.scrollTop-b.clientHeight<48;}
  function markSeen(){
    if(!(pageVis()&&cardVis()&&nearBottom()&&S.state==="approved"))return;
    var m=maxAdm();
    if(m>S.seen){S.seen=m;if(S.code)lsSet(seenKey(),String(m));}
    if(S.seen>S.acked&&!ackBusy&&Date.now()-S.ackAt>3000){
      ackBusy=true;var id=S.seen;S.ackAt=Date.now();
      req("POST","chat_ack",tok()+"&id="+id,10000,function(r){ackBusy=false;if(r&&r.ok&&id>S.acked)S.acked=id;});
    }
  }

  /* ---- 渲染 ---- */
  function mkDay(ts){var d=el("div","rc-day");d.appendChild(el("span",null,dlabel(ts)));return d;}
  function mkSys(text){var d=el("div","rc-sys"),s=el("span");s.appendChild(ico("info",13));s.appendChild(el("span",null,text));d.appendChild(s);return d;}
  function mkDivider(){var d=el("div","rc-divider");d.setAttribute("role","separator");d.appendChild(el("span",null,"以下为新消息"));return d;}
  function mkEmpty(){
    var d=el("div","rc-empty"),k=S.state==="pending"?"wait":S.state==="ended"?"done":"chat",t,s,ul;
    d.innerHTML=ILL[k];
    if(S.state==="approved"){t="向维护人员描述问题";s="写下遇到的现象和出现的时间，维护人员上线后会第一时间回复；离线时的留言也不会丢。";}
    else if(S.state==="pending"){t="等待维护人员放行";s="请把下面的报修码发给维护人员，放行后这里就能在线沟通。";}
    else if(S.state==="ended"){t="本次报修已结束";s="这次报修没有聊天记录。如仍需帮助，可以重新申请故障处理。";}
    else{t="还没有开启在线沟通";s="先点击「申请故障处理」，维护人员放行后即可在线沟通。";}
    d.appendChild(el("div","rc-et",t));d.appendChild(el("div","rc-ed",s));
    if(S.state==="pending"&&S.code){
      d.appendChild(el("div","rc-ecode",fmtCode(S.code)));
      ul=el("ul","rc-steps");["把报修码发给维护人员","等待放行","开始在线沟通"].forEach(function(x){ul.appendChild(el("li",null,x));});
      d.appendChild(ul);
    }
    return d;
  }
  function mkRow(m,g){
    var mine=m.side==="dev",ed=m.st==="failed";
    var row=el("div","rc-row "+(mine?"mine":"adm")+(g.start?" first":" cont")+(g.end?" end":" more")+(m.st==="sending"?" sending":"")+(ed?" failed":""));
    var col=el("div","rc-col"),line=el("div","rc-line");
    if(!mine&&g.start)col.appendChild(el("div","rc-name","维护人员"));
    if(!mine){var av=el("div","rc-mav"+(g.end?"":" sp"));if(g.end)av.innerHTML=svg("head",16);line.appendChild(av);}
    line.appendChild(el("div","rc-bub",m.text));
    col.appendChild(line);
    if(g.end||ed){
      var meta=el("div","rc-meta"),st;
      if(g.end)meta.appendChild(el("span",null,hm(m.ts)));
      if(mine){
        if(m.st==="sending"){st=el("span","rc-st sendi");st.appendChild(ico("spin",12));st.appendChild(el("span",null,"发送中"));meta.appendChild(st);}
        else if(ed){
          st=el("span","rc-st bad");st.appendChild(ico("warn",12));st.appendChild(el("span",null,"发送失败"));meta.appendChild(st);
          var rb=el("button","rc-retry");rb.type="button";rb.setAttribute("data-retry",m.cid);rb.setAttribute("aria-label","重新发送这条消息");
          rb.appendChild(ico("retry",13));rb.appendChild(el("span",null,"重发"));meta.appendChild(rb);
        }else if(g.end){
          var rd=m.id>0&&m.id<=S.peerRead;
          st=el("span","rc-st"+(rd?" read":""));st.appendChild(ico(rd?"check2":"check",13));st.appendChild(el("span",null,rd?"已读":"已发送"));meta.appendChild(st);
        }
      }
      col.appendChild(meta);
    }
    row.appendChild(col);return row;
  }
  /* 按 key 复用节点：只有真正变化的节点才重建，直播区域只会读到新增内容，也不会重放入场动画 */
  function build(){
    var box=$("rc-list"),items=S.srv.concat(S.loc),i,m,prev,next,out=[],real=0,g;
    function same(a,b){return a&&b&&a.side===b.side&&a.side!=="sys"&&dkey(a.ts)===dkey(b.ts)&&Math.abs(b.ts-a.ts)<=GAP;}
    for(i=0;i<items.length;i++){
      m=items[i];prev=items[i-1];next=items[i+1];
      if(!prev||dkey(prev.ts)!==dkey(m.ts))out.push({k:"d:"+dkey(m.ts),s:dlabel(m.ts),mk:(function(t){return function(){return mkDay(t);};})(m.ts)});
      if(m.side==="sys"){out.push({k:"x:"+m.id,s:m.text,mk:(function(t){return function(){return mkSys(t);};})(m.text)});continue;}
      real++;
      if(m.id&&m.id===S.divAt&&S.state==="approved")out.push({k:"div",s:"1",mk:mkDivider});
      var cutP=m.id&&m.id===S.divAt;
      g={start:!same(prev,m)||cutP,end:!(same(m,next)&&!(next.id&&next.id===S.divAt))};
      out.push({k:"m:"+(m.cid||("i"+m.id)),s:[m.side,m.text,m.st||"",g.start?1:0,g.end?1:0,m.id>0&&m.id<=S.peerRead?"r":"",hm(m.ts)].join("|"),mk:(function(a,b){return function(){return mkRow(a,b);};})(m,g)});
    }
    if(!real)out.push({k:"empty",s:S.state+"|"+S.code,mk:mkEmpty});
    var keep=box.scrollTop,stick=S.stick||nearBottom(),nodes={},cur=box.firstChild,o,n,c;
    for(i=0;i<out.length;i++){
      o=out[i];c=S.nodes[o.k];
      if(c&&c.s===o.s)n=c.n;
      else{n=o.mk();if(S.built&&!c&&n.className&&n.className.indexOf("rc-row")===0)n.className+=" pop";}
      nodes[o.k]={s:o.s,n:n};
      if(n===cur)cur=cur.nextSibling;else box.insertBefore(n,cur);
    }
    while(cur){n=cur.nextSibling;box.removeChild(cur);cur=n;}
    S.nodes=nodes;S.built=S.loaded;
    var dv=S.scrollTo==="div"?box.querySelector(".rc-divider"):null;
    if(S.scrollTo==="div"&&dv){box.scrollTop=Math.max(0,dv.offsetTop-14);S.stick=false;}
    else if(stick||S.scrollTo==="bottom"){box.scrollTop=box.scrollHeight;}
    else box.scrollTop=keep;
    S.scrollTo="";
  }
  function setBanner(txt,cls){
    var b=$("rc-banner");
    if(!txt){b.style.display="none";$("rc-btxt").textContent="";return;}
    $("rc-btxt").textContent=txt;b.className="rc-banner"+(cls?" "+cls:"");
    $("rc-bico").innerHTML=svg(cls==="err"?"warn":"info",15);b.style.display="flex";
  }
  function over(){var v=$("rc-ta").value.replace(/^\s+|\s+$/g,"");return nchars(v)>MAXC||v.split("\n").length>MAXL;}
  function inputState(){
    var ta=$("rc-ta"),en=(S.state==="approved");
    ta.disabled=!en;
    $("rc-box").className="rc-box"+(en?"":" off");
    var chips=$("rc-quick").getElementsByTagName("button");for(var i=0;i<chips.length;i++)chips[i].disabled=!en;
    var sm=!!(window.matchMedia&&window.matchMedia("(max-width:560px)").matches);
    ta.placeholder=en?(sm?"输入消息":"输入消息，Enter 发送，Shift+Enter 换行"):S.state==="pending"?"放行后即可发送消息":S.state==="ended"?"本次报修已结束":"申请并放行后可发送消息";
    var v=ta.value.replace(/^\s+|\s+$/g,""),n=nchars(v),ln=v.split("\n").length,ov=over();
    $("rc-send").disabled=!(en&&v&&!ov);
    var c=$("rc-cnt"),show=ov||n>=MAXC*0.8||ln>=MAXL-1;
    c.textContent=ln>MAXL?"行数超过 "+MAXL+" 行":n+"/"+MAXC;
    c.className="rc-cnt"+(ov?" over":"");
    c.style.visibility=show?"visible":"hidden";
    $("rc-foot").className="rc-foot"+((show||$("rc-tip").textContent)?" on":"");
  }
  function updateBadge(){
    var n=unread(),vis=cardVis()&&pageVis();
    var tb=$("dv-rp");
    if(tb){
      tb.classList.toggle("dot",n>0&&!vis);
      tb.setAttribute("data-st",S.state||"none");
      tb.title=n>0?"故障报修（"+n+" 条新消息）":"故障报修";
    }
    document.title=(n>0&&!pageVis())?"("+n+") "+baseTitle:baseTitle;
    var f=$("rc-new");
    if(n>0&&cardVis()&&!nearBottom()){f.textContent="";f.appendChild(ico("down",14));f.appendChild(el("span",null,n+" 条新消息"));f.style.display="inline-flex";}else f.style.display="none";
  }
  function paint(){
    var sub=$("rc-sub"),dot=$("rc-dot"),code=$("rc-code");
    if(S.code){$("rc-codet").textContent=fmtCode(S.code);if(!S.copyT)$("rc-codei").innerHTML=svg("copy",13);code.style.display="";}else code.style.display="none";
    if(S.state==="approved"){
      if(S.link&&S.online){dot.className="rc-dot on";sub.textContent="在线";}
      else{dot.className="rc-dot";sub.textContent="离线，可留言";}
    }else if(S.state==="pending"){dot.className="rc-dot wait";sub.textContent="等待放行";}
    else if(S.state==="ended"){dot.className="rc-dot";sub.textContent="已结束";}
    else{dot.className="rc-dot";sub.textContent="未开启";}
    $("rc").setAttribute("data-state",S.state);
    if(S.auth)setBanner("登录已过期，请刷新页面后重新登录。","err");
    else if(S.fails>=3)setBanner("与设备的连接中断，正在重试…","");
    else if(S.state==="ended")setBanner("本次报修已结束，仅可查看记录。","end");
    else if(S.state==="approved"&&!S.link)setBanner("设备与维护服务器的连接暂时中断，正在重连，消息稍后会自动同步。","");
    else setBanner("","");
    if(S.dirty){S.dirty=false;build();}
    inputState();
    markSeen();
    updateBadge();
  }

  /* ---- 发送 ---- */
  function errText(r,st){
    if(r&&r.error&&ERR[r.error])return ERR[r.error];
    if(st===401||st===403)return"登录已过期，请刷新页面后重新登录";
    return"设备没有响应，请点「重发」";
  }
  function tip(t){$("rc-tip").textContent=t;clearTimeout(S.tipT);if(t)S.tipT=setTimeout(function(){tip("");inputState();},7000);}
  function pump(){
    if(qBusy||!Q.length)return;
    var m=Q.shift();qBusy=true;m.st="sending";S.dirty=true;paint();
    req("POST","chat_send",tok()+"&cid="+encodeURIComponent(m.cid)+"&text="+encodeURIComponent(m.text),30000,function(r,st){
      qBusy=false;
      var at=S.loc.indexOf(m);
      if(r&&r.ok&&r.msg&&r.msg.id>0){
        if(at>=0)S.loc.splice(at,1);
        r.msg.side="dev";
        if(addSrv(r.msg))S.srv.sort(byId);
        S.dirty=true;paint();schedule(0);
      }else if(at>=0){
        m.st="failed";tip(errText(r,st));S.dirty=true;paint();
      }
      pump();
    });
  }
  function send(){
    var ta=$("rc-ta");
    if(S.state!=="approved")return;
    var v=ta.value.replace(/^\s+|\s+$/g,"");
    if(!v||over())return;
    var m={id:0,ts:Math.floor(Date.now()/1000),side:"dev",text:v,cid:newCid(),st:"sending"};
    S.loc.push(m);ta.value="";ta.style.height="";tip("");
    S.stick=true;S.scrollTo="bottom";S.dirty=true;paint();
    Q.push(m);pump();
  }
  function retry(cid){
    for(var i=0;i<S.loc.length;i++){
      var m=S.loc[i];
      if(m.cid===cid&&m.st==="failed"){m.st="sending";tip("");S.dirty=true;paint();Q.push(m);pump();return;}
    }
  }

  /* ---- 事件 ---- */
  var ta=$("rc-ta");
  function resize(){ta.style.height="auto";ta.style.height=Math.max(40,Math.min(ta.scrollHeight,120))+"px";}
  ta.addEventListener("input",function(){resize();inputState();});
  ta.addEventListener("keydown",function(e){
    if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send();}
  });
  $("rc-send").onclick=send;
  $("rc-list").addEventListener("scroll",function(){S.stick=nearBottom();markSeen();updateBadge();});
  $("rc-list").addEventListener("click",function(e){
    var t=e.target,c=null;
    while(t&&t!==this){if(t.getAttribute&&t.getAttribute("data-retry")){c=t.getAttribute("data-retry");break;}t=t.parentNode;}
    if(c)retry(c);
  });
  $("rc-new").onclick=function(){var b=$("rc-list");S.stick=true;b.scrollTop=b.scrollHeight;markSeen();updateBadge();};
  $("rc-code").onclick=function(){
    var c=S.code;if(!c)return;
    function ok(){
      var b=$("rc-code");b.className="rc-code done";$("rc-codei").innerHTML=svg("check",13);
      clearTimeout(S.copyT);S.copyT=setTimeout(function(){S.copyT=null;b.className="rc-code";$("rc-codei").innerHTML=svg("copy",13);},1600);
    }
    function legacy(){
      var t=document.createElement("textarea");t.value=c;t.setAttribute("readonly","");t.style.cssText="position:fixed;left:-999px;top:0;opacity:0";
      document.body.appendChild(t);t.select();
      try{if(document.execCommand("copy"))ok();}catch(e){}
      document.body.removeChild(t);
    }
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(c).then(ok,legacy);return;}}catch(e){}
    legacy();
  };
  var qb=$("rc-quick");
  QUICK.forEach(function(t){
    var b=el("button","rc-chip",t);b.type="button";b.disabled=true;
    b.onclick=function(){
      if(ta.disabled)return;
      var v=ta.value.replace(/\s+$/,"");
      ta.value=v?v+" "+t:t;resize();inputState();ta.focus();
    };
    qb.appendChild(b);
  });
  var wasVis=false;
  function syncVis(quiet){
    var v=cardVis()&&pageVis();
    if(v&&!wasVis){
      if(S.loaded)enterNow();else S.needEnter=true;
      paint();if(quiet!==true)schedule(0);
    }else if(!v&&wasVis){S.divAt=0;S.dirty=true;}
    wasVis=v;updateBadge();
  }
  document.addEventListener("visibilitychange",syncVis);
  ["rp-apply","rp-renew","rp-stop"].forEach(function(i){
    var e=$(i);
    if(e)e.addEventListener("click",function(){setTimeout(function(){schedule(0);},1500);setTimeout(function(){schedule(0);},4000);});
  });
  window.addEventListener("pagehide",function(){document.title=baseTitle;});

  window.MRT_RC_SYNC=function(){syncVis();};
  window.MRT_RC_FOCUS=function(){S.focusIn=true;};

  paint();syncVis();schedule(0);
})();

;

/* 固件横幅的「检查更新」/ NEW 标。后端是 rpcd luci.mwrt-ota(在线更新页同一套):
     latest —— 只读缓存, 打开首页时调, 不联网。缓存由手动检查或每小时那条 cron
               (开了自动检查才真去查)写入, 所以"自动检查发现新版"也会在这里亮 NEW;
     check  —— 点按钮时调, 现查服务器并刷新缓存。
   页面上别的 toast() 在另一个闭包里拿不到, 这里直接操作同一个 #mrt-toast。 */
(function(){
var ERR={nonet:'无法连接更新服务器，请检查网络后重试。',unknown_board:'无法识别本机机型，暂不支持在线更新。',no_ca:'缺少更新服务器证书。'};
var busy=false,LAST=null;
function say(m){var t=document.getElementById('mrt-toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(say.t);say.t=setTimeout(function(){t.classList.remove('show');},4000);}
function sizeTxt(n){return n?(Math.round(n/1048576*10)/10+' MB'):'未知大小';}

/* s141 在线更新浮窗：下载 → 自动 sha256 校验 → 手动确认刷机。
   服务端四个接口分工见 controller 里 ota_* 的注释；这里只负责把状态画出来。
   拒绝升级的三种情况都会明说原因（没清单 / 大小不符 / sha 不符），不静默。 */
function otaOpen(){
	var MXF=window.MXF;if(!MXF)return;
	var r=LAST||{};
	var b=MXF.open('固件更新','下载后自动校验 sha256 · 刷机需手动确认','fas fa-cloud-arrow-down');
	if(!b)return;
	b.innerHTML=
		'<div class="mxf-top"><span>本地</span><b>'+MXF.esc(r.local||'--')+'</b><i>线上 '+MXF.esc(r.version||'--')+'</i></div>'
		+'<div class="mxf-sec"><div class="mxf-h">下载加速<i>访问不了 github.com 时打开</i></div>'
		+'<div class="mxf-acc">'
		+'<label class="mxf-c ota-sw"><input type="checkbox" id="ota-acc-on"><span>启用 GitHub 下载加速</span></label>'
		+'<select id="ota-acc-sel" class="mxf-sel">'
		+'<option value="gh-proxy.com">gh-proxy.com（默认）</option>'
		+'<option value="ghproxy.net">ghproxy.net</option>'
		+'<option value="githubproxy.cc">githubproxy.cc</option>'
		+'<option value="__custom">自定义</option>'
		+'</select>'
		+'<input id="ota-acc-url" class="mxf-inp" placeholder="https://你的加速节点/" hidden>'
		+'</div></div>'
		+'<div class="mxf-sec"><div class="mxf-h">升级包<i>'+sizeTxt(r.size)+'</i></div>'
		+'<div class="mxf-bar"><i id="ota-bar"></i></div>'
		+'<div class="mxf-note" id="ota-note">点「下载升级包」开始</div></div>'
		+'<div class="mxf-foot">'
		+'<button type="button" class="mxf-btn" data-act="dl">下载升级包</button>'
		+'<button type="button" class="mxf-btn ghost" data-act="flash" disabled>立即升级（重启）</button>'
		+(r.url?'<a class="mxf-btn ghost" href="'+MXF.esc(r.url)+'" target="_blank" rel="noopener">发布页</a>':'')
		+'</div>';

	var bar=b.querySelector('#ota-bar'),note=b.querySelector('#ota-note');
	var flashBtn=b.querySelector('[data-act="flash"]'),dlBtn=b.querySelector('[data-act="dl"]');
	var accOn=b.querySelector('#ota-acc-on'),accSel=b.querySelector('#ota-acc-sel'),accUrl=b.querySelector('#ota-acc-url');

	/* 加速设置记住上次的选择（和 SimAdmin 的 OTA 页同一套三个节点 + 自定义） */
	var ACC_KEY='mwrt-ota-accel';
	function accLoad(){
		var s=null;try{s=JSON.parse(localStorage.getItem(ACC_KEY)||'null');}catch(e){}
		if(s&&typeof s==='object'){
			accOn.checked=!!s.on;
			if(s.node)accSel.value=s.node;
			if(s.url)accUrl.value=s.url;
		}
		accSync();
	}
	function accSave(){
		try{localStorage.setItem(ACC_KEY,JSON.stringify({on:accOn.checked,node:accSel.value,url:accUrl.value}));}catch(e){}
	}
	function accSync(){accUrl.hidden=(accSel.value!=='__custom');}
	function accPrefix(){
		if(!accOn.checked)return '';
		if(accSel.value==='__custom'){
			var u=(accUrl.value||'').trim();
			if(!/^https?:\/\/[A-Za-z0-9._~:\/\[\]-]+$/.test(u))return '';
			return u.replace(/\/$/,'')+'/';
		}
		return 'https://'+accSel.value+'/';
	}
	accSel.addEventListener('change',function(){accSync();accSave();});
	accOn.addEventListener('change',accSave);
	accUrl.addEventListener('change',accSave);
	accLoad();

	function setNote(t,c){note.textContent=t;note.className='mxf-note '+(c||'');}
	function setPct(p){bar.style.width=Math.max(0,Math.min(100,p))+'%';}
	function get(u,p,cb){XHR.get('/cgi-bin/luci/admin/fancontrol/'+u,p||{},function(x,d){cb(d||{});});}
	function verify(){
		setNote('正在校验 sha256…','warn');
		get('ota_verify',{},function(d){
			if(d.ok){setNote('校验通过（'+String(d.sha||'').slice(0,12)+'…），可以升级','ok');flashBtn.disabled=false;}
			else if(d.error==='nosums')setNote('发布页没有 SHA256SUMS，拒绝升级','bad');
			else if(d.error==='size')setNote('大小不符（'+d.got+' / '+d.total+'），请重新下载','bad');
			else setNote('sha256 不匹配，升级包已损坏，请重新下载','bad');
		});
	}
	function poll(){
		get('ota_progress',{},function(d){
			if(d.state==='error'){
				/* curl 6/7/28 = 域名解析不了 / 连不上 / 超时。本机这张卡的移动网络
				   直连 github.com 是不通的（api.github.com 却通），所以要明说。 */
				var rc=String(d.rc||'');
				var why=(rc==='6'||rc==='7'||rc==='28')
					? '连不上下载服务器（直连 github.com 被网络阻断）'
					: ('下载失败（curl '+rc+'）');
				setNote(why+'。打开上面的「下载加速」再试，或改用电脑下载后手动上传','bad');
				dlBtn.disabled=false;dlBtn.textContent='重新下载';
				return;
			}
			if(d.state==='done'){setPct(100);verify();return;}
			setPct(d.total>0?(d.got/d.total*100):0);
			setNote('已下载 '+sizeTxt(d.got)+' / '+sizeTxt(d.total));
			setTimeout(poll,800);
		});
	}
	b.addEventListener('click',function(e){
		var btn=e.target.closest?e.target.closest('[data-act]'):null;if(!btn||btn.disabled)return;
		var act=btn.getAttribute('data-act');
		if(act==='dl'){
			dlBtn.disabled=true;dlBtn.textContent='下载中…';setPct(0);
			var acc=accPrefix();
			setNote(acc?('正在通过 '+acc+' 下载…'):'正在直连 GitHub…');
			get('ota_download',{accel:acc},function(d){
				if(!d.ok){setNote('下载启动失败：'+((d&&d.error)||'未知'),'bad');dlBtn.disabled=false;dlBtn.textContent='重新下载';return;}
				poll();
			});
		}else if(act==='flash'){
			if(!btn._ok){btn._ok=1;btn.textContent='确认升级？再点一次';setTimeout(function(){btn._ok=0;btn.textContent='立即升级（重启）';},4000);return;}
			btn.disabled=true;btn.textContent='正在升级…';
			get('ota_install',{},function(d){
				if(d.ok)setNote('已开始升级，设备即将重启，约 60 秒后自动回到本页','ok');
				else{btn.disabled=false;btn._ok=0;btn.textContent='立即升级（重启）';setNote('升级未执行：'+((d&&d.error)||'未知'),'bad');}
			});
		}
	});
}
function rpc(method){
	/* s140: 原来 declare 的是 rpcd 的 luci.mwrt-ota —— SY108 上根本没有这个对象，
	   点「检查更新」必然 reject。改成打本包的 /fancontrol/ota_check，服务端去查
	   GitHub Releases（公开仓库，免 token），latest 那个调用带 6 小时缓存。
	   s159: 把用户在 OTA 浮窗里选的加速节点也带过来，让检查更新走同一条路；
	   服务端会先试加速，失败自动降级直连。 */
	var acc='';
	try{
		var s=JSON.parse(localStorage.getItem('mwrt-ota-accel')||'null');
		if(s&&s.on)acc=s.url||s.node||'';
	}catch(e){}
	return new Promise(function(res,rej){
		XHR.get('/cgi-bin/luci/admin/fancontrol/ota_check',{what:method,accel:acc},function(x,d){
			if(d&&d.ok===true)res(d);else rej(new Error((d&&d.error)||'fail'));
		});
	});
}
function mark(r){
	LAST=r||null;
	var a=document.getElementById('fw-new'),v=document.getElementById('fw-new-v');
	if(!a)return;
	/* 服务端给的 version 已经是 GitHub 的 tag_name（自带 v），别再补一个 v */
	if(r&&r.update&&r.version){v.textContent=r.version;a.hidden=false;}
	else a.hidden=true;
}
function setBusy(on){
	var b=document.getElementById('fw-chk'),i=document.getElementById('fw-chk-i'),t=document.getElementById('fw-chk-t');
	if(!b)return;
	b.disabled=on;i.classList.toggle('fa-spin',on);t.textContent=on?'检查中…':'检查更新';
}
window.fwCheck=function(){
	if(busy)return;busy=true;setBusy(true);
	rpc('check').then(function(r){
		if(!r||!r.ok){var e=r&&r.error;say(ERR[e]||(/^http_/.test(e||'')?'更新服务器返回错误（'+e.replace('http_','')+'）。':'检查失败，请稍后重试。'));return;}
		mark(r);
		/* update 可能是 null（两边版本号不是一个体系，比如本地是手工热修戳）——
		   这种情况据实把两个版本号都报出来，不要硬说"已是最新" */
		if(r.update===true)say('发现新固件 '+r.version+'，点击 NEW 前往更新');
		else if(r.update===false)say('当前已是最新固件（'+r.version+'）');
		else say('线上最新 '+r.version+'，本地 '+((r.local_tag)||'未知')+' —— 版本号不可直接比较');
	}).catch(function(){say('检查失败，请稍后重试。');}).then(function(){busy=false;setBusy(false);});
};
function init(){rpc('latest').then(mark).catch(function(){});}
/* s141: NEW 徽标改成开「固件更新」浮窗（原来跳 admin/system/ota）；没有浮窗外壳时保持原链接 */
var na=document.getElementById('fw-new');
if(na)na.addEventListener('click',function(e){if(window.MXF){e.preventDefault();otaOpen();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

;

/* s49: 三个圆环(CPU 各核 / 内存明细 / CPU+WiFi 温度) + 设备总览"在线设备"格子(设备列表)的悬停浮层。
   原先内存卡用原生 title: 样式没法管, 而且 2 秒一轮重写 title 时鼠标停着的那个提示会一闪一闪。
   - 目标打 data-pop="cpu|mem|tmp|clients", 全页只有一个浮层 #ga-pop(挂在 #P 里, 主题变量才生效)。
     只认 key 不认元素: dv-meta 每 1.8 秒整段 innerHTML 重写, 格子元素每轮都是新的。
   - 防闪: 内容只在 HTML 串变了才重写(列表滚动位置保留), 位置偏差超过 1.5px 才挪
     (卡片 :hover 会抬 1px, 不让浮层跟着抖); 只淡入淡出, 不做位移动画。
   - 数据: CPU/内存/温度直接吃 dev() 那一轮 devinfo(MRT_DEV, 2 秒), 不另发请求;
     (s54 起 devinfo 也带 WiFi温度, 后端 10 秒缓存, 是圆环的默认值)
     各频段 WiFi 温度、全部温区和设备列表只在浮层开着时拉 devpop, 3 秒一次, 收起就停。
   - 鼠标停 120ms 才弹(划过不弹), 移开 160ms 才收(留时间挪进浮层里滚列表);
     触屏点一下开、再点或点别处收; Esc 收。 */
(function(){
var POP_URL='/cgi-bin/luci/admin/fancontrol/devpop';
var pop=null,cur=null,html='',pos=null,showT=0,hideT=0,pollT=0,raf=0,lastPT='mouse',inflight={},cache={};
var TV=['--tc','--tb','--tc2'],BAND={'2.4G':1,'5G':1,'6G':1};
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
/* KiB → 486M / 1.5G / 0.3M */
function sz(k){k=+k||0;if(k<=0)return '0';var m=k/1024;return m>=1024?(m/1024).toFixed(1).replace(/\.0$/,'')+'G':(m<10?m.toFixed(1).replace(/\.0$/,''):Math.round(m))+'M';}
function ghz(m){return m>=1000?(m/1000).toFixed(1)+' GHz':m+' MHz';}
function bar(p,cls){p=Math.max(0,Math.min(100,+p||0));return '<span class="gp-b'+(cls?' '+cls:'')+'"><i style="width:'+p.toFixed(1)+'%"></i></span>';}
/* 温度分档和温度圆环同一套: >70 红, >50 琥珀, 其余青 */
function tcls(t){return t>70?'t-hot':t>50?'t-warm':'t-ok';}
function head(icon,title,right){return '<div class="gp-h"><i class="fas '+icon+'" aria-hidden="true"></i>'+title+(right?'<span>'+right+'</span>':'')+'</div>';}
function note(k,msg){return '<span class="gp-k">'+k+'</span><span class="gp-n" style="grid-column:2/-1">'+msg+'</span>';}

function rCpu(d){
 var cs=d["CPU各核"],tot=parseInt(d["CPU占用"]),o=head('fa-microchip','处理器',isNaN(tot)?'':'总 '+tot+'%');
 if(!Array.isArray(cs)||!cs.length)return o+'<div class="gp-n">暂无各核数据</div>';
 var fq={};cs.forEach(function(c){fq[c.mhz||0]=1;});
 var same=Object.keys(fq).length===1,g='',f=[];
 cs.forEach(function(c){var u=+c.usage||0;g+='<span class="gp-k">核心 '+h(c.id)+'</span>'+bar(u)+'<span class="gp-v">'+u.toFixed(1)+'%'+(!same&&c.mhz?'<small>'+ghz(c.mhz)+'</small>':'')+'</span>';});
 if(same&&cs[0].mhz)f.push('主频 '+ghz(cs[0].mhz));
 if(d["系统负载"]&&d["系统负载"]!=='未知')f.push('负载 '+h(d["系统负载"]));
 return o+'<div class="gp-g">'+g+'</div>'+(f.length?'<div class="gp-f">'+f.join(' · ')+'</div>':'');
}
function rMem(d){
 var pm=d["物理内存"],sw=d["虚拟内存"],fr=parseInt(d["剩余内存百分比"]),g='',f='';
 var o=head('fa-memory','内存',isNaN(fr)?'':'剩余 '+fr+'%');
 if(pm&&pm.total>0){var u=pm.total-pm.avail;g+='<span class="gp-k">物理内存</span>'+bar(u/pm.total*100)+'<span class="gp-v">'+sz(u)+'<small>/ '+sz(pm.total)+'</small></span>';}
 if(sw&&sw.total>0){
  g+='<span class="gp-k">虚拟内存</span>'+bar(sw.used/sw.total*100,'c2')+'<span class="gp-v">'+sz(sw.used)+'<small>/ '+sz(sw.total)+'</small></span>';
  if(sw.zram_total>0)g+='<span class="gp-k gp-k2">zram 压缩</span>'+bar(sw.zram_used/sw.zram_total*100,'c2')+'<span class="gp-v gp-v2">'+sz(sw.zram_used)+' / '+sz(sw.zram_total)+'</span>';
  if(sw.disk_total>0)g+='<span class="gp-k gp-k2">SD 交换</span>'+bar(sw.disk_used/sw.disk_total*100,'c2')+'<span class="gp-v gp-v2">'+sz(sw.disk_used)+' / '+sz(sw.disk_total)+'</span>';
  f=sw.disk_used>0?'<div class="gp-f warn">zram 曾用满，SD 上有 '+sz(sw.disk_used)+' 换出页，用到时会慢一些</div>'
   :'<div class="gp-f">'+(sw.zram_used>0?'zram 实占物理内存 '+sz(sw.zram_mem)+' · ':'')+'先用 zram，满了才写 SD</div>';
 }
 return o+(g?'<div class="gp-g">'+g+'</div>'+f:'<div class="gp-n">暂无数据</div>');
}
function rTmp(d){
 var t=parseInt(d["设备温度"]),wt=parseInt(d["WiFi温度"]),c=cache.tmp||{},p=c.d,rows=[],zr=[],g='';
 /* s54: 圆环默认显示 WiFi 温度, 浮层也把 WiFi 放第一行; 头部右侧和圆环是同一个数(WiFi 读不到才是 CPU) */
 var gv=!isNaN(wt)?wt:t;
 /* s140: 本机没有无线硬件时(wifi_hw===false)整条 WiFi 行连「未提供温度」的提示一起不出 ——
    主线 SY108 根本没网卡, 那行纯噪音(用户截图里它占着温度浮层第一行)。 */
 var hasWifi=!(p&&p.wifi_hw===false);
 if(hasWifi){
 if(p&&Array.isArray(p.wifi)&&p.wifi.length){
  /* 一颗芯片出几个频段, 读数相同就并成一行, 换成 devinfo 同一轮的数, 和圆环对得上 */
  var w=p.wifi,one=w.every(function(x){return x.temp===w[0].temp;});
  if(one)rows.push({k:'WiFi<small>'+w.map(function(x){return h(x.band);}).join(' · ')+'</small>',t:!isNaN(wt)?wt:+w[0].temp});
  else w.forEach(function(x){rows.push({k:'WiFi<small>'+h(x.band)+'</small>',t:+x.temp});});
 }else if(!isNaN(wt))rows.push({k:'WiFi',t:wt});
 }
 rows.forEach(function(r){g+='<span class="gp-k">'+r.k+'</span>'+bar(r.t,tcls(r.t))+'<span class="gp-v">'+r.t+'℃</span>';});
 if(!rows.length&&hasWifi)g+=note('WiFi',!p?(c.err?'读取失败':'读取中…'):'无线驱动未提供温度');
 /* 温区优先用 devpop 给的全部 thermal_zone; 名字用服务端翻好的 label(CPU0/5G 基带/主板…),
   没有 label 才退回 thermal_zoneN */
 if(p&&Array.isArray(p.zones)&&p.zones.length)zr=p.zones.map(function(z){return {k:h(z.label||z.name),t:+z.temp};});
 if(!zr.length&&!isNaN(t))zr.push({k:'CPU',t:t});
 zr.forEach(function(r){g+='<span class="gp-k">'+r.k+'</span>'+bar(r.t,tcls(r.t))+'<span class="gp-v">'+r.t+'℃</span>';});
 var fm=d["风扇模式"],fp=d["风扇转速百分比"];
 var f=fm&&fm!=='未知'?'<div class="gp-f">风扇 '+h(fm)+(fp!=null&&fp!==''?' · '+h(fp)+'%':'')+'</div>':'';
 return head('fa-thermometer-half','温度',isNaN(gv)?'':gv+'℃')+'<div class="gp-g">'+g+'</div>'+f;
}
function rCli(){
 var c=cache.clients||{},p=c.d;
 if(!p)return head('fa-network-wired','在线设备','')+'<div class="gp-n">'+(c.err?'读取失败，稍后重试':'读取中…')+'</div>';
 var l=Array.isArray(p.clients)?p.clients:[],o=head('fa-network-wired','在线设备',l.length+' 台');
 if(!l.length)return o+'<div class="gp-n">暂无在线设备</div>';
 return o+'<div class="gp-l">'+l.map(function(x){
  var wl=BAND[x.band],wd=x.band==='wired';
  return '<div class="gp-d"><i class="fas '+(wl?'fa-wifi':wd?'fa-ethernet':'fa-laptop')+'" aria-hidden="true"></i><div class="gp-dt">'+
   (x.name?'<b>'+h(x.name)+'</b>':'<b class="un">未命名设备</b>')+'<span>'+h(x.ip)+' · '+h(String(x.mac||'').toUpperCase())+'</span></div>'+
   (wl?'<span class="gp-tag">'+h(x.band)+'</span>':wd?'<span class="gp-tag wd">有线</span>':'')+'</div>';
 }).join('')+'</div>';
}
/* s63 第4项: 占用 CPU 的 TOP 进程。数据走 devpop?k=cputop(服务端 top -bn2 采样,
   只在浮层打开时 3 秒拉一次)。和温度/设备列表一样是"按需拉"的 need() 项。 */
function rCpuTop(){
 var c=cache.cputop||{},p=c.d;
 var right=p&&p.loadavg?p.loadavg:'';
 var o=head('fa-microchip','CPU 占用 TOP',right);
 if(!p)return o+'<div class="gp-n">'+(c.err?'读取失败，稍后重试':'采样中…')+'</div>';
 var l=Array.isArray(p.procs)?p.procs:[];
 if(!l.length)return o+'<div class="gp-n">暂无进程数据</div>';
 var mx=0;l.forEach(function(x){if((+x.cpu||0)>mx)mx=+x.cpu||0;});
 return o+'<div class="gp-g">'+l.map(function(x){
  var u=+x.cpu||0,w=mx>0?Math.round(u/mx*100):0;
  return '<span class="gp-k" title="PID '+h(x.pid)+'">'+h(x.cmd)+'</span>'+
   bar(w)+
   '<span class="gp-v">'+u+'%</span>';
 }).join('')+'</div><div class="gp-f">按此刻占用排序 · 两次采样间隔 1 秒</div>';
}
/* s63: 存储占用浮层 —— 各分区容量/已用/占用%(服务端 df -k, 按需拉)。
   和 CPU TOP 一样挂在悬停浮层里, 不占磁贴高度。 */
function rStorage(){
 var c=cache.storage||{},p=c.d;
 var o=head('fa-hdd','存储分区','');
 if(!p)return o+'<div class="gp-n">'+(c.err?'读取失败，稍后重试':'读取中…')+'</div>';
 var l=Array.isArray(p.parts)?p.parts:[];
 if(!l.length)return o+'<div class="gp-n">暂无分区数据</div>';
 /* 挂载点起个易懂的名字: / 是系统根, /overlay 是可写层(配置/插件都在这), 其余按挂载点显示 */
 function nm(m,fs){
  if(m==='/')return '系统根 /';
  if(m==='/overlay')return '可写层 overlay';
  if(m==='/rom')return '只读固件 /rom';
  if(m==='/boot')return '引导 /boot';
  return m||fs;
 }
 return o+'<div class="gp-g">'+l.map(function(x){
  var u=+x.pct||0;
  /* 已用/总量放到左列名字下面(gp-k 的 small), 右列只留占用%, 否则右列塞不下会溢出卡片 */
  return '<span class="gp-k" title="'+h(x.fs)+'">'+h(nm(x.mount,x.fs))+'<small>'+sz(x.used)+' / '+sz(x.total)+'</small></span>'+
   bar(u,u>=90?'t-hot':u>=70?'t-warm':'')+
   '<span class="gp-v">'+u+'%</span>';
 }).join('')+'</div><div class="gp-f">已用从大到小 · overlay 放配置和插件</div>';
}
/* s63: 活动连接浮层 —— 按对端(外网)IP 聚合的 TOP5, 回答"哪个 IP 占用最多连接"。
   内核 conntrack 只有 IP(没有 URL/域名), 所以列 IP + 连接数 + 常用端口, 不臆造域名。 */
function rConns(){
 var c=cache.conns||{},p=c.d;
 var right=p&&p.total!=null?(p.total+' 条'):'';
 var o=head('fa-project-diagram','活动连接 TOP5',right);
 if(!p)return o+'<div class="gp-n">'+(c.err?'读取失败，稍后重试':'读取中…')+'</div>';
 var l=Array.isArray(p.top)?p.top:[];
 if(!l.length)return o+'<div class="gp-n">暂无外部连接</div>';
 var mx=0;l.forEach(function(x){if((+x.count||0)>mx)mx=+x.count||0;});
 /* 常见端口 → 服务名, 让 IP 旁边有个人话标注(443=HTTPS 网站, 53=DNS 等) */
 function svc(port){var P={'443':'HTTPS','80':'HTTP','53':'DNS','22':'SSH','123':'NTP','3478':'STUN','8080':'HTTP','5228':'推送'};return P[String(port)]||(port?('端口 '+port):'');}
 return o+'<div class="gp-conn">'+l.map(function(x){
  var n=+x.count||0,w=mx>0?Math.round(n/mx*100):0,s=svc(x.port);
  return '<div class="gc" title="'+h(x.proto||'')+' '+h(x.ip)+'">'+
   '<div class="gc-top"><span class="gc-ip">'+h(x.ip)+(s?'<small>'+h(s)+'</small>':'')+'</span>'+
   '<span class="gc-n">'+n+'<small>条</small></span></div>'+
   bar(w,'c2')+
   '</div>';
 }).join('')+'</div><div class="gp-f">按对端外网 IP 聚合 · 内核仅提供 IP 无域名</div>';
}
/* s64: 硬件加速 HNAT 详情浮层。数据用页面那轮缓存的 window.MRT_HNAT(devpop?k=hnat)。
   列:加速引擎 / 全锥 NAT(游戏加速)/ 各 PPE 绑定表项占比, 末尾挂 USB 网卡通道 + 虚拟网卡名 HNAT 说明。 */
function rHnat(){
 /* s142 11-22: 详情浮层随磁贴改为「签约速率 / 承载等级」。
    数据 = window.MRT_HNAT (devpop?k=hnat, 弹窗开着时 3 秒一轮) 的 qos 字段。 */
 var p=window.MRT_HNAT||(cache.hnat&&cache.hnat.d);
 var o=head('fa-gauge-high','签约速率 · 承载等级','');
 function spdx(kb){kb=+kb||0;return kb>=1000000?(kb/1000000).toFixed(2)+' Gbps':(kb>=1000?(kb/1000)+' Mbps':(kb>0?kb+' Kbps':'--'));}
 if(!p)return o+'<div class="gp-n">读取中…</div>';
 var qo=p.qos;
 if(!qo||(!+qo.down_kbps&&!+qo.up_kbps))return o+'<div class="gp-n">'+h(p.state||'暂无承载信息')+'</div>';
 var lvl=(qo.kind==='5qi'?'5QI':'QCI')+' '+(qo.qci!=null?qo.qci:'--');
 var g='';
 g+='<span class="gp-k">签约下行</span>'+bar(Math.max(4,Math.min(100,Math.round(+qo.down_kbps/1000))))+'<span class="gp-v">'+spdx(qo.down_kbps)+'</span>';
 g+='<span class="gp-k">签约上行</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+spdx(qo.up_kbps)+'</span>';
 g+='<span class="gp-k">承载等级</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+h(lvl)+'<small>（'+(qo.kind==='5qi'?'5G QoS 标识':'4G 业务质量等级')+'）</small></span>';
 g+='<span class="gp-k">保证下行</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+spdx(qo.gbr_down)+'</span>';
 g+='<span class="gp-k">保证上行</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+spdx(qo.gbr_up)+'</span>';
 g+='<span class="gp-k">运营商</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+h(p.operator||'--')+(p.plmn?'<small>（'+h(p.plmn)+'）</small>':'')+'</span>';
 g+='<span class="gp-k">网络</span><span class="gp-v" style="grid-column:2/-1;text-align:left">'+h(p.rat_txt||'--')+(p.band?'<small> · band '+h(p.band)+'</small>':'')+'</span>';
 g+='<span class="gp-k">APN</span><span class="gp-v" style="grid-column:2/-1;text-align:left;word-break:break-all">'+h(p.apn||'--')+'</span>';
 return o+'<div class="gp-g">'+g+'</div>'+
  '<div class="gp-f">签约速率是运营商套餐允许的最大上下行（AMBR），实际速率受信号与基站负载影响；5QI/QCI 是这条数据承载的业务质量等级，数字越小优先级越高。</div>';
}
/* s71/s74: 产品图网口 / USB 的浮层 —— 直接吃 router3d-data 那一轮(MRT_R3D, 1.8 秒), 不另发请求 */
/* 字节 → 1.2 GB / 356 MB */
function bt(b){b=+b||0;var u=['B','KB','MB','GB','TB'],i=0;while(b>=1024&&i<4){b/=1024;i++;}return (i?b.toFixed(b<10?2:b<100?1:0):b)+' '+u[i];}
function mbps(v){v=+v||0;return v>=1000?(v/1000)+' Gbps':v>0?v+' Mbps':'';}
function kv(k,v){return '<span class="gp-k">'+k+'</span><span class="gp-v" style="grid-column:2/-1">'+v+'</span>';}
function io(dn,up,a,b){return '<span class="gp-io"><i class="fas fa-arrow-down" aria-hidden="true"></i>'+(a||'')+bt(dn)+'</span><span class="gp-io"><i class="fas fa-arrow-up" aria-hidden="true"></i>'+(b||'')+bt(up)+'</span>';}
var PROTO={dhcp:'DHCP 自动获取',pppoe:'PPPoE 拨号',static:'静态 IP',dhcpv6:'DHCPv6'};
function rEth(r){
 var d=window.MRT_R3D||{},p=(Array.isArray(d.ports)?d.ports:[]).filter(function(x){return (x.role==='WAN'?'WAN':'LAN')===r;})[0];
 var o=head('fa-ethernet',r+' 口',p?h(p.id):'');
 if(!p)return o+'<div class="gp-n">没有找到这个网口</div>';
 var on=+p.carrier===1,sp=+p.speed||0,eg=d.egress||{},g=[],tag='',f='';
 var isEg=r==='WAN'&&eg.kind==='wired'&&(eg.dev===p.id||/^pppoe/.test(eg.dev||''));
 if(r==='WAN')tag=isEg?'<span class="gp-tag">当前上网出口</span>':on?'<span class="gp-tag wd">备用线路</span>':'';
 else tag='<span class="gp-tag">局域网</span>';
 o+='<div class="gp-sp">'+(on?'<b>'+(mbps(sp)||'已连接')+'</b><small>'+(p.dup==='full'?'全双工':p.dup==='half'?'半双工':'')+'</small>':'<b class="off">未接网线</b>')+tag+'</div>';
 if(r==='WAN'){
  g.push(kv('接入方式',h(PROTO[d.wan_proto]||d.wan_proto||'--')));
  g.push(kv('WAN 地址','<span class="gp-mono">'+h(d.wan_addr||'未获取')+'</span>'));
  if(isEg&&eg.gw)g.push(kv('网关','<span class="gp-mono">'+h(eg.gw)+'</span>'));
  g.push(kv('累计流量',io(p.rx,p.tx)));
 }else{
  g.push(kv('路由器地址','<span class="gp-mono">'+h(d.lan_ip||'--')+(+d.lan_pfx?'/'+(+d.lan_pfx):'')+'</span>'));
  g.push(kv('在线设备',(+d.clients||0)+' 台'));
  g.push(kv('累计流量',io(p.tx,p.rx)));
 }
 if(p.mac)g.push(kv('MAC','<span class="gp-mono">'+h(String(p.mac).toUpperCase())+'</span>'));
 g.push(kv('插线次数','本次开机 '+(+p.cnt||0)+' 次'));
 if(on&&sp>0&&sp<1000)f='<div class="gp-f warn">协商速率低于千兆：请检查网线是否为超五类及以上、水晶头是否压好，或对端设备是否只支持百兆。</div>';
 else f='<div class="gp-f">'+(r==='WAN'?'WAN 口连接上级网络（光猫或上级路由）':'LAN 口连接下级设备')+'，数据随设备图实时刷新。</div>';
 return o+'<div class="gp-g">'+g.join('')+'</div>'+f;
}
var USPD={1:'低速 · 1.5 Mbps',12:'全速 · 12 Mbps',480:'高速 · 480 Mbps',5000:'超高速 · 5 Gbps',10000:'超高速 · 10 Gbps',20000:'超高速 · 20 Gbps'};
function rUsb(){
 var d=window.MRT_R3D||{},l=Array.isArray(d.usb)?d.usb:[],U=window.MRT_USB||{T:{},ver:function(){return '';},cap:function(){return '';}};
 var NR=U.role||function(){return '';},o=head('fa-plug','USB 口',l.length>1?l.length+' 台设备':'');
 if(!l.length)return o+'<div class="gp-n">USB 口未接入设备</div>';
 var warn='',camDone=0,audDone=0,anyAud=l.some(function(x){return x.type==='audio';});
 return o+l.map(function(u){var t=U.T[u.type]||U.T.other||['fas fa-plug','USB 设备'],v=U.ver(u.speed),c=U.cap(u.mb),ch=[],g=[];
  /* 外接 USB 口上认出来的蜂窝模组都是装在 USB 转接板上的 */
  var lb=u.type==='modem'?'USB 转接板模组':t[1],cam=u.type==='camera'||u.type==='video';
  ch.push('<span class="gp-chip">'+h(lb)+'</span>');
  if(v)ch.push('<span class="gp-chip">'+v+'</span>');
  if(c)ch.push('<span class="gp-chip n">'+c+'</span>');
  if(u.type==='hub')ch.push('<span class="gp-chip n">下挂 '+(+u.sub||0)+' 台</span>');
  var nm=u.name||u.mfr||lb;
  if(NR(u))g.push(kv('角色',h(NR(u))+(u.dev?' · <span class="gp-mono">'+h(u.dev)+'</span>':'')));
  if(u.type==='tether'&&u.role==='tether')g.push(kv('状态','已自动设为上网出口'));
  else if(u.type==='nic'&&(u.role==='wan'||u.role==='pending'))g.push(kv('状态',u.role==='wan'?'已设为上网出口':'不选默认按 LAN'));
  if(u.type==='display')g.push(kv('状态','已识别显示适配器'));
  if(u.type==='capture')g.push(kv('类型','HDMI 采集卡（输入设备）'));
  if(+u.speed||!(u.type==='nic'||u.type==='tether'))g.push(kv('协商速率',h(USPD[+u.speed]||mbps(u.speed)||'--')));
  if(c)g.push(kv('容量',c));
  if(u.vid||u.pid)g.push(kv('设备 ID','<span class="gp-mono">'+h(u.vid+':'+u.pid)+'</span>'));
  if(u.bus)g.push(kv('总线位置','<span class="gp-mono">'+h(u.bus)+'</span>'));
  if(+u.speed===480&&(u.type==='storage'||u.type==='net'))warn='设备工作在 USB 2.0：如果它支持 3.0，检查线材或转接头是否为 USB 3.0。';
  return '<div class="gp-ud"><i class="'+t[0]+'" aria-hidden="true"></i><div class="gp-dt"><b>'+h(nm)+'</b><span>'+h(u.mfr&&u.mfr!==nm?u.mfr:lb)+'</span></div></div>'+
   (cam&&!camDone&&(camDone=1)?'<div class="gp-cam" aria-label="摄像头预览"><img alt=""><span>正在打开摄像头…</span></div>':'')+
   (u.type==='audio'&&!audDone&&(audDone=1)?AUD.html(u):'')+
   '<div class="gp-chips">'+ch.join('')+'</div><div class="gp-g">'+g.join('')+'</div>';
 }).join('<div class="gp-sep"></div>')+(anyAud?'':AUD.entry())+(warn?'<div class="gp-f warn">'+warn+'</div>':'<div class="gp-f">插拔即时识别，只读系统信息，不占用设备。</div>');
}
function paint(k){var d=window.MRT_DEV||{};return k==='audio'?'<div class="gp-sc">'+rAudio()+'</div>':k==='usb'?'<div class="gp-sc">'+rUsb()+'</div>':k==='eth-WAN'?rEth('WAN'):k==='eth-LAN'?rEth('LAN'):k==='cpu'?rCpu(d):k==='mem'?rMem(d):k==='tmp'?rTmp(d):k==='cputop'?rCpuTop():k==='storage'?rStorage():k==='conns'?rConns():k==='hnat'?rHnat():rCli();}
/* s91 声卡设置浮层(产品图右上角喇叭键): 只放声卡这一块 —— 设备名片 + 音量/麦克风/波形 + 音乐播放器入口。USB 浮层里的同一块不动 */
function rAudio(){
 var d=window.MRT_R3D||{},l=Array.isArray(d.usb)?d.usb:[],U=window.MRT_USB||{T:{}},u=null,i;
 for(i=0;i<l.length;i++)if(l[i]&&l[i].type==='audio'){u=l[i];break;}
 var t=U.T.audio||['fas fa-headphones','USB 声卡'],ico=t[0].replace(/^fas /,'');
 if(!u)return head(ico,'声卡','')+'<div class="gp-n">USB 声卡未接入</div>'+AUD.entry();
 var nm=u.name||u.mfr||t[1],v=U.ver?U.ver(u.speed):'';
 return head(ico,'声卡设置','')+
  '<div class="gp-ud"><i class="'+t[0]+'" aria-hidden="true"></i><div class="gp-dt"><b>'+h(nm)+'</b><span>'+h(u.mfr&&u.mfr!==nm?u.mfr:t[1])+'</span></div></div>'+
  (v?'<div class="gp-chips"><span class="gp-chip">'+t[1]+'</span><span class="gp-chip">'+v+'</span></div>':'')+AUD.html(u);
}
function need(k){return k==='tmp'||k==='clients'||k==='cputop'||k==='storage'||k==='conns'||k==='hnat';}
var curEl=null;
function target(k){if(curEl&&curEl.isConnected&&curEl.getAttribute('data-pop')===k)return curEl;return document.querySelector('[data-pop="'+k+'"]');}

/* 上一次没回来就不叠发; 回调万一没来(断网之类), 8 秒后放行 */
function fetchK(k){
 var now=Date.now();if(inflight[k]&&now-inflight[k]<8000)return;inflight[k]=now;
 XHR.get(POP_URL,{k:k},function(x,d){
  inflight[k]=0;var c=cache[k]||(cache[k]={});
  if(d&&typeof d==='object'){c.d=d;c.err=0;}else c.err=1;
  if(cur===k)render();
 });
}
function ensure(){
 if(pop)return;
 pop=document.createElement('div');pop.className='gp';pop.id='ga-pop';pop.setAttribute('role','tooltip');
 (document.getElementById('P')||document.body).appendChild(pop);AUD.wire(pop);
}
function place(t){
 var r=t.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight,w=pop.offsetWidth,ph=pop.offsetHeight,G=8,M=8,nv=document.getElementById('mwrt-bottomnav'),nq=nv&&nv.getBoundingClientRect();
 if(nq&&nq.height&&nq.top>vh/2&&nq.top<vh)vh=Math.round(nq.top);
 var pe=document.getElementById('P'),x0=Math.max(M,pe?Math.round(pe.getBoundingClientRect().left)+M:M);
 /* 浮层挂在 #P 里, 左边的侧栏层级比它高; 横向下限取内容区左沿, 否则贴左的浮层会被侧栏盖掉一截 */
 var x=Math.max(x0,Math.min(Math.round(r.left+r.width/2-w/2),vw-w-M));
 /* 优先放在目标下方, 下方放不下且上方空间更大才翻到上方 */
 var y=(vh-r.bottom-G-M>=ph||vh-r.bottom>=r.top)?r.bottom+G:r.top-G-ph;
 y=Math.round(Math.max(M,Math.min(y,vh-ph-M)));
 if(!pos||Math.abs(pos[0]-x)>1.5||Math.abs(pos[1]-y)>1.5){pos=[x,y];pop.style.transform='translate('+x+'px,'+y+'px)';}
}
function render(){
 if(!cur)return;
 var t=target(cur);if(!t){close();return;}
 var s=paint(cur);
 if(s!==html){var l=pop.querySelector('.gp-l,.gp-sc'),st=l?l.scrollTop:0;pop.innerHTML=s;html=s;if(st&&(l=pop.querySelector('.gp-l,.gp-sc')))l.scrollTop=st;CAM.bind();AUD.apply();}
 /* 主色抄目标卡当下算好的值(温度卡会在 青/琥珀/红 之间换) */
 var cs=getComputedStyle(t);
 TV.forEach(function(v){var x=cs.getPropertyValue(v).trim();if(pop.style.getPropertyValue(v)!==x){if(x)pop.style.setProperty(v,x);else pop.style.removeProperty(v);}});
 place(t);
 AUD.sync();
}
function open(k){
 clearTimeout(showT);clearTimeout(hideT);hideT=0;ensure();
 if(cur!==k){
  cur=k;html='';pos=null;pop.classList.toggle('gp-wide',k==='clients'||k==='conns'||k==='storage'||k==='hnat');
  clearInterval(pollT);pollT=need(k)?setInterval(function(){fetchK(k);},3000):0;
  if(pollT)fetchK(k);
 }
 render();
 if(cur)pop.classList.add('on');
 AUD.sync();
}
/* s84 摄像头悬停预览: 进入浮层 250ms 后 POST camstart, 成功后每 1 秒换一张 camframe;
   浮层关闭 / 内容里没有预览区(设备拔出) / 页面隐藏 都立刻 POST camstop 并清定时器。
   st: 0 空闲 / 2 已发 camstart / 3 出画中 / 4 打开失败(提示留在预览区, 关浮层才复位)。gen 用来作废在途的 camstart 回包。 */
var CAM_URL={start:'/cgi-bin/luci/admin/modem/camstart',frame:'/cgi-bin/luci/admin/modem/camframe',stop:'/cgi-bin/luci/admin/modem/camstop'};
var CAM_ERR={nocam:'没有找到摄像头',busy:'摄像头正被其他程序占用',nobin:'系统里没有安装摄像头抓帧工具',fail:'摄像头打开失败'};
var CAM={st:0,gen:0,deb:0,tick:0,msg:'',
 tok:function(){return (window.L&&L.env&&L.env.token)||'';},
 post:function(u,cb){var x=new XMLHttpRequest();x.open('POST',u,true);x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
  x.onreadystatechange=function(){if(x.readyState!==4||!cb)return;var r=null;try{r=JSON.parse(x.responseText);}catch(e){}cb(x.status,r);};
  x.send('token='+encodeURIComponent(CAM.tok()));},
 box:function(){return pop&&pop.querySelector('.gp-cam');},
 say:function(t){CAM.msg=t;var b=CAM.box();if(!b)return;var e=b.querySelector('span'),i=b.querySelector('img');e.textContent=t;e.style.display=t?'':'none';if(t)i.style.display='none';},
 frame:function(){var b=CAM.box();if(!b||CAM.st!==3)return;var i=b.querySelector('img');
  i.onload=function(){i.style.display='block';CAM.say('');};
  i.onerror=function(){CAM.say('没有画面');};
  i.src=CAM_URL.frame+'?t='+Date.now();},
 start:function(){CAM.deb=0;if(!CAM.box()||cur!=='usb'){CAM.st=0;return;}
  var g=++CAM.gen;CAM.st=2;
  CAM.post(CAM_URL.start,function(code,r){
   if(g!==CAM.gen){CAM.post(CAM_URL.stop);return;}
   if(r&&r.ok){CAM.st=3;CAM.frame();CAM.tick=setInterval(CAM.frame,1000);}
   else{CAM.st=4;CAM.say(CAM_ERR[r&&r.error]||(code===403?'会话已过期，请刷新页面':'摄像头打开失败'));}
  });},
 stop:function(){clearTimeout(CAM.deb);CAM.deb=0;clearInterval(CAM.tick);CAM.tick=0;CAM.gen++;
  var was=CAM.st;CAM.st=0;CAM.msg='';if(was>=2)CAM.post(CAM_URL.stop);},
 bind:function(){
  if(!CAM.box()||cur!=='usb'){if(CAM.st||CAM.deb)CAM.stop();return;}
  if(!CAM.st&&!CAM.deb){CAM.say('正在打开摄像头…');CAM.deb=setTimeout(CAM.start,250);return;}
  if(CAM.msg)CAM.say(CAM.msg);
  if(CAM.st===3)CAM.frame();}
};
document.addEventListener('visibilitychange',function(){if(document.hidden&&CAM.st+CAM.deb)close();});
window.addEventListener('pagehide',function(){if(CAM.st>=2&&navigator.sendBeacon){try{navigator.sendBeacon(CAM_URL.stop,new Blob(['token='+encodeURIComponent(CAM.tok())],{type:'application/x-www-form-urlencoded'}));}catch(e){}CAM.st=0;}CAM.stop();});
/* s89 USB 声卡: 设备详情里的音量 / 输出波形 / 麦克风波形, 以及固定对话框 #mwa-dlg 音乐播放器。
   只用控制器的 audio_* 接口, 后端字符串写进 innerHTML 前一律 h() 转义, 页面里不依赖 cards[].card。
   轮询只在「USB 浮层里有声卡区块」或「播放器对话框打开」且页面可见时跑: audio_state 每 2 秒、audio_wave 每 300 毫秒(带 seq);
   gen 是代数, 停/起一次加 1, 在途回包带着旧代数回来就丢掉。波形由 rAF 按 50ms 一桶匀速滚动, 页面隐藏时不画。
   浮层内容里的声卡区块是不含动态值的固定标记(render() 的串比较不会因它重建 DOM), 所有数值都由 apply() 直接改节点。 */
var AU_URL={state:'/cgi-bin/luci/admin/modem/audio_state',wave:'/cgi-bin/luci/admin/modem/audio_wave',
 vol:'/cgi-bin/luci/admin/modem/audio_vol',mute:'/cgi-bin/luci/admin/modem/audio_mute',
 play:'/cgi-bin/luci/admin/modem/audio_play',ctl:'/cgi-bin/luci/admin/modem/audio_ctl',
 mic:'/cgi-bin/luci/admin/modem/audio_mic',upload:'/cgi-bin/luci/admin/modem/audio_upload',
 del:'/cgi-bin/luci/admin/modem/audio_del'};
var AUD=(function(){
 var A={gen:0,on:0,st:null,stAt:0,fail:0,sT:0,wT:0,raf:0,seq:0,sBusy:0,wBusy:0,hold:{},drag:null,dragAt:0,vt:{},errT:0,pstate:'',
  dlg:null,dlgOpen:0,opener:null,delId:'',delT:0,lsSig:'',up:null,mini:null,hasCard:false,mnSig:'',force:'',mode:'tv'};
 var CH={out:{q:[],h:[],acc:0,last:0,feed:0},mic:{q:[],h:[],acc:0,last:0,feed:0}};
 var EXT='.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.wma,.opus';
 /* 页面里的 Font Awesome 是裁剪过的子集(fa-plug / fa-times 等缺字形, 显示成豆腐块), 播放器的图标一律用内联 SVG */
 var IC={
  vol:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.3a8 8 0 0 1 0 11.4"/>',
  mute:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  play:'<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause:'<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  prev:'<path d="M7 5v14"/><path d="M19 5.5v13L9.5 12z" fill="currentColor"/>',
  next:'<path d="M17 5v14"/><path d="M5 5.5v13L14.5 12z" fill="currentColor"/>',
  up:'<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  del:'<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  wave:'<path d="M3 12h3l2-6 4 12 3-9 2 3h4"/>',
  hdd:'<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M5 14 7 5h10l2 9"/><circle cx="7.5" cy="17" r=".6" fill="currentColor"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>'};
 function ic(n,z){z=z||14;return '<svg viewBox="0 0 24 24" width="'+z+'" height="'+z+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+IC[n]+'</svg>';}
 function tok(){return (window.L&&L.env&&L.env.token)||'';}
 function xhr(method,url,body,cb){
  var x=new XMLHttpRequest();x.open(method,url,true);
  if(method==='POST')x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
  x.onreadystatechange=function(){if(x.readyState!==4)return;var r=null;try{r=JSON.parse(x.responseText);}catch(e){}cb(x.status,r);};
  x.send(body||null);return x;}
 function post(url,o,cb){var s='token='+encodeURIComponent(tok());for(var k in o)s+='&'+k+'='+encodeURIComponent(o[k]);
  xhr('POST',url,s,function(code,r){if(r&&r.ok){if(cb)cb(true,r);return;}
   var m=(r&&r.err)||(code===403?'会话已过期，请刷新页面':'操作失败，请稍后再试');showErr(m);if(cb)cb(false,r);});}
 function showErr(m){
  var l=[];if(pop)l=Array.prototype.slice.call(pop.querySelectorAll('.au-er'));if(A.dlg)l.push(A.dlg.querySelector('#mwa-err'));
  l.forEach(function(e){if(!e)return;e.textContent=m;e.hidden=!m;});
  clearTimeout(A.errT);if(m)A.errT=setTimeout(function(){showErr('');},4500);}
 function light(){return !!document.querySelector('.P.L');}
 function fmtT(s){s=Math.max(0,Math.floor(+s||0));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
 function fmtS(b){b=+b||0;return b>=1048576?(b/1048576).toFixed(1).replace(/\.0$/,'')+' MB':b>=1024?Math.round(b/1024)+' KB':b+' B';}
 /* 声卡区块只有在 USB 浮层真的开着时才算存在: 浮层收起后旧节点还留在 pop 里, 不能再当作"能看到开关" */
 function block(){return pop&&(cur==='usb'||cur==='audio')&&pop.classList.contains('on')&&pop.querySelector('[data-au]');}
 function card(bus){var cs=(A.st&&A.st.cards)||[],i;
  if(bus)for(i=0;i<cs.length;i++)if(cs[i].busid===bus)return cs[i];
  for(i=0;i<cs.length;i++)if(cs[i].play)return cs[i];return cs[0]||null;}
 function dragging(){return !!A.drag&&Date.now()-A.dragAt<20000;}

 /* ---------- 浮层里的固定标记 ---------- */
 var SPK=ic('vol',14);
 function htmlBlock(u){
  var row=function(k,lb,mu){return '<div class="au-r" data-r="'+k+'" hidden><span class="au-k">'+lb+'<em hidden>软件音量</em></span><span class="au-v">--</span>'+
   '<button type="button" class="au-mu" data-a="'+mu+'" aria-label="静音">'+ic('vol',13)+'</button>'+
   '<input type="range" class="au-rg" min="0" max="100" step="1" value="0" data-a="'+k+'" aria-label="'+lb+'" disabled></div>';};
  return '<div class="gp-au" data-au data-bus="'+h(u.bus||'')+'"><div class="au-m" hidden></div>'+row('pvol','播放音量','pmute')+row('cvol','麦克风音量','cmute')+
   '<div class="au-cv"><div class="au-lb"><span>输出波形</span><b data-o="pst"></b></div><canvas data-w="out" aria-label="输出波形"></canvas></div>'+
   '<div class="au-cv"><div class="au-lb"><span>麦克风波形</span><button type="button" class="au-sw" role="switch" aria-checked="false" data-a="mic" aria-label="开启麦克风监测" disabled><i></i></button></div>'+
   '<canvas data-w="mic" class="mic" aria-label="麦克风波形"></canvas><div class="au-sub" data-o="msub">只显示声音大小，不录音</div></div>'+
   '<div class="au-er" role="alert" hidden></div>'+
   '<button type="button" class="au-en" data-a="dlg">'+SPK+'<span>音乐播放器</span><b data-o="ppl"></b></button></div>';}
 function htmlEntry(){return '<button type="button" class="au-en solo" data-a="dlg">'+SPK+'<span>音乐播放器（需接入 USB 声卡）</span></button>';}

 /* ---------- 状态 → 界面 ---------- */
 function setRange(inp,pct,key){
  var lab=inp.parentNode.querySelector('.au-v');
  if(A.drag===inp||Date.now()<(A.hold[key]||0))return;
  pct=Math.max(0,Math.min(100,Math.round(+pct||0)));inp.value=pct;inp.style.setProperty('--p',pct+'%');if(lab)lab.textContent=pct+'%';}
 function setMute(btn,on,key){
  if(Date.now()<(A.hold[key]||0))return;
  btn.classList.toggle('off',!!on);btn.setAttribute('aria-pressed',on?'true':'false');
  btn.innerHTML=ic(on?'mute':'vol',13);}
 function applyRow(b,k,mu,v,msg){
  var r=b.querySelector('[data-r="'+k+'"]');if(!r)return;
  var on=!!(v&&!msg);r.hidden=!on;if(!on)return;
  var inp=r.querySelector('input'),em=r.querySelector('em');inp.disabled=false;
  setRange(inp,v.pct,k);setMute(r.querySelector('.au-mu'),v.mute,mu);if(em)em.hidden=v.hw!==false;}
 function applyPop(){
  var b=block();if(!b)return;var st=A.st,c=st&&card(b.getAttribute('data-bus')),msg='',m=b.querySelector('.au-m');
  if(!st)msg=A.fail>=2?'无法获取声卡状态，请稍后再试':'正在读取声卡状态…';
  else if(st.tools&&st.tools.alsa===false)msg='固件缺少播放组件';
  else if(!c)msg='还没找到可用的声卡，请稍候或重新插拔';
  m.textContent=msg;m.hidden=!msg;
  applyRow(b,'pvol','pmute',c&&c.pvol,msg);applyRow(b,'cvol','cmute',c&&c.cvol,msg);
  var sw=b.querySelector('.au-sw'),sub=b.querySelector('[data-o="msub"]'),cap=!!(c&&c.cap&&!msg);
  if(sw){sw.disabled=!cap;if(Date.now()>=(A.hold.mic||0)){var on=!!(cap&&st.mic&&st.mic.on);sw.setAttribute('aria-checked',on?'true':'false');}}
  if(sub)sub.textContent=msg?'':!c?'':!c.cap?'这块声卡没有麦克风输入':'只显示声音大小，不录音';
  var ps=b.querySelector('[data-o="pst"]'),pl=st&&st.player&&st.player.state,pp=b.querySelector('[data-o="ppl"]');
  if(ps)ps.textContent=pl==='playing'?'播放中':pl==='paused'?'已暂停':'';
  if(pp)pp.textContent=pl==='playing'?'播放中':pl==='paused'?'已暂停':'';
  if((cur==='usb'||cur==='audio')&&pop.classList.contains('on')){var t=target(cur);if(t)place(t);}}

 /* ---------- 波形 ---------- */
 function feed(ch,arr,now){var c=CH[ch];if(!Array.isArray(arr)||!arr.length)return;
  arr.slice(-40).forEach(function(v){c.q.push(Math.max(0,Math.min(100,+v||0)));});c.feed=now;if(c.q.length>80)c.q.splice(0,c.q.length-80);}
 function stepCh(c,now){
  if(!c.last)c.last=now;var dt=now-c.last;c.last=now;if(dt>250)dt=250;c.acc+=dt/50;
  while(c.acc>=1){
   if(c.q.length){c.h.push(c.q.shift());c.acc-=1;if(c.q.length>12){c.h.push(c.q.shift());}}
   else if(now-c.feed>900){c.h.push(0);c.acc-=1;}
   else{c.acc=0;break;}}
  if(c.h.length>300)c.h.splice(0,c.h.length-200);}
 function draw(cv,c,col){
  var cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
  var d=Math.min(window.devicePixelRatio||1,2),W=Math.round(cw*d),H=Math.round(ch*d);
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  var g=cv.getContext('2d');g.clearRect(0,0,W,H);
  var bw=2.5*d,st=4*d,n=Math.ceil(W/st)+2,sh=c.acc*st,mid=H/2,mx=H/2-2*d,i;
  g.fillStyle=col;
  for(i=0;i<n;i++){
   var idx=c.h.length-1-i,v=idx>=0?c.h[idx]:0,x=W-(i+1)*st-sh+(st-bw)/2;
   if(x+bw<0||x>W)continue;
   var hh=Math.max(1*d,Math.pow(v/100,0.7)*mx*2);
   g.globalAlpha=(v>0?0.45:0.5)+0.5*Math.max(0,Math.min(1,x/W))*(v>0?1:0.2);
   if(g.roundRect){g.beginPath();g.roundRect(x,mid-hh/2,bw,hh,Math.min(bw/2,hh/2));g.fill();}else g.fillRect(x,mid-hh/2,bw,hh);}
  g.globalAlpha=1;}
 /* s131 产品图背后的大波形: 第 i 根离中心 (i+acc)*st, 最新采样在正中; 两侧按距离衰减, 高度上下对称; 颜色横向 cb→ca→cb */
 function wvCol(cv){
  var p=document.getElementById('dv-wvp');if(!p)return null;
  var n=(cv.__wn=(cv.__wn||0)+1);if(cv.__wc&&n%24)return cv.__wc;
  var cs=getComputedStyle(p);cv.__wc=[cs.color,cs.borderTopColor];return cv.__wc;}
 /* wvFlow: 铺满背景的单向滚动频谱, 最新采样在右边, 随 c.acc 平滑左移 */
 function drawBg(cv,c,now){/*patch23 patch24 patch25*/
  var cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
  var d=Math.min(window.devicePixelRatio||1,2),W=Math.round(cw*d),H=Math.round(ch*d);
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  var g=cv.getContext('2d');g.clearRect(0,0,W,H);
  var co=wvCol(cv);if(!co)return;
  var st=7*d,bw=3*d,n=Math.ceil(W/st)+9,sh=c.acc*st,mid=H*0.5,mx=H*0.36,i,j,hs=[];
  for(i=0;i<n+8;i++){var idx=c.h.length-1-i,v=idx>=0?c.h[idx]:0;hs.push(Math.pow(v/100,0.72));}
  var sm=[];for(i=0;i<n+6;i++)sm.push((hs[i]*2+hs[i+1]+(i?hs[i-1]:hs[i]))/4);
  var gr=g.createLinearGradient(0,0,W,0);gr.addColorStop(0,co[0]);gr.addColorStop(0.34,'#22d3ee');gr.addColorStop(0.66,co[1]);gr.addColorStop(1,'#f472b6');
    for(i=0;i<n;i++){
   var x=W-(i+1)*st-sh+(st-bw)/2;if(x+bw<0||x>W)continue;
   var ev=Math.sin(Math.PI*Math.min(1,Math.max(0,(x+bw/2)/W))),hh=Math.max(1.6*d,sm[i]*mx*(0.45+0.55*Math.pow(ev,0.6)));
   var bg=g.createLinearGradient(0,mid-hh,0,mid+hh);bg.addColorStop(0,'rgba(255,255,255,0.16)');bg.addColorStop(0.5,'rgba(255,255,255,0.78)');bg.addColorStop(1,'rgba(255,255,255,0.16)');
   g.fillStyle=bg;
   if(g.roundRect){g.beginPath();g.roundRect(x,mid-hh,bw,hh*2,bw/2);g.fill();}else g.fillRect(x,mid-hh,bw,hh*2);
  }
  g.globalCompositeOperation='source-in';
  g.fillStyle=gr;g.fillRect(0,0,W,H);
  g.globalCompositeOperation='source-over';}
 function tick(now){
  A.raf=0;if(!A.on||document.hidden)return;
  stepCh(CH.out,now);stepCh(CH.mic,now);
  var lt=light(),co=lt?'#0891b2':'#22d3ee',cm=lt?'#db2777':'#f472b6';
  var l=[];if(pop)l=Array.prototype.slice.call(pop.querySelectorAll('canvas[data-w]'));
  if(A.dlgOpen&&A.dlg)l=l.concat(Array.prototype.slice.call(A.dlg.querySelectorAll('canvas[data-w]')));
  var wb=A.pillOn&&document.getElementById('dv-wvbg');if(wb&&wb.offsetParent)drawBg(wb,CH.out,now);
  if(miniVis()&&A.mini.getAttribute('data-t')==='full'){var mc=A.mini.querySelector('canvas');if(mc)l.push(mc);}
  l.forEach(function(cv){var k=cv.getAttribute('data-w');draw(cv,CH[k],k==='mic'?cm:co);});
  if(A.dlgOpen)prog(now);
  if(miniVis())progMini(now);
  A.raf=requestAnimationFrame(tick);}

 /* ---------- 轮询 ---------- */
 function pollState(){
  if(A.sBusy&&Date.now()-A.sBusy<6000)return;A.sBusy=Date.now();var g=A.gen;
  xhr('GET',AU_URL.state+'?_='+Date.now(),null,function(code,r){
   if(g!==A.gen)return;A.sBusy=0;
   if(r&&r.ok){A.st=r;A.stAt=performance.now();A.fail=0;}else A.fail++;
   apply();});}
 /* 空闲(没在播放、麦克风监测关着)时波形只是一条平线, 每秒拉一次就够; 有声音时回到 300 毫秒 */
 function wavBusy(){var p=A.st&&A.st.player;return A.pstate==='playing'||!!(p&&p.state==='playing')||!!(A.st&&A.st.mic&&A.st.mic.on);}
 function pollWave(){
  if(A.wBusy&&Date.now()-A.wBusy<4000)return;
  if(!wavBusy()&&A.wAt&&Date.now()-A.wAt<1000)return;
  A.wAt=Date.now();A.wBusy=Date.now();var g=A.gen;
  xhr('GET',AU_URL.wave+'?seq='+A.seq+'&_='+Date.now(),null,function(code,r){
   if(g!==A.gen)return;A.wBusy=0;if(!r||!r.ok)return;
   var now=performance.now();
   if(+r.seq<A.seq){CH.out.q=[];CH.mic.q=[];}
   A.seq=+r.seq||0;A.pstate=r.pstate||'';
   feed('out',r.out,now);
   if(r.micon)feed('mic',r.mic,now);else if(CH.mic.q.length)CH.mic.q=[];});}
 function want(){
  if(document.hidden)return false;
  return !!(A.dlgOpen||block()||A.pillOn||miniVis());}
 function miniVis(){var m=A.mini;return !!(m&&A.hasCard&&A.mode!=='tv'&&m.offsetParent&&m.getAttribute('data-t')!=='off');}
 function sync(){
  var w=want();
  if(w&&!A.on){A.on=1;A.gen++;A.fail=0;A.seq=0;A.sBusy=A.wBusy=A.wAt=0;CH.out.q=[];CH.mic.q=[];CH.out.last=CH.mic.last=0;
   pollState();pollWave();A.sT=setInterval(pollState,2000);A.wT=setInterval(pollWave,300);A.raf=requestAnimationFrame(tick);}
  else if(!w&&A.on)stop();
  /* 麦克风监测只在能看到开关的时候开着: 浮层收起(只剩对话框)也关 */
  if(A.on&&A.st&&A.st.mic&&A.st.mic.on&&!block())micOff();}
 function micOff(){if(A.st&&A.st.mic)A.st.mic.on=false;post(AU_URL.mic,{on:0});}
 function stop(){
  var mic=A.st&&A.st.mic&&A.st.mic.on;
  A.on=0;A.gen++;clearInterval(A.sT);clearInterval(A.wT);A.sT=A.wT=0;A.sBusy=A.wBusy=0;
  if(A.raf){cancelAnimationFrame(A.raf);A.raf=0;}
  if(mic)micOff();}
 function apply(){applyPop();applyMini();if(A.dlgOpen)applyDlg();}

 /* ---------- 浮层交互(挂在 pop 上, 只挂一次) ---------- */
 function onVol(inp){
  var k=inp.getAttribute('data-a'),v=+inp.value,kind=k==='pvol'?'play':'cap';
  A.hold[k]=Date.now()+1600;inp.style.setProperty('--p',v+'%');
  var lab=inp.parentNode.querySelector('.au-v');if(lab)lab.textContent=v+'%';
  clearTimeout(A.vt[k]);A.vt[k]=setTimeout(function(){post(AU_URL.vol,{kind:kind,pct:v},function(){A.hold[k]=Date.now()+1200;});},120);}
 function muteIc(t,on){t.classList.toggle('off',on);t.setAttribute('aria-pressed',on?'true':'false');t.innerHTML=ic(on?'mute':'vol',13);}
 function onClick(e){
  var t=e.target.closest&&e.target.closest('[data-a]');if(!t)return;var a=t.getAttribute('data-a');
  if(a==='pmute'||a==='cmute'){
   var k=a==='pmute'?'pvol':'cvol',kind=a==='pmute'?'play':'cap',on=!t.classList.contains('off');
   A.hold[a]=Date.now()+1600;muteIc(t,on);
   post(AU_URL.mute,{kind:kind,on:on?1:0},function(ok){if(!ok)muteIc(t,!on);A.hold[a]=Date.now()+1200;});}
  else if(a==='mic'){
   if(t.disabled)return;var on=t.getAttribute('aria-checked')!=='true';
   A.hold.mic=Date.now()+2500;t.setAttribute('aria-checked',on?'true':'false');
   if(!on)CH.mic.q=[];
   post(AU_URL.mic,{on:on?1:0},function(ok){if(!ok)t.setAttribute('aria-checked',on?'false':'true');else if(A.st){A.st.mic=A.st.mic||{};A.st.mic.on=on;}A.hold.mic=Date.now()+1200;});}
  else if(a==='dlg')openDlg(t);}
 function wire(p){
  if(p._au)return;p._au=1;
  p.addEventListener('input',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('au-rg'))onVol(t);});
  p.addEventListener('pointerdown',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('au-rg')){A.drag=t;A.dragAt=Date.now();}});
  p.addEventListener('click',onClick);}
 /* 拖滑块期间浮层不许因为指针滑出边缘而关闭; 松手时指针若已不在浮层/触发目标上, 补一次延时收起 */
 function endDrag(e){
  if(!A.drag)return;A.drag=null;
  var el=e&&e.target;if(pop&&el&&pop.contains(el))return;
  if(el&&el.closest&&el.closest('[data-pop]'))return;
  later();}

 /* ---------- 播放器对话框 ---------- */
 function build(){
  if(A.dlg)return A.dlg;
  var d=document.createElement('div');d.className='mwa-ov';d.id='mwa-dlg';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','mwa-t');d.setAttribute('aria-hidden','true');
  d.innerHTML='<div class="mwa-win" tabindex="-1">'+
   '<button type="button" class="mwa-x" data-a="close" aria-label="关闭">'+ic('x',15)+'</button>'+
   '<div class="mwa-hd"><span class="mwa-ico">'+SPK.replace('width="14" height="14"','width="21" height="21"')+'</span>'+
   '<div class="mwa-hdt"><div class="mwa-t" id="mwa-t">音乐播放器</div><div class="mwa-s" id="mwa-sub"></div></div></div>'+
   '<div class="mwa-wn" id="mwa-wn" hidden></div>'+
   '<div class="mwa-stage"><div class="mwa-bd" id="mwa-bd">'+
    '<div class="mwa-now"><div class="mwa-nm" id="mwa-nm">未在播放</div><div class="mwa-tm" id="mwa-tm"></div></div>'+
    '<div class="mwa-pg" id="mwa-pg"><i id="mwa-pgi"></i></div>'+
    '<div class="mwa-ct">'+
     '<button type="button" data-a="prev" aria-label="上一首">'+ic('prev',15)+'</button>'+
     '<button type="button" class="big" data-a="pp" id="mwa-pp" aria-label="播放">'+ic('play',18)+'</button>'+
     '<button type="button" data-a="stop" aria-label="停止">'+ic('stop',14)+'</button>'+
     '<button type="button" data-a="next" aria-label="下一首">'+ic('next',15)+'</button></div>'+
    '<div class="mwa-cv"><canvas data-w="out" aria-label="输出波形"></canvas></div>'+
    '<div class="mwa-sec">曲目</div>'+
    '<div class="mwa-ls" id="mwa-ls" role="listbox" aria-label="曲目列表"></div>'+
    '<div class="mwa-up"><button type="button" class="mwa-ub" data-a="upload" id="mwa-ub">'+ic('up',15)+'上传音乐</button>'+
     '<input type="file" id="mwa-file" accept="'+EXT+'" hidden><span class="mwa-um" id="mwa-um"></span></div>'+
    '<div class="mwa-upb" id="mwa-upb" hidden><i></i></div>'+
   '</div>'+
   '<div class="mwa-off" id="mwa-off" hidden><span class="mwa-oi">'+ic('mute',22)+'</span><b>接入 USB 声卡设备后支持播放</b><small>插入后这里会自动解锁</small></div></div>'+
   '<div class="mwa-err" id="mwa-err" role="alert" hidden></div></div>';
  document.body.appendChild(d);A.dlg=d;
  d.addEventListener('click',dlgClick);
  d.addEventListener('keydown',function(e){
   if(e.key==='Escape'){e.stopPropagation();closeDlg();return;}
   if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute&&e.target.getAttribute('data-a')==='trk'){e.preventDefault();playId(e.target.getAttribute('data-id'));}
   if(e.key==='Tab'){var f=Array.prototype.filter.call(d.querySelectorAll('button,[tabindex="0"]'),function(x){return !x.disabled&&x.offsetParent;});
    if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}});
  d.querySelector('#mwa-file').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];e.target.value='';if(f)upload(f);});
  return d;}
 function openDlg(opener){
  build();A.opener=opener||null;A.dlgOpen=1;A.lsSig='';
  if(window.MRT_OVBOX)window.MRT_OVBOX();
  A.dlg.classList.add('open');A.dlg.setAttribute('aria-hidden','false');
  A.dlg.classList.toggle('lt',light());document.documentElement.classList.add('mwa-lock');
  applyDlg();close();sync();
  var w=A.dlg.querySelector('.mwa-win');if(w)w.focus();}
 function closeDlg(){
  if(!A.dlgOpen)return;A.dlgOpen=0;A.dlg.classList.remove('open');A.dlg.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('mwa-lock');showErr('');sync();
  var o=A.opener;A.opener=null;if(o&&o.isConnected&&o.focus)try{o.focus();}catch(e){}}
 function idxOf(id){var ts=(A.st&&A.st.tracks)||[];for(var i=0;i<ts.length;i++)if(ts[i].id===id)return i;return -1;}
 function playId(id){if(!id)return;
  post(AU_URL.play,{id:id},function(ok){if(ok){A.sBusy=0;pollState();}});}
 function ctl(act){post(AU_URL.ctl,{act:act},function(ok){if(ok){A.sBusy=0;pollState();}});}
 function step(dir){var ts=(A.st&&A.st.tracks)||[];if(!ts.length)return;var p=A.st.player||{},i=idxOf(p.track||'');
  i=i<0?0:(i+dir+ts.length)%ts.length;playId(ts[i].id);}
 function togglePP(){var p=A.st&&A.st.player,s=p&&p.state;
  if(s==='playing')ctl('pause');else if(s==='paused')ctl('resume');
  else{var ts=(A.st&&A.st.tracks)||[];if(ts.length)playId(p&&p.track&&idxOf(p.track)>=0?p.track:ts[0].id);}}
 function dlgClick(e){
  if(e.target===A.dlg){closeDlg();return;}
  var t=e.target.closest&&e.target.closest('[data-a]');if(!t||t.disabled)return;var a=t.getAttribute('data-a');
  if(a==='close')closeDlg();
  else if(a==='prev')step(-1);else if(a==='next')step(1);
  else if(a==='stop')ctl('stop');
  else if(a==='pp')togglePP();
  else if(a==='trk')playId(t.getAttribute('data-id'));
  else if(a==='del'){var id=t.getAttribute('data-id');
   if(A.delId!==id){A.delId=id;A.lsSig='';applyDlg();clearTimeout(A.delT);A.delT=setTimeout(function(){A.delId='';A.lsSig='';if(A.dlgOpen)applyDlg();},3000);return;}
   A.delId='';clearTimeout(A.delT);A.lsSig='';post(AU_URL.del,{id:id},function(ok){A.sBusy=0;pollState();});}
  else if(a==='upload'){var f=A.dlg.querySelector('#mwa-file');if(f)f.click();}}
 function upload(f){
  var st=A.st||{},lim=st.limits||{},m=A.dlg.querySelector('#mwa-upb'),bar=m.firstChild;
  if(A.up)return;
  var ext=(f.name.match(/\.[^.]+$/)||[''])[0].toLowerCase();
  if(EXT.split(',').indexOf(ext)<0){showErr('不支持这种格式，只能上传 mp3、wav、flac、ogg、m4a、aac、wma、opus');return;}
  if(lim.file&&f.size>lim.file){showErr('文件太大了，单个不能超过 '+fmtS(lim.file));return;}
  if(st.free!=null&&f.size>st.free){showErr('剩余空间不够，还能放 '+fmtS(Math.max(0,st.free)));return;}
  var fd=new FormData();fd.append('token',tok());fd.append('file',f,f.name);
  var x=new XMLHttpRequest();A.up={x:x,pct:0};x.open('POST',AU_URL.upload,true);
  m.hidden=false;bar.style.width='0%';showErr('');applyDlg();
  x.upload.onprogress=function(ev){if(!ev.lengthComputable)return;A.up.pct=Math.round(ev.loaded*100/ev.total);bar.style.width=A.up.pct+'%';var u=A.dlg.querySelector('#mwa-um');if(u)u.textContent='正在上传 '+A.up.pct+'%';};
  x.onreadystatechange=function(){if(x.readyState!==4)return;var r=null;try{r=JSON.parse(x.responseText);}catch(e){}
   A.up=null;m.hidden=true;
   if(r&&r.ok){showErr('');A.sBusy=0;pollState();}
   else showErr((r&&r.err)||(x.status===403?'会话已过期，请刷新页面':x.status===413?'文件太大了':'上传失败，请稍后再试'));
   applyDlg();};
  x.send(fd);}
 function prog(now){
  var p=A.st&&A.st.player;if(!p||!A.dlg)return;var pos=+p.pos||0,dur=+p.dur||0;
  if(p.state==='playing')pos+=(now-A.stAt)/1000;if(dur>0)pos=Math.min(pos,dur);
  var tm=A.dlg.querySelector('#mwa-tm'),pg=A.dlg.querySelector('#mwa-pgi');
  var s=(p.state==='playing'||p.state==='paused')?fmtT(pos)+' / '+(dur>0?fmtT(dur):'--:--'):'';
  if(tm&&tm.textContent!==s)tm.textContent=s;
  if(pg)pg.style.width=(dur>0&&s?Math.max(0,Math.min(100,pos*100/dur)):0)+'%';}
 function applyDlg(){
  var d=A.dlg;if(!d)return;var st=A.st,c=st&&card(),p=(st&&st.player)||{},tools=(st&&st.tools)||{};
  d.classList.toggle('lt',light());
  var sub=d.querySelector('#mwa-sub'),off=d.querySelector('#mwa-off'),bd=d.querySelector('#mwa-bd'),wn=d.querySelector('#mwa-wn');
  var noTool=!!(st&&(tools.alsa===false||tools.ffmpeg===false)),noCard=!!(st&&!(st.cards&&st.cards.length)),loading=!st;
  sub.textContent=loading?(A.fail>=2?'无法获取声卡状态':'正在读取声卡状态…'):c?c.name+(c.busid?' · '+c.busid:''):'未接入 USB 声卡';
  wn.hidden=!noTool;wn.textContent=noTool?'固件缺少播放组件':'';
  var dis=loading||noCard||noTool;bd.classList.toggle('dis',dis);bd.setAttribute('aria-disabled',dis?'true':'false');
  off.hidden=!(noCard&&!noTool);
  Array.prototype.forEach.call(d.querySelectorAll('.mwa-bd button'),function(b){b.disabled=dis||(!!A.up&&b.id==='mwa-ub');});
  var ts=(st&&st.tracks)||[],pl=p.state||'idle';
  var nm=d.querySelector('#mwa-nm');nm.textContent=pl==='error'?(p.err||'播放出错'):pl==='idle'?'未在播放':(p.title||'正在播放');
  nm.classList.toggle('bad',pl==='error');
  var pp=d.querySelector('#mwa-pp'),pk=pl==='playing'?'pause':'play';if(pp.getAttribute('data-ic')!==pk){pp.setAttribute('data-ic',pk);pp.innerHTML=ic(pk,18);}pp.setAttribute('aria-label',pl==='playing'?'暂停':'播放');
  d.querySelector('#mwa-pg').classList.toggle('ind',pl==='playing'&&!(+p.dur>0));
  var sig=JSON.stringify([ts.map(function(t){return [t.id,t.title,t.src,t.size];}),pl==='playing'||pl==='paused'?p.track:'',pl,A.delId,dis,loading]);
  if(sig!==A.lsSig){A.lsSig=sig;var ls=d.querySelector('#mwa-ls'),sc=ls.scrollTop;
   /* 整块重建会销毁刚获得焦点的曲目行 / 删除钮, 焦点掉到 body 后 Esc 和 Tab 陷阱都失效: 重建前记下, 重建后补回 */
   var fa=document.activeElement,fk=fa&&ls.contains(fa)&&fa!==ls?[fa.getAttribute('data-a'),fa.getAttribute('data-id')]:null;
   ls.innerHTML=ts.length?ts.map(function(t){
    var cu=(pl==='playing'||pl==='paused')&&p.track===t.id,srcl=t.src==='test'?'内置':t.src==='up'?'已上传':'外部存储',
     icn=t.src==='test'?'wave':t.src==='up'?'music':'hdd';
    return '<div class="mwa-tr'+(cu?' cur':'')+(cu&&pl==='playing'?' pl':'')+'" role="option" aria-selected="'+(cu?'true':'false')+'" tabindex="'+(dis?-1:0)+'" data-a="trk" data-id="'+h(t.id)+'">'+
     '<span class="mwa-ti">'+ic(icn,12)+'</span><span class="mwa-tn">'+h(t.title)+'</span>'+
     '<span class="mwa-tz">'+srcl+(t.size?' · '+fmtS(t.size):'')+'</span>'+
     (cu&&pl==='playing'?'<span class="mwa-eq" aria-hidden="true"><i></i><i></i><i></i></span>':'')+
     (t.src==='up'?'<button type="button" class="mwa-dl'+(A.delId===t.id?' ask':'')+'" data-a="del" data-id="'+h(t.id)+'" aria-label="删除"'+(dis?' disabled':'')+'>'+(A.delId===t.id?'确认删除':ic('del',13))+'</button>':'')+'</div>';}).join(''):
    '<div class="mwa-emp">'+(loading?'正在读取曲目…':'还没有曲目，上传一首试试')+'</div>';
   ls.scrollTop=sc;
   if(fk){var nf=Array.prototype.filter.call(ls.querySelectorAll('[data-a]'),function(x){return x.getAttribute('data-a')===fk[0]&&x.getAttribute('data-id')===fk[1]&&!x.disabled;})[0];
    if(!nf)nf=d.querySelector('.mwa-win');if(nf&&nf.focus)nf.focus();}}
  var um=d.querySelector('#mwa-um');
  if(!A.up&&um){var lim=(st&&st.limits)||{};um.textContent=st&&st.free!=null?'剩余 '+fmtS(Math.max(0,st.free))+(lim.file?'，单个 ≤ '+fmtS(lim.file):''):'';}
  prog(performance.now());}

 /* ---------- 首页迷你播放器(#dv-mini, 在 dv-fl 与 dv-meta 之间): 只有接了 USB 声卡才轮询; 没声卡时是一块静态占位 ---------- */
 function mq(s){return A.mini&&A.mini.querySelector(s);}
 function setTx(e,t){if(e&&e.textContent!==t)e.textContent=t;}
 function applyMini(){
  var m=A.mini;if(!m)return;
  var st=A.st,p=(st&&st.player)||{},tools=(st&&st.tools)||{},pl=p.state||'idle',c=st&&card();
  var loading=A.hasCard&&!st,noTool=!!(st&&(tools.alsa===false||tools.ffmpeg===false)),noCard=!A.hasCard||!!(st&&!(st.cards&&st.cards.length));
  var dis=noCard||loading||noTool;
  var sig=[A.hasCard,dis,pl,p.track||'',p.title||'',c&&c.name,loading,noTool,A.fail>=2].join('|');
  if(sig===A.mnSig)return;A.mnSig=sig;
  m.classList.toggle('dis',dis);m.classList.toggle('pl',!dis&&pl==='playing');
  var nm=pl==='error'?(p.err||'播放出错'):(pl==='playing'||pl==='paused')?(p.title||'正在播放'):'音乐播放器';
  var sub=!A.hasCard||noCard?'接入 USB 声卡后可播放':noTool?'固件缺少播放组件':loading?(A.fail>=2?'无法获取声卡状态':'正在读取声卡状态…'):
   (pl==='playing'?'播放中':pl==='paused'?'已暂停':'空闲，点击播放')+(c&&c.name?' · '+c.name:'');
  setTx(mq('#mn-nm'),nm);setTx(mq('#mn-sub'),sub);
  Array.prototype.forEach.call(m.querySelectorAll('.mn-ct button'),function(b){b.disabled=dis;});
  var pp=mq('#mn-pp'),pk=pl==='playing'?'pause':'play';
  if(pp&&pp.getAttribute('data-ic')!==pk){pp.setAttribute('data-ic',pk);pp.innerHTML=ic(pk,17);}
  if(pp)pp.setAttribute('aria-label',pl==='playing'?'暂停':'播放');
  if(dis||(pl!=='playing'&&pl!=='paused')){setTx(mq('#mn-tm'),'');setTx(mq('#mn-du'),'');var g=mq('#mn-pgi');if(g)g.style.width='0%';}}
 function progMini(now){
  var p=A.st&&A.st.player;if(!p||!A.mini)return;
  if(p.state!=='playing'&&p.state!=='paused')return;
  var pos=+p.pos||0,dur=+p.dur||0;if(p.state==='playing')pos+=(now-A.stAt)/1000;if(dur>0)pos=Math.min(pos,dur);
  setTx(mq('#mn-tm'),fmtT(pos));setTx(mq('#mn-du'),dur>0?fmtT(dur):'--:--');
  var g=mq('#mn-pgi');if(g)g.style.width=(dur>0?Math.max(0,Math.min(100,pos*100/dur)):0)+'%';}
 /* 按高度分档: 空间够就带波形, 再矮去波形、去进度条, 再矮整块隐藏 */
 function miniTier(){
  var m=A.mini;if(!m)return;var hh=m.offsetParent?m.clientHeight:0;
  var t=hh>=134?'full':hh>=112?'mid':hh>=96?'cmp':'off';
  if(m.getAttribute('data-t')!==t){m.setAttribute('data-t',t);sync();}}
 /* 迷你区两种形态: 有 USB 声卡 = 音乐播放器(music); 没有 = 简洁挂画式信息播报(tv)。MRT_AUD.mode('tv'|'music'|'') 可强制(测试用, 不持久) */
 function setMode(){var m=A.mini;if(!m)return;var md=A.force||(A.hasCard?'music':'tv');A.mode=md;m.setAttribute('data-mode',md);
  if(window.MRT_TV)window.MRT_TV.on(md==='tv');sync();}
 function miniMode(x){A.force=(x==='tv'||x==='music')?x:'';setMode();}
 function miniCard(on){on=!!on;if(A.hasCard===on){setMode();return;}A.hasCard=on;A.mnSig='';applyMini();setMode();sync();}
 function miniInit(){
  var m=document.getElementById('dv-mini');if(!m||A.mini)return;A.mini=m;
  m.addEventListener('click',function(e){
   var t=e.target.closest&&e.target.closest('[data-m]');if(!t||t.disabled)return;var a=t.getAttribute('data-m');
   if(a==='prev')step(-1);else if(a==='next')step(1);else if(a==='pp')togglePP();else if(a==='open')openDlg(t);});
  if(window.ResizeObserver)new ResizeObserver(miniTier).observe(m);
  applyMini();miniTier();setMode();}
 miniInit();
 document.addEventListener('visibilitychange',sync);
 document.addEventListener('pointerup',endDrag,true);document.addEventListener('pointercancel',endDrag,true);
 window.addEventListener('pagehide',function(){if(A.st&&A.st.mic&&A.st.mic.on&&navigator.sendBeacon){try{navigator.sendBeacon(AU_URL.mic,new Blob(['on=0&token='+encodeURIComponent(tok())],{type:'application/x-www-form-urlencoded'}));}catch(e){}}});
 /* s91/s131 正在播放时拉波形, 画在产品图背后的 #dv-wvbg 上 */
 function pill(on){on=!!on;if(A.pillOn===on)return;A.pillOn=on;var sh=document.querySelector('.dv-shot');if(sh)sh.classList.toggle('wv-on',on);sync();}
 return window.MRT_AUD={pill:pill,card:miniCard,mode:miniMode,tier:miniTier,html:htmlBlock,entry:htmlEntry,wire:wire,sync:sync,apply:apply,dragging:dragging,open:openDlg,closeDlg:closeDlg,isOpen:function(){return !!A.dlgOpen;}};
})();
function close(){
 clearTimeout(showT);clearTimeout(hideT);clearInterval(pollT);hideT=pollT=0;cur=null;CAM.stop();
 if(pop)pop.classList.remove('on');
 AUD.sync();
}
function later(){if(cur&&!hideT&&!AUD.dragging())hideT=setTimeout(function(){hideT=0;close();},160);}

document.addEventListener('pointerdown',function(e){lastPT=e.pointerType||'mouse';},true);
document.addEventListener('pointerover',function(e){
 if(e.pointerType!=='mouse')return;
 var el=e.target;
 if(pop&&pop.contains(el)){clearTimeout(hideT);hideT=0;return;}
 if(AUD.dragging())return;
 var t=el.closest&&el.closest('[data-pop]');
 if(!t){clearTimeout(showT);later();return;}
 clearTimeout(hideT);hideT=0;
 var k=t.getAttribute('data-pop');
 if(k===cur){if(curEl!==t){curEl=t;render();}return;}
 curEl=t;
 clearTimeout(showT);
 if(cur)open(k);else showT=setTimeout(function(){open(k);},120);
});
document.addEventListener('pointerout',function(e){if(e.pointerType==='mouse'&&!e.relatedTarget){clearTimeout(showT);later();}});
/* 触屏: 没有悬停, 改成点开/点收。鼠标点击不走这里(悬停已经管了) */
document.addEventListener('click',function(e){
 if(lastPT==='mouse')return;
 if(pop&&pop.contains(e.target))return;
 var t=e.target.closest&&e.target.closest('[data-pop]');
 if(t){var k=t.getAttribute('data-pop');curEl=t;if(k===cur)close();else open(k);return;}
 if(cur)close();
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&cur)close();});
function follow(){
 if(!cur||raf)return;
 raf=requestAnimationFrame(function(){
  raf=0;if(!cur)return;
  var t=target(cur);if(!t){close();return;}
  var r=t.getBoundingClientRect();
  if(r.bottom<0||r.top>window.innerHeight){close();return;}
  place(t);
 });
}
window.addEventListener('scroll',follow,{passive:true,capture:true});
window.addEventListener('resize',follow);
/* dev() 每轮调 upd('dev'), 设备总览每轮重写完 dv-meta 调 upd('r3d')(格子换了新元素, 重新对位置);
   内容没变时 render() 只比一次串, 不碰 DOM */
window.MRT_POP={upd:function(){if(cur)render();},open:open,close:close};
})();

;

/* s87 gauges 区右侧「蜂窝模组」面板(PC)。
   数据不另取: 蜂窝卡片(#mrt-sec 里带 data-mx 的 .cd)仍由 UI.render 照旧生成, 手机端原样内联显示;
   这里只读这些卡片的 DOM —— 给六个按钮填一行摘要、决定可不可点, 点开后把对应卡片克隆进弹窗。
   用 MutationObserver 盯 #mrt-sec 和 #hero-sig 的 class: render / cellx 刷新 / hero 切换不管走哪条路写 DOM 都会同步,
   弹窗开着时内容也跟着刷新(UI.render 内容没变不写 DOM, 所以不会无谓重建)。 */
(function(){
 var $=function(id){return document.getElementById(id);};
 var P=$('P'),sec=$('mrt-sec'),pan=$('gx-mod'),gau=pan&&pan.parentNode;
 if(!P||!sec||!pan||!gau)return;
 var DEF={
  mod:{t:'蜂窝模组',s:'型号 · 制造商 · 固件版本',i:'fas fa-microchip'},
  sim:{t:'SIM卡信息',s:'卡状态 · 运营商 · 签约速率',i:'fas fa-sim-card'},
  cell:{t:'基站信息',s:'主服务小区 · 频段 · 信号',i:'fas fa-broadcast-tower'},
  nb:{t:'附近小区',s:'邻区 · 信号强度排序',i:'fas fa-project-diagram'},
  topo:{t:'网络拓扑',s:'出口链路 · 信号参数 · 下挂设备',i:'fas fa-project-diagram'}
 };
 var KEYS=['mod','sim','cell','nb','topo'];
 function txt(el){return el?String(el.textContent||'').replace(/\s+/g,' ').replace(/^[●\s]+/,'').trim():'';}
 function card(k){return sec.querySelector('.cd[data-mx="'+k+'"]');}
 /* 每张卡 → 按钮上的一行摘要(+ 可选的状态点 g 好 / w 一般 / b 差) */
 var EX={
  mod:function(c){return{s:txt(c.querySelector('.mod-cell-v.lg'))};},
  sim:function(c){var st='',sl='';
   Array.prototype.forEach.call(c.querySelectorAll('.sim-grid .ir'),function(x){
    var k=txt(x.querySelector('.ik')),v=txt(x.querySelector('.iv'));
    if(!st&&/状态|status/i.test(k))st=v;else if(!sl&&/插槽|卡槽|slot/i.test(k))sl=v;});
   return{s:st?st+(sl?' · '+sl:''):'',lv:st?(/ready|就绪|正常/i.test(st)?'g':'b'):''};},
  cell:function(c){var b='',p='';
   Array.prototype.forEach.call(c.querySelectorAll('.cell-item'),function(x){
    var l=txt(x.querySelector('.ci-label')),v=txt(x.querySelector('.ci-value'));
    if(!b&&/频段/.test(l))b=v;else if(!p&&/物理小区/.test(l))p=v;});
   return{s:b?b+(p?' · PCI '+p:''):''};},
  nb:function(c){var m=txt(c.querySelector('.cd-t')).match(/(\d+)\s*个邻区/);return{s:m?m[1]+' 个邻区':''};}
 };
 var cur='';
 function sync(){
  var hs=$('hero-sig');
  var any=!!sec.querySelector('.cd[data-mx]:not([data-mx="empty"])');
  var show=!!hs&&!hs.classList.contains('hid')&&any;
  /* s90: 面板永不整块隐藏 —— 无模组 / 系统版 hero 时只留「网络拓扑」磁贴(gx-nomod) */
  pan.hidden=false;
  pan.classList.toggle('gx-nomod',!show);
  gau.classList.toggle('gx-solo',!show);
  P.classList.toggle('gx-on',show);
  if(!show){if(cur)close();return;}
  KEYS.forEach(function(k){
   if(k==='topo')return;   /* 网络拓扑磁贴不依赖蜂窝卡片, 恒可点 */
   var b=pan.querySelector('.gx-t[data-k="'+k+'"]'),c=card(k);if(!b)return;
   var ex=c&&EX[k]?EX[k](c):null,sm=c?((ex&&ex.s)||DEF[k].s):'暂无数据';
   b.disabled=!c;
   b.title=DEF[k].t+' · '+sm;
  });
  if(cur)fill();
 }
 function left(m){
  /* 和 wfmOpen / cawLeft 同一套: 罩只盖右侧内容区, 不连菜单栏一起盖; 窄屏 left=0 全屏居中 */
  var host=document.querySelector('.main-right')||$('maincontent'),l=0;
  if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)l=Math.round(r.left);}
  m.style.setProperty('--wfm-l',l+'px');try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
 }
 function fill(){
  var b=$('mxm-b'),c=card(cur);if(!b)return;
  if(!c){b._h='';b.innerHTML='<div class="caw-empty"><i class="fas fa-wave-square"></i><span>暂无数据</span></div>';return;}
  if(b._h===c.innerHTML)return;
  b._h=c.innerHTML;
  var n=c.cloneNode(true),age=n.querySelector('.cx-age'),sub=$('mxm-s');
  if(sub)sub.textContent=DEF[cur].s+(age?' · '+txt(age):'');
  Array.prototype.forEach.call(n.querySelectorAll('.clh'),function(x){x.parentNode.removeChild(x);});
  var t=n.firstElementChild;if(t&&t.classList.contains('cd-t'))n.removeChild(t);
  Array.prototype.forEach.call(n.querySelectorAll('.shut'),function(x){x.classList.remove('shut');});
  n.removeAttribute('data-mx');
  b.innerHTML='';b.appendChild(n);
 }
 /* s90 网络拓扑: mwrt-topo.js(+ 美术库 mwrt-topo-art.js)首次点击才加载, 不拖慢首页; 美术库加载失败时拓扑脚本自带的备用图元顶上 */
 var topoLoad=0;
 /* 加载失败要有提示(原先静默): 磁贴文字临时改成"加载失败，点此重试", 3.5 秒后还原; 美术库失败不算失败(拓扑脚本自带备用图元) */
 function topoFail(tb){
  topoLoad=0;if(!tb)return;
  tb.classList.remove('ld');
  var b=tb.querySelector('b');if(!b)return;
  if(!tb._t0)tb._t0=b.textContent;
  b.textContent='加载失败，点此重试';tb.setAttribute('aria-live','polite');
  clearTimeout(tb._tm);tb._tm=setTimeout(function(){b.textContent=tb._t0;},3500);
 }
 function topo(){
  if(window.MwrtTopo){window.MwrtTopo.open();return;}
  if(topoLoad)return;
  var tb=pan.querySelector('.gx-t[data-k="topo"]');
  window.MWRT_TOPO_URL=tb&&tb.getAttribute('data-topo-url')||'';
  topoLoad=1;if(tb)tb.classList.add('ld');
  /* ?v= 由模板按两个 js 的文件大小自动生成(data-topo-v), 改了 js 不必再手工改版本号; 手写的 2/4 只在属性缺失时兜底 */
  var tv=(tb&&tb.getAttribute('data-topo-v')||'').split('-'),va=tv[0]&&tv[0]!=='0'?'2-'+tv[0]:'2',vj=tv[1]&&tv[1]!=='0'?'4-'+tv[1]:'4';
  var n=2,done=function(){
   if(--n)return;
   if(!window.MwrtTopo){topoFail(tb);return;}
   topoLoad=0;if(tb)tb.classList.remove('ld');
   window.MwrtTopo.open();
  };
  ['mwrt-topo-art.js?v='+va,'mwrt-topo.js?v='+vj].forEach(function(f){
   var s=document.createElement('script');s.src='/luci-static/resources/'+f;
   s.onload=done;s.onerror=done;document.head.appendChild(s);
  });
 }
 /* ---- s139: 锁频设置 / 短信管理 改成首页浮窗（用户要求"弹出一个界面，不跳转"） ----
    外壳复用 #mxm（和蜂窝模组/SIM/基站磁贴同一个 .wfm 弹窗，含 × 与点遮罩关闭），
    正文自己填；不克隆 #mrt-sec 的卡，所以 cur 置空、sync() 不会来覆盖。 */
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
 function mxfOpen(title,sub,icon){
  var m=$('mxm');if(!m)return null;
  cur='';
  $('mxm-t').textContent=title;$('mxm-s').textContent=sub;$('mxm-i').className=icon;
  var b=$('mxm-b');b._h='';b.innerHTML='<div class="mxf-ld"><i class="fas fa-circle-notch fa-spin"></i> 正在读取…</div>';
  left(m);m.classList.add('open');m.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  return b;
 }
 function mxfNote(b,t,cls){var n=b&&b.querySelector('.mxf-note');if(n){n.textContent=t;n.className='mxf-note '+(cls||'');}}
 function mxfErr(b,t){if(b)b.innerHTML='<div class="mxf-ld bad"><i class="fas fa-triangle-exclamation"></i> '+esc(t)+'</div>';}

 /* 锁频设置：勾选 = 只允许这些频段；都不勾 = 不限制。频段清单只列 supported_bands
    （模组真支持的），避免勾到 n5/n8 这种锁了也没信号的频段。
    应用按钮第一下变成「确认应用？」—— 锁错频段会掉网，必须二次确认。 */
 function lockbandOpen(){
  var b=mxfOpen('锁频设置','频段锁定 · 只允许勾选的频段接入','fas fa-lock');
  if(!b)return;
  function bandSec(t,rat,g){
   var list=(g&&g.supported)||[],on=(g&&g.bands)||[],un=!!(g&&g.unrestricted);
   if(!list.length)return '<div class="mxf-sec"><div class="mxf-h">'+t+'</div><div class="mxf-ld sm">本机不支持频段锁定</div></div>';
   var chips=list.map(function(x){
    var ck=(!un&&on.indexOf(x)>=0)?' checked':'';
    return '<label class="mxf-c"><input type="checkbox" value="'+esc(x)+'"'+ck+'><span>'+esc(x)+'</span></label>';
   }).join('');
   return '<div class="mxf-sec" data-rat="'+rat+'"><div class="mxf-h">'+t+'<i>'+(un?'当前不限':'当前已锁')+'</i></div>'
     + '<div class="mxf-chips">'+chips+'</div></div>';
  }
  function load(){
   XHR.get('/cgi-bin/luci/admin/fancontrol/band_get',{},function(x,d){
    if(!d||d.ok!==true){mxfErr(b,(d&&d.error)||'读取频段失败');return;}
    b.innerHTML='<div class="mxf-top"><span>当前驻留</span><b>'
      + esc(String(d.rat||'--').toUpperCase())+' '+esc(String(d.band||'--'))+'</b>'
      + '<i>PCI '+esc(d.pci==null?'--':d.pci)+'</i></div>'
      + bandSec('LTE 频段','lte',d.lte)+bandSec('5G NR 频段','nr',d.nr)
      + '<div class="mxf-note"></div>'
      + '<div class="mxf-foot"><button type="button" class="mxf-btn" data-act="apply">应用</button>'
      + '<button type="button" class="mxf-btn ghost" data-act="clear">解除全部锁频</button>'
      + '<span class="mxf-hint">都不勾 = 不限制频段</span></div>';
   });
  }
  b.addEventListener('click',function(e){
   var btn=e.target.closest?e.target.closest('[data-act]'):null;if(!btn||btn.disabled)return;
   var act=btn.getAttribute('data-act');
   if(act==='apply'&&!btn._ok){
    btn._ok=1;btn.textContent='确认应用？再点一次';
    setTimeout(function(){btn._ok=0;btn.textContent='应用';},4000);
    return;
   }
   var lte=[],nr=[];
   Array.prototype.forEach.call(b.querySelectorAll('.mxf-sec[data-rat]'),function(s){
    var rat=s.getAttribute('data-rat'),arr=[];
    Array.prototype.forEach.call(s.querySelectorAll('input:checked'),function(i){arr.push(i.value);});
    if(rat==='lte')lte=arr;else nr=arr;
   });
   var txt=btn.textContent;btn.disabled=true;btn.textContent='提交中…';
   mxfNote(b,'正在下发频段锁定，切换期间信号会短暂中断…');
   var q=(act==='clear')?{clear:'1'}:{lte:lte.join(','),nr:nr.join(',')};
   XHR.get('/cgi-bin/luci/admin/fancontrol/band_set',q,function(x,d){
    btn.disabled=false;btn._ok=0;btn.textContent=txt;
    if(d&&d.ok===true){mxfNote(b,'已生效，正在刷新…','ok');setTimeout(load,1200);return;}
    if(d&&d.pending){mxfNote(b,'已下发，模组正在切换频段，稍后自动刷新…','warn');setTimeout(load,4000);return;}
    mxfNote(b,(d&&d.error)||'提交失败','bad');
   });
  });
  load();
 }

 /* 短信管理：最近 12 条，勾选后可批量删除（用户 2026-11-19 要求）。
    删除要回传 index + pdu_sha256 两项 —— index 会随新短信挪位，只给 index 可能删错行，
    服务端也会再校验一遍格式。正文必须 esc()：短信内容是不可信输入，直接拼 HTML 会被注入。 */
 function smsOpen(){
  var b=mxfOpen('短信管理','最近收到的短信 · 勾选可批量删除','fas fa-comment-dots');
  if(!b)return;
  function load(){
   XHR.get('/cgi-bin/luci/admin/fancontrol/sms_list',{},function(x,d){
    if(!d||d.ok!==true){mxfErr(b,(d&&d.error)||'读取短信失败');return;}
    var ms=d.messages||[],h;
    if(!ms.length){h='<div class="mxf-ld sm">没有短信</div>';}
    else{
     h='<div class="mxf-sms">'+ms.map(function(m){
      var v=esc((m.index==null?'':m.index)+':'+(m.sha||''));
      return '<label class="sms-r"><input type="checkbox" class="sms-ck" value="'+v+'">'
        + '<div class="sms-main"><div class="sms-hd"><b>'+esc(m.peer||'未知号码')+'</b>'
        + '<span>'+esc(m.time||'')+'</span></div>'
        + '<div class="sms-tx">'+esc(m.text||'（无正文）')+'</div></div></label>';
     }).join('')+'</div>';
    }
    h+='<div class="mxf-note"></div><div class="mxf-foot">';
    if(ms.length){
     h+='<label class="mxf-c sms-all"><input type="checkbox" data-act="all"><span>全选</span></label>'
      + '<button type="button" class="mxf-btn danger" data-act="del">删除选中</button>';
    }
    h+='<button type="button" class="mxf-btn ghost" data-act="refresh">刷新</button>'
      + '<a class="mxf-btn ghost" href="/cgi-bin/luci/admin/udx/sms">打开短信页</a>'
      + '<span class="mxf-hint">共 '+esc(d.total||0)+' 条</span></div>';
    b.innerHTML=h;
   });
  }
  b.addEventListener('change',function(e){
   var t=e.target;
   if(t&&t.getAttribute&&t.getAttribute('data-act')==='all'){
    Array.prototype.forEach.call(b.querySelectorAll('.sms-ck'),function(i){i.checked=t.checked;});
   }
  });
  b.addEventListener('click',function(e){
   var btn=e.target.closest?e.target.closest('[data-act]'):null;if(!btn||btn.disabled)return;
   var act=btn.getAttribute('data-act');
   if(act==='all')return;
   if(act==='refresh'){
    b.innerHTML='<div class="mxf-ld"><i class="fas fa-circle-notch fa-spin"></i> 正在刷新…</div>';
    load();return;
   }
   if(act==='del'){
    var sel=[];
    Array.prototype.forEach.call(b.querySelectorAll('.sms-ck:checked'),function(i){sel.push(i.value);});
    if(!sel.length){mxfNote(b,'先勾选要删除的短信','warn');return;}
    if(!btn._ok){
     btn._ok=1;btn.textContent='确认删除 '+sel.length+' 条？';
     setTimeout(function(){btn._ok=0;btn.textContent='删除选中';},4000);
     return;
    }
    btn.disabled=true;btn.textContent='删除中…';
    mxfNote(b,'正在删除 '+sel.length+' 条…');
    XHR.get('/cgi-bin/luci/admin/fancontrol/sms_del',{items:sel.join(',')},function(x,r){
     btn.disabled=false;btn._ok=0;btn.textContent='删除选中';
     if(r&&r.ok===true){
      var msg='已删除 '+((r.deleted==null)?sel.length:r.deleted)+' 条';
      mxfNote(b,r.failed?(msg+'，'+r.failed+' 条未删'):msg,r.failed?'warn':'ok');
      setTimeout(load,900);return;
     }
     if(r&&r.pending){mxfNote(b,'删除已下发，正在执行…','warn');setTimeout(load,2500);return;}
     mxfNote(b,(r&&r.error)||'删除失败','bad');
    });
   }
  });
  load();
 }

 function open(k){
  if(k==='wifi'){if(typeof wfmOpen==='function')wfmOpen('2g');return;}   /* s130 无线设置: 复用首页 WiFi 设置浮窗 */
  if(k==='lockband'){lockbandOpen();return;}   /* s139 锁频设置: 首页浮窗, 不再跳 admin/udx/network */
  if(k==='sms'){smsOpen();return;}             /* s139 短信管理: 首页浮窗, 不再跳 admin/udx/sms */
  if(k==='topo'){if(window.MRT_OVBOX)window.MRT_OVBOX();topo();return;}   /* 网络拓扑: 全屏覆盖层, 脚本点击时才加载 */
  var m=$('mxm');if(!m||!DEF[k])return;
  cur=k;
  $('mxm-t').textContent=DEF[k].t;$('mxm-s').textContent=DEF[k].s;$('mxm-i').className=DEF[k].i;
  $('mxm-b')._h='';
  left(m);m.classList.add('open');m.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  fill();
 }
 function close(){
  var m=$('mxm');cur='';if(!m)return;
  m.classList.remove('open');m.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
 }
 pan.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('.gx-t'):null;
  if(b&&!b.disabled)open(b.getAttribute('data-k'));
 });
 document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&cur)close();
 });
 var raf=0;
 function sched(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;try{sync();}catch(e){}});}
 new MutationObserver(sched).observe(sec,{childList:true,subtree:true,characterData:true});
 var hs0=$('hero-sig');
 if(hs0)new MutationObserver(sched).observe(hs0,{attributes:true,attributeFilter:['class']});
 window.MX={open:open,close:close,sync:sync};
 /* s141: 浮窗外壳给同文件里后面那些 IIFE 复用（在线更新的弹窗要用） */
 /* s145: 导出锁频/短信浮窗给「网络设置」浮窗调用 */
 window.lockbandOpen=lockbandOpen;window.smsOpen=smsOpen;
 window.MXF={open:mxfOpen,note:mxfNote,err:mxfErr,esc:esc};
 sync();
})();

;

/* s87 品牌标开关: 型号以 NRadio 开头 → 型号格出 NRadio 标; 固件版本串含 ImmortalWrt → 固件行出 ImmortalWrt 标。
   这两格由 dev() 异步写入文字, 所以盯着文字变化; 联发科标(处理器格)是静态的 */
(function(){
 function $(i){return document.getElementById(i);}
 function sync(){
  var m=$('f-model'),f=$('f-fw'),mc=m&&m.closest?m.closest('.fc'):null,fb=f&&f.closest?f.closest('.fw-banner'):null;
  if(mc)mc.classList.toggle('lg-nr',/^ *nradio/i.test(m.textContent||''));
  if(fb)fb.classList.toggle('lg-iw',/immortalwrt/i.test(f.textContent||''));
 }
 ['f-model','f-fw'].forEach(function(i){var e=$(i);if(e)new MutationObserver(sync).observe(e,{childList:true,characterData:true,subtree:true});});
 sync();
})();

;

/* s87 两处动画(纯装饰, 不接收鼠标, 不进文档流):
   ① gauges 卡片背景: 只在内存清理(双击内存圆环 → memClean)时联动 —— 清理中四周流光向圆环收拢, 清理完从圆环炸开光幕扫过整张卡;平时画布空着不画;
   ② 设备总览展台: 产品图上方有个看不见的喷口往下喷雾, 雾遇到产品轮廓会顺着边缘绕开 ——
      轮廓取自产品图本身的透明度(离屏小画布采样 → 模糊成"势场"), 粒子沿势场的法向被推开、沿切向滑过去。
   ②b s88: 喷雾的速度和量级跟风扇转速走(见下面 fanTarget): 风扇满转 = 原来的样子, 转速降低喷得更少更慢更淡, 停转后散尽;
   两块画布都按 1/2 分辨率画, 页面不可见 / 画布滚出视口时整体暂停, 不白耗电。
   s93: 手机也画(面板宽 ≥240px 即可)。 */
(function(){
 var P=document.getElementById('P');if(!P)return;
 var RES=0.5,rnd=Math.random;
 function clamp(v,a,b){return v<a?a:v>b?b:v;}
 function sprite(rgb,soft){
  var s=64,c=document.createElement('canvas');c.width=c.height=s;
  var x=c.getContext('2d'),g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba('+rgb+',1)');g.addColorStop(soft,'rgba('+rgb+',0.5)');g.addColorStop(0.72,'rgba('+rgb+',0.14)');g.addColorStop(1,'rgba('+rgb+',0)');
  x.fillStyle=g;x.fillRect(0,0,s,s);return c;
 }
 function mkCanvas(host,cls){
  var cv=document.createElement('canvas');cv.className='sm-cv '+cls;cv.setAttribute('aria-hidden','true');
  host.insertBefore(cv,host.firstChild);return cv;
 }
 function fit(S){
  var w=S.host.clientWidth,h=S.host.clientHeight;
  if(!w||!h)return false;
  if(S.cw!==w||S.ch!==h){
   S.cw=w;S.ch=h;S.cv.width=Math.max(2,Math.round(w*RES));S.cv.height=Math.max(2,Math.round(h*RES));
   if(S.onfit)S.onfit();
  }
  return true;
 }

 /* ---------- ① gauges 背景: 内存清理联动 ----------
    平时画布空着(不画、不耗电)。memClean() 给 #ga-mem 加 / 去 .mem-cleaning, 这里盯这个 class:
    加上 → "吸入"相: 整张卡的背景里亮起一条条流光, 从四面八方朝内存圆环收拢, 圆环处的辉光随清理进度变亮(流光数量跟清理前的占用率挂钩);
    去掉 → "释放"相: 圆环处炸开一团绿光, 两道光幕向左右扫过整张卡, 带一层转瞬即逝的绿色底光, 最后散成向外的流光。 */
 var gau=document.querySelector('.gauges'),G=null;
 if(gau){
  G={host:gau,cv:mkCanvas(gau,'sm-g'),ps:[],rp:[],mode:0,pw:0,tm:0,acc:0,used:0.5,cen:{x:0,y:0},cw:0,ch:0,vis:true,dirty:false,
     sp:[sprite('52,211,153',0.3),sprite('150,140,255',0.34),sprite('120,230,200',0.3)]};
  G.ctx=G.cv.getContext('2d');
 }
 function gCenter(){
  var w=document.querySelector('#ga-mem .ga-w')||document.getElementById('ga-mem');
  if(!w||!G.cw)return{x:G.cw*0.5,y:G.ch*0.5};
  var r=w.getBoundingClientRect(),h=G.host.getBoundingClientRect();
  return{x:r.left-h.left+r.width/2,y:r.top-h.top+r.height/2};
 }
 function gStart(){
  if(!G||G.mode===1)return;
  var v=document.getElementById('gv-mem'),rem=parseInt(v?v.textContent:'');
  G.used=isFinite(rem)?clamp((100-rem)/100,0,1):0.5;
  fit(G);G.cen=gCenter();G.mode=1;G.tm=0;G.acc=0;G.rp.length=0;
 }
 function gEnd(){
  if(!G||G.mode!==1)return;
  fit(G);G.cen=gCenter();G.mode=2;G.tm=0;
  G.rp.push({r:0,a:1,dl:0},{r:0,a:0.6,dl:0.28});
  var n=22,i;
  for(i=0;i<n;i++){
   var ang=rnd()*6.283,v=220+rnd()*320;
   G.ps.push({k:1,x:G.cen.x,y:G.cen.y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v*0.38,u:0,dur:0.9+rnd()*0.9,r:10+rnd()*14,s:rnd()<0.6?0:2});
  }
 }
 function gStep(dt,t){
  if(!G.mode&&!G.ps.length&&!G.rp.length&&G.pw<0.004){
   if(G.dirty){G.ctx.clearRect(0,0,G.cv.width,G.cv.height);G.dirty=false;}
   return false;
  }
  if(!fit(G)||G.cw<240)return false;
  var w=G.cw,h=G.ch,c=G.ctx,cx=G.cen.x,cy=G.cen.y,i,p;
  G.tm+=dt;
  G.pw+=((G.mode===1?1:0)-G.pw)*Math.min(1,dt*(G.mode===1?5:1.8));
  c.setTransform(RES,0,0,RES,0,0);c.clearRect(0,0,w,h);
  c.globalCompositeOperation='lighter';G.dirty=true;
  /* 圆环处的辉光: 吸入相随进度亮起并轻微脉动 */
  if(G.pw>0.004){
   c.globalAlpha=G.pw*(0.36+0.1*Math.sin(t*10));
   c.drawImage(G.sp[0],cx-w*0.2,cy-h*1.05,w*0.4,h*2.1);
   c.globalAlpha=G.pw*0.5;
   c.drawImage(G.sp[0],cx-46,cy-46,92,92);
  }
  /* 吸入相: 四周的流光向圆环收拢 */
  if(G.mode===1){
   G.acc+=(60+110*G.used)*dt;
   while(G.acc>=1){
    G.acc-=1;
    var ang=rnd()*6.283,d=0.28+rnd()*0.42;
    G.ps.push({k:0,x0:clamp(cx+Math.cos(ang)*w*d,-20,w+20),y0:clamp(cy+Math.sin(ang)*h*(0.7+rnd()*0.6),-10,h+10),
     u:0,dur:0.55+rnd()*0.5,r:9+rnd()*14,s:rnd()<0.55?0:2,sw:(rnd()-0.5)*0.5});
   }
  }
  /* 释放相: 两道光幕向左右扫过 + 一层绿色底光 */
  var wash=0;
  for(i=G.rp.length-1;i>=0;i--){
   p=G.rp[i];
   if(p.dl>0){p.dl-=dt;continue;}
   var reach=Math.max(cx,w-cx)+80;
   p.r+=dt*(w*0.55+p.r*0.9);
   var q=p.r/reach;
   if(q>=1){G.rp.splice(i,1);continue;}
   var al=p.a*(1-q)*(1-0.6*q),bw=56+p.r*0.12,sides=[cx-p.r,cx+p.r],k;
   wash+=al*0.05;
   c.globalAlpha=Math.min(1,al*1.3);
   for(k=0;k<2;k++){
    if(sides[k]<-bw||sides[k]>w+bw)continue;
    c.drawImage(G.sp[2],sides[k]-bw/2,-h*0.25,bw,h*1.5);c.drawImage(G.sp[0],sides[k]-bw*0.2,-h*0.1,bw*0.4,h*1.2);
   }
  }
  if(wash>0.002){c.globalAlpha=wash;c.fillStyle='rgb(52,211,153)';c.fillRect(0,0,w,h);}
  if(G.mode===2&&G.tm>0.4&&!G.rp.length)G.mode=0;
  /* 流光粒子: k=0 收拢(加速), k=1 向外散开(减速) */
  for(i=G.ps.length-1;i>=0;i--){
   p=G.ps[i];p.u+=dt/p.dur;
   if(p.u>=1){G.ps.splice(i,1);continue;}
   var u=p.u,px,py,ox,oy,sin=Math.sin(u*3.1416);
   if(p.k===0){
    var e=u*u,e2=(u+0.04)*(u+0.04);
    px=p.x0+(cx-p.x0)*e;py=p.y0+(cy-p.y0)*e+Math.sin(u*3.1416)*p.sw*h*0.3;
    ox=p.x0+(cx-p.x0)*e2-px;oy=p.y0+(cy-p.y0)*e2-py;
    c.globalAlpha=Math.pow(sin,0.8)*0.5;
   }else{
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-Math.min(1,dt*2.2);p.vy*=1-Math.min(1,dt*2.2);
    px=p.x;py=p.y;ox=p.vx;oy=p.vy;
    c.globalAlpha=(1-u)*(1-u)*0.5;
   }
   var rr=p.r*(p.k?1:(1-0.5*u));
   c.save();c.translate(px,py);c.rotate(Math.atan2(oy,ox));c.scale(2.4,1);
   c.drawImage(G.sp[p.s],-rr,-rr,rr*2,rr*2);c.restore();
  }
  c.globalAlpha=1;
  return true;
 }
 if(G){
  var gm=document.getElementById('ga-mem');
  if(gm){
   var was=gm.classList.contains('mem-cleaning');
   new MutationObserver(function(){
    var now=gm.classList.contains('mem-cleaning');
    if(now&&!was)gStart();else if(!now&&was)gEnd();
    was=now;
   }).observe(gm,{attributes:true,attributeFilter:['class']});
  }
 }

 /* ---------- ② 产品图上方喷雾 ---------- */
 var stg=document.querySelector('.dv-stage'),A=null;
 if(stg){
  A={host:stg,cv:mkCanvas(stg,'sm-p'),ps:[],cw:0,ch:0,vis:true,acc:0,
     M:{ok:false,gw:0,gh:0,cell:4,f:null,cx:0,cy:0,top:0,bot:0},
     spD:sprite('176,166,255',0.3),spL:sprite('104,116,190',0.3)};
  A.ctx=A.cv.getContext('2d');
  A.onfit=function(){buildMask();};
 }
 /* 轮廓势场: 产品图按 contain 画进 1/4 分辨率离屏画布 → 取不透明区 → 两遍盒式模糊成 0..1 的场 */
 function buildMask(){
  if(!A)return;
  var img=document.getElementById('dv-img');
  if(!img||!img.complete||!img.naturalWidth||img.style.display==='none'){A.M.ok=false;return;}
  var sr=A.host.getBoundingClientRect(),ir=img.getBoundingClientRect();
  if(!sr.width||!ir.width)return;
  var M=A.M,cell=M.cell,gw=Math.ceil(sr.width/cell),gh=Math.ceil(sr.height/cell);
  var nw=img.naturalWidth,nh=img.naturalHeight,sc=Math.min(ir.width/nw,ir.height/nh),dw=nw*sc,dh=nh*sc;
  var dx=ir.left-sr.left+(ir.width-dw)/2,dy=ir.top-sr.top+(ir.height-dh)/2;
  var oc=document.createElement('canvas');oc.width=gw;oc.height=gh;
  var x=oc.getContext('2d');
  try{
   x.drawImage(img,dx/cell,dy/cell,dw/cell,dh/cell);
   var id=x.getImageData(0,0,gw,gh).data,f=new Float32Array(gw*gh),i,n=gw*gh,sx=0,sy=0,sn=0,mnY=1e9,mxY=-1,mnX=1e9,mxX=-1;
   for(i=0;i<n;i++){if(id[i*4+3]>40){f[i]=1;var px=i%gw,py=(i/gw)|0;sx+=px;sy+=py;sn++;if(px<mnX)mnX=px;if(px>mxX)mxX=px;if(py<mnY)mnY=py;if(py>mxY)mxY=py;}}
   if(!sn){M.ok=false;return;}
   var tmp=new Float32Array(n),R=5,pass,y,xx,k,acc,cnt;
   for(pass=0;pass<2;pass++){
    for(y=0;y<gh;y++){for(xx=0;xx<gw;xx++){acc=0;cnt=0;for(k=-R;k<=R;k++){var q=xx+k;if(q>=0&&q<gw){acc+=f[y*gw+q];cnt++;}}tmp[y*gw+xx]=acc/(2*R+1);}}
    for(y=0;y<gh;y++){for(xx=0;xx<gw;xx++){acc=0;for(k=-R;k<=R;k++){var qy=y+k;if(qy>=0&&qy<gh)acc+=tmp[qy*gw+xx];}f[y*gw+xx]=acc/(2*R+1);}}
   }
   /* 模糊后实体内部约 0.7~1, 边缘外 0.3 米宽的过渡带: 拉伸一下让"贴着轮廓"也有明显的场强 */
   for(i=0;i<n;i++)f[i]=Math.min(1,f[i]*1.7);
   M.gw=gw;M.gh=gh;M.f=f;M.cx=sx/sn*cell;M.cy=sy/sn*cell;M.top=mnY*cell;M.bot=mxY*cell;M.hw=(mxX-mnX)/2*cell;M.ok=true;
  }catch(e){
   /* 图被跨域污染读不了像素: 退回椭圆轮廓 */
   var f2=new Float32Array(gw*gh),ccx=(dx+dw/2)/cell,ccy=(dy+dh/2)/cell,rx=dw/2/cell,ry=dh/2/cell,yy,xx2;
   for(yy=0;yy<gh;yy++)for(xx2=0;xx2<gw;xx2++){var ex=(xx2-ccx)/(rx+4),ey=(yy-ccy)/(ry+4),dd=ex*ex+ey*ey;f2[yy*gw+xx2]=dd<1?1:Math.max(0,1-(Math.sqrt(dd)-1)*3);}
   M.gw=gw;M.gh=gh;M.f=f2;M.cx=ccx*cell;M.cy=ccy*cell;M.top=(ccy-ry)*cell;M.bot=(ccy+ry)*cell;M.hw=rx*cell;M.ok=true;
  }
 }
 function fld(M,x,y){
  var gx=x/M.cell,gy=y/M.cell;
  if(gx<1||gy<1||gx>=M.gw-2||gy>=M.gh-2)return 0;
  var ix=gx|0,iy=gy|0,fx=gx-ix,fy=gy-iy,f=M.f,w=M.gw,a=f[iy*w+ix],b=f[iy*w+ix+1],c=f[(iy+1)*w+ix],d=f[(iy+1)*w+ix+1];
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
 }
 /* ---------- s88 风扇比例 ----------
    数据源 = 首页每轮轮询 devinfo 存下的 window.MRT_DEV(后端 fancontrol.lua 给 "风扇PWM"=sysfs pwm1 的 0..255)。
    比例 = PWM/255, 0..1。读不到按 1 处理(保持原样): 还没拿到数据 / 没有 PWM 这个键 / 数值不是数 /
    风扇模式「未知」且 PWM=0(后端读不到 pwm 文件时就是这个组合, 不是真停转)。
    cur 平滑追 tgt(时间常数约 1.2 秒), 手动/智能调速时烟不会跳变; window.SMK.fan(v) 可覆盖(测试用), SMK.fan() 取消覆盖。 */
 var FAN={cur:1,ov:null};
 function fanTarget(){
  if(FAN.ov!=null)return FAN.ov;
  var d=window.MRT_DEV;if(!d)return 1;
  var raw=d['风扇PWM'];if(raw==null||raw==='')return 1;
  var v=parseFloat(raw);if(!isFinite(v))return 1;
  if(v===0&&d['风扇模式']==='未知')return 1;
  return clamp(v/255,0,1);
 }
 function aSpawn(){
  var M=A.M,w=A.cw,ang=(rnd()-0.5)*0.7,v=(42+rnd()*36)*(0.35+0.65*FAN.cur),cx=M.ok?M.cx:w/2;
  A.ps.push({x:cx+(rnd()-0.5)*w*(window.innerWidth<=768?0.045:0.07),y:6+rnd()*10,vx:Math.sin(ang)*v,vy:Math.cos(ang)*v,age:0,life:(7+rnd()*3)*(A.hs||1),
   r0:(window.innerWidth<=768?9:12)+rnd()*8,gr:(window.innerWidth<=768?9:14)+rnd()*14,a:0.55+rnd()*0.45,ph:rnd()*6.28});
 }
 function aStep(dt,t){
  if(!A||!fit(A)||!A.M.ok)return false;
  var M=A.M,c=A.ctx,w=A.cw,h=A.ch,light=P.classList.contains('L'),i,p;
  /* s117 手机: 展台是整个第一屏(约 490px 高), 原来的飘程只够走到一半就散了 —— 按展台高度放慢寿命、加快落速(飘程 ≈ 高度/260 倍), 让烟雾走满整页; 电脑端 hk=1 不变 */
  var mob=window.innerWidth<=768,hk=mob?clamp(h/260,1,2.4):1,hs=Math.sqrt(hk);A.hs=hs;
  /* 喷雾有"一阵一阵"的节奏: 约 7 秒一个周期, 峰值时多喷, 低谷时只剩一点余烟 */
  var pulse=0.5+0.5*Math.sin(t*0.55),rate=2.4+7*pulse*pulse;
  /* s88 风扇: fa=平滑后的转速比例; 喷出率按比例缩(满转=原值), 停转(<0.02)不再喷;
     sv 是速度系数(满转 1, 低转最慢约 0.35), aq 是整体透明度系数(满转 1, 停转 0, 已喷出的烟随之散尽) */
  FAN.cur+=(fanTarget()-FAN.cur)*Math.min(1,dt*0.8);
  var fa=FAN.cur,sv=0.35+0.65*fa,aq=fa*(0.4+0.6*fa);
  if(fa>0.02){A.acc+=rate*fa*dt;while(A.acc>=1){A.acc-=1;if(A.ps.length<110)aSpawn();}}else A.acc=0;
  c.setTransform(RES,0,0,RES,0,0);c.clearRect(0,0,w,h);
  c.globalCompositeOperation=light?'source-over':'lighter';
  var lim=mob?clamp(Math.max(w*0.26,(M.hw||0)+24),50,w*0.4):0,spr=light?A.spL:A.spD,base=(light?0.24:0.2)*(mob?1.25:1);
  for(i=A.ps.length-1;i>=0;i--){
   p=A.ps[i];p.age+=dt;
   if(p.age>=p.life||p.y>h+60||p.x<-60||p.x>w+60){A.ps.splice(i,1);continue;}
   var u=p.age/p.life,f=fld(M,p.x,p.y);
   /* 目标速度 = 向下的喷流(逐渐减弱) + 沿轮廓的切向滑行 + 沿法向的推离 */
   var tvx=Math.sin(t*0.45+p.ph)*7*sv,tvy=(58-36*u)*(1-0.82*f)*sv*hs,dxc=p.x-M.cx;
   if(f>0.02){
    var e=1.2,gx=(fld(M,p.x+e*M.cell,p.y)-fld(M,p.x-e*M.cell,p.y)),gy=(fld(M,p.x,p.y+e*M.cell)-fld(M,p.x,p.y-e*M.cell)),gl=Math.sqrt(gx*gx+gy*gy);
    if(gl>1e-4){
     var nx=-gx/gl,ny=-gy/gl,tx=-ny,ty=nx;      /* n: 指向场变小的方向(远离产品) */
     if(ty<-0.25){tx=-tx;ty=-ty;}else if(Math.abs(ty)<=0.25&&tx*(p.x-M.cx)<0){tx=-tx;ty=-ty;}
     var s=Math.min(1,f*2.2);
     tvx+=(tx*s*(mob?34:74)+nx*s*(mob?30:44))*sv;tvy+=(ty*s*74+ny*s*44)*sv;
    }
    if(f>0.9){p.age+=dt*3;}     /* 万一钻进实体里: 加速消散 */
   }
   /* s117 手机: 烟雾只在产品图两侧一条窄带内流动, 越过带边就往中线拉回, 并随越界淡出 */
   if(mob){var ex=Math.abs(dxc)-lim*0.55;if(ex>0)tvx-=(dxc>0?1:-1)*ex*2.2;}
   var k=Math.min(1,dt*2.4);p.vx+=(tvx-p.vx)*k;p.vy+=(tvy-p.vy)*k;
   p.x+=p.vx*dt;p.y+=p.vy*dt;
   var r=p.r0+p.gr*(p.age/1.2<1?p.age/1.2:1)+p.gr*1.6*u;
   var al=p.a*base*Math.min(1,p.age/0.35)*Math.pow(1-u,1.4)*(1-Math.min(1,f*1.1))*aq*(mob?clamp(1.6-Math.abs(p.x-M.cx)/lim*1.1,0,1):1);
   if(al<0.003)continue;
   c.globalAlpha=al;c.drawImage(spr,p.x-r,p.y-r,r*2,r*2);
  }
  c.globalAlpha=1;
  return true;
 }

 /* ---------- 调度 ---------- */
 var last=0,raf=0,t=0,pageVis=true;
 function frame(ts){
  raf=0;
  if(!last)last=ts;
  var dt=Math.min(0.1,(ts-last)/1000);last=ts;t+=dt;
  try{
   if(G&&G.vis)gStep(dt,t);else if(G&&G.ps.length){G.ctx.clearRect(0,0,G.cv.width,G.cv.height);G.ps.length=0;}
   if(A&&A.vis)aStep(dt,t);
  }catch(e){}
  if(pageVis)raf=requestAnimationFrame(frame);
 }
 function go(){if(!raf&&pageVis){last=0;raf=requestAnimationFrame(frame);}}
 document.addEventListener('visibilitychange',function(){pageVis=!document.hidden;if(pageVis)go();});
 if(window.IntersectionObserver){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(G&&e.target===G.host)G.vis=e.isIntersecting;if(A&&e.target===A.host)A.vis=e.isIntersecting;});});
  if(G)io.observe(G.host);if(A)io.observe(A.host);
 }
 var img=document.getElementById('dv-img');
 if(img){
  img.addEventListener('load',buildMask);
  new MutationObserver(buildMask).observe(img,{attributes:true,attributeFilter:['src','style']});
 }
 if(window.ResizeObserver&&A)new ResizeObserver(function(){buildMask();}).observe(A.host);
 window.addEventListener('resize',function(){if(A)setTimeout(buildMask,60);});
 window.SMK={fan:function(v){FAN.ov=(v==null||!isFinite(+v))?null:clamp(+v,0,1);return FAN.cur;},fanCur:function(){return FAN.cur;},nps:function(){return A?A.ps.length:-1;},rebuild:buildMask,start:function(){if(G)gStart();},end:function(){if(G)gEnd();}};
 setTimeout(buildMask,400);setTimeout(buildMask,2500);
 go();
})();

;

/* 网口 WAN/LAN 切换浮窗挪到了全局的 mwrt-portsw.js(由 footer 注入, 所有页面都有):
   网口当 LAN 时插上光猫/上级路由, 哪个页面都要能弹"接入检测"提示, 浮窗跟它是一套。
   这里只把网口格按钮的 onclick 接过去。 */
window.pwmOpen=function(){if(window.mwrtPortSw)mwrtPortSw.open();};

/* === s145 网络设置浮窗（原「设置向导」的浮窗化移植，2026-11-22） ===
   #wz-btn 点击后就地弹窗，内含网络模式 / SA-NSA / APN 三样常用配置，
   复杂配置保留「更多设置」链接跳整页。数据走 admin/modem/netcfg_get/set，
   改网络模式会重拨，保存前必须二次确认。独立 IIFE，不依赖上面的内部变量。 */
(function(){
 'use strict';
 var P='/cgi-bin/luci/', data=null, busy=false;
 function $(i){return document.getElementById(i);}
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
 function get(url,cb){var x=new XMLHttpRequest();x.open('GET',url+(url.indexOf('?')<0?'?':'&')+'_='+Date.now(),true);
  x.onreadystatechange=function(){if(x.readyState!==4)return;if(x.status===200){try{cb(JSON.parse(x.responseText));}catch(e){cb(null);}}else cb(null);};x.send();}
 function open(){
  var m=$('ncfg');if(!m)return;
  var w=$('wfm');if(w&&w.parentNode&&m.parentNode!==w.parentNode)w.parentNode.insertBefore(m,w);
  var host=document.querySelector('.main-right')||$('maincontent'),left=0;
  if(host){var r=host.getBoundingClientRect();if(r.width>0&&r.left>0)left=Math.round(r.left);}
  m.style.setProperty('--wfm-l',left+'px');
  try{if(window.MRT_OVBOX)window.MRT_OVBOX();}catch(e){}
  m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  load();
 }
 function close(){var m=$('ncfg');if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';}
 function opt(v,label,cur){return '<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(label)+'</option>';}
 function load(){
  var b=$('ncfg-body');if(b)b.innerHTML='<div style="opacity:.6;font-size:13px"><i class="fas fa-circle-notch fa-spin"></i> 正在读取…</div>';
  get(P+'admin/modem/netcfg_get',function(d){
   data=d;if(!b)return;
   if(!d||d.ok!==true){b.innerHTML='<div style="color:#f87171;font-size:13px"><i class="fas fa-triangle-exclamation"></i> '+esc((d&&d.error)||'读取失败')+'</div>';return;}
   var mc=d.mode_choices||{},nc=(d.nr_capability&&d.nr_capability.choices)||{},opts='';
   for(var k in mc)opts+=opt(k,mc[k].label||k,d.mode);
   var nopts='';for(var n in nc)nopts+=opt(n,nc[n].label||n,(d.nr_capability&&d.nr_capability.mode)||'');
   b.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px;opacity:.75">'+
      '<span class="tg">'+esc((d.mode||'--').toUpperCase())+'</span><span>'+esc(d.apn||'自动识别')+'</span>'+
      (d.active?'<span style="color:#34d399">● 已连接</span>':'<span style="color:#fbbf24">○ 未连接</span>')+'</div>'+
    '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;opacity:.7;margin-bottom:4px">网络模式</label>'+
      '<select id="ncfg-mode" style="width:100%;padding:8px 10px;border-radius:8px">'+opts+'</select>'+
      '<div style="font-size:11px;opacity:.55;margin-top:3px">切换会重拨，网络短暂中断</div></div>'+
    '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;opacity:.7;margin-bottom:4px">SA / NSA</label>'+
      '<select id="ncfg-nr" style="width:100%;padding:8px 10px;border-radius:8px"'+(!d.write_supported?' disabled':'')+'>'+nopts+'</select></div>'+
    '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;opacity:.7;margin-bottom:4px">APN（留空 = 自动识别）</label>'+
      '<input type="text" id="ncfg-apn" maxlength="63" value="'+esc(d.apn||'')+'" placeholder="例如 cmnet" style="width:100%;padding:8px 10px;border-radius:8px"></div>'+
    '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;margin-top:14px">'+
      '<div><b style="font-size:13px">锁频设置</b><div style="font-size:11px;opacity:.6">只允许指定频段接入</div></div>'+
      '<button type="button" class="wfm-act-btn" onclick="ncfgBand()">打开 <i class="fas fa-arrow-right"></i></button></div>'+
    '<div id="ncfg-tip" style="font-size:12px;opacity:.7;margin-top:12px;min-height:18px"></div>';
  });
 }
 function save(){
  if(busy)return;
  var mode=$('ncfg-mode'),nr=$('ncfg-nr'),apn=$('ncfg-apn'),tip=$('ncfg-tip');
  var btn=$('ncfg-ok');
  if(!btn._ok){
   btn._ok=1;var old=btn.innerHTML;btn.innerHTML='<i class="fas fa-exclamation-triangle"></i> 确认应用？再点一次';
   if(tip)tip.textContent='保存后蜂窝会重新拨号，网络会短暂中断';
   setTimeout(function(){btn._ok=0;btn.innerHTML=old;},5000);
   return;
  }
  var params=[];
  if(mode&&mode.value!==(data&&data.mode))params.push('mode='+encodeURIComponent(mode.value));
  var nrNow=(data&&data.nr_capability&&data.nr_capability.mode)||'';
  if(nr&&!nr.disabled&&nr.value!==nrNow)params.push('nr_capability='+encodeURIComponent(nr.value));
  var apnNow=(data&&data.apn)||'';
  if(apn&&apn.value!==apnNow)params.push('apn='+encodeURIComponent(apn.value));
  if(!params.length){if(tip)tip.textContent='没有改动';btn._ok=0;return;}
  busy=true;btn.disabled=true;if(tip)tip.textContent='正在应用…';
  get(P+'admin/modem/netcfg_set?'+params.join('&'),function(d){
   busy=false;btn.disabled=false;btn._ok=0;
   if(tip)tip.textContent=(d&&d.ok)?((d.pending?'已下发，正在切换…':'已保存并应用')):((d&&d.error)||'保存失败');
   if(d&&d.ok)setTimeout(load,1500);
  });
 }
 function band(){close();try{if(typeof window.lockbandOpen==='function')window.lockbandOpen();}catch(e){} }
 document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  if(t.closest('#wz-btn')){e.preventDefault();e.stopPropagation();open();return;}
  if(t.closest('#ncfg-x')){close();return;}
 },true);
 document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
 window.ncfgOpen=open;window.ncfgClose=close;window.ncfgSave=save;window.ncfgBand=band;
})();
