/* 登录页深色:与后台同一个偏好键 mwrt-theme(dark,或 auto 且系统深色);没设过就是浅色 */
(function(){try{var t=localStorage.getItem('mwrt-theme')||'light',d=t==='dark'||(t==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.getElementById('al').className+=' al-dk';}catch(e){}})();
/* 右上角日夜切换:点一下在白天/夜间间切换并记进 mwrt-theme(后台也跟着用);图标与无障碍文字随状态更新 */
(function(){var al=document.getElementById('al'),b=document.getElementById('alTg');if(!al||!b)return;
function sync(){var dk=al.className.indexOf('al-dk')>-1;b.setAttribute('aria-label',dk?'切换到白天模式':'切换到夜间模式');b.title=dk?'切换到白天模式':'切换到夜间模式';}
sync();
b.addEventListener('click',function(){var dk=al.className.indexOf('al-dk')>-1;
al.className=al.className.replace(/\s*al-sw/g,'')+' al-sw';
if(dk)al.className=al.className.replace(/\s*al-dk/g,'');else al.className+=' al-dk';
try{localStorage.setItem('mwrt-theme',dk?'light':'dark');}catch(e){}
sync();setTimeout(function(){al.className=al.className.replace(/\s*al-sw/g,'');},500);});})();

/* 关于 Mwrt 弹窗:纯前端,登录页不依赖任何后端接口 */
var abLast=null;
function abOpen(){
  var m=document.getElementById('abMask');
  abLast=document.activeElement;
  m.classList.add('ab-open');
  /* 先上 display 再上透明度,否则同一帧内过渡不生效 */
  requestAnimationFrame(function(){
    m.classList.add('ab-in');
    var x=m.querySelector('.ab-x');
    if(x){try{x.focus({preventScroll:true});}catch(e){x.focus();}}
  });
}
function abClose(){
  var m=document.getElementById('abMask');
  m.classList.remove('ab-in');
  setTimeout(function(){m.classList.remove('ab-open');},250);
  if(abLast&&abLast.focus&&abLast!==document.body){try{abLast.focus({preventScroll:true});}catch(e){}}
}
(function(){
  var m=document.getElementById('abMask');
  /* 这个框只是介绍,点遮罩和 ESC 都可以关(跟首登强制确认的那个不同) */
  m.addEventListener('click',function(e){if(e.target===m)abClose();});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&m.classList.contains('ab-open'))abClose();
  });
  var tabs=m.querySelectorAll('.ab-tab');
  for(var i=0;i<tabs.length;i++){
    tabs[i].addEventListener('click',function(){
      var k=this.getAttribute('data-ab-tab'),j;
      for(j=0;j<tabs.length;j++)tabs[j].classList.remove('on');
      this.classList.add('on');
      var ps=m.querySelectorAll('.ab-pane');
      for(j=0;j<ps.length;j++)
        ps[j].classList.toggle('on',ps[j].getAttribute('data-ab-pane')===k);
      m.querySelector('.ab-bd').scrollTop=0;
    });
  }
})();

/* 登录页交互:角色动画 + 表单行为。原生 JS,无外部依赖。
   缓动用 power2.out 的 requestAnimationFrame 复刻(对应原项目 gsap.quickTo 的 0.2~0.3s),
   没有目标变化且全部收敛后停掉 rAF;页面隐藏时暂停并清掉所有定时器。 */
