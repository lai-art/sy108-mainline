/*
 * mwrt-aurora-boot.js —— aurora 皮肤的启动脚本
 *
 * 作为 <body> 开头的同步脚本执行: 此时 <head> 里的样式表已经解析进 CSSOM,
 * 但文档还没首次绘制, 所以下面的停用和深浅模式设置不会闪一下旧配色。
 *
 * 干几件事:
 *   1. 整站深浅模式 (s107) —— 唯一来源是 html[data-darkmode]。
 *      偏好存在浏览器 localStorage 的 mwrt-theme (light|dark|auto, 缺省 light),
 *      旧键 mrt-t(首页日夜键)一次性迁移, 写入时回写 mrt-t 兼容旧缓存页。
 *      window.MwrtTheme 对外提供 get/set/toggle/effective/isLightOnly,
 *      状态变化时在 document 上发 CustomEvent 'mwrt-theme'。
 *      LIGHT_ONLY 名单里的页面(暂未适配深色)强制浅色并给 html 打 data-mwrt-lightonly=1。
 *   2. 停用 argon 的两个本地定制表:
 *        argon-menu-custom.css    深色霓虹侧边栏 + 深色顶栏
 *        argon-global-custom.css  #388087 青绿控件皮
 *      这两份整份都是 !important, 留着就得逐条对着压; 直接标成
 *      media="not all" 更干净, 且不改硬盘上的任何文件。
 *   3. 停用 argon 内联的 dark.css —— 它藏在 <head> 的 <style> 里,
 *      包在 @media (prefers-color-scheme: dark) 中。无条件静音:
 *      深色只认 data-darkmode 一个来源, 不和 aurora 暗色板叠加。
 *
 * 全部包在 try/catch 里: 出错就退回 argon 原样, 页面功能不受影响。
 */
