/* mwrt-notice.js —— 右上角全局消息中心
 *
 * 数据来自 rpcd luci.mwrt-notice list(只读文件和 sysfs, 不发 AT), 每 10 秒刷新一次。
 * 多条消息叠加显示, 按等级排序(critical > warn > info)。
 *  - closable 的消息右侧有 ×, 关掉后记进 localStorage, 同一 id 不再出现;
 *  - 不可关闭的消息(模组切换 USB3.0、SIM 初始化、首次开机建虚拟内存)没有 ×,
 *    条件消失后自动撤掉, 底部带一条流动进度线, 表示"进行中"; 后端给了
 *    progress(0-100) 就换成实心进度条, 标签后跟百分比, 原地更新不重建卡片。
 * 接口接入(网线/USB)是可关闭的一次性提示, 后端给 icon/title 字段: 换专属图标和标题、绿色。
 * USB 网卡 / 手机数据线共享(s88)的六种事件同走这条路: 接入=绿、拔出=石板灰;
 * 「USB 网卡等待选择」(icon usb-ask)用琥珀色并带「去选择」按钮, 点了直达全局提示框
 * (mwrt-portsw.js 的 askUsb), 那块网卡不再等待回答时按钮自动收起。
 * 新固件提示也走这里(id 带版本号, 关掉的是这一版), 替代原来的 mwrt-ota-notify.js。
 * s102: 5700 新短信(icon sms, 天蓝)和未接来电(icon miss, 红)也走这里, 取代 mwrt-phone.js 左上角的 toast。
 * 后端 luci.mwrt-notice 给的是「最近 24 小时的短信 / 未接来电」, 已读状态只记在浏览器 localStorage 里:
 *  - link=sms 的卡片(短信卡、汇总卡)带「查看收信箱 →」, 点卡片任意位置(不含 × 和选中文字时)都跳到收信箱并顺带记为已读;
 *  - 带 rev 的卡片(汇总卡, rev=超出条数)把 rev 并进已读键: 关掉后条数变了会重新出现;
 *  - 同一 id 文字变了(汇总卡条数变化)原地更新, 不重建卡片;
 *  - 对外 API window.mwrtNotice.refresh(): 立刻再拉一次(300ms 去抖), 供 mwrt-phone.js 收到新事件后调用,
 *    短信到达 3 秒内就能出现卡片, 不必等 10 秒周期;
 *  - 多个标签页各自轮询、共用 localStorage: 在一个页面点 × 后, 其它页面通过 storage 事件立刻收起。
 * s103: ① link=smsset(短信功能 IMS 未开启提醒卡 ims-off)跳「短信管理 → 设置」页, 地址由 data-sms 派生(加 ?view=settings),
 *   整卡可点、点击记为已读; 图标沿用 sms 信封但换琥珀色(level=warn + icon=sms → data-kind=smswarn);
 *   ② 卡片很多时容器限高(视口高 - top - 12px)并可滚动, 溢出时才开 overflow-y:auto + pointer-events:auto(滚动手势才能用),
 *   平时仍是 pointer-events:none、不裁阴影; ③ 原地更新分支同步更新卡片标题(保留标签里的时间和百分比子节点)。
 * s105: 短信 / 未接来电的已读状态改为设备端统一记录(/tmp/mwrt-phone/notice.ack), 所有浏览器一致:
 *  - 点 ×: POST modem/notice_ack(带 CSRF token, 同源请求), 服务端写成功后才收起; 失败(离线 / 接口出错)退回 localStorage 兜底收起;
 *  - 点整卡跳转: 先发 ack(fetch keepalive, 跳转后请求也会发完), 最多等 200ms 就跳, 不被网络耗时卡住;
 *  - 汇总卡(sms-more)的 ×: 后端给的 ack=sms_older|older 作为 scope, 并带上当前显示的卡片 id 作 keep(只标比它们更老的, 新到的不动);
 *  - 别的页面 / 别的浏览器: 后端不再返回已读的卡, 下一轮(10 秒)自然消失; 同一浏览器的其它标签页通过 mwrt-notice-ping 存储事件立即重拉;
 *  - 打开短信管理收件箱由 smsc.htm 自己 ack(scope=sms), 完成后调 window.mwrtNotice.ping();
 *  - localStorage 的 dismiss 仍保留(ims-off、网口 / USB / 新固件等不在服务端记录的卡, 以及 ack 失败兜底)。
 * s155: 故障报修在线聊天的「维护人员发来新消息」通知卡(后端 list 里 icon=chat 的一张, 带 chat:{code,state,ids,more,max,online}):
 *  - 未读 = ids 里大于浏览器 mwrt.rc.seen.<报修码>(聊天页写)的条数; 聊天卡片(#rc)正显示在当前页面时不弹 / 收回;
 *  - 点 × 记 mwrt.rc.dismiss.<报修码>=关掉时的最大消息 id, 更新的消息到来才再弹; 报修结束 / 换码清掉旧记录;
 *  - 点卡片 / 「查看并回复」跳 设置页#mwrt-chat; 置顶显示; localStorage 不可用时退 sessionStorage / 内存。
 * 由全局 footer.ut 注入, 所有主题都有。样式自带(半透明毛玻璃卡片), 按页面底色
 * 自动切深浅; 文字一律 textContent。 */
