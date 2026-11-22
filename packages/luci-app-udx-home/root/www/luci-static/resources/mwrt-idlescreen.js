/* mwrt-idlescreen.js —— 从 mwrt 移植的闲置屏保（s144, 2026-11-22）
 *
 * 来源：mwrt 移植包 rootfs/usr/lib/lua/luci/view/themes/argon/footer.htm 里的
 *       #idle_overlay + idle screensaver 脚本。原版是 Lua 模板内联，SY108 是
 *       ucode 主题，所以这里做成独立、自包含的脚本：DOM 由 JS 自己创建，
 *       index.ut 只需引一行 <script>，不改静态模板结构。
 *
 * 与 mwrt 原版的差异（适配 SY108）：
 *   - 配置：原版读 /etc/config/mwrt 的 ndis.showtime；这里读
 *     admin/fancontrol/msgct（后端从 /etc/config/outline.screensaver 读，默认关闭）。
 *   - 数据：原版轮询 admin/fancontrol/modem_ctrl(cfg=2_1) + devinfo；
 *     这里复用首页同一套 devpop?k=hnat（信号/qos）+ devpop?k=tmp（温度），
 *     返回结构不同， renderNetInfo/renderSysInfo 按 SY108 的字段重写。
 *   - 去掉 mwrt 专有的「纯净版/常规版切换」链接（SY108 无该系统）。
 *
 * 安全：默认关闭（后端 showtime=0），任何异常都静默退出，绝不影响管理界面。
 */