(function () {
	'use strict';

	/* ── 0. 仅浅色页面名单 (s107) ────────────────────────────────────────────
	 * 命中的页面强制浅色(data-darkmode=false)并设 html[data-mwrt-lightonly]=1,
	 * 切换键在这些页面只给「此页暂不支持深色模式」的提示。
	 * 适配完一页就从这里删一项。写法: 路径片段, 匹配 location.pathname 里
	 * 「/cgi-bin/luci」之后的部分, 整段或前缀均可(后面必须是结尾或 /)。
	 * 登录页不加载本脚本, 保持现状(浅色)。 */
	var LIGHT_ONLY = [
		'/admin/modem/webui'      /* 5700 WEBUI (iframe 内是独立 SPA, 暂无深色) */
	];

	var THEME_KEY = 'mwrt-theme';     /* light | dark | auto */
	var OLD_KEY = 'mrt-t';            /* 旧首页日夜键: dark | light */
	var html = document.documentElement;
	var memPref = null;               /* localStorage 不可用时的内存兜底 */

	function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

	function isLightOnly() {
		try {
			var p = location.pathname || '';
			var i = p.indexOf('/cgi-bin/luci');
			if (i !== -1) p = p.slice(i + 13);
			p = p.replace(/\/+$/, '');
			for (var n = 0; n < LIGHT_ONLY.length; n++) {
				var s = LIGHT_ONLY[n];
				if (p === s || p.indexOf(s + '/') === 0) return true;
			}
		} catch (e) { /* ignore */ }
		return false;
	}

	/* 读偏好: mwrt-theme 优先; 它不存在而旧键 mrt-t 是 dark → 一次性迁移成 dark */
	function readPref() {
		var v = lsGet(THEME_KEY);
		if (v === 'light' || v === 'dark' || v === 'auto') return v;
		if (lsGet(OLD_KEY) === 'dark') { lsSet(THEME_KEY, 'dark'); return 'dark'; }
		return memPref || 'light';
	}

	var mq = null;
	try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }
	function sysDark() { return !!(mq && mq.matches); }

	var pref = 'light';
	try { pref = readPref(); } catch (e) { pref = 'light'; }

	/* 不考虑 LIGHT_ONLY 时用户「想要」的深浅 */
	function wantDark() { return pref === 'auto' ? sysDark() : pref === 'dark'; }
	/* 当前页面实际生效 */
	function effectiveDark() { return isLightOnly() ? false : wantDark(); }

	function applyDom() {
		try {
			var d = effectiveDark();
			html.setAttribute('data-darkmode', d ? 'true' : 'false');
			html.style.colorScheme = d ? 'dark' : 'light';
			if (isLightOnly()) html.setAttribute('data-mwrt-lightonly', '1');
			else html.removeAttribute('data-mwrt-lightonly');
		} catch (e) { /* ignore */ }
	}

	function emit() {
		try {
			var ev;
			var detail = { pref: pref, dark: effectiveDark(), lightOnly: isLightOnly() };
			if (typeof window.CustomEvent === 'function') ev = new CustomEvent('mwrt-theme', { detail: detail });
			else { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('mwrt-theme', false, false, detail); }
			document.dispatchEvent(ev);
		} catch (e) { /* ignore */ }
	}

	var MwrtTheme = {
		get: function () { return pref; },
		effective: function () { return effectiveDark() ? 'dark' : 'light'; },
		isLightOnly: isLightOnly,
		set: function (v) {
			if (v !== 'light' && v !== 'dark' && v !== 'auto') return false;
			pref = v; memPref = v;
			lsSet(THEME_KEY, v);
			lsSet(OLD_KEY, wantDark() ? 'dark' : 'light');   /* 回写旧键, 兼容旧缓存页 */
			applyDom(); emit();
			return true;
		},
		/* 按用户看到的状态取反, 写成显式 light/dark; 仅浅色页面只提示不切换 */
		toggle: function () {
			if (isLightOnly()) { MwrtTheme.hint('此页暂不支持深色模式'); return false; }
			return MwrtTheme.set(effectiveDark() ? 'light' : 'dark');
		},
		hint: function (text) { try { showHint(text); } catch (e) { /* ignore */ } }
	};
	window.MwrtTheme = MwrtTheme;

	applyDom();

	/* 多标签/同源 iframe 同步: 别处改了偏好, 这里跟着重读 */
	try {
		window.addEventListener('storage', function (e) {
			if (e.key !== null && e.key !== THEME_KEY) return;
			var np = lsGet(THEME_KEY);
			if (np !== 'light' && np !== 'dark' && np !== 'auto') np = 'light';
			if (np === pref && e.key !== null) return;
			pref = np; memPref = np;
			applyDom(); emit();
		});
	} catch (e) { /* ignore */ }
	/* 跟随系统: 系统深浅变了, auto 时同步 */
	try {
		var onMq = function () { if (pref === 'auto') { applyDom(); emit(); } };
		if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
		else if (mq && mq.addListener) mq.addListener(onMq);
	} catch (e) { /* ignore */ }

	/* 把一个样式表节点彻底静音 */
	/* bian kuang dang wei(hou tai si zhou): mwrtst san duan kongjian xie
	   localStorage(mwrt-border), mei ye gei body/.main she neilian style
	   (padding/border-radius important) —— CSS class ya bu dong yuansheng 5px,
	   zhiyou neilian ke kao. round=5px/14px mini=3px/7px none=0/0. */
	var MWRT_BD={round:["5px","14px"],mini:["3px","7px"],none:["0px","0px"],capsule:["0px","0px"],catcap:["0px","0px"]};
	/* s115: capsule = 「胶囊主题」, catcap = 「猫の胶囊」(多加 mwrt-catcap 类, 白天可爱配色): 页面四周无边距无圆角, html 上加 mwrt-capsule 类, chrome.css 里悬浮侧栏样式只认这个类 */
	/* s119: 猫の胶囊「自定义配色」—— 两个颜色(起点/终点) + 渐变角度 + 透明度(底色是纯白: 颜色以该透明度叠在白底上),
	   由它们推出整套 --cc-* 变量(左侧栏底色/文字明暗/品牌色/按钮渐变/卡片底/光晕…), 内联写在 <html> 上;
	   chrome.css 里猫の胶囊(和圆环卡/顶部卡)的颜色都写成 var(--cc-xxx, 原色), 没设置(或不是猫の胶囊/手机)时变量不存在, 外观不变。
	   侧栏底色太深时自动换白字。localStorage: mwrt-catstyle = {"a":"#rrggbb","b":"#rrggbb","ang":0-360,"op":0-100}; 旧版 mwrt-catcolor(单色)自动迁移。 */
	var CC_KEYS=["brand","brandh","deep","deep2","link","rgb","rgb2","rgb3","rgbh","rgbs","rgbp","pink","pink2","pink3","ink","ink2","ink3","ink3b","mute","ink4","text","headfg","subtle","subtleh","sunken","sb-bg","sec-bg","head-bg","sbt","sbt2","sbt3","sbac","sbaf","sbab","sbh","sbhair","page","ca","cb","dkd","dk-bg"];
	var CC_DEF={a:"#8b6cf6",b:"#ff8fb8",ang:168,op:32};
	var CC_PRESETS=[
		["樱花紫","#8b6cf6","#ff8fb8",168,32],["海盐蓝","#3b82f6","#22d3ee",160,28],["薄荷绿","#10b981","#5eead4",160,30],["日落橙","#f97316","#fbbf24",150,30],
		["玫瑰红","#e11d48","#fb7185",165,26],["晴空紫","#0ea5e9","#a78bfa",150,30],["石墨银","#475569","#cbd5e1",170,38],["夜海","#1e3a8a","#0ea5e9",160,92]
	];
	function ccHsl(h,s,l){
		h=((h%360)+360)%360;s=Math.max(0,Math.min(1,s));l=Math.max(0,Math.min(1,l));
		var a=s*Math.min(l,1-l);
		function f(n){var k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));}
		return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];
	}
	function ccCss(h,s,l){return "rgb("+ccHsl(h,s,l).join(",")+")";}
	function ccTri(h,s,l){return ccHsl(h,s,l).join(" ");}
	function ccRgb(hex){var m=/^#?([0-9a-f]{6})$/i.exec(hex||"");if(!m)return null;var n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255];}
	function ccHex(c){return "#"+c.map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?"0":"")+v.toString(16);}).join("");}
	function ccToHsl(c){
		var r=c[0]/255,g=c[1]/255,b=c[2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),L=(mx+mn)/2,d=mx-mn,S=d===0?0:d/(1-Math.abs(2*L-1)),h=0;
		if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}
		return [h,S,L];
	}
	function ccLum(c){
		var q=c.map(function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
		return .2126*q[0]+.7152*q[1]+.0722*q[2];
	}
	function ccOver(c,al){return c.map(function(v){return 255-al*(255-v);});}
	/* 渐变底: 起点→终点色以透明度 al 叠在纯白上 */
	function ccGrad(ang,A,B,al){
		return "linear-gradient("+ang+"deg,rgb("+A.join(" ")+" / "+al.toFixed(3)+"),rgb("+B.join(" ")+" / "+al.toFixed(3)+")),linear-gradient(#fff,#fff)";
	}
	function ccNorm(o){
		var a=ccRgb(o&&o.a),b=ccRgb(o&&o.b),g=+(o&&o.ang),p=+(o&&o.op);
		if(!a||!b||!isFinite(g)||!isFinite(p))return null;
		return {a:ccHex(a),b:ccHex(b),ang:Math.round(((g%360)+360)%360),op:Math.max(0,Math.min(100,Math.round(p)))};
	}
	function ccStored(){
		try{
			var j=localStorage.getItem("mwrt-catstyle");
			if(j){var o=ccNorm(JSON.parse(j));if(o)return o;}
			var x=localStorage.getItem("mwrt-catcolor"),c=ccRgb(x);
			if(c){var hs=ccToHsl(c);return {a:ccHex(c),b:ccHex(ccHsl(hs[0]+45,Math.max(hs[1],.6),.62)),ang:CC_DEF.ang,op:30};}
		}catch(e){}
		return null;
	}
	function ccSave(S){try{localStorage.setItem("mwrt-catstyle",JSON.stringify(S));localStorage.removeItem("mwrt-catcolor");}catch(e){}}
	function ccPalette(S){
		var A=ccRgb(S.a),B=ccRgb(S.b);if(!A||!B)return null;
		var ha=ccToHsl(A),hb=ccToHsl(B),h=ha[0],Sa=Math.max(.3,ha[1]),La=Math.min(.58,Math.max(.3,ha[2])),
			Sb=Math.max(.5,hb[1]),Lb=Math.min(.72,Math.max(.55,hb[2])),c=Math.max,al=S.op/100,as=Math.min(.3,al*.3),
			eA=ccOver(A,al),eB=ccOver(B,al),eL=ccLum([(eA[0]+eB[0])/2,(eA[1]+eB[1])/2,(eA[2]+eB[2])/2]),dark=eL<.36,
			br=ccHsl(h,Sa,La),pg=ccOver([(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2],.07);
		var p={
			"brand":"rgb("+br.join(",")+")","brandh":ccCss(h,Sa,c(.2,La-.08)),"deep":ccCss(h,Sa,c(.25,La-.18)),"deep2":ccCss(h,Sa,c(.22,La-.26)),"link":ccCss(h,Sa,c(.2,La-.04)),
			"rgb":br.join(" "),"rgb2":ccTri(h,c(Sa,.8),.66),"rgb3":ccTri(hb[0],c(Sb,.7),.58),"rgbh":ccTri(h,.5,.6),"rgbs":ccTri(hb[0],.5,.65),"rgbp":ccTri(hb[0],.9,.7),
			"pink":ccCss(hb[0],Sb,Lb),"pink2":ccCss(hb[0],Sb,Lb-.02),"pink3":ccCss(hb[0],Sb,Lb+.03),
			"ink":ccCss(h,.3,.27),"ink2":ccCss(h,.2,.5),"ink3":ccCss(h,.3,.69),"ink3b":ccCss(h,.2,.64),"mute":ccCss(h,.2,.61),"ink4":ccCss(h,.27,.38),
			"text":ccCss(h,.34,.24),"headfg":ccCss(h,.36,.38),
			"subtle":ccCss(h,.8,.96),"subtleh":ccCss(h,.7,.93),"sunken":ccCss(h,.8,.985),
			"sb-bg":ccGrad(S.ang,A,B,al),
			"sec-bg":ccGrad(S.ang,A,B,as),
			"head-bg":ccGrad(S.ang,A,B,Math.min(.4,as*1.5)),
			"page":"rgb("+pg.map(Math.round).join(",")+")",
			"ca":ccHex(A),"cb":ccHex(B),"dkd":ccCss(h,Sa,.72),
			"dk-bg":(function(){var a=Math.min(.5,.1+al*.45).toFixed(3);return "linear-gradient("+S.ang+"deg,rgb("+A.join(" ")+" / "+a+"),rgb("+B.join(" ")+" / "+a+")),linear-gradient(#141822,#141822)";})()
		};
		if(dark){
			p.sbt="#f5f7fc";p.sbt2="rgb(255 255 255 / .8)";p.sbt3="rgb(255 255 255 / .52)";p.sbac=ccCss(ha[0],.9,.72);p.sbaf="#fff";
			p.sbab="rgb(255 255 255 / .2)";p.sbh="rgb(255 255 255 / .1)";p.sbhair="rgb(255 255 255 / .2)";
		}else{
			p.sbt=ccCss(h,.3,.2);p.sbt2=ccCss(h,.2,.36);p.sbt3=ccCss(h,.18,.52);p.sbac=p.brand;p.sbaf=p.deep;
			p.sbab="rgb(255 255 255 / .92)";p.sbh="rgb(255 255 255 / .55)";p.sbhair="rgb("+br.join(" ")+" / .22)";
		}
		return p;
	}
	function applyCatColor(on){
		try{
			var st=document.documentElement.style,S=on?ccStored():null,p=S?ccPalette(S):null,i;
			for(i=0;i<CC_KEYS.length;i++){if(p&&p[CC_KEYS[i]])st.setProperty("--cc-"+CC_KEYS[i],p[CC_KEYS[i]]);else st.removeProperty("--cc-"+CC_KEYS[i]);}
			document.documentElement.classList[p?"add":"remove"]("mwrt-ccset");
		}catch(e){}
	}
	function applyCapsuleCls(v){
		try{var cl=document.documentElement.classList;cl[(v==="capsule"||v==="catcap")?"add":"remove"]("mwrt-capsule");cl[v==="catcap"?"add":"remove"]("mwrt-catcap");}catch(e){}
		applyCatColor(v==="catcap");
	}
	function applyBorderPref(){
		try{
			var v=null;try{v=window.localStorage.getItem("mwrt-border");}catch(e){return;}
			/* 手机(<=768px)只有默认这一套外观: 不吃 PC 上选的圆角/胶囊/猫の胶囊, 也不写 body/.main 的内联边距 */
			if(window.innerWidth<=768){
				applyCapsuleCls(null);
				/* 边距/圆角固定用"圆角"档(四周 5px、内容区 14px 圆角); 底边不留 body 内边距, 胶囊底栏的位置由 .main-right 自己留 */
				if(document.body){document.body.style.setProperty("padding","5px","important");document.body.style.setProperty("padding-bottom","5px","important");}
				var mn0=document.querySelector(".main");if(mn0)mn0.style.setProperty("border-radius","14px","important");
				return;
			}
			applyCapsuleCls(v);
			if(!MWRT_BD[v])return;
			var pad=MWRT_BD[v][0],rad=MWRT_BD[v][1];
			/* s79: di bian bu neng zhi jie xie pad —— neilian important hui ba yidongduan
			   gei di bu dao hang lan yuliu de padding-bottom(52px+safe-area) ya diao,
			   ye mian zui xia mian de an niu bei dao hang lan dang zhu. di bian zou
			   --mwrt-nav-reserve(chrome.css s79 zhi zai you di lan shi ding yi), PC hui luo pad. */
			if(document.body){
				document.body.style.setProperty("padding",pad,"important");
				document.body.style.setProperty("padding-bottom","var(--mwrt-nav-reserve, "+pad+")","important");
			}
			var mn=document.querySelector(".main");
			if(mn)mn.style.setProperty("border-radius",rad,"important");
		}catch(e){}
	}
	function watchBorderPref(){
		try{
			applyBorderPref();
			if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",applyBorderPref);}
			setTimeout(applyBorderPref,0);setTimeout(applyBorderPref,300);
			window.addEventListener("resize",applyBorderPref);
		}catch(e){}
	}
	try{watchBorderPref();}catch(e){}

	/* s115: PC 侧栏左下角「主题设置」按钮 —— 点开浮窗, 选 Mwrt设定→边框设置 里的五个主题(同一个 localStorage mwrt-border)。
	   选「猫の胶囊」时顺带请求后台把桌面猫咪和趣玩中心打开(改了才刷新本页, 让猫和菜单立刻出现)。 */
	var TSET_ITEMS=[
		["round","经典圆角","默认,四周留边","#dfe5f2"],
		["mini","经典微边","边距更小","#cdd6e8"],
		["none","经典无边","铺满整个窗口","#b9c3d9"],
		["capsule","胶囊主题","悬浮侧栏 + 胶囊内容区","linear-gradient(135deg,#ffffff,#e6ebf7)"],
		["catcap","猫の胶囊","可爱粉紫,自动开猫咪和趣玩中心","linear-gradient(135deg,#ffd6e8,#e3d4ff)"]
	];
	function tsetCur(){try{var v=localStorage.getItem("mwrt-border");return MWRT_BD[v]?v:"round";}catch(e){return "round";}}
	function tsetCatOn(){
		try{
			var en=(window.L&&window.L.env)||{};if(!en.token)return;
			var x=new XMLHttpRequest();
			x.open("POST",(en.scriptname||"/cgi-bin/luci")+"/admin/fancontrol/catshow_on",true);
			x.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
			x.onload=function(){try{var r=JSON.parse(x.responseText);if(r&&r.ok&&r.changed)location.reload();}catch(e){}};
			x.send("token="+encodeURIComponent(en.token));
		}catch(e){}
	}
	function tsetPick(v){
		try{localStorage.setItem("mwrt-border",v);}catch(e){}
		applyBorderPref();
		try{document.dispatchEvent(new CustomEvent("mwrt-border"));}catch(e){}
		if(v==="catcap")tsetCatOn();
		tsetMark();
	}
	/* s119: 浮窗里的「自定义配色」面板 —— 预览条 / 预设 / 起止色 / 角度转盘 / 透明度 */
	var ccS=null;
	function ccEl(id){return document.getElementById(id);}
	function ccCur(){return ccS||(ccS=ccStored()||{a:CC_DEF.a,b:CC_DEF.b,ang:CC_DEF.ang,op:CC_DEF.op});}
	function ccUiPaint(S){
		var cc=ccEl("mwrt-cc");if(!cc)return;
		var p=ccPalette(S),sty=cc.style,i,pe=cc.querySelectorAll(".cc-ps div");
		ccEl("mwrt-cc-a").value=S.a;ccEl("mwrt-cc-b").value=S.b;
		ccEl("mwrt-cc-ang").value=S.ang;ccEl("mwrt-cc-op").value=S.op;
		ccEl("mwrt-cc-angv").textContent=S.ang+"°";ccEl("mwrt-cc-opv").textContent=S.op+"%";
		ccEl("mwrt-cc-dial").firstChild.style.transform="rotate("+S.ang+"deg)";
		ccEl("mwrt-cc-bar").style.background="linear-gradient(90deg,"+S.a+","+S.b+")";
		ccEl("mwrt-cc-op").style.setProperty("--rg","linear-gradient(90deg,#fff,"+S.a+")");
		if(p){
			sty.setProperty("--pv-sb",p["sb-bg"]);sty.setProperty("--pv-tx",p.sbt);sty.setProperty("--pv-act",p.sbaf);sty.setProperty("--pv-hl",p.sbhair);
			sty.setProperty("--pv-b1",p.brand);sty.setProperty("--pv-b2",p.pink);sty.setProperty("--pv-sec",p["sec-bg"]);sty.setProperty("--pv-pg",p.page);
		}
		for(i=0;i<pe.length;i++){var q=CC_PRESETS[i];pe[i].className=(q[1]===S.a&&q[2]===S.b&&q[3]===S.ang&&q[4]===S.op)?"on":"";}
	}
	function ccSet(patch){
		var S=ccCur(),k,o={a:S.a,b:S.b,ang:S.ang,op:S.op};
		for(k in patch)o[k]=patch[k];
		o=ccNorm(o);if(!o)return;
		ccS=o;ccSave(o);applyCatColor(tsetCur()==="catcap");ccUiPaint(o);
		var n=ccEl("mwrt-cc-n");if(n)n.textContent="已自定义";
	}
	function ccUiSync(){
		var cc=ccEl("mwrt-cc");if(!cc)return;
		var ok=tsetCur()==="catcap",n=ccEl("mwrt-cc-n");
		cc.className=ok?"":"off";
		if(n)n.textContent=ok?(ccStored()?"已自定义":"选预设，或自己调配色"):"仅「猫の胶囊」可用";
		if(ok){ccS=ccStored()||ccS;ccUiPaint(ccCur());}
	}
	function ccUiBind(p){
		var i,ps=p.querySelector("#mwrt-cc-ps"),h="";
		for(i=0;i<CC_PRESETS.length;i++){var q=CC_PRESETS[i];h+='<div role="button" tabindex="0" title="'+q[0]+'" aria-label="'+q[0]+'" style="background:linear-gradient(135deg,'+q[1]+','+q[2]+')"></div>';}
		ps.innerHTML=h;
		var pe=ps.children;
		function pick(ix){var q=CC_PRESETS[ix];ccSet({a:q[1],b:q[2],ang:q[3],op:q[4]});}
		for(i=0;i<pe.length;i++)(function(ix){
			pe[ix].addEventListener("click",function(){pick(ix);});
			pe[ix].addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(ix);}});
		})(i);
		p.querySelector("#mwrt-cc-a").addEventListener("input",function(){ccSet({a:this.value});});
		p.querySelector("#mwrt-cc-b").addEventListener("input",function(){ccSet({b:this.value});});
		p.querySelector("#mwrt-cc-ang").addEventListener("input",function(){ccSet({ang:+this.value});});
		p.querySelector("#mwrt-cc-op").addEventListener("input",function(){ccSet({op:+this.value});});
		function swap(){var S=ccCur();ccSet({a:S.b,b:S.a});}
		var sw=p.querySelector("#mwrt-cc-sw");
		sw.addEventListener("click",swap);
		sw.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();swap();}});
		var dial=p.querySelector("#mwrt-cc-dial"),drag=false;
		function at(e){
			var r=dial.getBoundingClientRect(),g=Math.round(Math.atan2(e.clientX-(r.left+r.width/2),-(e.clientY-(r.top+r.height/2)))*180/Math.PI);
			if(g<0)g+=360;if(e.shiftKey)g=Math.round(g/15)*15%360;
			ccSet({ang:g});
		}
		dial.addEventListener("pointerdown",function(e){drag=true;try{dial.setPointerCapture(e.pointerId);}catch(x){}at(e);e.preventDefault();});
		dial.addEventListener("pointermove",function(e){if(drag)at(e);});
		dial.addEventListener("pointerup",function(){drag=false;});
		dial.addEventListener("pointercancel",function(){drag=false;});
		dial.addEventListener("keydown",function(e){
			var d=e.shiftKey?15:5,S=ccCur();
			if(e.key==="ArrowRight"||e.key==="ArrowUp"){e.preventDefault();ccSet({ang:S.ang+d});}
			else if(e.key==="ArrowLeft"||e.key==="ArrowDown"){e.preventDefault();ccSet({ang:S.ang-d});}
		});
		p.querySelector("#mwrt-cc-rs").addEventListener("click",function(){
			try{localStorage.removeItem("mwrt-catstyle");localStorage.removeItem("mwrt-catcolor");}catch(e){}
			ccS=null;applyCatColor(false);ccUiSync();
		});
	}
	function tsetMark(){
		var cur=tsetCur(),rs=document.querySelectorAll("#mwrt-tset-pop [data-bd]");
		for(var i=0;i<rs.length;i++)rs[i].className=(rs[i].getAttribute("data-bd")===cur)?"on":"";
		ccUiSync();
	}
	function tsetSync(){
		var b=document.getElementById("mwrt-tset-btn"),p=document.getElementById("mwrt-tset-pop");
		var ml=document.querySelector(".main .main-left"),r=ml&&ml.getBoundingClientRect();
		var ok=!!(r&&r.width>60&&window.innerWidth>768);
		if(b)b.style.display=ok?"flex":"none";
		if(!ok&&p)p.classList.remove("open");
		if(ok&&b){b.style.left=Math.round(r.left+12)+"px";b.style.bottom=Math.round(window.innerHeight-r.bottom+12)+"px";
			if(p){p.style.left=Math.round(r.right+10)+"px";p.style.bottom=Math.round(window.innerHeight-r.bottom+12)+"px";}}
	}
	function setupTset(){
		if(!document.body||document.getElementById("mwrt-tset-btn"))return;
		var st=document.createElement("style");
		st.textContent="#mwrt-tset-btn{position:fixed;z-index:10040;width:30px;height:30px;border-radius:50%;border:0;padding:0;display:none;align-items:center;justify-content:center;cursor:pointer;color:#6a45e6;background:rgba(255,255,255,.92);box-shadow:0 4px 12px -4px rgba(90,70,160,.45);transition:transform .15s}"+
		"#mwrt-tset-btn:hover{transform:scale(1.1)}"+
		"#mwrt-tset-pop{position:fixed;z-index:10060;width:288px;max-height:calc(100vh - 24px);overflow-y:auto;padding:10px;border-radius:18px;background:#fff;color:#2d2852;box-shadow:0 18px 44px -14px rgba(40,30,90,.45);border:1px solid rgba(120,100,200,.16);display:none;font:13px/1.4 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}"+
		"#mwrt-tset-pop.open{display:block}"+
		"#mwrt-tset-pop h4{margin:2px 6px 8px;font-size:13px;font-weight:700;color:inherit}"+
		"#mwrt-tset-pop button{display:flex!important;align-items:center;justify-content:flex-start!important;gap:10px;width:100%!important;height:auto!important;min-height:0!important;padding:8px!important;margin:0 0 2px!important;border:0!important;border-radius:12px!important;background:transparent;color:inherit!important;text-align:left!important;cursor:pointer;font:inherit!important;box-shadow:none!important}"+
		"#mwrt-tset-pop button:hover{background:rgba(139,108,246,.09)!important}"+
		"#mwrt-tset-pop button.on{background:rgba(139,108,246,.16)!important}"+
		"#mwrt-tset-pop i{display:block;flex:0 0 26px;width:26px;height:26px;margin:0;border-radius:9px;border:1px solid rgba(120,100,200,.2)}"+
		"#mwrt-tset-pop span{display:block;text-align:left}#mwrt-tset-pop b{display:block;font-weight:600;color:inherit}#mwrt-tset-pop small{display:block;font-size:11px;opacity:.65;color:inherit}"+
		"#mwrt-tset-pop button.on b:after{content:' \\2713';color:#7c5cfc}"+
		"#mwrt-cc{margin:6px 2px 0;padding:10px 6px 2px;border-top:1px solid rgba(120,100,200,.16)}"+
		"#mwrt-cc .cc-h{display:flex;align-items:center;gap:8px}"+
		"#mwrt-cc .cc-t{flex:1 1 auto;min-width:0}#mwrt-cc .cc-t b{display:block;font-weight:600;font-size:13px}#mwrt-cc .cc-t small{display:block;font-size:11px;opacity:.65}"+
		"#mwrt-cc em{flex:0 0 auto;font-style:normal;font-size:11.5px;color:#7c5cfc;cursor:pointer;padding:3px 8px;border-radius:7px}#mwrt-cc em:hover{background:rgba(139,108,246,.12)}"+
		"#mwrt-cc.off .cc-bd{display:none}#mwrt-cc.off .cc-h{opacity:.45;pointer-events:none}"+
		"#mwrt-cc .cc-bd{margin-top:10px}"+
		"#mwrt-cc .cc-pv{display:flex;gap:6px;height:60px;padding:6px;border-radius:12px;background:var(--pv-pg,#f4f5fa);border:1px solid rgba(120,100,200,.18);overflow:hidden;box-sizing:border-box}"+
		"#mwrt-cc .pv-sb{flex:0 0 32%;display:flex;flex-direction:column;gap:5px;padding:7px 6px;border-radius:8px;background:var(--pv-sb);box-shadow:0 0 0 1px var(--pv-hl,rgba(0,0,0,.08)),0 6px 12px -8px rgba(30,30,60,.4);box-sizing:border-box}"+
		"#mwrt-cc .pv-sb div{height:4px;border-radius:2px;background:var(--pv-tx);opacity:.5}#mwrt-cc .pv-sb div.on{height:6px;background:var(--pv-act);opacity:1}"+
		"#mwrt-cc .pv-ct{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}"+
		"#mwrt-cc .pv-ct .h{height:14px;border-radius:6px;background:linear-gradient(135deg,var(--pv-b2),var(--pv-b1))}"+
		"#mwrt-cc .pv-ct .c{flex:1;border-radius:6px;background:var(--pv-sec);border:1px solid var(--pv-hl,rgba(0,0,0,.08))}"+
		"#mwrt-cc .cc-ps{display:flex;justify-content:space-between;padding:0 3px;margin-top:12px}"+
		"#mwrt-cc .cc-ps div{flex:0 0 22px;width:22px;height:22px;border-radius:50%;cursor:pointer;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(120,100,200,.28);margin:3px 0;transition:transform .12s}"+
		"#mwrt-cc .cc-ps div:hover{transform:scale(1.12)}#mwrt-cc .cc-ps div.on{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--pv-b1,#8b6cf6)}"+
		"#mwrt-cc .cc-row{display:flex;align-items:center;gap:8px;margin-top:10px;min-height:28px}"+
		"#mwrt-cc .cc-row>label{flex:0 0 42px;margin:0;font-size:12px;font-weight:500;opacity:.7;color:inherit}"+
		"#mwrt-cc .cc-row output{flex:0 0 40px;text-align:right;font-size:11.5px;opacity:.8;font-variant-numeric:tabular-nums;color:inherit}"+
		"#mwrt-cc input[type=color]{flex:0 0 34px;width:34px!important;height:28px!important;padding:0!important;margin:0!important;border:1px solid rgba(120,100,200,.3)!important;border-radius:8px!important;background:none!important;cursor:pointer}"+
		"#mwrt-cc input[type=color]::-webkit-color-swatch-wrapper{padding:0}#mwrt-cc input[type=color]::-webkit-color-swatch{border:0;border-radius:7px}"+
		"#mwrt-cc .cc-swap{flex:0 0 22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;opacity:.65;user-select:none}#mwrt-cc .cc-swap:hover{opacity:1;background:rgba(139,108,246,.12)}"+
		"#mwrt-cc .cc-bar{flex:1;min-width:0;height:10px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(120,100,200,.2)}"+
		"#mwrt-cc .cc-dial{flex:0 0 30px;position:relative;width:30px;height:30px;border-radius:50%;background:#fff;border:1px solid rgba(120,100,200,.32);cursor:grab;touch-action:none;box-sizing:border-box;outline:0}"+
		"#mwrt-cc .cc-dial:focus-visible{box-shadow:0 0 0 2px var(--pv-b1,#8b6cf6)}"+
		"#mwrt-cc .cc-dial div{position:absolute;left:50%;top:3px;width:2px;height:12px;margin-left:-1px;border-radius:1px;background:var(--pv-b1,#8b6cf6);transform-origin:50% 12px}"+
		"#mwrt-cc .cc-dial div:before{content:'';position:absolute;left:-2px;top:-2px;width:6px;height:6px;border-radius:50%;background:var(--pv-b1,#8b6cf6)}"+
		"#mwrt-cc input[type=range]{-webkit-appearance:none;appearance:none;flex:1;min-width:0;width:auto!important;height:8px!important;padding:0!important;margin:0!important;border:0!important;border-radius:4px!important;background:var(--rg,rgba(120,100,200,.2))!important;box-shadow:inset 0 0 0 1px rgba(120,100,200,.25)!important;outline:0}"+
		"#mwrt-cc input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid var(--pv-b1,#8b6cf6);box-shadow:0 2px 6px rgba(40,30,90,.3);cursor:pointer}"+
		"#mwrt-cc input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--pv-b1,#8b6cf6);box-shadow:0 2px 6px rgba(40,30,90,.3);cursor:pointer}"+
		"#mwrt-cc .cc-dk{display:none;margin-top:10px;font-size:11px;opacity:.6}html[data-darkmode=true] #mwrt-cc .cc-dk{display:block}"+
		"html[data-darkmode=true] #mwrt-cc{border-top-color:rgba(255,255,255,.1)}html[data-darkmode=true] #mwrt-cc em{color:#cbb8ff}"+
		"html[data-darkmode=true] #mwrt-cc .cc-dial{background:#232a3d;border-color:rgba(255,255,255,.2)}html[data-darkmode=true] #mwrt-cc .cc-pv{border-color:rgba(255,255,255,.12)}"+
		"html[data-darkmode=true] #mwrt-tset-btn{background:#232a3d;color:#cbb8ff}"+
		"html[data-darkmode=true] #mwrt-tset-pop{background:#171c28;color:#e6e9f5;border-color:rgba(255,255,255,.1)}"+
		"@media (max-width:768px){#mwrt-tset-btn,#mwrt-tset-pop{display:none!important}}";
		document.head.appendChild(st);
		var b=document.createElement("button");b.type="button";b.id="mwrt-tset-btn";b.title="主题设置";b.setAttribute("aria-label","主题设置");
		b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>';
		var p=document.createElement("div");p.id="mwrt-tset-pop";
		var h="<h4>主题设置</h4>";
		for(var i=0;i<TSET_ITEMS.length;i++){var t=TSET_ITEMS[i];h+='<button type="button" data-bd="'+t[0]+'"><i style="background:'+t[3]+'"></i><span><b>'+t[1]+'</b><small>'+t[2]+'</small></span></button>';}
		h+='<div id="mwrt-cc" class="off"><div class="cc-h"><span class="cc-t"><b>自定义配色</b><small id="mwrt-cc-n">仅「猫の胶囊」可用</small></span><em id="mwrt-cc-rs" title="恢复默认粉紫">还原</em></div>'+
			'<div class="cc-bd"><div class="cc-pv"><div class="pv-sb"><div></div><div class="on"></div><div></div></div><div class="pv-ct"><div class="h"></div><div class="c"></div></div></div>'+
			'<div class="cc-ps" id="mwrt-cc-ps"></div>'+
			'<div class="cc-row"><label>配色</label><input type="color" id="mwrt-cc-a" aria-label="起点色"><div class="cc-swap" id="mwrt-cc-sw" role="button" tabindex="0" title="交换起点与终点" aria-label="交换起点与终点">⇄</div><input type="color" id="mwrt-cc-b" aria-label="终点色"><div class="cc-bar" id="mwrt-cc-bar"></div></div>'+
			'<div class="cc-row"><label>角度</label><div class="cc-dial" id="mwrt-cc-dial" tabindex="0" role="slider" aria-label="渐变角度"><div></div></div><input type="range" id="mwrt-cc-ang" min="0" max="360" step="1" aria-label="渐变角度"><output id="mwrt-cc-angv">168°</output></div>'+
			'<div class="cc-row"><label>透明度</label><input type="range" id="mwrt-cc-op" min="0" max="100" step="1" aria-label="透明度（底色为纯白）"><output id="mwrt-cc-opv">32%</output></div>'+
			'<div class="cc-dk">夜间模式保持深色，不受配色影响。</div></div></div>';
		p.innerHTML=h;
		ccUiBind(p);
		document.body.appendChild(b);document.body.appendChild(p);
		b.addEventListener("click",function(e){e.stopPropagation();tsetSync();tsetMark();p.classList.toggle("open");});
		p.addEventListener("click",function(e){e.stopPropagation();var t=e.target;while(t&&t!==p&&!(t.getAttribute&&t.getAttribute("data-bd")))t=t.parentNode;if(t&&t!==p)tsetPick(t.getAttribute("data-bd"));});
		document.addEventListener("click",function(){p.classList.remove("open");});
		document.addEventListener("keydown",function(e){if(e.key==="Escape")p.classList.remove("open");});
		window.addEventListener("resize",tsetSync);
		setInterval(tsetSync,700);tsetSync();tsetMark();
	}
	try{if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupTset);else setupTset();}catch(e){}

	/* s116: 手机首页(默认主题): 第一屏 = 顶栏 + 蜂窝卡 + 产品主图展台, 展台高度按手机可视区算满整屏;
	   往下滑才出现系统状态/圆环/设置等内容, 靠 CSS scroll-snap 吸附成"翻页", 这里只负责三件事:
	   ① 量展台顶部位置, 把 --mw-sh 写到 .dv-stage 上(CSS 用它当 min-height)
	   ② 滑动时展台轻微上移/变淡/缩小(视差), 回到顶部还原
	   ③ 下面的块(.dv-side/.gauges/.cd-q)进入视口时淡入上浮, 并在展台底部放一个"上滑"提示, 点它滚到第二页 */
	var mhSt={stg:null,sc:null,cue:null,ticking:false,io:null};
	function mhOn(){
		try{return window.innerWidth<=768;}catch(e){return false;}
	}
	function mhTop(el,sc){
		var t=0,e=el;
		while(e&&e!==sc){t+=e.offsetTop;e=e.offsetParent;}
		return t;
	}
	function mhFit(){
		var stg=mhSt.stg,sc=mhSt.sc;
		if(!stg||!sc||!stg.isConnected)return;
		if(!mhOn()){
			["--mw-sh","--mw-img","--mw-pb","--mw-ex"].forEach(function(v){if(stg.style.getPropertyValue(v))stg.style.removeProperty(v);});
			stg.style.opacity="";stg.style.transform="";
			return;
		}
		/* 展台 = 整个第一页, 一直铺到内容区底(胶囊底栏浮在它上面, 不再把内容一刀切掉);
		   底部 padding(--mw-pb)按底栏实际高度留出, 蜂窝卡/仪表卡正好落在胶囊上沿上方;
		   产品图高度(--mw-img)按展台里其余内容的实际高度反推, 字体放大/换行也不会把内容顶到胶囊底下 */
		var scr=sc.getBoundingClientRect(),nav=document.getElementById("mwrt-bottomnav"),navTop=scr.bottom;
		if(nav&&getComputedStyle(nav).display!=="none"){var nt=nav.getBoundingClientRect().top;if(nt>scr.top)navTop=Math.min(navTop,nt);}
		var pb=Math.max(0,Math.round(scr.bottom-navTop))+8;
		if(stg.style.getPropertyValue("--mw-pb")!==pb+"px")stg.style.setProperty("--mw-pb",pb+"px");
		var h=Math.max(300,Math.round(scr.bottom-(scr.top+mhTop(stg,sc))));
		var cur=parseInt(stg.style.getPropertyValue("--mw-sh"),10);
		if(isNaN(cur)||Math.abs(cur-h)>1)stg.style.setProperty("--mw-sh",h+"px");
		var shot=stg.querySelector(".dv-shot"),img=shot&&shot.querySelector("img:not(#dv-img-b)");
		if(shot&&img&&img.offsetHeight>20){
			var cs=getComputedStyle(stg),kids=stg.children,used=0,n=0,k,ks;
			for(k=0;k<kids.length;k++){
				ks=getComputedStyle(kids[k]);
				if(ks.display==="none"||ks.position==="absolute"||ks.position==="fixed")continue;
				n++;
				if(kids[k]!==shot)used+=kids[k].offsetHeight;
			}
			var gap=parseFloat(cs.rowGap||cs.gap)||0;
			var avail=h-(parseFloat(cs.paddingTop)||0)-pb-used-gap*Math.max(0,n-1)-(shot.offsetHeight-img.offsetHeight)-6;
			var im=Math.round(Math.max(90,Math.min(300,avail)));
			var ci=parseInt(stg.style.getPropertyValue("--mw-img"),10);
			if(isNaN(ci)||Math.abs(ci-im)>1)stg.style.setProperty("--mw-img",im+"px");
		}
		/* 贴底块(连接信息 + 蜂窝卡/仪表卡)向两侧撑出展台内边距, 与顶栏 header .fill 同宽 */
		var fl=document.querySelector("header .fill");
		if(fl){
			var ex=Math.round(stg.getBoundingClientRect().left+(parseFloat(getComputedStyle(stg).paddingLeft)||0)-fl.getBoundingClientRect().left);
			if(ex<0||ex>60)ex=0;
			if(stg.style.getPropertyValue("--mw-ex")!==ex+"px")stg.style.setProperty("--mw-ex",ex+"px");
		}
	}
	function mhScroll(){
		var stg=mhSt.stg,sc=mhSt.sc;
		if(!stg||!sc)return;
		if(!mhOn()){stg.style.opacity="";stg.style.transform="";return;}
		var st=sc.scrollTop,h=stg.offsetHeight||1;
		var p=Math.min(1,Math.max(0,st/(h*0.8)));
		if(p<0.01){stg.style.opacity="";stg.style.transform="";}
		else{
			stg.style.opacity=(1-p*0.55).toFixed(3);
			stg.style.transform="translateY("+(st*0.1).toFixed(1)+"px) scale("+(1-p*0.045).toFixed(4)+")";
		}
		if(mhSt.cue)mhSt.cue.style.opacity=p>0.02?"0":"";
	}
	function mhReveal(){
		var P=document.getElementById("P");
		if(!P||!("IntersectionObserver" in window))return;
		var sc=mhSt.sc;
		if(!mhSt.io){
			mhSt.io=new IntersectionObserver(function(es){
				for(var i=0;i<es.length;i++)if(es[i].isIntersecting){es[i].target.classList.remove("mw-pre");mhSt.io.unobserve(es[i].target);}
			},{root:sc,threshold:0.06,rootMargin:"0px 0px -4% 0px"});
		}
		var l=P.querySelectorAll(".dv-fl,.gauges");
		for(var j=0;j<l.length;j++){
			if(l[j].getAttribute("data-mw-rv"))continue;
			l[j].setAttribute("data-mw-rv","1");l[j].classList.add("mw-rv","mw-pre");mhSt.io.observe(l[j]);
		}
	}
	/* 手机上把蜂窝卡 #hero-w 挪进 .dv-body(排在产品展台后面, 与连接信息 #dv-meta 同属第一页); 宽屏还原 */
	var mhDk={ph:null,pm:null,pt:null,pg:null,s2:null,bot:null,row:null};
	function mhDock(){
		var hw=document.getElementById("hero-w"),dm=document.getElementById("dv-meta"),stg=document.querySelector("#P .dv-stage");
		if(!stg)return;
		var tf=stg.querySelector(".dv-tf")||(mhDk.row&&mhDk.row.querySelector(".dv-tf")),cue=mhSt.cue;
		if(mhOn()){
			/* 展台里从上到下: 产品图 → 名称 → [流量 + 上滑提示] → 连接信息 → 蜂窝卡 (全靠 DOM 顺序)。
			   dv-meta 的样式都写成 ".dv-side>.dv-meta", 所以给它一个同类名的外壳 .dv-side.mw-side2 */
			var bot=mhDk.bot,row=mhDk.row,s2=mhDk.s2;
			if(!bot){
				bot=mhDk.bot=document.createElement("div");bot.className="mw-bot";
				row=mhDk.row=document.createElement("div");row.className="mw-row";
			}
			/* [流量 + 上滑提示] 一行跟在名称后面(与产品图同属上半区); 连接信息 + 蜂窝卡(无模组机型是精简仪表卡)组成贴底的 .mw-bot */
			if(row.parentNode!==stg||bot.parentNode!==stg||bot.previousSibling!==row||bot!==stg.lastElementChild){
				stg.appendChild(row);stg.appendChild(bot);
			}
			if(tf&&tf.parentNode!==row){
				if(!mhDk.pt||!mhDk.pt.parentNode){mhDk.pt=document.createComment("mw-tf-ph");tf.parentNode.insertBefore(mhDk.pt,tf);}
				row.insertBefore(tf,row.firstChild);
			}
			if(cue&&cue.parentNode!==row)row.appendChild(cue);
			var prev=null;
			if(dm){
				if(!s2){s2=mhDk.s2=document.createElement("div");s2.className="dv-side mw-side2";}
				if(dm.parentNode!==s2){
					if(!mhDk.pm||!mhDk.pm.parentNode){mhDk.pm=document.createComment("mw-meta-ph");dm.parentNode.insertBefore(mhDk.pm,dm);}
					s2.appendChild(dm);
				}
				if(s2.parentNode!==bot||bot.firstChild!==s2)bot.insertBefore(s2,bot.firstChild);
				prev=s2;
			}
			if(hw){
				if(hw.parentNode!==bot&&(!mhDk.ph||!mhDk.ph.parentNode)){mhDk.ph=document.createComment("mw-hero-ph");hw.parentNode.insertBefore(mhDk.ph,hw);}
				if(hw.parentNode!==bot||hw.previousSibling!==prev)bot.insertBefore(hw,prev?prev.nextSibling:bot.firstChild);
				prev=hw;
			}
			/* 无蜂窝模组(#hero-w 带 hw-lite, 整块隐藏): 用精简版仪表卡 .gauges 顶替蜂窝卡, 排在最下 */
			var g=document.querySelector("#P .gauges"),nc=!!(hw&&hw.classList.contains("hw-lite"));
			if(g){
				if(nc){
					if(g.parentNode!==bot&&(!mhDk.pg||!mhDk.pg.parentNode)){mhDk.pg=document.createComment("mw-gauges-ph");g.parentNode.insertBefore(mhDk.pg,g);}
					if(g.parentNode!==bot||bot.lastChild!==g)bot.appendChild(g);
				}else if(g.parentNode===bot&&mhDk.pg&&mhDk.pg.parentNode)mhDk.pg.parentNode.insertBefore(g,mhDk.pg);
			}
		}else if(mhDk.bot&&mhDk.bot.parentNode){
			var g2=document.querySelector("#P .gauges");
			if(g2&&mhDk.pg&&mhDk.pg.parentNode&&g2.parentNode===mhDk.bot)mhDk.pg.parentNode.insertBefore(g2,mhDk.pg);
			if(hw&&mhDk.ph&&mhDk.ph.parentNode&&hw.parentNode===mhDk.bot)mhDk.ph.parentNode.insertBefore(hw,mhDk.ph);
			if(dm&&mhDk.s2&&dm.parentNode===mhDk.s2&&mhDk.pm&&mhDk.pm.parentNode)mhDk.pm.parentNode.insertBefore(dm,mhDk.pm);
			if(tf&&mhDk.pt&&mhDk.pt.parentNode&&tf.parentNode===mhDk.row)mhDk.pt.parentNode.insertBefore(tf,mhDk.pt);
			if(cue&&cue.parentNode===mhDk.row)stg.appendChild(cue);
			mhDk.bot.parentNode.removeChild(mhDk.bot);
			if(mhDk.row.parentNode)mhDk.row.parentNode.removeChild(mhDk.row);
		}
	}
	/* 设备信息卡: 一组里条目是奇数时, 最后一个横跨两列居中, 避免孤零零靠左 */
	function mhPair(){
		var gs=document.querySelectorAll("#P .cd-q .q-g");
		for(var g=0;g<gs.length;g++){
			var ks=gs[g].children,run=[],n,i;
			var flush=function(){
				for(n=0;n<run.length;n++){
					var w=(run.length%2===1&&n===run.length-1);
					if(run[n].classList.contains("mw-wide")!==w)run[n].classList.toggle("mw-wide",w);
				}
				run=[];
			};
			for(i=0;i<ks.length;i++){
				var k=ks[i];
				if(k.classList.contains("q-bt")||k.classList.contains("q-sp")||k.classList.contains("fw-banner")){flush();continue;}
				if(k.classList.contains("ch-sep"))flush();
				if(k.offsetParent===null&&getComputedStyle(k).display==="none")continue;
				run.push(k);
			}
			flush();
		}
	}
	function mhSetup(){
		var stg=document.querySelector("#P .dv-stage"),sc=document.querySelector(".main-right");
		if(!stg||!sc)return false;
		if(mhSt.stg===stg)return true;
		mhSt.stg=stg;mhSt.sc=sc;
		var cue=document.createElement("div");cue.className="mw-swipe";cue.setAttribute("aria-hidden","true");
		cue.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/></svg><span>上滑查看更多</span>';
		stg.appendChild(cue);mhSt.cue=cue;
		cue.addEventListener("click",function(e){
			e.stopPropagation();
			var sd=document.querySelector("#P .dv-fl");if(!sd)return;
			try{sc.scrollTo({top:mhTop(sd,sc)-10,behavior:"smooth"});}catch(x){sc.scrollTop=mhTop(sd,sc)-10;}
		});
		sc.addEventListener("scroll",function(){
			if(mhSt.ticking)return;mhSt.ticking=true;
			(window.requestAnimationFrame||setTimeout)(function(){mhSt.ticking=false;mhScroll();});
		},{passive:true});
		window.addEventListener("resize",function(){mhDock();mhFit();mhScroll();});
		window.addEventListener("orientationchange",function(){setTimeout(function(){mhFit();mhScroll();},250);});
		try{
			if(window.ResizeObserver){
				var ro=new ResizeObserver(function(){mhFit();});
				ro.observe(sc);
				var ns=[document.querySelector(".main-right > header"),document.getElementById("hero-w"),document.getElementById("dv-meta"),document.querySelector("#maincontent > .alert-message")];
				for(var i=0;i<ns.length;i++)if(ns[i])ro.observe(ns[i]);
			}
		}catch(e){}
		mhReveal();
		return true;
	}
	function mhTick(){
		try{if(!mhSetup())return;mhDock();mhFit();mhReveal();if(mhOn())mhPair();}catch(e){}
	}
	try{
		if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mhTick);else mhTick();
		setInterval(mhTick,900);
	}catch(e){}

	function mute(node) {
		try {
			node.setAttribute('media', 'not all');
			node.disabled = true;
			node.setAttribute('data-mwrt-muted', '1');
		} catch (e) { /* ignore */ }
	}

	/* 2. 两个定制表 —— SY108/mwrt 主题无 argon 本地定制表, DROP 置空: 不停用任何 <link>, 不误伤 main.css */
	try {
		var DROP = [];
		var links = document.querySelectorAll('link[rel~="stylesheet"][href]');
		for (var i = 0; i < links.length; i++) {
			var href = links[i].getAttribute('href') || '';
			for (var j = 0; j < DROP.length; j++) {
				if (href.indexOf(DROP[j]) !== -1) { mute(links[i]); break; }
			}
		}
	} catch (e) { /* ignore */ }

	/* 3. 内联的 dark.css —— SY108/mwrt 主题无此内联表, styles 置空: 不触碰任何 <style> (含 main.css 的 data-luci-shell 内联样式) */
	try {
		var styles = [];
		for (var k = 0; k < styles.length; k++) {
			var txt = styles[k].textContent || '';
			if (txt.indexOf('prefers-color-scheme') !== -1 &&
			    txt.indexOf('.main .main-left') !== -1) {
				mute(styles[k]);
			}
		}
	} catch (e) { /* ignore */ }


	/* ── s107: 切换键 + 轻提示 ───────────────────────────────────────────────
	 * 键本体由本脚本直接建在顶栏 .container 里 #indicators 之后(不进 #indicators 内部:
	 * 那个容器会被 luci.js 的状态轮询整块刷新); 手机另在「更多」抽屉(.main-left)里建一行兜底。
	 * 图标语义同首页 #t-btn: 当前是浅色 → 月亮(点我去夜间), 当前是深色 → 太阳。
	 * 首页存在 #t-btn 时, 全局圆钮由 chrome.css 的 body:has(#t-btn) 规则隐藏。 */
	var SVG_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
	var SVG_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';

	var hintTimer = 0;
	function showHint(text) {
		if (!document.body) return;
		var tip = document.getElementById('mwrt-theme-tip');
		if (!tip) {
			tip = document.createElement('div');
			tip.id = 'mwrt-theme-tip';
			tip.setAttribute('role', 'status');
			document.body.appendChild(tip);
		}
		tip.textContent = text;
		tip.classList.add('show');
		clearTimeout(hintTimer);
		hintTimer = setTimeout(function () { tip.classList.remove('show'); }, 2400);
	}

	function syncThemeBtns() {
		var d = effectiveDark();
		var bs = document.querySelectorAll('[data-mwrt-theme-btn]');
		for (var i = 0; i < bs.length; i++) {
			var b = bs[i];
			var ic = b.querySelector('.mwrt-tb-ic');
			var key = d ? 'd' : 'l';
			if (ic && ic.getAttribute('data-k') !== key) {
				ic.innerHTML = d ? SVG_SUN : SVG_MOON;
				ic.setAttribute('data-k', key);
			}
			var lo = isLightOnly();
			var label = lo ? '此页暂不支持深色模式' : (d ? '切换到浅色模式' : '切换到深色模式');
			b.setAttribute('aria-label', label);
			b.setAttribute('title', label);
			b.setAttribute('aria-pressed', d ? 'true' : 'false');
			var tx = b.querySelector('.mwrt-tb-tx');
			if (tx) tx.textContent = lo ? '深色模式(此页暂不支持)' : '深色模式';
		}
	}

	function mkThemeBtn(cls, withText) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = cls;
		b.setAttribute('data-mwrt-theme-btn', '1');
		var ic = document.createElement('span');
		ic.className = 'mwrt-tb-ic';
		b.appendChild(ic);
		if (withText) {
			var tx = document.createElement('span');
			tx.className = 'mwrt-tb-tx';
			b.appendChild(tx);
		}
		b.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			MwrtTheme.toggle();
		});
		return b;
	}

	function setupThemeBtn() {
		var ind = document.getElementById('indicators');
		if (ind && ind.parentNode && !document.getElementById('mwrt-theme-btn')) {
			var b = mkThemeBtn('mwrt-theme-btn', false);
			b.id = 'mwrt-theme-btn';
			ind.parentNode.appendChild(b);
		}
		/* PC 端 header 是 display:none (只手机显示), 所以 PC 另放一枚悬浮圆钮挂在 body 下,
		 * 固定在内容区右上角; CSS 里 <=768px 隐藏它、>=769px 隐藏 header 里那枚 */
		if (document.body && !document.getElementById('mwrt-theme-fab')) {
			var fab = mkThemeBtn('mwrt-theme-btn mwrt-theme-fab', false);
			fab.id = 'mwrt-theme-fab';
			document.body.appendChild(fab);
		}
		var ml = document.querySelector('.main .main-left');
		if (ml && !ml.querySelector('.mwrt-sb-theme')) {
			var row = document.createElement('div');
			row.className = 'mwrt-sb-theme';
			row.appendChild(mkThemeBtn('mwrt-sb-theme-btn', true));
			var ver = ml.querySelector('.mwrt-sb-ver');
			if (ver) ml.insertBefore(row, ver); else ml.appendChild(row);
		}
		syncThemeBtns();
	}
	/* 状态变了(含别的标签页改的)就把键对一遍 */
	try { document.addEventListener('mwrt-theme', syncThemeBtns); } catch (e) { /* ignore */ }

	/* ── 4. 页脚收进"关于本机"浮层 ─────────────────────────────────────────
	 * 原样是一整行版本信息横在内容最底下。之前试过 sticky/fixed 贴右下角,
	 * 但它一直压着内容, 所以改成: 右下角一枚小图标, 默认不展开, 点一下弹出
	 * 浮层, 再点图标 / 点关闭 / 点浮层外面 / 按 Esc 都收起。
	 *
	 * 这里只做三件改动, 展开收起和全部外观都交给
	 * mwrt-aurora-chrome.css §14(靠 body.mwrt-about-open 这个类切换):
	 *   1. 给 footer 插一条标题栏(标题 + 关闭按钮)。
	 *   2. 往 body 上挂那枚触发图标, 接好开合逻辑。
	 *   3. 最后才把原来"A / B / C / 长版本串"这一长行拆成每项一行的键值表
	 *      (模板里各项之间的 " / " 是裸文本节点, CSS 选不到, 只能在这儿拆)。
	 *      顺序是有意的: 重排最容易出岔子, 放最后并单独 try/catch, 失败也
	 *      不会连带吃掉已经建好的触发图标。
	 *
	 * 整段包 try/catch, 出错就保持原样的页脚, 页面功能不受影响。
	 * ──────────────────────────────────────────────────────────────────── */

	/* footer.htm 的 pollShowtime() 每几秒重写一次 #osv-switch-link 的
	   innerHTML, 内容是 '<a ...>NRadio-鲲鹏无限</a>/ ' —— 末尾那个 "/" 是
	   给一长行排版用的分隔符, 拆成表格后就成了多余的一撇, 而且 CSS 选不到
	   文本节点。所以挂个观察器, 每次被重写就把它抹掉。
	   抹完不再产生新的 childList 变化, 观察器自然停下, 不会自激。 */
	function stripTrailingSlash(sp) {
		var n = sp.lastChild;
		while (n && n.nodeType === 3) {
			var t = n.nodeValue.replace(/\s*\/\s*$/, '');
			if (t.replace(/\s+/g, '')) { n.nodeValue = t; return; }
			sp.removeChild(n);
			n = sp.lastChild;
		}
	}

	/* 单独一个函数, 免得在循环里建闭包捕获到会变的循环变量 */
	function watchOsv(sp) {
		stripTrailingSlash(sp);
		try {
			new MutationObserver(function () {
				stripTrailingSlash(sp);
			}).observe(sp, { childList: true });
		} catch (e) { /* 老浏览器: 末尾多一撇, 不影响功能 */ }
	}

	/* 一行"标签 + 值"。mono=true 时值走等宽字(修订号/构建串那种)。 */
	function mkRow(label, value, mono) {
		var row = document.createElement('div');
		row.className = 'mwrt-ft-row';
		if (label) {
			var k = document.createElement('span');
			k.className = 'mwrt-ft-k';
			k.textContent = label;
			row.appendChild(k);
		}
		var v = document.createElement('span');
		v.className = 'mwrt-ft-v' + (mono ? ' mwrt-ft-mono' : '');
		if (typeof value === 'string') v.textContent = value;
		else if (value) v.appendChild(value);
		row.appendChild(v);
		return row;
	}

	function mkGroup() {
		var g = document.createElement('div');
		g.className = 'mwrt-ft-grp';
		return g;
	}

	/* ubus 的 builddate 是 unix 秒, 原样显示没人看得懂 */
	function fmtDate(sec) {
		var n = parseInt(sec, 10);
		if (!n) return '';
		var d = new Date(n * 1000);
		if (isNaN(d.getTime())) return '';
		function p(x) { return (x < 10 ? '0' : '') + x; }
		return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
	}

	/* ── 设备信息: 型号 / 平台 / 处理器 / 内核 / … ───────────────────────────
	   数据来自 ubus 的 `system board`, 走 LuCI 自己的 /ubus/ 代理。会话 id 和
	   代理路径都在页面内联的 `L = new LuCI({...})` 里(env.sessionid /
	   env.ubuspath), 所以不需要另外拿 token。

	   用 XMLHttpRequest 而不是 fetch: 这个文件通篇 ES5, 保持一致, 也少一层
	   Promise 的兼容假设。

	   异步拿到再往浮层顶部插 —— 拿不到(没有 L、会话过期、ACL 不允许)就什么都
	   不插, 浮层退回"只有原来那几行"的样子, 不报错、不空占位。 */
	function loadBoard(box, anchor) {
		var env = (window.L && window.L.env) || {};
		if (!env.sessionid) return;
		var xhr = new XMLHttpRequest();
		xhr.open('POST', env.ubuspath || '/ubus/', true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onreadystatechange = function () {
			if (xhr.readyState !== 4) return;
			var b;
			try {
				var r = JSON.parse(xhr.responseText);
				/* ubus 的返回是 [状态码, 数据], 状态码 0 才是成功 */
				if (!r.result || r.result[0] !== 0) return;
				b = r.result[1];
			} catch (e) { return; }
			if (!b) return;
			try { renderBoard(box, anchor, b); } catch (e) { /* ignore */ }
		};
		xhr.send(JSON.stringify({
			jsonrpc: '2.0', id: 1, method: 'call',
			params: [env.sessionid, 'system', 'board', {}]
		}));
	}

	function renderBoard(box, anchor, b) {
		var rel = b.release || {};
		var frag = document.createDocumentFragment();

		/* 主角一行: 型号做标题, 下面一行小字放构建目标。
		   用 model("NRadio-C2000Ultra")而不是 board_name
		   ("NRadio-C2000MAX-Ultra") —— board_name 是 DTS 里的编译标识,
		   model 才是对外的机型名。 */
		var name = b.model || b.board_name || b.hostname;
		if (name) {
			var hero = document.createElement('div');
			hero.className = 'mwrt-ft-hero';
			var ic = document.createElement('span');
			ic.className = 'mwrt-ft-hero-ic';
			var tx = document.createElement('div');
			tx.className = 'mwrt-ft-hero-tx';
			var nm = document.createElement('div');
			nm.className = 'mwrt-ft-hero-name';
			nm.textContent = name;
			tx.appendChild(nm);
			var sub = [rel.target, rel.distribution].filter(Boolean).join(' · ');
			if (sub) {
				var sb = document.createElement('div');
				sb.className = 'mwrt-ft-hero-sub';
				sb.textContent = sub;
				tx.appendChild(sb);
			}
			hero.appendChild(ic);
			hero.appendChild(tx);
			frag.appendChild(hero);
		}

		var g = mkGroup();
		var SPEC = [
			['主机名', b.hostname],
			['处理器', b.system],
			['内核', b.kernel, true],
			['根文件', b.rootfs_type],
			['构建', fmtDate(rel.builddate), true]
		];
		for (var i = 0; i < SPEC.length; i++) {
			if (SPEC[i][1]) g.appendChild(mkRow(SPEC[i][0], SPEC[i][1], SPEC[i][2]));
		}
		if (g.firstChild) frag.appendChild(g);

		box.insertBefore(frag, anchor || box.firstChild);
	}

	/* 把页脚那一长行重排成键值表。单独一个函数、由 setupAbout 最后调用并
	   单独包 try/catch —— 重排是三步里最容易因为模板被改而出岔子的一步,
	   不能让它的失败连带吃掉前面已经建好的触发图标(那就彻底点不开了)。 */
	function buildRows(box) {
		/* 一长行 → 键值表。
		   先把子节点收成"条目": 元素节点各算一条, 文本节点去掉首尾的 "/"
		   之后还有内容的(也就是末尾那段版本串)算一条, 只剩分隔符的丢掉。 */
		var items = [];
		var kids = Array.prototype.slice.call(box.childNodes);
		var modemenu = null, i;
		for (i = 0; i < kids.length; i++) {
			var n = kids[i];
			if (n.nodeType === 3) {
				var t = n.nodeValue.replace(/\s+/g, ' ')
				                   .replace(/^\s*\/\s*/, '')
				                   .replace(/\s*\/\s*$/, '')
				                   .trim();
				if (t) items.push({ text: t });
			} else if (n.nodeType === 1) {
				/* #modemenu 是 LuCI 的模式面包屑, 默认 display:none,
				   但可能被别处填内容, 原样留在末尾, 不动它 */
				if (n.id === 'modemenu') modemenu = n;
				else items.push({ node: n });
			}
		}

		/* 标签按顺序贴。条目数不是预期的 4 条(模板被改过)就不贴标签,
		   只保留"每项一行", 免得标签和内容对错位。 */
		var LABELS = ['系统', '面板', '主题', '固件'];
		var labeled = (items.length === LABELS.length);

		/* 分两组: 前三条是短值, 并成一组; 最后那条固件构建串又长又是等宽字,
		   单独一组、标签压在值上面独占一行。
		   之前靠 CSS 的 :last-of-type 认这一条 —— 但 #modemenu 原样留在末尾,
		   选择器得绕着它走, 很脆。改成显式分组, CSS 只看类名。 */
		var frag = document.createDocumentFragment();
		var g = mkGroup();
		for (i = 0; i < items.length; i++) {
			var last = (i === items.length - 1);
			var val;
			if (items[i].node) {
				/* 节点原样搬过来 —— appendChild 会把它从 box 里摘走,
				   所以下面清空 box 时不会连带删掉 */
				val = items[i].node;
				if (val.id === 'osv-switch-link') watchOsv(val);
			} else {
				val = items[i].text;
			}
			var row = mkRow(labeled ? LABELS[i] : '', val, !items[i].node);
			if (labeled && last) {
				var wide = mkGroup();
				wide.className += ' mwrt-ft-grp-wide';
				wide.appendChild(row);
				frag.appendChild(g);
				frag.appendChild(wide);
				g = null;
			} else {
				g.appendChild(row);
			}
		}
		if (g && g.firstChild) frag.appendChild(g);

		while (box.firstChild) box.removeChild(box.firstChild);
		box.appendChild(frag);
		if (modemenu) box.appendChild(modemenu);

		/* 设备信息插在最前面。放在重排之后要: 这时 box 的第一个子节点已经是
		   我们自己建的组, 插在它前面顺序才对。 */
		loadBoard(box, box.firstChild);
	}

	function setupAbout() {
		var ft = document.querySelector('footer.mobile-hide');
		if (!ft || ft.getAttribute('data-mwrt-about')) return;
		var box = ft.firstElementChild;
		if (!box || box.tagName !== 'DIV') return;
		ft.setAttribute('data-mwrt-about', '1');

		/* 标题栏 */
		var bar = document.createElement('div');
		bar.className = 'mwrt-ft-bar';
		var title = document.createElement('span');
		title.className = 'mwrt-ft-title';
		title.textContent = '关于本机';
		var close = document.createElement('button');
		close.type = 'button';
		close.className = 'mwrt-ft-close';
		close.setAttribute('aria-label', '关闭');
		bar.appendChild(title);
		bar.appendChild(close);
		ft.insertBefore(bar, box);

		/* 触发图标 */
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.id = 'mwrt-about-btn';
		btn.setAttribute('aria-label', '关于本机');
		btn.setAttribute('aria-expanded', 'false');
		document.body.appendChild(btn);

		function toggle(on) {
			if (on) document.body.classList.add('mwrt-about-open');
			else document.body.classList.remove('mwrt-about-open');
			btn.setAttribute('aria-expanded', on ? 'true' : 'false');
		}
		function isOpen() {
			return document.body.classList.contains('mwrt-about-open');
		}

		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			toggle(!isOpen());
		});
		close.addEventListener('click', function (e) {
			e.stopPropagation();
			toggle(false);
		});
		/* 点浮层外面收起。挂在 document 上, 所以上面两个处理器都要
		   stopPropagation, 否则点完立刻又被这里收/开一次。 */
		document.addEventListener('click', function (e) {
			if (isOpen() && !ft.contains(e.target)) toggle(false);
		});
		document.addEventListener('keydown', function (e) {
			if (isOpen() && (e.key === 'Escape' || e.keyCode === 27)) toggle(false);
		});

		/* 重排放最后, 且单独兜一层: 到这里图标和开合逻辑都已经就绪,
		   重排万一出岔子, 最多是页脚内容还是原来那一长行, 仍然点得开。 */
		try { buildRows(box); } catch (e) { /* ignore */ }
	}

	/* ── 5. 标签栏横向滚动: 原生滚动条 → 箭头 + 边缘渐变 ───────────────────
	 * passwall 这类页面标签一多, argon 让 ul.tabs 横向滚动并露出滚动条。
	 * 这里给溢出的标签栏外面包一层 .mwrt-tabs-wrap, 两端各插一枚圆形箭头,
	 * 滚动时按"还能往哪滚"点亮对应箭头 + 渐变遮罩(样式在 chrome.css §s66)。
	 * 不溢出的标签栏一律不动。整段 try/catch, 出错退回原生滚动。
	 * ──────────────────────────────────────────────────────────────────── */
	function mkArrow(dir) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'mwrt-tabs-arrow mwrt-tabs-' + dir;
		b.setAttribute('aria-label', dir === 'prev' ? '向左' : '向右');
		b.tabIndex = -1;
		return b;
	}

	function enhanceTabs(ul) {
		if (!ul || ul.getAttribute('data-mwrt-tabs')) return;
		/* 没溢出就不折腾 —— 留 2px 容差, 免得整数像素抖动误判 */
		if (ul.scrollWidth <= ul.clientWidth + 2) return;
		ul.setAttribute('data-mwrt-tabs', '1');

		var wrap = document.createElement('div');
		wrap.className = 'mwrt-tabs-wrap';
		ul.parentNode.insertBefore(wrap, ul);
		wrap.appendChild(ul);

		var prev = mkArrow('prev');
		var next = mkArrow('next');
		wrap.appendChild(prev);
		wrap.appendChild(next);

		/* 按当前滚动位置点亮箭头和渐变: 左边还有 → 亮左, 右边还有 → 亮右 */
		function update() {
			var max = ul.scrollWidth - ul.clientWidth;
			var x = ul.scrollLeft;
			var left = x > 2;
			var right = x < max - 2;
			if (left) { prev.className = 'mwrt-tabs-arrow mwrt-tabs-prev show'; }
			else { prev.className = 'mwrt-tabs-arrow mwrt-tabs-prev'; }
			if (right) { next.className = 'mwrt-tabs-arrow mwrt-tabs-next show'; }
			else { next.className = 'mwrt-tabs-arrow mwrt-tabs-next'; }
			if (left) { if (wrap.className.indexOf('has-left') < 0) wrap.className += ' has-left'; }
			else { wrap.className = wrap.className.replace(/\s*has-left/g, ''); }
			if (right) { if (wrap.className.indexOf('has-right') < 0) wrap.className += ' has-right'; }
			else { wrap.className = wrap.className.replace(/\s*has-right/g, ''); }
		}

		/* 点箭头滚一屏的七成, 留点重叠让人知道接上了 */
		function step(dir) {
			var d = Math.max(80, Math.round(ul.clientWidth * 0.7));
			ul.scrollLeft += dir * d;
		}
		prev.addEventListener('click', function (e) { e.preventDefault(); step(-1); });
		next.addEventListener('click', function (e) { e.preventDefault(); step(1); });

		/* 竖滚轮也能横向翻, 鼠标用户不必找箭头 */
		ul.addEventListener('wheel', function (e) {
			if (e.deltaY === 0) return;
			var max = ul.scrollWidth - ul.clientWidth;
			if ((e.deltaY < 0 && ul.scrollLeft > 0) ||
			    (e.deltaY > 0 && ul.scrollLeft < max)) {
				ul.scrollLeft += e.deltaY;
				e.preventDefault();
			}
		}, { passive: false });

		ul.addEventListener('scroll', update);
		try {
			window.addEventListener('resize', function () {
				/* 窗口变宽到不再溢出就把增强撤掉, 免得留着空箭头 */
				update();
			});
		} catch (e) { /* ignore */ }
		update();
	}

	function scanTabs(root) {
		try {
			var uls = (root || document).querySelectorAll('ul.tabs');
			for (var i = 0; i < uls.length; i++) enhanceTabs(uls[i]);
		} catch (e) { /* ignore */ }
	}

	function setupTabs() {
		scanTabs(document);
		/* LuCI 的 JS 视图是异步渲染的, 标签栏可能在 DOMContentLoaded 之后才进
		   DOM; 挂个观察器, 新出现的 ul.tabs 也接管。 */
		try {
			new MutationObserver(function (muts) {
				for (var i = 0; i < muts.length; i++) {
					var added = muts[i].addedNodes;
					for (var j = 0; j < added.length; j++) {
						var n = added[j];
						if (n.nodeType !== 1) continue;
						if (n.tagName === 'UL' && /\btabs\b/.test(n.className)) enhanceTabs(n);
						else scanTabs(n);
					}
				}
			}).observe(document.body, { childList: true, subtree: true });
		} catch (e) { /* ignore */ }
	}

	/* ── 6. 侧栏左下角固件版本块 ──────────────────────────────────────────────
	 * 侧栏(.main-left)底部原本是大片空白。这里插一块扁平的版本信息:
	 * 发行版徽标(Mwrt) + 版本号主串 + 构建日期。数据走 LuCI 的 /ubus/ 代理
	 * (和 loadBoard 同一条路), 拿 release.version / distribution / builddate。
	 * CSS 在 chrome.css §s68(.mwrt-sb-ver), 靠 margin-top:auto 推到最底。
	 * 整段 try/catch, 拿不到就不插, 侧栏保持原样。
	 * ──────────────────────────────────────────────────────────────────────── */
	function pickVer(ver) {
		/* release.version 形如 "@Manper-5.1.1150-24 by Padavanonly's ..."
		   只取版本号核心(数字点串), 太长的编译说明不要。 */
		if (!ver) return '';
		var m = ver.match(/(\d+(?:\.\d+)+(?:-\d+)?)/);
		return m ? m[1] : ver.split(/\s+/)[0].replace(/^@/, '');
	}

	/* ── s83: 版本块下方的 funny 按钮 ─────────────────────────────────────────
	 * 点一下就向更新服务器拉一次趣玩中心配置（POST admin/mwrtfun/refresh，带 CSRF token）：
	 *   服务器开了且有子菜单 => 侧栏立即出现/更新“趣玩中心”；
	 *   拉不到配置 / 服务器关了 => 侧栏立即撤掉“趣玩中心”，并在按钮下提示原因。
	 * 防洪水：按钮忙时忽略点击；浏览器端 30 秒冷却（localStorage，多标签页共用）；
	 * 设备端 mwrt-fun 脚本自己再做 30 秒限频，前端被绕过也只会真去问服务器一次。 */
	var FUN_CD_KEY = 'mwrt-fun-cd';
	var FUN_GAP = 30000;
	var FUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><circle cx="15" cy="13" r="1"></circle><circle cx="18" cy="11" r="1"></circle><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5z"></path></svg>';
	var FUN_ERR = {
		nonet: '连不上更新服务器',
		timeout: '连接更新服务器超时',
		tls: '服务器证书校验失败，请检查“Mwrt服务器配置”里的地址',
		busy: '服务器繁忙，请稍后再试',
		disabled: '趣玩中心已在“Mwrt设定”里关闭',
		bad_reply: '服务器返回的内容无法识别',
		bad_server: '服务器地址无效',
		no_ca: '缺少服务器证书文件',
		method: '请求方式不对',
		internal: '设备内部错误'
	};

	function funErrText(code) {
		if (FUN_ERR[code]) return FUN_ERR[code];
		return /^http_/.test(code || '') ? '服务器返回 ' + String(code).replace('http_', '') : '拉取失败';
	}

	function makeFunBtn() {
		var wrap = document.createElement('div');
		wrap.className = 'msv-fun';

		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'msv-fun-btn';
		btn.setAttribute('aria-label', '检测趣玩中心');
		btn.innerHTML = FUN_ICON + '<span>funny</span>';

		var msg = document.createElement('div');
		msg.className = 'msv-fun-msg';
		msg.setAttribute('role', 'status');
		msg.setAttribute('aria-live', 'polite');
		msg.hidden = true;

		wrap.appendChild(btn);
		wrap.appendChild(msg);

		var busy = false, hideTimer = 0;

		function say(text, kind) {
			clearTimeout(hideTimer);
			msg.textContent = text;
			msg.className = 'msv-fun-msg' + (kind ? ' ' + kind : '');
			msg.hidden = false;
			hideTimer = setTimeout(function () { msg.hidden = true; }, 5000);
		}

		function onFunPage() { return /\/admin\/fun(\/|$)/.test(location.pathname); }

		/* 侧栏里现有的趣玩子项 id（按 admin/fun/<id> 的链接取） */
		function sidebarFunIds() {
			var ids = [], as = document.querySelectorAll('#mainmenu a[href*="/admin/fun/"]');
			for (var i = 0; i < as.length; i++) {
				var m = (as[i].getAttribute('href') || '').match(/\/admin\/fun\/([^\/?#]+)/);
				if (m) ids.push(m[1]);
			}
			return ids.sort().join(',');
		}

		function applyMenu(r) {
			/* 以设备返回的最新菜单项和侧栏现状比对，不一致才重画。
			   不能只看 changed：页面可能是早先打开的，缓存早被定时任务或别的标签页改过了，
			   这次拉取没有新变化（或被限频）时 changed 也是 0，侧栏却还是旧的。
			   趣玩菜单被撤时人还停在它的页面上，就带回首页 */
			if (!r) return;
			var want = (r.ok === false || !r.enabled) ? '' : String(r.ids || '').split(',').sort().join(',');
			if (!r.changed && want === sidebarFunIds()) return;
			var gone = !want;
			var again = function () {
				if (gone && onFunPage()) location.href = (window.L && L.url) ? L.url('admin/modeminfo') : '/';
			};
			if (window.mwrtMenu && typeof window.mwrtMenu.rerender === 'function')
				window.mwrtMenu.rerender().then(again, function () { location.reload(); });
			else
				location.reload();
		}

		function done(r, status, hadFocus) {
			busy = false;
			btn.classList.remove('busy');
			btn.disabled = false;
			/* disabled 会让键盘焦点丢到 body，结束后还给按钮 */
			if (hadFocus) { try { btn.focus(); } catch (e) { /* ignore */ } }
			if (!r) {
				/* 没拿到有效回复：不占冷却，让用户处理完（比如重新登录）就能立刻再点 */
				try { localStorage.removeItem(FUN_CD_KEY); } catch (e) { /* ignore */ }
				if (status === 403) say('登录已过期，请刷新页面重新登录', 'bad');
				else if (!status) say('拉取失败：连接设备超时', 'bad');
				else say('拉取失败：设备返回异常（' + status + '）', 'bad');
				return;
			}
			if (r.throttled) {
				say('刚检测过，请 ' + (r.retry_after || 30) + ' 秒后再试', 'warn');
				applyMenu(r);
				return;
			}
			if (!r.ok) {
				say('拉取失败：' + funErrText(r.error) + (r.changed ? '，趣玩中心菜单已撤掉' : ''), 'bad');
			} else if (!r.enabled) {
				say('趣玩服务未开启' + (r.changed ? '，菜单已撤掉' : ''), 'warn');
			} else if (!r.count) {
				say('趣玩服务已开启，但还没有子菜单', 'warn');
			} else {
				say('趣玩中心已开启，共 ' + r.count + ' 项', 'ok');
			}
			applyMenu(r);
		}

		btn.addEventListener('click', function () {
			if (busy) return;
			var now = Date.now(), last = 0;
			try { last = parseInt(localStorage.getItem(FUN_CD_KEY), 10) || 0; } catch (e) { /* ignore */ }
			if (now >= last && now - last < FUN_GAP) {
				say('请 ' + Math.ceil((FUN_GAP - (now - last)) / 1000) + ' 秒后再试', 'warn');
				return;
			}
			try { localStorage.setItem(FUN_CD_KEY, String(now)); } catch (e) { /* ignore */ }

			var hadFocus = (document.activeElement === btn);
			busy = true;
			btn.classList.add('busy');
			btn.disabled = true;
			say('正在检测趣玩服务…');

			var env = (window.L && window.L.env) || {};
			var xhr = new XMLHttpRequest();
			xhr.open('POST', (window.L && L.url) ? L.url('admin/mwrtfun/refresh') : '/cgi-bin/luci/admin/mwrtfun/refresh', true);
			xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
			xhr.timeout = 25000;
			xhr.onreadystatechange = function () {
				if (xhr.readyState !== 4) return;
				var r = null;
				try { r = JSON.parse(xhr.responseText); } catch (e) { r = null; }
				done(r, xhr.status, hadFocus);
			};
			xhr.send('token=' + encodeURIComponent(env.token || ''));
		});

		return wrap;
	}

	function renderSbVer(ml, b) {
		var rel = b.release || {};
		var ver = pickVer(rel.version);

		var box = document.createElement('div');
		box.className = 'mwrt-sb-ver';

		if (ver) {
			var top = document.createElement('div');
			top.className = 'msv-top';
			var dist = document.createElement('span');
			dist.className = 'msv-dist';
			dist.textContent = rel.distribution || 'OpenWrt';
			var vv = document.createElement('span');
			vv.className = 'msv-ver';
			vv.textContent = ver;
			top.appendChild(dist);
			top.appendChild(vv);
			box.appendChild(top);

			var date = fmtDate(rel.builddate);
			if (date) {
				var sub = document.createElement('div');
				sub.className = 'msv-sub';
				sub.textContent = '构建于 ' + date;
				box.appendChild(sub);
			}
		}

		/* s83: 版本号取不到时也要有 funny 按钮，所以不再提前 return。
		   s96: 趣玩中心有总开关(Mwrt设定 -> 界面与趣玩，默认关)。开关值由 footer.ut 在服务端渲染成
		   window.MwrtUi.fun，关着就不建按钮；没有这个对象(页面没带 footer)同样按关闭处理。 */
		if (window.MwrtUi && window.MwrtUi.fun) box.appendChild(makeFunBtn());
		/* 没有版本号、也没有按钮时，整块是空的，不要往侧栏里放一个空盒子 */
		if (!box.firstChild) return;
		ml.appendChild(box);
	}

	/* ── s96: 趣玩开关/菜单变了，浏览器缓存的侧栏菜单要跟着更新 ─────────────────────────
	 * LuCI 把菜单树缓存在 sessionStorage['luci-session-store'][会话id].menu（ui.menu.load 读它），
	 * 服务端菜单索引一变（在「Mwrt设定」里切了趣玩中心、或趣玩菜单内容变了）这份缓存却不会失效，
	 * 同一标签页里接着点菜单，侧栏还是旧的。footer.ut 把服务端状态的版本戳写进 MwrtUi.funrev，
	 * 这里和本标签页上次见到的比：不同就清掉缓存的菜单树，并重画侧栏（menu-argon 还没起来就不用管，它自己会拉新的；任何情况都不 reload）。
	 * 版本戳先存后清，所以最多处理一次，不会刷新循环。新标签页/新会话本来就没有缓存，什么都不做。 */
	function setupFunRev() {
		var ui = window.MwrtUi, env = (window.L && window.L.env) || {};
		if (!ui || ui.funrev == null || !env.sessionid) return;
		var KEY = 'mwrt-funrev', STORE = 'luci-session-store', rev = String(ui.funrev), prev = null;
		try {
			prev = sessionStorage.getItem(KEY);
			sessionStorage.setItem(KEY, rev);
		} catch (e) { return; }
		if (prev === rev) return;
		var store = null;
		try { store = JSON.parse(sessionStorage.getItem(STORE)); } catch (e) { store = null; }
		if (!store || !store[env.sessionid] || !store[env.sessionid].menu) return;
		try {
			delete store[env.sessionid].menu;
			sessionStorage.setItem(STORE, JSON.stringify(store));
		} catch (e) { return; }
		/* 缓存已清：menu-argon 还没起来（常态，它由 footer 里异步 L.require）就会自己拉新菜单，
		 * 不能 reload —— 「Mwrt设定」保存后的页面是 POST 响应，reload 会重新提交表单。
		 * 已起来则原地重画；重画失败也不 reload，下次进页面自然更新。 */
		if (window.mwrtMenu && typeof window.mwrtMenu.rerender === 'function')
			window.mwrtMenu.rerender().then(function () {}, function () {});
	}

	function setupSidebarVer() {
		var ml = document.querySelector('.main .main-left');
		if (!ml || ml.getAttribute('data-mwrt-ver')) return;
		var env = (window.L && window.L.env) || {};
		if (!env.sessionid) return;
		ml.setAttribute('data-mwrt-ver', '1');

		var xhr = new XMLHttpRequest();
		xhr.open('POST', env.ubuspath || '/ubus/', true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onreadystatechange = function () {
			if (xhr.readyState !== 4) return;
			var b;
			try {
				var r = JSON.parse(xhr.responseText);
				if (!r.result || r.result[0] !== 0) return;
				b = r.result[1];
			} catch (e) { return; }
			if (!b) return;
			try { renderSbVer(ml, b); } catch (e) { /* ignore */ }
		};
		xhr.send(JSON.stringify({
			jsonrpc: '2.0', id: 1, method: 'call',
			params: [env.sessionid, 'system', 'board', {}]
		}));
	}

	try {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function () {
				try { setupAbout(); } catch (e) { /* ignore */ }
				try { setupThemeBtn(); } catch (e) { /* ignore */ }
				try { setupTabs(); } catch (e) { /* ignore */ }
				try { setupSidebarVer(); } catch (e) { /* ignore */ }
				try { setupFunRev(); } catch (e) { /* ignore */ }
			});
		} else {
			setupAbout();
			try { setupThemeBtn(); } catch (e) { /* ignore */ }
			try { setupTabs(); } catch (e) { /* ignore */ }
			try { setupSidebarVer(); } catch (e) { /* ignore */ }
			try { setupFunRev(); } catch (e) { /* ignore */ }
		}
	} catch (e) { /* ignore */ }
})();