(function () {
	'use strict';

	if (window.__mwrtNotice) return;
	window.__mwrtNotice = true;

	var me = document.currentScript;
	var LINKS = {
		ota: (me && me.getAttribute('data-ota')) || '',
		sms: (me && me.getAttribute('data-sms')) || ''
	};
	var ACK_URL = (me && me.getAttribute('data-ack')) || '';
	var PING = 'mwrt-notice-ping';
	var ACK_ID = /^(sms|miss)-[0-9]{1,10}-[0-9]{1,12}$/;
	// s103: 短信管理设置页 = data-sms 地址 + ?view=settings(data-sms 已带查询串时用 &)
	LINKS.smsset = LINKS.sms ? LINKS.sms + (LINKS.sms.indexOf('?') < 0 ? '?' : '&') + 'view=settings' : '';
	var LINKTXT = { sms: '查看收信箱 →', smsset: '去开启 →' };
	var KEY = 'mwrt-notice-dismissed', KEEP = 200;
	var EVERY = 10000;
	var RANK = { critical: 0, warn: 1, info: 2 };
	var LABEL = { critical: '重要提示', warn: '请稍候', info: '系统通知' };
	// 图标是写死的常量 SVG, 不含任何后端数据
	var SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
		'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
	var ICON = {
		critical: SVG + '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
			'<path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
		warn: SVG + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
		info: SVG + '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
		// 接口接入通知(后端给 icon 字段): 网线水晶头 / USB 插头
		eth: SVG + '<path d="M7 3h10v7l-2 2v4H9v-4l-2-2z"/><path d="M10 6v2"/><path d="M12 6v2"/><path d="M14 6v2"/><path d="M12 16v5"/></svg>',
		usb: SVG + '<circle cx="12" cy="20" r="1.6"/><path d="M12 18.4V4"/><path d="m9.5 6.5 2.5-3 2.5 3"/><path d="M12 14 7.5 11V8.5"/><path d="M12 12.5 16.5 10V8"/>' +
			'<rect x="6.5" y="7" width="2" height="2" rx=".4"/><circle cx="16.5" cy="7.6" r="1"/></svg>'
	};
	// 手机(数据线共享)
	ICON.phone = SVG + '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
	// USB 声卡(s89): 扬声器 + 两道声波
	ICON.audio = SVG + '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.3a8 8 0 0 1 0 11.4"/></svg>';
	// s102: 短信 = 信封; 未接来电 = 听筒右上角一个叉
	ICON.sms = SVG + '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/></svg>';
	ICON.miss = SVG + '<path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 18.6 18.6 0 0 1-8.1-2.9 18.3 18.3 0 0 1-5.6-5.6A18.6 18.6 0 0 1 2.2 4.9 2 2 0 0 1 4.2 2.8h2.6a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L7.9 10.4a16 16 0 0 0 5.7 5.7l1.2-1.1a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.5 1.6z"/>' +
		'<path d="m16 2.5 5.5 5.5"/><path d="m21.5 2.5L16 8"/></svg>';
	ICON['usb-ask'] = ICON.usb;
	// s155: 维护人员(耳麦)
	ICON.chat = SVG + '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="12.5" width="4" height="6.5" rx="1.7"/><rect x="17.5" y="12.5" width="4" height="6.5" rx="1.7"/>' +
		'<path d="M19.5 19c0 1.6-1.7 2.2-4.2 2.2H13"/></svg>';
	// 断开 / 移除: 同一个图标加一道斜杠
	ICON['eth-off'] = ICON.eth.replace('</svg>', '<path d="M3 3l18 18"/></svg>');
	ICON['usb-off'] = ICON.usb.replace('</svg>', '<path d="M3 3l18 18"/></svg>');
	ICON['phone-off'] = ICON.phone.replace('</svg>', '<path d="M3 3l18 18"/></svg>');
	ICON['audio-off'] = ICON.audio.replace('</svg>', '<path d="M3 3l18 18"/></svg>');
	// 有专属图标的通知: 接入 = 绿色, 断开 = 石板灰(不是故障, 不用红/黄), 都和 info 的蓝色区分开
	// ask = 需要用户操作(USB 网卡等待选择 WAN/LAN), 用琥珀色提醒
	var ICON_LEVEL = { eth: 'link', usb: 'link', phone: 'link', 'usb-ask': 'ask', 'eth-off': 'unlink', 'usb-off': 'unlink', 'phone-off': 'unlink', audio: 'link', 'audio-off': 'unlink', sms: 'sms', miss: 'miss' };
	var CLOSE = SVG.replace('width="18" height="18"', 'width="14" height="14"') +
		'<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

	var CSS = [
		'#mwrt-notice{position:fixed;top:12px;right:12px;z-index:2147483000;display:flex;flex-direction:column;',
		'gap:10px;width:368px;max-width:calc(100vw - 24px);pointer-events:none;overscroll-behavior:contain;',
		'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',

		'#mwrt-notice.mwrt-scroll{overflow-y:auto;overflow-x:hidden;pointer-events:auto;box-sizing:border-box;padding:2px 6px 18px;margin:0 -6px;scrollbar-width:thin}',
			'#mwrt-notice .mwrt-notice-item{flex:none;--c:#3b82f6;--ct:#1d4ed8;--cs:rgba(59,130,246,.13);--cb:rgba(59,130,246,.24);--cf:rgba(59,130,246,.35);position:relative;pointer-events:auto;display:flex;',
		'align-items:flex-start;gap:12px;box-sizing:border-box;margin:0;padding:12px 12px 12px 16px;overflow:hidden;',
		'border-radius:14px;font-size:13px;line-height:1.55;letter-spacing:.1px;text-align:left;color:#1f2937;',
		'background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.65);',
		'-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);',
		'box-shadow:0 12px 32px -10px rgba(15,23,42,.28),0 2px 8px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.7);',
		'animation:mwrt-notice-in .38s cubic-bezier(.2,.8,.2,1) both;transition:transform .2s ease,box-shadow .2s ease}',
		'#mwrt-notice .mwrt-notice-item:hover{transform:translateY(-1px);',
		'box-shadow:0 16px 36px -10px rgba(15,23,42,.34),0 2px 8px rgba(15,23,42,.1),inset 0 1px 0 rgba(255,255,255,.7)}',
		'#mwrt-notice .mwrt-notice-item[data-level="critical"]{--c:#e5484d;--ct:#c62828;--cs:rgba(229,72,77,.13);--cb:rgba(229,72,77,.24);--cf:rgba(229,72,77,.35)}',
		'#mwrt-notice .mwrt-notice-item[data-level="warn"]{--c:#f59e0b;--ct:#b45309;--cs:rgba(245,158,11,.15);--cb:rgba(245,158,11,.28);--cf:rgba(245,158,11,.4)}',
		'#mwrt-notice .mwrt-notice-item[data-kind="link"]{--c:#10b981;--ct:#047857;--cs:rgba(16,185,129,.13);--cb:rgba(16,185,129,.26);--cf:rgba(16,185,129,.38)}',
		'#mwrt-notice .mwrt-notice-item[data-kind="link"] .mwrt-notice-icon svg,#mwrt-notice .mwrt-notice-item[data-kind="ask"] .mwrt-notice-icon svg,',
		'#mwrt-notice .mwrt-notice-item[data-kind="sms"] .mwrt-notice-icon svg,#mwrt-notice .mwrt-notice-item[data-kind="smswarn"] .mwrt-notice-icon svg,#mwrt-notice .mwrt-notice-item[data-kind="miss"] .mwrt-notice-icon svg{animation:mwrt-notice-plug .6s cubic-bezier(.2,.8,.2,1) .15s both}',
		// s102: 短信 = 天蓝, 未接来电 = 红(和 critical 同色系, 但图标 / 标题不同)
		'#mwrt-notice .mwrt-notice-item[data-kind="sms"]{--c:#0ea5e9;--ct:#0369a1;--cs:rgba(14,165,233,.14);--cb:rgba(14,165,233,.28);--cf:rgba(14,165,233,.4)}',
		'#mwrt-notice .mwrt-notice-item[data-kind="miss"]{--c:#ef4444;--ct:#b91c1c;--cs:rgba(239,68,68,.13);--cb:rgba(239,68,68,.27);--cf:rgba(239,68,68,.4)}',
		// s103: 短信功能(IMS)未开启提醒 = 信封图标 + 琥珀色(和 USB 网卡等待选择同色)
		'#mwrt-notice .mwrt-notice-item[data-kind="smswarn"]{--c:#f59e0b;--ct:#b45309;--cs:rgba(245,158,11,.15);--cb:rgba(245,158,11,.28);--cf:rgba(245,158,11,.4)}',
		'#mwrt-notice .mwrt-notice-item.mwrt-go{cursor:pointer}',
		'#mwrt-notice .mwrt-notice-item[data-kind="ask"]{--c:#f59e0b;--ct:#b45309;--cs:rgba(245,158,11,.15);--cb:rgba(245,158,11,.28);--cf:rgba(245,158,11,.4)}',
		'#mwrt-notice .mwrt-notice-item[data-kind="unlink"]{--c:#64748b;--ct:#475569;--cs:rgba(100,116,139,.13);--cb:rgba(100,116,139,.26);--cf:rgba(100,116,139,.38)}',
		'#mwrt-notice .mwrt-notice-item[data-kind="unlink"] .mwrt-notice-icon svg{animation:mwrt-notice-unplug .7s cubic-bezier(.3,.7,.3,1) .15s both}',
		'#mwrt-notice .mwrt-notice-item.mwrt-leave{animation:mwrt-notice-out .22s ease-in both}',

		// 左侧细色条
		'#mwrt-notice .mwrt-notice-item::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;',
		'border-radius:0 3px 3px 0;background:linear-gradient(180deg,var(--c),var(--cf))}',

		'#mwrt-notice .mwrt-notice-icon{flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;',
		'border-radius:10px;color:var(--c);background:var(--cs);',
		'box-shadow:inset 0 0 0 1px var(--cb)}',
		'#mwrt-notice .mwrt-notice-body{flex:1;min-width:0;word-break:break-word}',
		'#mwrt-notice .mwrt-notice-label{display:flex;align-items:baseline;margin:0 0 2px;font-size:12px;font-weight:600;line-height:1.4;color:var(--ct)}',
		'#mwrt-notice .mwrt-notice-time{margin-left:auto;padding-left:8px;flex:none;font-size:11px;font-weight:400;opacity:.6;font-variant-numeric:tabular-nums;color:inherit}',
		'#mwrt-notice .mwrt-notice-text{display:block;color:inherit}',

		'#mwrt-notice a.mwrt-notice-link{display:inline-flex;align-items:center;gap:4px;margin:8px 0 0;padding:3px 10px;',
		'border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;text-decoration:none;color:var(--ct);',
		'background:var(--cs);transition:background .15s ease}',
		'#mwrt-notice a.mwrt-notice-link:hover{background:var(--cb)}',
		'#mwrt-notice a.mwrt-notice-link.mwrt-act{cursor:pointer}',

		'#mwrt-notice button.mwrt-notice-close{all:unset;flex:none;display:flex;align-items:center;justify-content:center;',
		'width:24px;height:24px;margin:-2px -2px 0 0;border-radius:8px;cursor:pointer;color:#6b7280;transition:background .15s,color .15s}',
		'#mwrt-notice button.mwrt-notice-close:hover{background:rgba(15,23,42,.07);color:#111827}',
		'#mwrt-notice button.mwrt-notice-close:focus-visible,#mwrt-notice a.mwrt-notice-link:focus-visible{',
		'outline:2px solid var(--c);outline-offset:2px}',

		// 进行中: 底部流动细线
		'#mwrt-notice .mwrt-notice-busy{position:absolute;left:0;right:0;bottom:0;height:2px;overflow:hidden;',
		'background:var(--cs)}',
		'#mwrt-notice .mwrt-notice-busy::after{content:"";position:absolute;top:0;bottom:0;width:40%;',
		'background:linear-gradient(90deg,transparent,var(--c),transparent);animation:mwrt-notice-busy 1.6s ease-in-out infinite}',
		'#mwrt-notice .mwrt-notice-busy.mwrt-det::after{left:0;width:var(--p,0%);animation:none;background:var(--c);',
		'transition:width .6s ease}',
		'#mwrt-notice .mwrt-notice-pct{margin-left:6px;font-weight:500;opacity:.8;font-variant-numeric:tabular-nums}',

		// s155: 维护人员聊天消息卡(data-kind=chat): 靛紫色渐变头像 + 在线点 + 未读徽标 + 两行预览气泡 + 主按钮
		'#mwrt-notice .mwrt-notice-item[data-kind="chat"]{--c:#6366f1;--ct:#4338ca;--cs:rgba(99,102,241,.12);--cb:rgba(99,102,241,.26);--cf:rgba(139,92,246,.42);padding:14px 12px 13px 16px}',
		'#mwrt-notice .mwrt-chat.mwrt-stack{margin-bottom:7px;box-shadow:0 12px 32px -10px rgba(15,23,42,.28),0 2px 8px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.7),0 5px 0 -2px rgba(99,102,241,.2),0 10px 0 -4px rgba(99,102,241,.1)}',
		'#mwrt-notice .mwrt-chat.mwrt-stack:hover{box-shadow:0 16px 36px -10px rgba(15,23,42,.34),0 2px 8px rgba(15,23,42,.1),inset 0 1px 0 rgba(255,255,255,.7),0 5px 0 -2px rgba(99,102,241,.2),0 10px 0 -4px rgba(99,102,241,.1)}',
		'#mwrt-notice .mwrt-chat-av{flex:none;position:relative;display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;color:#fff;',
		'background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 5px 12px -4px rgba(99,102,241,.6),inset 0 0 0 1px rgba(255,255,255,.28)}',
		'#mwrt-notice .mwrt-chat-av svg{width:20px;height:20px}',
		'#mwrt-notice .mwrt-chat-dot{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;box-sizing:border-box;background:#94a3b8;border:2px solid #f5f6fb}',
		'#mwrt-notice .mwrt-chat[data-online="1"] .mwrt-chat-dot{background:#22c55e}',
		'#mwrt-notice .mwrt-chat-head{display:flex;align-items:center;gap:8px;min-width:0;margin-top:1px}',
		'#mwrt-notice .mwrt-chat-title{min-width:0;font-size:13.5px;font-weight:650;line-height:1.35;color:#1f2937;letter-spacing:.2px}',
		'#mwrt-notice .mwrt-chat-badge{flex:none;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:18px;color:#fff;',
		'background:#4f46e5;font-variant-numeric:tabular-nums;white-space:nowrap}',
		'#mwrt-notice .mwrt-chat-badge.mwrt-pop{animation:mwrt-chat-pop .42s cubic-bezier(.2,.8,.2,1)}',
		'#mwrt-notice .mwrt-chat-meta{display:flex;align-items:center;margin-top:1px;font-size:11.5px;line-height:1.5;color:#6b7280;font-variant-numeric:tabular-nums}',
		'#mwrt-notice .mwrt-chat-time::before{content:"·";margin:0 6px}',
		'#mwrt-notice .mwrt-chat-time:empty{display:none}',
		'#mwrt-notice .mwrt-chat-bubble{margin-top:9px;padding:8px 12px;border-radius:4px 14px 14px 14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.17);color:#111827;font-size:13px;line-height:1.55}',
		'#mwrt-notice .mwrt-chat-bubble .mwrt-notice-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;word-break:break-word}',
		'#mwrt-notice .mwrt-chat-act{display:flex;margin-top:10px}',
		'#mwrt-notice a.mwrt-notice-link.mwrt-chat-go{margin:0;padding:5px 15px;font-size:12.5px;letter-spacing:.3px;color:#fff;background:linear-gradient(135deg,#4f46e5,#7c3aed);',
		'box-shadow:0 5px 12px -5px rgba(79,70,229,.7);transition:filter .15s ease,box-shadow .15s ease}',
		'#mwrt-notice a.mwrt-notice-link.mwrt-chat-go:hover{background:linear-gradient(135deg,#4f46e5,#7c3aed);filter:brightness(1.1);box-shadow:0 7px 14px -5px rgba(79,70,229,.75)}',
		'#mwrt-notice a.mwrt-notice-link.mwrt-chat-go::after{content:"\\2192";display:inline-block;margin-left:2px;transition:transform .15s ease}',
		'#mwrt-notice a.mwrt-notice-link.mwrt-chat-go:hover::after{transform:translateX(2px)}',

		// 深色页面
		'#mwrt-notice.mwrt-dark .mwrt-notice-item{color:#e5e7eb;background:rgba(28,31,38,.72);border-color:rgba(255,255,255,.08);',
		'box-shadow:0 12px 32px -10px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.06)}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item{--ct:#93c5fd}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-level="critical"]{--ct:#ff9b9b}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-level="warn"]{--ct:#fcd34d}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="link"]{--ct:#6ee7b7}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="ask"],#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="smswarn"]{--ct:#fcd34d}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="sms"]{--c:#38bdf8;--ct:#7dd3fc}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="miss"]{--c:#f87171;--ct:#fca5a5}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="unlink"]{--c:#94a3b8;--ct:#cbd5e1}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item[data-kind="chat"]{--c:#818cf8;--ct:#c7d2fe;--cs:rgba(129,140,248,.14);--cb:rgba(129,140,248,.3)}',
		'#mwrt-notice.mwrt-dark .mwrt-chat-dot{border-color:#1c1f26}',
		'#mwrt-notice.mwrt-dark .mwrt-chat-title{color:#f3f4f6}',
		'#mwrt-notice.mwrt-dark .mwrt-chat-meta{color:#9ca3af}',
		'#mwrt-notice.mwrt-dark .mwrt-chat-badge{background:#6366f1}',
		'#mwrt-notice.mwrt-dark .mwrt-chat-bubble{background:rgba(129,140,248,.13);border-color:rgba(129,140,248,.26);color:#e5e7eb}',
		'#mwrt-notice.mwrt-dark .mwrt-chat.mwrt-stack{box-shadow:0 12px 32px -10px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.06),0 5px 0 -2px rgba(129,140,248,.26),0 10px 0 -4px rgba(129,140,248,.13)}',
		'#mwrt-notice.mwrt-dark button.mwrt-notice-close{color:#9ca3af}',
		'#mwrt-notice.mwrt-dark button.mwrt-notice-close:hover{background:rgba(255,255,255,.08);color:#f3f4f6}',

		// 不支持毛玻璃的浏览器: 提高不透明度保证可读
		'@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){',
		'#mwrt-notice .mwrt-notice-item{background:rgba(255,255,255,.95)}',
		'#mwrt-notice.mwrt-dark .mwrt-notice-item{background:rgba(28,31,38,.95)}}',

		'@media (max-width:600px){#mwrt-notice{left:8px;right:8px;width:auto;max-width:none}}',

		'@keyframes mwrt-chat-pop{0%{transform:scale(1)}40%{transform:scale(1.2)}100%{transform:scale(1)}}',
		'@keyframes mwrt-notice-in{from{opacity:0;transform:translateX(24px) scale(.98)}to{opacity:1;transform:none}}',
		'@keyframes mwrt-notice-out{to{opacity:0;transform:translateX(24px) scale(.98)}}',
		'@keyframes mwrt-notice-busy{from{left:-40%}to{left:100%}}',
		'@keyframes mwrt-notice-plug{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:none}}',
		// 拔出: 往上一提再掉下来停住, 最后变淡
		'@keyframes mwrt-notice-unplug{0%{transform:none}30%{transform:translateY(-3px)}100%{transform:translateY(3px);opacity:.6}}',
		'@media (prefers-reduced-motion:reduce){#mwrt-notice .mwrt-notice-item,#mwrt-notice .mwrt-notice-item.mwrt-leave,',
		'#mwrt-notice .mwrt-notice-busy::after,#mwrt-notice .mwrt-notice-item .mwrt-notice-icon svg,#mwrt-notice .mwrt-chat-badge.mwrt-pop{animation:none}#mwrt-notice .mwrt-notice-item:hover{transform:none}#mwrt-notice a.mwrt-chat-go:hover::after{transform:none}}'
	].join('');

	var box = null, listFn = null, timer = null, lastList = [], seq = 0, rtimer = 0;
	var acked = {};      // s105: 本页已向服务端 ack 成功的卡片 id, 挡住 ack 之前发出、之后才返回的旧列表

	function dismissed() {
		try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; }
	}

	// 已读键: 普通卡 = id; 带 rev 的卡(短信汇总卡)= id#rev, rev 变了(超出条数变了)要重新出现
	function dkey(n) {
		return n.id + (n.rev != null && n.rev !== '' ? '#' + n.rev : '');
	}

	// s105: 这张卡能不能在服务端记已读, 能就返回 POST 字段: 短信 / 未接卡 → ids; 汇总卡 → scope + keep(当前显示的短信 / 未接卡 id)
	function ackFields(n) {
		if (!ACK_URL || !n) return null;
		if (ACK_ID.test(n.id)) return { ids: n.id };
		if (n.id === 'sms-more' && (n.ack === 'sms_older' || n.ack === 'older') && box) {
			var keep = [];
			Array.prototype.forEach.call(box.querySelectorAll('.mwrt-notice-item:not(.mwrt-leave)'), function (c) {
				var id = c.getAttribute('data-id');
				if (ACK_ID.test(id) && keep.length < 10) keep.push(id);
			});
			if (keep.length) return { scope: n.ack, keep: keep.join(',') };
		}
		return null;
	}

	// 发 ack。resolve(true) = 服务端确认写入; 其余(网络错误 / 非 JSON / ok 不为真 / 超时)resolve(false)。永不 reject。
	function postAck(fields, keepalive) {
		return new Promise(function (resolve) {
			var done = false, finish = function (v) { if (!done) { done = true; resolve(v); } };
			try {
				var f = {}, k, body = [];
				for (k in fields) f[k] = fields[k];
				f.token = (window.L && L.env && L.env.token) || '';
				for (k in f) body.push(encodeURIComponent(k) + '=' + encodeURIComponent(f[k]));
				var opt = { method: 'POST', credentials: 'same-origin', cache: 'no-store',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.join('&') };
				if (keepalive) opt.keepalive = true;
				window.setTimeout(function () { finish(false); }, 8000);
				fetch(ACK_URL, opt).then(function (r) { return r.json(); })
					.then(function (j) { finish(!!(j && j.ok === true)); })
					.catch(function () { finish(false); });
			} catch (e) { finish(false); }
		});
	}

	// ack 成功后: 记入本页已读、作废在途的旧列表、通知同浏览器其它标签页、马上重拉
	function afterAck(ids) {
		(ids || []).forEach(function (id) { acked[id] = true; });
		seq++;
		ping();
	}

	function ping() {
		try { localStorage.setItem(PING, String(Date.now())); } catch (e) {}
		refresh();
	}

	function dismiss(key) {
		var d = dismissed();
		if (d.indexOf(key) < 0) d.push(key);
		// 只留最近 KEEP 条, 免得越攒越多
		try { localStorage.setItem(KEY, JSON.stringify(d.slice(-KEEP))); } catch (e) {}
	}

	// 按页面实际底色判深浅: argon 的深色可以是跟随系统也可以是强制, 只看 media 不准
	function pageIsDark() {
		// s107: 整站深浅的唯一来源是 html[data-darkmode](mwrt-aurora-boot.js), 读得到就直接用
		var dm = document.documentElement.getAttribute('data-darkmode');
		if (dm === 'true') return true;
		if (dm === 'false') return false;
		var m = null;
		[document.body, document.documentElement].some(function (el) {
			var c = el && getComputedStyle(el).backgroundColor;
			var p = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
			if (p && (p[4] === undefined || +p[4] > 0.5)) { m = p; return true; }
			return false;
		});
		if (!m) return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
		return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 110;
	}

	// 手机上 argon 顶部有一条 49px 的标题栏(汉堡菜单+标题), 消息排在它下面。
	// 标题栏是 relative, 跟着 .main-right 一起滚走, 所以按它的高度而不是当前位置算,
	// 滚动时消息不跟着上下跳。桌面版 header 高度是 0, 消息贴到 12px。
	function place() {
		if (!box) return;
		var top = 12;
		var hd = document.querySelector('header');
		if (hd) {
			var h = hd.getBoundingClientRect().height;
			if (h > 0 && h < 120) top = Math.round(h) + 8;
		}
		box.style.top = top + 'px';
		box.classList.toggle('mwrt-dark', pageIsDark());
		// s103: 限高 = 视口高 - top - 12px, 卡片太多时在容器内滚动, 不把汇总卡 / 页面全盖住
		var vh = window.innerHeight || document.documentElement.clientHeight || 0;
		// s104: 手机底栏(#mwrt-bottomnav)在场时, 容器底边停在底栏上方 8px, 不压住底栏按钮(容器 z-index 比底栏高, 压住就点不到底栏)
		var bot = 12, nav = document.getElementById('mwrt-bottomnav');
		if (nav) {
			var nr = nav.getBoundingClientRect();
			if (nr.height > 0 && nr.top > vh / 2 && nr.top < vh) bot = Math.round(vh - nr.top) + 8;
		}
		box.style.maxHeight = Math.max(96, vh - top - bot) + 'px';
		fit();
	}

	// s103: 只有内容超过限高时才给容器开 overflow-y:auto + pointer-events:auto(滚动手势才能用);
	// 平时容器仍是 pointer-events:none、不裁阴影和滑入动画。内容撑满时 scrollHeight > clientHeight。
	function fit() {
		if (!box || box.style.display === 'none') return;
		var over = box.scrollHeight > box.clientHeight + 1;
		if (box.classList.contains('mwrt-scroll') !== over) box.classList.toggle('mwrt-scroll', over);
	}

	function container() {
		if (box && document.body.contains(box)) return box;
		if (!document.getElementById('mwrt-notice-style')) {
			var st = document.createElement('style');
			st.id = 'mwrt-notice-style';
			st.textContent = CSS;
			(document.head || document.documentElement).appendChild(st);
		}
		box = document.createElement('div');
		box.id = 'mwrt-notice';
		box.setAttribute('role', 'region');
		box.setAttribute('aria-label', '系统消息');
		box.style.display = 'none';
		document.body.appendChild(box);
		place();
		window.addEventListener('resize', place);
		document.addEventListener('mwrt-theme', place);   // s107: 切换深浅后通知卡立刻换色
		return box;
	}

	function leave(c) {
		if (c.classList.contains('mwrt-leave')) return;
		c.classList.add('mwrt-leave');
		window.setTimeout(function () {
			if (c.parentNode) c.parentNode.removeChild(c);
			if (box && !box.querySelector('.mwrt-notice-item:not(.mwrt-leave)')) box.style.display = 'none';
			else fit();
		}, 220);
	}

	// 百分比放在 aria-hidden 的 span 里: 卡片是 alert, 改它的文字读屏软件会反复播报
	function setProgress(c, p) {
		var bz = c.querySelector('.mwrt-notice-busy');
		var pc = c.querySelector('.mwrt-notice-pct');
		if (!bz) return;
		var ok = typeof p === 'number' && isFinite(p);
		if (ok) {
			p = Math.max(0, Math.min(100, Math.round(p)));
			bz.style.setProperty('--p', p + '%');
		}
		bz.classList.toggle('mwrt-det', ok);
		if (pc) pc.textContent = ok ? p + '%' : '';
	}

	function pad2(v) { return v < 10 ? '0' + v : '' + v; }

	// 事件时间: 时钟可信显示本地 HH:MM:SS, 不可信显示"刚刚", 没有 ts 的通知不显示
	function timeText(n) {
		if (n.ts == null || isNaN(+n.ts)) return '';
		if (!n.clock_ok) return '刚刚';
		var d = new Date(n.ts * 1000);
		return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
	}

	function setTime(c, n) {
		var lb = c.querySelector('.mwrt-notice-label');
		var tm = c.querySelector('.mwrt-notice-time');
		var tx = lb ? timeText(n) : '';
		if (!tx) {
			if (tm) tm.parentNode.removeChild(tm);
			return;
		}
		if (!tm) {
			tm = document.createElement('span');
			tm.className = 'mwrt-notice-time';
			lb.appendChild(tm);
		}
		if (tm.textContent !== tx) tm.textContent = tx;
	}

	// 卡片配色类别: 有专属图标的按 ICON_LEVEL; s103: sms 图标 + warn 等级(IMS 未开启提醒)换琥珀色 smswarn
	function kindOf(n, level) {
		var kind = ICON[n.icon] && ICON_LEVEL[n.icon];
		if (kind === 'sms' && level === 'warn') kind = 'smswarn';
		return kind;
	}

	// 标题文字: 有专属图标且后端给了 title 用 title, 否则按等级的默认标签
	function labelText(n, level) {
		return (kindOf(n, level) && n.title) || LABEL[level];
	}

	// s103: 原地更新标题文字: 只改标签里的第一个文本节点, 时间 / 百分比子节点原样保留
	function setLabel(c, text) {
		var lb = c.querySelector('.mwrt-notice-label');
		if (!lb) return;
		var tn = lb.firstChild;
		if (tn && tn.nodeType === 3) {
			if (tn.nodeValue !== text) tn.nodeValue = text;
		} else {
			lb.insertBefore(document.createTextNode(text), lb.firstChild);
		}
	}

	function card(n) {
		var level = RANK[n.level] === undefined ? 'info' : n.level;
		if (n.icon === 'chat' && n.chat) return chatCard(n);      // s155
		var c = document.createElement('div');
		c.className = 'mwrt-notice-item';
		c.setAttribute('data-id', n.id);
		c.setAttribute('data-level', level);
		c.setAttribute('data-text', n.text || '');
		var kind = kindOf(n, level);
		if (kind) c.setAttribute('data-kind', kind);
		// critical/warn 用 alert 让读屏软件立即播报, info 用 status 不打断
		c.setAttribute('role', level === 'info' ? 'status' : 'alert');

		var ic = document.createElement('span');
		ic.className = 'mwrt-notice-icon';
		ic.innerHTML = ICON[kind ? n.icon : level];

		var body = document.createElement('div');
		body.className = 'mwrt-notice-body';
		var lb = document.createElement('span');
		lb.className = 'mwrt-notice-label';
		lb.textContent = labelText(n, level);
		var t = document.createElement('span');
		t.className = 'mwrt-notice-text';
		t.textContent = n.text || '';
		body.appendChild(lb);
		body.appendChild(t);

		var href = n.link && LINKS[n.link];
		if (href) {
			var a = document.createElement('a');
			a.className = 'mwrt-notice-link';
			a.href = href;
			a.textContent = LINKTXT[n.link] || '前往查看 →';
			body.appendChild(a);
		}
		c.__n = n;
		// s102: 短信卡整张可点, 跳到收信箱并顺带记为已读(点 ×、点链接本身、选中文字时不抢)
		// s103: smsset(IMS 未开启提醒)同一机制, 跳短信管理设置页
		if (href && (n.link === 'sms' || n.link === 'smsset')) {
			c.classList.add('mwrt-go');
			c.addEventListener('click', function (e) {
				var t = e.target;
				if (t && t.closest && t.closest('button.mwrt-notice-close')) return;
				var onLink = !!(t && t.closest && t.closest('a'));      // 链接自己会跳, 这里只记已读
				var sel = window.getSelection && window.getSelection();
				if (!onLink && sel && String(sel).length) return;       // 正在选文字: 不跳也不记
				// s105: 短信 / 未接卡先在服务端记已读(keepalive: 页面跳走后请求也会发完), 最多等 200ms 再跳;
				// 其它卡(ims-off)仍只记 localStorage
				var f = ackFields(c.__n), key = dkey(c.__n);
				if (!f) {
					dismiss(key);
					if (!onLink) location.href = href;
					return;
				}
				var go = false;
				var jump = function () { if (!go) { go = true; if (!onLink) location.href = href; } };
				var gate = window.setTimeout(jump, 200);
				postAck(f, true).then(function (ok) {
					window.clearTimeout(gate);
					if (ok) afterAck(f.ids ? [f.ids] : []); else dismiss(key);
					jump();
				});
			});
		}

		// 需要用户操作的通知(USB 网卡等待选择): 带「去选择」直达全局提示框, 是否还能点由 syncActs 管
		if (n.act === 'usbask' && n.dev) {
			var b = document.createElement('a');
			b.className = 'mwrt-notice-link mwrt-act';
			b.href = '#';
			b.setAttribute('role', 'button');
			b.setAttribute('data-act', 'usbask');
			b.setAttribute('data-dev', n.dev);
			b.textContent = '去选择 →';
			b.style.display = 'none';
			b.addEventListener('click', function (e) {
				e.preventDefault();
				var ps = window.mwrtPortSw;
				if (!(ps && ps.askUsb && ps.askUsb(n.dev))) syncActs();
			});
			body.appendChild(b);
		}

		c.appendChild(ic);
		c.appendChild(body);

		if (n.closable) {
			var x = document.createElement('button');
			x.type = 'button';
			x.className = 'mwrt-notice-close';
			x.innerHTML = CLOSE;
			x.setAttribute('aria-label', '标记已读并关闭');
			x.setAttribute('title', '已读');
			x.addEventListener('click', function () {
				var f = ackFields(c.__n), key = dkey(c.__n);
				if (!f) {
					dismiss(key);
					leave(c);
					return;
				}
				// s105: 服务端写成功后才收起; 失败退回本浏览器 localStorage 兜底收起
				if (x.getAttribute('aria-busy') === 'true') return;
				x.setAttribute('aria-busy', 'true');
				postAck(f, false).then(function (ok) {
					x.removeAttribute('aria-busy');
					if (ok) afterAck(f.ids ? [f.ids] : []); else dismiss(key);
					leave(c);
				});
			});
			c.appendChild(x);
		} else {
			var pc = document.createElement('span');
			pc.className = 'mwrt-notice-pct';
			pc.setAttribute('aria-hidden', 'true');
			lb.appendChild(pc);
			var bz = document.createElement('span');
			bz.className = 'mwrt-notice-busy';
			bz.setAttribute('aria-hidden', 'true');
			c.appendChild(bz);
			setProgress(c, n.progress);
		}
		setTime(c, n);
		return c;
	}

	// 「去选择」按钮只在那块网卡还在等回答时显示; 每轮刷新(和提示框的轮询)后对一遍
	function syncActs() {
		if (!box) return;
		var ps = window.mwrtPortSw;
		var pend = ps && ps.usbPending ? ps.usbPending() : [];
		Array.prototype.forEach.call(box.querySelectorAll('a[data-act="usbask"]'), function (a) {
			a.style.display = pend.indexOf(a.getAttribute('data-dev')) >= 0 ? 'inline-flex' : 'none';
		});
	}

	/* ---- s155: 故障报修在线聊天 → 「维护人员发来新消息」通知卡 ----
	 * 数据: 后端 list 里 icon=chat 的一张卡(chat:{code,state,ids[未读维护人员消息 id],more,max,online}), text=最新一条的 80 字预览。
	 * 未读 = ids 里大于 seen 的。seen = 聊天页写在浏览器里的 mwrt.rc.seen.<报修码>(已看到的最大维护人员消息 id)与后端已排除的设备 chat.ack 取较大者;
	 * 本脚本只读 seen, 不写。用户点 × 记在 mwrt.rc.dismiss.<报修码>(= 关掉时的最大消息 id), 更新的维护人员消息到来(max 变大)才重新弹出。
	 * 聊天卡片(#rc)正显示在当前页面时不弹、已弹的收回; 回到后台标签页不算「正在看」。点卡片 / 「查看并回复」跳 设置页#mwrt-chat 深链。
	 * 存储降级: localStorage 不可用(隐私模式 / 被禁)时退到 sessionStorage, 再不行退到内存, 任何一步抛错都吞掉。 */
	var SEEN_PRE = 'mwrt.rc.seen.', DISM_PRE = 'mwrt.rc.dismiss.';
	var CHAT_HASH = '#mwrt-chat', CHAT_EVERY = 1500;
	var memKV = {}, chatSig = '', chatMin = 0;

	function stores() {
		var a = [];
		try { if (window.localStorage) a.push(window.localStorage); } catch (e) {}
		try { if (window.sessionStorage) a.push(window.sessionStorage); } catch (e) {}
		return a;
	}
	function kvGetInt(key) {      // 所有可用存储里取最大值(只认非负整数)
		var best = parseInt(memKV[key], 10) || 0;
		stores().forEach(function (s) {
			try { var v = parseInt(s.getItem(key), 10); if (v > best) best = v; } catch (e) {}
		});
		return best;
	}
	function kvSetInt(key, val) { // 优先 localStorage, 失败退 sessionStorage, 再失败只留内存; 同时记一份内存, 本页内始终一致
		memKV[key] = String(val);
		var ok = false;
		stores().some(function (s) {
			try { s.setItem(key, String(val)); ok = true; } catch (e) {}
			return ok;
		});
	}
	function kvDel(key) {
		delete memKV[key];
		stores().forEach(function (s) { try { s.removeItem(key); } catch (e) {} });
	}
	function kvKeys(pre) {
		var out = Object.keys(memKV).filter(function (k) { return k.indexOf(pre) === 0; });
		stores().forEach(function (s) {
			try {
				for (var i = 0; i < s.length; i++) {
					var k = s.key(i);
					if (k && k.indexOf(pre) === 0 && out.indexOf(k) < 0) out.push(k);
				}
			} catch (e) {}
		});
		return out;
	}

	// 会话切换 / 结束时清掉旧报修码的关闭记录(顶层 chat 由后端给: 有会话文件才有)
	function chatCleanup(meta) {
		if (!meta || typeof meta.code !== 'string') return;
		kvKeys(DISM_PRE).forEach(function (k) {
			var code = k.slice(DISM_PRE.length);
			if (code !== meta.code || meta.state !== 'approved') kvDel(k);
		});
	}

	// 聊天卡片此刻是否正显示在当前页面上(#rc 在、没被折叠 / 隐藏的页签藏起来、整页也没在后台)
	function chatPageVisible() {
		try {
			if (document.hidden) return false;
			var rc = document.getElementById('rc');
			if (!rc || rc.offsetParent === null) return false;
			// aurora 下未选中的页签只是 visibility:hidden + height:0(offsetParent 仍非空), 要连同 data-tab-active 一起判
			if (getComputedStyle(rc).visibility === 'hidden') return false;
			var tab = rc.closest && rc.closest('[data-tab-active]');
			if (tab && tab.getAttribute('data-tab-active') === 'false') return false;
			return true;
		} catch (e) { return false; }
	}

	// 把后端的聊天卡按本浏览器的 seen / 关闭记录 / 页面可见性判一遍: 返回要显示的卡(副本, 带 count), 不该显示返回 null
	function chatEval(n) {
		var c = n.chat;
		if (!c || typeof c.code !== 'string' || !Array.isArray(c.ids)) return null;
		var seen = kvGetInt(SEEN_PRE + c.code), cnt = 0;
		c.ids.forEach(function (id) { if (id > seen) cnt++; });
		if (c.more > 0 && c.ids.length && seen < c.ids[0]) cnt += c.more;
		if (cnt < 1) return null;
		var max = c.max || 0;
		if (kvGetInt(DISM_PRE + c.code) >= max) return null;
		if (chatPageVisible()) return null;
		var m = {};
		Object.keys(n).forEach(function (k) { m[k] = n[k]; });
		m.chat = { code: c.code, state: c.state, max: max, online: !!c.online, count: cnt };
		return m;
	}

	// s161: 报修聊天搬进首页浮窗(#rpw), 点通知卡跳首页并弹出它; 首页地址优先 L.url, 取不到就用 data-ota 同级地址推出来
	function chatBase() {
		try {
			if (window.L && L.url) {
				var u = L.url('admin', 'modeminfo');
				if (u) return u;
			}
		} catch (e) { }
		var ota = LINKS.ota || '';
		return /\/admin\/system\/ota/.test(ota) ? ota.replace(/\/admin\/system\/ota.*$/, '/admin/modeminfo') : '';
	}
	function chatGo() {
		var base = chatBase();
		if (!base) return;
		var here = location.pathname.replace(/\/+$/, ''), there = base.replace(/[?#].*$/, '').replace(/\/+$/, '');
		there = there.replace(/^https?:\/\/[^\/]+/, '');
		if (here === there) {     // 已经在首页: 不刷新, 直接开浮窗(首页脚本也认 #mwrt-chat)
			if (window.MRT_RP && MRT_RP.open) MRT_RP.open(true);
			else location.hash = CHAT_HASH;
			return;
		}
		location.href = base + CHAT_HASH;
	}

	// 相对时间(ts 是维护服务器给的真实时间, 用浏览器时间比; 浏览器时间落后则一律「刚刚」)
	function chatRel(ts) {
		if (!(ts > 0)) return '';
		var s = Math.floor(Date.now() / 1000 - ts);
		if (s < 45) return '刚刚';
		if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' 分钟前';
		if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
		var d = new Date(ts * 1000);
		return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
	}
	function chatBadgeText(n) { return (n > 99 ? '99+' : n) + ' 条未读'; }

	function chatCard(n) {
		var c = document.createElement('div');
		c.className = 'mwrt-notice-item mwrt-chat mwrt-go';
		c.setAttribute('data-id', n.id);
		c.setAttribute('data-level', 'info');
		c.setAttribute('data-kind', 'chat');
		c.setAttribute('data-text', n.text || '');
		c.setAttribute('role', 'status');
		c.__n = n;
		c.__chat = true;

		var av = document.createElement('span');
		av.className = 'mwrt-chat-av';
		av.setAttribute('aria-hidden', 'true');
		av.innerHTML = ICON.chat;
		var dot = document.createElement('i');
		dot.className = 'mwrt-chat-dot';
		av.appendChild(dot);

		var body = document.createElement('div');
		body.className = 'mwrt-notice-body';
		var head = document.createElement('div');
		head.className = 'mwrt-chat-head';
		var ttl = document.createElement('span');
		ttl.className = 'mwrt-chat-title';
		ttl.textContent = '维护人员发来新消息';
		var bd = document.createElement('span');
		bd.className = 'mwrt-chat-badge';
		head.appendChild(ttl);
		head.appendChild(bd);

		var meta = document.createElement('div');
		meta.className = 'mwrt-chat-meta';
		var who = document.createElement('span');
		who.className = 'mwrt-chat-who';
		var tm = document.createElement('span');
		tm.className = 'mwrt-chat-time';
		meta.appendChild(who);
		meta.appendChild(tm);

		var bub = document.createElement('div');
		bub.className = 'mwrt-chat-bubble';
		var tx = document.createElement('span');
		tx.className = 'mwrt-notice-text';
		bub.appendChild(tx);

		var act = document.createElement('div');
		act.className = 'mwrt-chat-act';
		var a = document.createElement('a');
		a.className = 'mwrt-notice-link mwrt-chat-go';
		a.href = chatBase() ? chatBase() + CHAT_HASH : '#';
		a.textContent = '查看并回复';
		a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); chatGo(); });
		act.appendChild(a);

		body.appendChild(head);
		body.appendChild(meta);
		body.appendChild(bub);
		body.appendChild(act);

		var x = document.createElement('button');
		x.type = 'button';
		x.className = 'mwrt-notice-close';
		x.innerHTML = CLOSE;
		x.setAttribute('aria-label', '暂不提醒这条消息');
		x.setAttribute('title', '关闭提醒');
		x.addEventListener('click', function (e) {
			e.stopPropagation();
			var cur = c.__n && c.__n.chat;
			if (cur) kvSetInt(DISM_PRE + cur.code, cur.max);
			chatSig = '';
			leave(c);
		});

		c.addEventListener('click', function (e) {
			var t = e.target;
			if (t && t.closest && t.closest('button.mwrt-notice-close')) return;
			var sel = window.getSelection && window.getSelection();
			if (sel && String(sel).length) return;      // 正在选文字: 不跳
			chatGo();
		});

		c.appendChild(av);
		c.appendChild(body);
		c.appendChild(x);
		chatUpdate(c, n, true);
		return c;
	}

	// 原地更新(数量 / 预览 / 在线 / 时间): 不重建、不重播入场动画; 条数变大时徽标轻弹一下
	function chatUpdate(c, n, first) {
		var info = n.chat, old = c.__n && c.__n.chat;
		c.__n = n;
		var bd = c.querySelector('.mwrt-chat-badge'), tx = c.querySelector('.mwrt-notice-text');
		var t = chatBadgeText(info.count);
		if (bd.textContent !== t) {
			bd.textContent = t;
			if (!first && old && info.count > old.count) {
				bd.classList.remove('mwrt-pop');
				void bd.offsetWidth;
				bd.classList.add('mwrt-pop');
			}
		}
		var txt = n.text || '';
		if (tx.textContent !== txt) tx.textContent = txt;
		c.setAttribute('data-text', txt);
		c.classList.toggle('mwrt-stack', info.count > 1);
		var who = c.querySelector('.mwrt-chat-who');
		var wt = '维护人员 · ' + (info.online ? '在线' : '离线');
		if (who.textContent !== wt) who.textContent = wt;
		c.setAttribute('data-online', info.online ? '1' : '0');
		chatTimes(c);
	}
	function chatTimes(c) {
		var tm = c.querySelector('.mwrt-chat-time');
		if (!tm) return;
		var s = chatRel(c.__n && c.__n.ts);
		if (tm.textContent !== s) tm.textContent = s;
	}

	// 每 1.5 秒对一遍: 聊天页是否显示 / seen 被追上 / 被别的标签页关掉 → 只在「该不该显示」的判定变了才重画; 相对时间每分钟更新
	function chatTick() {
		var has = lastList.some(function (n) { return n && n.icon === 'chat' && n.chat; });
		if (!has) { chatSig = ''; return; }
		var sig = lastList.map(function (n) {
			if (!(n && n.icon === 'chat' && n.chat)) return '';
			var m = chatEval(n);
			return m ? m.chat.count + '/' + m.chat.max : '-';
		}).join('|');
		if (sig !== chatSig) {
			chatSig = sig;
			render(lastList, true);
		}
		if (++chatMin >= 40) {
			chatMin = 0;
			if (box) Array.prototype.forEach.call(box.querySelectorAll('.mwrt-chat'), chatTimes);
		}
	}

	function render(list, force) {
		lastList = list || [];
		var d = dismissed();
		var want = [];
		lastList.forEach(function (n) {
			if (!n || !n.id || acked[n.id]) return;
			if (n.icon === 'chat' && n.chat) {      // s155: 聊天通知卡走自己的未读 / 关闭 / 可见性判定
				var m = chatEval(n);
				if (m) want.push(m);
				return;
			}
			if (n.closable && d.indexOf(dkey(n)) >= 0) return;
			want.push(n);
		});
		var rk = function (n) { return n.chat && n.icon === 'chat' ? -1 : (RANK[n.level] === undefined ? 9 : RANK[n.level]); };
		want.sort(function (a, b) { return rk(a) - rk(b); });      // 聊天消息置顶, 其余按等级(稳定排序)

		var b = container();
		place();
		// 内容没变就不动 DOM, 免得读屏软件每 10 秒重播一次
		var sig = want.map(function (n) { return n.id + '|' + (n.title || '') + '|' + n.text + '|' + (n.progress == null ? '' : n.progress) + '|' + (n.rev == null ? '' : n.rev) + (n.chat ? '|' + n.chat.count + '/' + n.chat.max + '/' + (n.chat.online ? 1 : 0) + '/' + n.ts : ''); }).join('\n');
		if (!force && b.getAttribute('data-sig') === sig) return;
		b.setAttribute('data-sig', sig);

		// 按 id 增量更新: 没变的卡片原地保留(不重播动画/读屏), 新的滑入, 没了的滑出
		var keep = {};
		Array.prototype.forEach.call(b.querySelectorAll('.mwrt-notice-item:not(.mwrt-leave)'), function (c) {
			keep[c.getAttribute('data-id')] = c;
		});
		var live = want.map(function (n) {
			var c = keep[n.id];
			// 同 id、同等级: 文字变了(汇总卡条数变化)原地改文字, 不重建、不重播入场动画
			if (c && c.getAttribute('data-level') === n.level) {
				delete keep[n.id];
				if (c.__chat) { chatUpdate(c, n); return c; }      // s155: 聊天卡原地更新
				c.__n = n;
				if (c.getAttribute('data-text') !== (n.text || '')) {
					var tx = c.querySelector('.mwrt-notice-text');
					if (tx) tx.textContent = n.text || '';
					c.setAttribute('data-text', n.text || '');
				}
				setLabel(c, labelText(n, n.level));      // s103: 标题变了也原地更新(时间 / 百分比子节点保留)
				if (!n.closable) setProgress(c, n.progress);
				setTime(c, n);
				return c;
			}
			return card(n);
		});
		Object.keys(keep).forEach(function (id) { leave(keep[id]); });
		live.forEach(function (c, i) {
			var at = b.querySelectorAll('.mwrt-notice-item:not(.mwrt-leave)')[i] || null;
			if (at !== c) b.insertBefore(c, at);
		});
		if (want.length) b.style.display = 'flex';
		fit();
	}

	function tick() {
		if (!listFn) return;
		var my = ++seq;
		listFn().then(function (r) {
			if (my !== seq) return;      // 有更新的一次请求已发出, 丢掉这次(防止旧结果盖掉新结果)
			try { chatCleanup(r && r.chat); } catch (e) {}      // s155
			render(r && Array.isArray(r.notices) ? r.notices : []);
			syncActs();
		}).catch(function () { /* 没权限或后端没装: 什么都不显示 */ });
	}

	// s102: 对外 API。mwrt-phone.js 收到新短信 / 未接来电事件后调用, 300ms 去抖后立刻拉一次。
	// 页面还没把 rpc 准备好时调用是安全的: run() 准备好后本来就会马上 tick 一次。
	function refresh() {
		if (rtimer) clearTimeout(rtimer);
		rtimer = window.setTimeout(function () { rtimer = 0; tick(); }, 300);
	}
	// s105: ping() = 已读状态变了(smsc.htm 打开收件箱 ack 成功后调): 通知同浏览器其它标签页并立刻重拉
	window.mwrtNotice = { refresh: refresh, ping: ping, version: 14, chatSync: function () { chatSig = ''; chatTick(); } };

	/* 板钟校准(s95)。路由器没有 RTC, 断网时 NTP 对不上, 开机后的时钟停在上次刷机/保存配置的时刻再往后走,
	 * 比真实时间慢几小时到几天。静态文件的 Date 头因此落后于浏览器, 浏览器按「启发式新鲜期 = Last-Modified 到
	 * Date 间隔的 10%」算出的有效期远小于已经过去的时间, 每个资源都判为过期, 每点一次菜单都要重新向路由器
	 * 条件请求二三十个 js/css, 页面就有整页刷新的感觉(板钟准的机器第二次起是 0 次请求)。
	 * 做法: 取一个静态文件的 Date 头跟浏览器时间比, 板钟落后超过 2 分钟、且浏览器时间不早于该文件的
	 * Last-Modified(排除电脑时钟本身不对)时, 用和「系统-同步浏览器时间」按钮同一个接口(luci.setLocaltime)
	 * 校一次。只往前校, 不往回拨; 每 3 分钟最多检查一次, 失败(无权限等)一律静默。 */
	function clockSync(rpc) {
		try {
			var KEY = 'mwrt.clk', now = Date.now();
			if (now - (+localStorage.getItem(KEY) || 0) < 180000) return;
			localStorage.setItem(KEY, String(now));
		} catch (e) { return; }
		var base = (L.env && L.env.resource) || '/luci-static/resources';
		fetch(base + '/luci.js', { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
			var d = Date.parse(r.headers.get('Date') || ''), lm = Date.parse(r.headers.get('Last-Modified') || '');
			var t = Date.now();
			if (!d || !lm || t - d < 120000 || t < lm) return;
			var set = rpc.declare({ object: 'luci', method: 'setLocaltime', params: ['localtime'], expect: { result: 0 } });
			return set(Math.floor(t / 1000));
		}).catch(function () {});
	}

	function run() {
		if (!window.L || !L.require) return;
		if (document.querySelector('input[name="luci_password"]')) return;      // s155: 登录页不弹任何消息
		document.addEventListener('mwrt-usbnic', syncActs);   // portsw 每轮取到新状态就对一遍「去选择」
		// 别的标签页点了 ×(共用 localStorage): 本页立刻按新的已读集合重画, 不等 10 秒
		window.addEventListener('storage', function (e) {
			if (e.key === KEY && box) render(lastList, true);
			// s155: 聊天页写了 seen / 别的标签页关了聊天提醒: 立刻重判
			if (e.key === null || (e.key && (e.key.indexOf(SEEN_PRE) === 0 || e.key.indexOf(DISM_PRE) === 0))) { chatSig = ''; chatTick(); }
			// s105: 别的标签页向服务端 ack 过(或收件箱已读): 作废在途请求并马上重拉
			if (e.key === PING) { seq++; if (rtimer) clearTimeout(rtimer); rtimer = 0; tick(); }
		});
		// 标签页从后台回来立刻拉一次(后台时轮询是停着的)
		document.addEventListener('visibilitychange', function () {
			if (!document.hidden) refresh();
			chatSig = '';
			chatTick();
		});
		// s155: 聊天卡是否在屏幕上会随页签切换变化, 点击 / 哈希变化后马上重判, 其余每 1.5 秒兜底(只在有聊天通知时才干活)
		window.addEventListener('hashchange', function () { window.setTimeout(chatTick, 50); });
		document.addEventListener('click', function () { window.setTimeout(chatTick, 120); }, true);
		window.setInterval(chatTick, CHAT_EVERY);
		L.require('rpc').then(function (rpc) {
			clockSync(rpc);
			listFn = rpc.declare({ object: 'luci.mwrt-notice', method: 'list' });
			tick();
			timer = window.setInterval(function () {
				if (!document.hidden) tick();
			}, EVERY);
		}).catch(function () {});
	}

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', run);
	else
		run();
}());