(function(){
'use strict';
var root=document.getElementById('al');
if(!root)return;
function G(i){return document.getElementById(i);}
var uEl=G('al-user'),pEl=G('al-pass'),eye=G('alEye'),form=G('alForm'),btn=G('alBtn'),btnT=G('alBtnT');
var slot=G('alSlot'),stageEl=G('alStage'),card=G('alCard');
var coarse=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
var FR=16.7,raf=0,timers={};
var S={typing:0,pwLen:0,show:0,look:0,pshow:0,scale:1,mx:0,my:0,ptype:'none',vis:false,kb:false};
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function nowT(){return (window.performance&&performance.now)?performance.now():Date.now();}

/* ---- 缓动属性:go() 设新目标就从当前值重新起一段 power2.out,与 quickTo 逐帧重设的手感一致 ---- */
var ALL=[];
function P(v){var p={c:v,f:v,t:v,s:0,d:300,a:0};ALL.push(p);return p;}
function go(p,v,d,now){
  if(Math.abs(p.t-v)<0.01)return;
  p.f=p.c;p.t=v;p.d=d;p.s=now-FR;p.a=1;
}
function step(p,now){
  if(!p.a)return 0;
  var k=(now-p.s)/p.d;
  if(k>=1){k=1;p.a=0;}
  var e=1-(1-k)*(1-k);
  p.c=p.f+(p.t-p.f)*e;
  return 1;
}

/* ---- 角色 ---- */
var C={
  pu:{el:G('alPu'),face:G('alPuF'),sk:P(0),x:P(0),h:P(400),fx:P(0),fy:P(0)},
  bl:{el:G('alBl'),face:G('alBlF'),sk:P(0),x:P(0),fx:P(0),fy:P(0)},
  or:{el:G('alOr'),face:G('alOrF'),sk:P(0),fx:P(0),fy:P(0)},
  ye:{el:G('alYe'),face:G('alYeF'),mouth:G('alYeM'),sk:P(0),fx:P(0),fy:P(0),mx:P(0),my:P(0)}
};
var SHK=P(0);
var eyeballs=[],dots=[],i,list;
if(stageEl){
  list=stageEl.querySelectorAll('.al-eyeball');
  for(i=0;i<list.length;i++)eyeballs.push({eb:list[i],pu:list[i].firstElementChild,who:list[i].getAttribute('data-who'),max:+list[i].getAttribute('data-max')||5,x:P(0),y:P(0)});
  list=stageEl.querySelectorAll('.al-dot');
  for(i=0;i<list.length;i++)dots.push({el:list[i],who:list[i].getAttribute('data-who'),max:+list[i].getAttribute('data-max')||5,x:P(0),y:P(0)});
}

function calcPos(e){
  var r=e.getBoundingClientRect();
  var dx=(S.mx-(r.left+r.width/2))/S.scale,dy=(S.my-(r.top+r.height/3))/S.scale;
  return {fx:clamp(dx/20,-15,15),fy:clamp(dy/30,-10,10),bs:clamp(-dx/120,-6,6)};
}
function eyeVec(e,max,ox,oy){
  var r=e.getBoundingClientRect(),sc=S.scale;
  var dx=(S.mx-(r.left+r.width/2-ox*sc))/sc,dy=(S.my-(r.top+r.height/2-oy*sc))/sc;
  var d=Math.min(Math.sqrt(dx*dx+dy*dy),max),a=Math.atan2(dy,dx);
  return {x:Math.cos(a)*d,y:Math.sin(a)*d};
}

/* 每帧由当前指针/状态算各部件目标值(规则与原项目 tick 一致) */
function compute(now){
  var showing=S.pwLen>0&&S.show,hiding=S.pwLen>0&&!S.show,ty=S.typing,lk=S.look&&!showing;
  if(showing)return;               /* 显示密码:目标在 applyShow() 里一次性给定 */
  var pu=C.pu,bl=C.bl,or=C.or,ye=C.ye,v,k;
  var pp=calcPos(pu.el),bp=calcPos(bl.el),op=calcPos(or.el),yp=calcPos(ye.el);
  if(ty||hiding){go(pu.sk,pp.bs-12,300,now);go(pu.x,40,300,now);go(pu.h,440,300,now);}
  else{go(pu.sk,pp.bs,300,now);go(pu.x,0,300,now);go(pu.h,400,300,now);}
  if(lk){go(bl.sk,bp.bs*1.5+10,300,now);go(bl.x,20,300,now);}
  else if(ty||hiding){go(bl.sk,bp.bs*1.5,300,now);go(bl.x,0,300,now);}
  else{go(bl.sk,bp.bs,300,now);go(bl.x,0,300,now);}
  go(or.sk,op.bs,300,now);go(ye.sk,yp.bs,300,now);
  if(lk){                           /* 输入账号的前 0.8 秒:紫黑两个互相对视 */
    go(pu.fx,10,300,now);go(pu.fy,25,300,now);go(bl.fx,6,300,now);go(bl.fy,-20,300,now);
  }else{
    go(pu.fx,pp.fx>=0?Math.min(25,pp.fx*1.5):pp.fx,300,now);go(pu.fy,pp.fy,300,now);
    go(bl.fx,bp.fx,300,now);go(bl.fy,bp.fy,300,now);
  }
  go(or.fx,op.fx,200,now);go(or.fy,op.fy,200,now);
  go(ye.fx,yp.fx,200,now);go(ye.fy,yp.fy,200,now);
  go(ye.mx,yp.fx,200,now);go(ye.my,yp.fy,200,now);
  for(k=0;k<dots.length;k++){
    v=eyeVec(dots[k].el,dots[k].max,dots[k].x.c,dots[k].y.c);
    go(dots[k].x,v.x,100,now);go(dots[k].y,v.y,100,now);
  }
  for(k=0;k<eyeballs.length;k++){
    var b=eyeballs[k];
    if(lk){
      if(b.who==='pu'){go(b.x,3,300,now);go(b.y,4,300,now);}
      else{go(b.x,0,300,now);go(b.y,-4,300,now);}
    }else{
      v=eyeVec(b.eb,b.max,0,0);go(b.x,v.x,100,now);go(b.y,v.y,100,now);
    }
  }
}
/* 显示密码:全体转头回避(坐标取自原项目 applyShowPassword) */
function applyShow(){
  var n=nowT(),pu=C.pu,bl=C.bl,or=C.or,ye=C.ye,k,b;
  go(pu.sk,0,300,n);go(bl.sk,0,300,n);go(or.sk,0,300,n);go(ye.sk,0,300,n);
  go(pu.x,0,300,n);go(bl.x,0,300,n);go(pu.h,400,300,n);
  go(pu.fx,-25,300,n);go(pu.fy,-5,300,n);go(bl.fx,-16,300,n);go(bl.fy,-4,300,n);
  go(or.fx,-32,200,n);go(or.fy,-5,200,n);go(ye.fx,-32,200,n);go(ye.fy,-5,200,n);
  go(ye.mx,-30,200,n);go(ye.my,0,200,n);
  for(k=0;k<eyeballs.length;k++){b=eyeballs[k];go(b.x,-4,300,n);go(b.y,-4,300,n);}
  for(k=0;k<dots.length;k++){b=dots[k];go(b.x,-5,300,n);go(b.y,-4,300,n);}
}
function r2(v){return Math.round(v*100)/100;}
function render(){
  var pu=C.pu,bl=C.bl,or=C.or,ye=C.ye,k,sh=SHK.c;
  pu.el.style.transform='translateX('+r2(pu.x.c)+'px) skewX('+r2(pu.sk.c)+'deg)';
  pu.el.style.height=r2(pu.h.c)+'px';
  bl.el.style.transform='translateX('+r2(bl.x.c)+'px) skewX('+r2(bl.sk.c)+'deg)';
  or.el.style.transform='skewX('+r2(or.sk.c)+'deg)';
  ye.el.style.transform='skewX('+r2(ye.sk.c)+'deg)';
  pu.face.style.transform='translate('+r2(pu.fx.c+sh)+'px,'+r2(pu.fy.c)+'px)';
  bl.face.style.transform='translate('+r2(bl.fx.c+sh)+'px,'+r2(bl.fy.c)+'px)';
  or.face.style.transform='translate('+r2(or.fx.c+sh)+'px,'+r2(or.fy.c)+'px)';
  ye.face.style.transform='translate('+r2(ye.fx.c+sh)+'px,'+r2(ye.fy.c)+'px)';
  ye.mouth.style.transform='translate('+r2(ye.mx.c+sh)+'px,'+r2(ye.my.c)+'px)';
  for(k=0;k<eyeballs.length;k++)eyeballs[k].pu.style.transform='translate('+r2(eyeballs[k].x.c)+'px,'+r2(eyeballs[k].y.c)+'px)';
  for(k=0;k<dots.length;k++)dots[k].el.style.transform='translate('+r2(dots[k].x.c)+'px,'+r2(dots[k].y.c)+'px)';
}
function frame(){
  raf=0;
  if(document.hidden||!S.vis)return;
  var t=nowT(),act=0,k;
  compute(t);
  for(k=0;k<ALL.length;k++)if(step(ALL[k],t))act=1;
  render();
  if(act)raf=requestAnimationFrame(frame);   /* 全部收敛就停,不空转 */
}
function kick(){if(!raf&&!document.hidden&&S.vis)raf=requestAnimationFrame(frame);}

/* ---- 眨眼(紫/黑各自随机 3~7 秒)、偷看(显示密码时紫色)、对视计时:都是 setTimeout,隐藏时全清 ---- */
var puEB=[],blEB=[];
for(i=0;i<eyeballs.length;i++)(eyeballs[i].who==='pu'?puEB:blEB).push(eyeballs[i].eb);
function blink(key,eb){
  clearTimeout(timers[key]);clearTimeout(timers[key+'o']);
  if(document.hidden||!eb.length)return;
  timers[key]=setTimeout(function(){
    var j;
    for(j=0;j<eb.length;j++)eb[j].classList.add('al-blink');
    timers[key+'o']=setTimeout(function(){
      for(j=0;j<eb.length;j++)eb[j].classList.remove('al-blink');
      blink(key,eb);
    },150);
  },3000+Math.random()*4000);
}
function startBlink(){blink('bp',puEB);blink('bb',blEB);}
function schedulePeek(){
  clearTimeout(timers.pk);clearTimeout(timers.pk2);
  if(document.hidden)return;
  timers.pk=setTimeout(function(){
    if(!(S.pwLen>0&&S.show))return;
    var n=nowT(),j;
    for(j=0;j<eyeballs.length;j++)if(eyeballs[j].who==='pu'){go(eyeballs[j].x,4,300,n);go(eyeballs[j].y,5,300,n);}
    go(C.pu.fx,-25,300,n);go(C.pu.fy,-5,300,n);
    kick();
    timers.pk2=setTimeout(function(){
      var n2=nowT(),q;
      for(q=0;q<eyeballs.length;q++)if(eyeballs[q].who==='pu'){go(eyeballs[q].x,-4,300,n2);go(eyeballs[q].y,-4,300,n2);}
      kick();schedulePeek();
    },800);
  },2000+Math.random()*3000);
}
function lookFx(){
  clearTimeout(timers.lk);
  if(S.typing&&!(S.pwLen>0&&S.show)){
    S.look=1;
    timers.lk=setTimeout(function(){S.look=0;kick();},800);
  }else S.look=0;
  kick();
}
function stateChanged(){
  var showing=S.pwLen>0&&S.show?1:0;
  if(showing!==S.pshow){
    S.pshow=showing;
    if(showing){applyShow();schedulePeek();}
    else{clearTimeout(timers.pk);clearTimeout(timers.pk2);}
    lookFx();
  }
  kick();
}
/* 登录失败:克制的反馈——四个角色脸轻轻左右晃两下,紫黑眼睛微眯一会儿 */
function shake(){
  if(!stageEl||document.hidden)return;
  var seq=[-6,6,-4,4,-2,0],q=0;
  stageEl.classList.add('al-squint');
  (function nxt(){
    if(q>=seq.length||document.hidden)return;
    go(SHK,seq[q++],70,nowT());kick();
    timers.sk=setTimeout(nxt,85);
  })();
  timers.sq=setTimeout(function(){stageEl.classList.remove('al-squint');},1000);
}

/* ---- 指针 / 触点 ---- */
function onPtr(e){
  S.mx=e.clientX;S.my=e.clientY;
  S.ptype=e.pointerType||'mouse';
  kick();
}
function onTouch(e){
  var t=e.touches&&e.touches[0];
  if(t){S.mx=t.clientX;S.my=t.clientY;S.ptype='touch';kick();}
}
function aimAt(el){
  if(!el)return;
  var r=el.getBoundingClientRect();
  S.mx=r.left+r.width/2;S.my=r.top+r.height/2;kick();
}
window.addEventListener('pointermove',onPtr,{passive:true});
window.addEventListener('pointerdown',onPtr,{passive:true});
window.addEventListener('touchstart',onTouch,{passive:true});
window.addEventListener('touchmove',onTouch,{passive:true});
root.addEventListener('scroll',function(){kick();},{passive:true});

/* ---- 缩放:按 .al-slot 实际可用大小算 --s,舞台整体等比缩放 ---- */
function fitScale(){
  if(!slot)return;
  var w=slot.clientWidth,h=slot.clientHeight;
  if(!w||!h){S.vis=false;return;}
  var s=Math.min(1,(w-6)/450,h/400);
  s=Math.max(0.2,Math.floor(s*1000)/1000);
  S.vis=true;
  if(s!==S.scale){S.scale=s;root.style.setProperty('--s',s);}
}
function relayout(){
  fitScale();
  if(S.ptype==='none')aimAt(card);
  kick();
}
window.addEventListener('resize',relayout);
window.addEventListener('orientationchange',function(){setTimeout(relayout,200);});
if(window.ResizeObserver&&slot){try{new ResizeObserver(function(){fitScale();kick();}).observe(slot);}catch(e){}}

/* ---- 软键盘:visualViewport 变矮就把页面高度收到可视区,并把聚焦的输入框滚进来 ---- */
var vv=window.visualViewport;
function reveal(el){
  if(!el)return;
  clearTimeout(timers.rv);
  timers.rv=setTimeout(function(){
    try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){el.scrollIntoView(false);}
  },S.kb?60:320);
}
function vvFix(){
  if(!vv)return;
  var kb=(window.innerHeight-vv.height)>120;
  if(kb){
    root.style.setProperty('--al-h',Math.round(vv.height)+'px');
    root.style.top=Math.round(vv.offsetTop)+'px';
  }else{
    root.style.removeProperty('--al-h');
    root.style.top='';
  }
  if(kb!==S.kb){
    S.kb=kb;root.classList.toggle('al-kb',kb);
    if(kb&&document.activeElement&&document.activeElement.tagName==='INPUT')reveal(document.activeElement);
  }
  fitScale();kick();
}
if(vv){vv.addEventListener('resize',vvFix);vv.addEventListener('scroll',vvFix);}

/* ---- 表单 ---- */
function syncPw(){
  var n=pEl?pEl.value.length:0;
  if(n!==S.pwLen){S.pwLen=n;stateChanged();}
}
if(uEl){
  uEl.addEventListener('focus',function(){S.typing=1;lookFx();});
  uEl.addEventListener('blur',function(){S.typing=0;lookFx();});
}
if(pEl){
  pEl.addEventListener('input',syncPw);
  pEl.addEventListener('change',syncPw);
}
form.addEventListener('focusin',function(e){
  var t=e.target;
  if(!t||t.tagName!=='INPUT')return;
  if(S.ptype!=='mouse')aimAt(t);     /* 没有鼠标时,眼睛看向当前聚焦的输入框 */
  if(coarse||S.kb)reveal(t);
});
if(eye&&pEl){
  var wasFocus=false;
  function rememberFocus(){wasFocus=(document.activeElement===pEl);}
  eye.addEventListener('mousedown',function(e){e.preventDefault();});   /* 不抢输入框焦点,手机键盘不收 */
  eye.addEventListener('pointerdown',rememberFocus);
  eye.addEventListener('touchstart',rememberFocus,{passive:true});
  eye.addEventListener('click',function(){
    S.show=S.show?0:1;
    pEl.type=S.show?'text':'password';
    eye.classList.toggle('al-on',!!S.show);
    eye.setAttribute('aria-pressed',S.show?'true':'false');
    eye.setAttribute('aria-label',S.show?'隐藏密码':'显示密码');
    if(wasFocus){try{pEl.focus({preventScroll:true});}catch(e){pEl.focus();}}
    stateChanged();
  });
}
/* 提交:真实 POST,按钮进入“登录中…”并防重复;后退缓存(pageshow)时恢复 */
var busy=false;
function setBusy(b){
  busy=b;
  btn.classList.toggle('al-busy',b);
  btn.setAttribute('aria-disabled',b?'true':'false');
  btnT.textContent=b?'登录中…':'登录';
}
form.addEventListener('submit',function(e){
  if(busy){e.preventDefault();return;}
  setBusy(true);
  clearTimeout(timers.bz);
  timers.bz=setTimeout(function(){setBusy(false);},20000);   /* 服务器久无响应时别把按钮永久锁死 */
});
window.addEventListener('pageshow',function(e){
  clearTimeout(timers.bz);setBusy(false);
  if(e.persisted){syncPw();kick();}
});

/* ---- 页面可见性:隐藏时停 rAF 并清定时器,显示时再恢复 ---- */
function clearAll(){
  var k;
  for(k in timers)if(timers.hasOwnProperty(k)&&k!=='bz')clearTimeout(timers[k]);
  for(k=0;k<puEB.length;k++)puEB[k].classList.remove('al-blink');
  for(k=0;k<blEB.length;k++)blEB[k].classList.remove('al-blink');
  if(stageEl)stageEl.classList.remove('al-squint');
  S.look=0;
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden){
    if(raf){cancelAnimationFrame(raf);raf=0;}
    clearAll();
  }else{
    startBlink();
    if(S.pshow)schedulePeek();
    relayout();
  }
});
window.addEventListener('pagehide',function(){
  if(raf){cancelAnimationFrame(raf);raf=0;}
  clearAll();
});

/* ---- 启动 ---- */
fitScale();
vvFix();
aimAt(card);
startBlink();
render();
kick();
setTimeout(syncPw,400);setTimeout(syncPw,1500);   /* 密码管理器自动填充不一定触发 input */
if(root.getAttribute('data-err')==='1')setTimeout(shake,500);
/* 页面载入后密码框自动聚焦(原页面行为)。触屏设备不自动聚焦:否则载入就弹软键盘,会把角色舞台挤没 */
if(pEl&&!coarse){try{pEl.focus({preventScroll:true});}catch(e){pEl.focus();}}
})();