(function () {
	'use strict';

	var P = '/cgi-bin/luci/';
	var overlay = null, canvas = null, ctx = null, animFrame = 0;
	var particles = [], pollIntv = 0, showTimer = 0, lastAction = Date.now();
	var showtime = 0, isIdle = false, countdown = null, loading = false;

	function $(id) { return document.getElementById(id); }
	function get(url, cb) {
		var x = new XMLHttpRequest();
		x.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), true);
		x.onreadystatechange = function () {
			if (x.readyState !== 4) return;
			if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch (e) { cb(null); } }
			else cb(null);
		};
		x.send();
	}

	/* DOM 自建：只挂一个全屏 overlay 到 body，和首页其它浮窗互不干扰 */
	function build() {
		if (overlay) return;
		overlay = document.createElement('div');
		overlay.id = 'mrt-idle-overlay';
		overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10000;display:none;opacity:0;transition:opacity .6s;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';
		overlay.innerHTML =
			'<canvas id="mrt-idle-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>' +
			'<div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.4) 100%);pointer-events:none"></div>' +
			'<div style="position:relative;z-index:2;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;overflow:hidden;color:#fff">' +
			  '<div id="mrt-idle-time" style="font-size:clamp(4.5rem,12vw,7.5rem);font-weight:100;letter-spacing:-4px;text-shadow:0 0 60px rgba(255,255,255,.06);line-height:1"></div>' +
			  '<div id="mrt-idle-date" style="font-size:13px;color:rgba(255,255,255,.5);letter-spacing:5px;margin-top:6px;margin-bottom:30px;font-weight:300"></div>' +
			  '<div id="mrt-idle-status" style="display:flex;gap:8px;align-items:center;margin-bottom:24px;flex-wrap:wrap;justify-content:center"></div>' +
			  '<div id="mrt-idle-cell" style="display:none;width:100%;max-width:760px;background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px 22px;box-sizing:border-box;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)">' +
			    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
			      '<span style="font-size:9px;color:rgba(255,255,255,.4);letter-spacing:3px">CELLULAR · 蜂窝网络</span>' +
			      '<span id="mrt-idle-mode" style="font-size:11px;color:#a78bfa"></span>' +
			    '</div>' +
			    '<div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">' +
			      '<div style="text-align:center;min-width:130px"><div id="mrt-idle-op" style="font-size:15px;font-weight:600"></div><div id="mrt-idle-rsrp" style="font-size:12px;color:rgba(255,255,255,.55);margin-top:4px"></div><div id="mrt-idle-bars" style="margin-top:8px"></div></div>' +
			      '<div id="mrt-idle-chips" style="display:flex;gap:6px;flex-wrap:wrap;flex:1"></div>' +
			    '</div>' +
			  '</div>' +
			'</div>';
		document.body.appendChild(overlay);
		canvas = $('mrt-idle-canvas');
		ctx = canvas ? canvas.getContext('2d') : null;
		/* 任何点击/按键都退出屏保 */
		['mousedown', 'mousemove', 'touchstart', 'keydown', 'scroll', 'wheel', 'click'].forEach(function (e) {
			window.addEventListener(e, function () { lastAction = Date.now(); hideCountdown(); if (isIdle) hide(); }, true);
		});
	}

	function initCanvas() {
		if (!ctx) return;
		var dpr = window.devicePixelRatio || 1;
		var W = window.innerWidth, H = window.innerHeight;
		canvas.width = W * dpr; canvas.height = H * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		particles = [];
		for (var i = 0; i < 60; i++) particles.push({
			x: Math.random() * W, y: Math.random() * H,
			r: Math.random() * 1.4 + 0.3,
			vx: (Math.random() - 0.5) * 0.18, vy: -Math.random() * 0.18 - 0.04,
			a: Math.random() * 0.35 + 0.05
		});
		function draw() {
			ctx.clearRect(0, 0, W, H);
			var bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.8);
			bg.addColorStop(0, '#0d1119'); bg.addColorStop(0.7, '#070912'); bg.addColorStop(1, '#03050a');
			ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
			for (var i = 0; i < particles.length; i++) {
				var p = particles[i];
				p.x += p.vx; p.y += p.vy;
				if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
				if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
				ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,255,255,' + p.a + ')'; ctx.fill();
			}
			animFrame = requestAnimationFrame(draw);
		}
		draw();
	}

	function tickClock() {
		if (!isIdle) return;
		var n = new Date(), pad = function (v) { return v < 10 ? '0' + v : '' + v; };
		var t = $('mrt-idle-time'), d = $('mrt-idle-date');
		if (t) t.innerHTML = pad(n.getHours()) + '<span style="opacity:.2;margin:0 6px;font-weight:100">:</span>' + pad(n.getMinutes());
		if (d) {
			var wk = ['日', '一', '二', '三', '四', '五', '六'][n.getDay()];
			d.textContent = (n.getMonth() + 1) + '月' + n.getDate() + '日  星期' + wk + '  ·  ' + pad(n.getSeconds());
		}
		setTimeout(tickClock, 1000);
	}

	function chip(label, value, color) {
		return '<span style="display:inline-flex;flex-direction:column;gap:2px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 10px;min-width:76px">' +
			'<span style="font-size:9px;color:rgba(255,255,255,.4);letter-spacing:1px">' + label + '</span>' +
			'<span style="font-size:12px;font-weight:600;color:' + (color || 'rgba(255,255,255,.85)') + '">' + value + '</span></span>';
	}

	/* s146: 蜂窝指标 + 温度统一渲染到同一行 chips。
	   两个接口异步返回，各自存缓存后都调 paintChips，避免互相覆盖。
	   温度原本放在日期下方的 #mrt-idle-status，成一枚孤零零的徽章、和别的数字不同行
	   （用户 11-22 截图反馈），这里并入蜂窝卡片指标区，并隐藏空掉的状态容器。 */
	var cellCache = null, tempCache = null;
	function paintChips() {
		var chips = $('mrt-idle-chips'); if (!chips) return;
		var d = cellCache || {}, s = '';
		if (d.band) s += chip('频段', d.band, '#c4b5fd');
		if (d.rsrq != null) s += chip('RSRQ', d.rsrq.toFixed(1) + ' dB', '#6ee7b7');
		if (d.sinr != null) s += chip('SINR', d.sinr.toFixed(1) + ' dB', '#fcd34d');
		if (d.qos && d.qos.down_kbps > 0) s += chip('签约下行', (d.qos.down_kbps / 1000) + 'M', '#93c5fd');
		if (d.state) s += chip('状态', d.state, '#34d399');
		/* 最高温度取所有温区最大值，作为最后一枚 chip，和其他指标同一行 */
		if (tempCache != null) s += chip('最高温度', Math.round(tempCache) + '℃', '#fbbf24');
		chips.innerHTML = s;
	}

	function pollData() {
		/* 信号 / 运营商 / 频段 / qos —— devpop?k=hnat 已在首页复用，返回结构见 _cell_signal() */
		get(P + 'admin/fancontrol/devpop?k=hnat', function (d) {
			if (!d || !isIdle) return;
			cellCache = d;
			var card = $('mrt-idle-cell'); if (card) card.style.display = 'block';
			var op = $('mrt-idle-op'); if (op) op.textContent = d.operator || '蜂窝网络';
			var mode = $('mrt-idle-mode'); if (mode) mode.textContent = d.rat_txt || '';
			var rsrp = $('mrt-idle-rsrp'); if (rsrp) rsrp.textContent = (d.rsrp != null ? Math.round(d.rsrp) + ' dBm' : '--');
			var bars = $('mrt-idle-bars');
			if (bars) {
				var lvl = d.rsrp != null ? (d.rsrp >= -95 ? 4 : d.rsrp >= -105 ? 3 : d.rsrp >= -115 ? 2 : 1) : 0;
				var h = '';
				for (var i = 1; i <= 5; i++) h += '<span style="display:inline-block;width:4px;height:' + (4 + i * 3) + 'px;margin-right:2px;border-radius:1px;background:' + (i <= lvl ? '#34d399' : 'rgba(255,255,255,.15)') + '"></span>';
				bars.innerHTML = h;
			}
			paintChips();
		});
		/* 温度 / wifi_hw —— devpop?k=tmp；并入蜂窝指标行 */
		get(P + 'admin/fancontrol/devpop?k=tmp', function (d) {
			if (!d || !isIdle) return;
			var mx = null;
			if (d.zones && d.zones.length) {
				for (var i = 0; i < d.zones.length; i++)
					if (d.zones[i].temp != null && (mx == null || d.zones[i].temp > mx)) mx = d.zones[i].temp;
			}
			tempCache = mx;
			var st = $('mrt-idle-status'); if (st) st.style.display = 'none';  /* 空容器不再占位 */
			paintChips();
		});
	}

	function showCountdown(sec) {
		if (!countdown) {
			countdown = document.createElement('div');
			countdown.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.4);color:#fff;font-size:2rem;padding:12px 36px;border-radius:24px;z-index:200001;transition:opacity .3s;backdrop-filter:blur(4px)';
			document.body.appendChild(countdown);
		}
		countdown.textContent = '还剩 ' + sec + ' 秒进入屏保';
		countdown.style.display = 'block'; countdown.style.opacity = '1';
	}
	function hideCountdown() {
		if (countdown && countdown.style.display === 'block') {
			countdown.style.opacity = '0';
			setTimeout(function () { countdown.style.display = 'none'; }, 300);
		}
	}

	function show() {
		if (isIdle) return;
		isIdle = true; hideCountdown();
		overlay.style.display = 'block'; void overlay.offsetWidth; overlay.style.opacity = '1';
		initCanvas(); tickClock(); pollData();
		pollIntv = setInterval(pollData, 8000);
	}
	function hide() {
		if (!isIdle) return;
		isIdle = false;
		overlay.style.opacity = '0';
		setTimeout(function () { overlay.style.display = 'none'; }, 600);
		clearInterval(pollIntv); pollIntv = 0;
		cancelAnimationFrame(animFrame);
		schedule();   /* 退出后重新开始计时 */
	}

	function schedule() {
		clearTimeout(showTimer);
		if (!showtime) return;
		showTimer = setTimeout(function () {
			var idleSec = Math.floor((Date.now() - lastAction) / 1000);
			var remain = showtime - idleSec;
			if (remain <= 0) show();
			else { if (showtime >= 6 && remain <= 5) showCountdown(remain); schedule(); }
		}, 1000);
	}

	/* 轮询配置：默认 30 秒一次，开关后最快 3 秒生效 */
	function pollConfig() {
		if (loading) return;
		loading = true;
		get(P + 'admin/fancontrol/msgct', function (d) {
			loading = false;
			var st = (d && d.showtime) ? parseInt(d.showtime, 10) : 0;
			if (st > 0 && st !== showtime) { showtime = st; lastAction = Date.now(); schedule(); }
			else if (st === 0 && showtime !== 0) { showtime = 0; clearTimeout(showTimer); if (isIdle) hide(); }
			setTimeout(pollConfig, st > 0 ? 15000 : 5000);
		});
	}

	/* ---------- 设置浮窗（原风扇键位置 #dv-idle → #idw） ---------- */
	var cfgEnabled = false, cfgSecs = 30;

	function cfgOpen() {
		var m = $('idw'); if (!m) return;
		/* 与其它浮窗同一层，避免 transform 祖先困住 fixed */
		var w = $('wfm');
		if (w && w.parentNode && m.parentNode !== w.parentNode) w.parentNode.insertBefore(m, w);
		loadCfg(function () {
			m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
			document.body.style.overflow = 'hidden';
			paintCfg();
		});
	}
	function cfgClose() {
		var m = $('idw'); if (!m || !m.classList.contains('open')) return;
		m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
		document.body.style.overflow = '';
	}
	function paintCfg() {
		var sw = $('idle-sw'), sel = $('idle-sec');
		if (sw) { sw.classList.toggle('on', cfgEnabled); sw.setAttribute('aria-checked', cfgEnabled ? 'true' : 'false'); }
		if (sel) {
			/* 时长不在下拉里（比如 uci 被手工改过）就就近取一个 */
			var opts = sel.options, found = false;
			for (var i = 0; i < opts.length; i++) if (+opts[i].value === cfgSecs) found = true;
			if (!found) cfgSecs = 30;
			sel.value = '' + cfgSecs;
		}
	}
	function loadCfg(cb) {
		get(P + 'admin/fancontrol/msgct', function (d) {
			cfgEnabled = !!(d && d.enabled);
			cfgSecs = (d && d.showtime) ? parseInt(d.showtime, 10) : 30;
			if (!(cfgSecs >= 6)) cfgSecs = 30;
			cb();
		});
	}
	function saveCfg(tip) {
		get(P + 'admin/fancontrol/screensaver_set?enabled=' + (cfgEnabled ? 1 : 0) + '&showtime=' + cfgSecs, function (d) {
			var t = $('idle-save-tip');
			if (t) { t.textContent = (d && d.ok) ? (tip || '已保存') : '保存失败，请重试'; }
			/* 让运行中的计时器跟上新配置 */
			showtime = (d && d.enabled) ? cfgSecs : 0;
			clearTimeout(showTimer);
			if (showtime) { lastAction = Date.now(); schedule(); }
			else if (isIdle) hide();
		});
	}
	window.idleCfgToggle = function () { cfgEnabled = !cfgEnabled; paintCfg(); saveCfg(cfgEnabled ? '已启用屏保' : '已关闭屏保'); };
	window.idleCfgSave = function () {
		var sel = $('idle-sec'); cfgSecs = sel ? parseInt(sel.value, 10) : 30;
		if (!cfgEnabled) cfgEnabled = true;   /* 改时长即视为启用 */
		paintCfg(); saveCfg('已保存：' + cfgSecs + ' 秒');
	};
	window.MrtIdleCfg = { open: cfgOpen, close: cfgClose };

	/* 浮窗按钮/关闭/遮罩的事件委托 */
	document.addEventListener('click', function (e) {
		var t = e.target; if (!t || !t.closest) return;
		if (t.closest('#dv-idle')) { e.preventDefault(); cfgOpen(); return; }
		if (t.closest('#idw-x')) { cfgClose(); return; }
		if (t.id === 'idw') cfgClose();
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') cfgClose();
	});

	try {
		/* 登录页 / iframe 里不装 */
		if (window.top !== window.self) return;
		var path = String(window.location.pathname || '');
		if (path.indexOf('/admin/') < 0) return;
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { build(); pollConfig(); });
		else { build(); pollConfig(); }
	} catch (e) { /* 屏保坏了不能拖垮管理界面 */ }
})();
