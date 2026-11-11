'use strict';
'require baseclass';
'require rpc';
'require poll';
'require ui';

var statusRPC = rpc.declare({object : 'udx', method : 'status', expect : {'' : {}}, reject : true});
var boardRPC =
    rpc.declare({object : 'system', method : 'board', expect : {'' : {}}, reject : true});
var systemRPC =
    rpc.declare({object : 'system', method : 'info', expect : {'' : {}}, reject : true});
function call(operation, args) {
    args = args || {};
    var fields = Object.keys(args);
    return rpc.declare({ object: 'udx.cellular', method: operation,
        params: fields, expect: { '': {} }, reject: true })
        .apply(null, fields.map(function(key) { return args[key]; }));
}
var cellStatusRPC = rpc.declare({object: 'udx.cellular', method: 'status', expect: {'': {}}, reject: true});
var historyRPC = rpc.declare({object: 'udx.cellular', method: 'sms_history_status', expect: {'': {}}, reject: true});
var smsRPC = rpc.declare({object: 'udx.cellular', method: 'sms_status', expect: {'': {}}, reject: true});
var apnRPC = rpc.declare({object: 'udx.cellular', method: 'apn_status', expect: {'': {}}, reject: true});
var wanRPC = rpc.declare({object: 'network.interface.wan', method: 'status', expect: {'': {}}, reject: true});
var wan6RPC = rpc.declare({object: 'network.interface.wan6', method: 'status', expect: {'': {}}, reject: true});
var usbRPC = rpc.declare({
    object : 'udx',
    method : 'usb',
    params : [ 'profile', 'acm' ],
    expect : {'' : {}},
    reject : true
});
var receiptRPC = rpc.declare({
    object : 'udx.cellular',
    method : 'sms_receipt',
    params : [ 'request_id' ],
    expect : {'' : {}},
    reject : true
});
var frequencyRPC =
    rpc.declare({object : 'udx', method : 'frequency_status', expect : {'' : {}}, reject : true});
var frequencyApplyRPC = rpc.declare({
    object : 'udx',
    method : 'frequency_apply',
    params : [ 'cpu_governor', 'cpu_min_khz', 'cpu_max_khz' ],
    expect : {'' : {}},
    reject : true
});
/* udx.speedtest is a separate ubus object. `start` is declared twice because
 * the speed run lets the service pick its own caps (only mode/node/threads are
 * sent) while a burn run always carries the user's own limits. */
var speedStatusRPC =
    rpc.declare({object : 'udx.speedtest', method : 'status', expect : {'' : {}}, reject : true});
var speedNodesRPC = rpc.declare({
    object : 'udx.speedtest',
    method : 'nodes',
    params : [ 'mode' ],
    expect : {'' : {}},
    reject : true
});
var speedStartRPC = rpc.declare({
    object : 'udx.speedtest',
    method : 'start',
    params : [ 'mode', 'node', 'threads' ],
    expect : {'' : {}},
    reject : true
});
var burnStartRPC = rpc.declare({
    object : 'udx.speedtest',
    method : 'start',
    params : [ 'mode', 'max_seconds', 'max_bytes', 'threads' ],
    expect : {'' : {}},
    reject : true
});
var speedStopRPC =
    rpc.declare({object : 'udx.speedtest', method : 'stop', expect : {'' : {}}, reject : true});
var queue = Promise.resolve();
function delay(ms) {
    return new Promise(function(resolve) {
        window.setTimeout(resolve, ms);
    });
}
function value(v, suffix) {
    if (v === null || v === undefined || v === '')
        return '—';
    if (typeof v === 'boolean')
        return v ? _('Yes') : _('No');
    if (Array.isArray(v))
        return v.map(function(x) {
                    return value(x);
                }).join(' / ') ||
               '—';
    return String(v) + (suffix || '');
}
/* Signal grading. The breakpoints mirror the UDX710 signal dashboard: each
 * metric is scored 0..100 through a piecewise linear curve, then bucketed into
 * five levels. Keep these numbers in sync if the dashboard ever changes. */
var SIGNAL_CURVES = {
    rsrp : [ [ -120, 0 ], [ -110, 20 ], [ -100, 45 ], [ -90, 70 ], [ -80, 88 ], [ -60, 100 ] ],
    rsrq : [ [ -30, 0 ], [ -20, 25 ], [ -15, 60 ], [ -10, 85 ], [ -3, 100 ] ],
    sinr : [ [ -10, 0 ], [ 0, 25 ], [ 13, 65 ], [ 20, 85 ], [ 30, 100 ] ]
};
var SIGNAL_LEVELS = [
    { min : 80, label : 'Excellent', color : '#16a34a' },
    { min : 60, label : 'Good', color : '#22c55e' },
    { min : 40, label : 'Fair', color : '#d97706' },
    { min : 20, label : 'Poor', color : '#ea580c' },
    { min : -1, label : 'Bad', color : '#dc2626' }
];
function interp(v, points) {
    if (v <= points[0][0])
        return points[0][1];
    for (var i = 1; i < points.length; i++) {
        var a = points[i - 1], b = points[i];
        if (v <= b[0])
            return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]);
    }
    return points[points.length - 1][1];
}
function signalQuality(kind, v) {
    if (v === null || v === undefined || v === '' || !SIGNAL_CURVES[kind])
        return null;
    var score = interp(Number(v), SIGNAL_CURVES[kind]);
    score = Math.min(100, Math.max(0, score));
    for (var i = 0; i < SIGNAL_LEVELS.length; i++)
        if (score >= SIGNAL_LEVELS[i].min)
            return { score : score, label : _(SIGNAL_LEVELS[i].label), color : SIGNAL_LEVELS[i].color };
    return null;
}
/* "优秀 (-95.4 dBm)" with the level coloured, used inside table/list cells. */
function signalBadge(kind, v, suffix) {
    var q = signalQuality(kind, v);
    if (!q)
        return E('span', {}, '—');
    return E('span', {},
             [ E('span', {style : 'color:' + q.color + ';font-weight:600'}, q.label), ' (',
               String(v) + (suffix || ''), ')' ]);
}
/* ---------------------------------------------------------------------------
 * Design tokens
 *
 * Every colour threshold used by the UDX pages lives here and only here: no
 * view may hardcode 55 / 70 / 85 / 60 / 150. Colours map onto Outline/Aurora
 * custom properties and fall back to literals so a bare LuCI still renders.
 * ------------------------------------------------------------------------ */
var TOKENS = {
    ok : {
        fg : 'var(--success-fg, #0f6e56)',
        bg : 'var(--success-surface, #e8f5f0)',
        line : 'var(--success-color-low, #9fd4c4)',
        solid : 'var(--success, #16a34a)'
    },
    /* QCI/5QI "GBR" badge and the temperature/storage/latency "good" band share
     * one teal so the same number never looks different on two pages. */
    teal : {
        fg : 'var(--success-fg, #0f6e56)',
        bg : 'var(--success-surface, #e8f5f0)',
        line : 'var(--success-color-low, #9fd4c4)',
        solid : 'var(--success, #0f6e56)'
    },
    warn : {
        fg : 'var(--warning-fg, #8a5308)',
        bg : 'var(--warning-surface, #fdf4e3)',
        line : 'var(--warning-a15, #e9c78f)',
        solid : 'var(--warning, #d97706)'
    },
    bad : {
        fg : 'var(--danger-surface-fg, #a32d2d)',
        bg : 'var(--danger-surface, #fcedec)',
        line : 'var(--destructive-a20, #efb7b5)',
        solid : 'var(--danger, #dc2626)'
    },
    neutral : {
        fg : 'var(--muted-foreground, #5b6472)',
        bg : 'var(--background-color-low, #f2f4f6)',
        line : 'var(--border-color-low, #e3e6ea)',
        solid : 'var(--muted-foreground, #8a929e)'
    }
};
/* Breakpoints: temperature in degrees Celsius, storage in percent used,
 * latency in milliseconds. Bands are inclusive on both ends of the warn step. */
var THRESHOLDS = {
    temperature : {warn : 55, bad : 70},
    storage : {warn : 70, bad : 85},
    latency : {warn : 60, bad : 150}
};
function level(metric, v) {
    var t = THRESHOLDS[metric];
    if (!t || v === null || v === undefined || v === '' || !isFinite(Number(v)))
        return null;
    var n = Number(v);
    if (n > t.bad)
        return 'bad';
    if (n >= t.warn)
        return 'warn';
    return 'ok';
}
function tone(key) {
    return TOKENS[key] || TOKENS.neutral;
}
/* ---------------------------------------------------------------------------
 * QCI / 5QI semantics — one table, read by both the overview card and the
 * mobile-network page.
 *
 * The badge is a two-way split, not a severity scale. GBR bearers reserve a
 * bit rate for real-time traffic; Non-GBR bearers are best effort and that is
 * the normal state of a phone on the internet. QCI 9 in particular must never
 * be rendered as a warning — painting it amber would tell every user their
 * device is broken whenever it is working exactly as designed.
 *
 *   GBR     1-4, 65-67, 75, 82-90
 *   Non-GBR 5-9, 69, 70, 79, 80
 * ------------------------------------------------------------------------ */
var QCI_TABLE = {
    1 : {kind : 'gbr', text : 'Conversational voice (VoLTE)'},
    2 : {kind : 'gbr', text : 'Conversational video'},
    3 : {kind : 'gbr', text : 'Real-time gaming'},
    4 : {kind : 'gbr', text : 'Non-conversational video'},
    5 : {kind : 'non-gbr', text : 'IMS signalling'},
    6 : {kind : 'non-gbr', text : 'Buffered streaming video, TCP'},
    7 : {kind : 'non-gbr', text : 'Voice, video and interactive gaming'},
    8 : {kind : 'non-gbr', text : 'Buffered streaming video, TCP'},
    9 : {kind : 'non-gbr', text : 'Default bearer, best effort'},
    65 : {kind : 'gbr', text : 'Mission-critical push to talk'},
    66 : {kind : 'gbr', text : 'Non-mission-critical push to talk'},
    67 : {kind : 'gbr', text : 'Mission-critical video'},
    69 : {kind : 'non-gbr', text : 'Mission-critical signalling'},
    70 : {kind : 'non-gbr', text : 'Mission-critical data'},
    75 : {kind : 'gbr', text : 'V2X messages'},
    79 : {kind : 'non-gbr', text : 'Low-latency eMBB'},
    80 : {kind : 'non-gbr', text : 'Low-latency eMBB, TCP'},
    82 : {kind : 'gbr', text : 'Discrete automation'},
    83 : {kind : 'gbr', text : 'Discrete automation'},
    84 : {kind : 'gbr', text : 'Intelligent transport systems'},
    85 : {kind : 'gbr', text : 'Intelligent transport systems'},
    86 : {kind : 'gbr', text : 'V2X messages'},
    87 : {kind : 'gbr', text : 'V2X messages'},
    88 : {kind : 'gbr', text : 'V2X messages'},
    89 : {kind : 'gbr', text : 'V2X messages'},
    90 : {kind : 'gbr', text : 'V2X messages'}
};
/* `kind` distinguishes LTE QCI from 5G SA 5QI; older firmware sends only `qci`,
 * in which case the value is a QCI. */
function qciInfo(value, kind) {
    var prefix = kind === '5qi' ? '5QI' : 'QCI';
    var n = (value === null || value === undefined || value === '')
                ? null
                : Number(value);
    if (n === null || !isFinite(n))
        return {
            known : false,
            prefix : prefix,
            value : null,
            badge : _('Unknown'),
            tone : 'warn',
            text : _('Unknown')
        };
    var row = QCI_TABLE[n];
    return {
        known : !!row,
        prefix : prefix,
        value : n,
        badge : prefix + ' ' + n,
        tone : row ? (row.kind === 'gbr' ? 'teal' : 'neutral') : 'warn',
        /* Above 9 the LTE semantics stop applying; never force them onto 5QI. */
        text : row ? _(row.text) : _('Extended level') + ' ' + n
    };
}
/* ---------------------------------------------------------------------------
 * Layout primitives. Kept here so the overview and the network page render the
 * same card, bar and step widgets from one place.
 * ------------------------------------------------------------------------ */
var STYLE_NODE = null;
var CSS = [
    '.udx-page{--udx-surface:var(--background-color-high,#fff);',
    '--udx-surface2:var(--background-color-low,#f7f8fa);',
    '--udx-text:var(--foreground,#1f2328);',
    '--udx-text2:var(--muted-foreground,#5b6472);',
    '--udx-line:var(--border-color-low,#e3e6ea);',
    '--udx-line2:var(--border-color-medium,#ccd2d9);',
    '--udx-bar:var(--background-color-medium,#eceef1);}',
    '.udx-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 16px}',
    '@media (max-width:1100px){.udx-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:680px){.udx-cards{grid-template-columns:minmax(0,1fr)}}',
    '.udx-card{border:1px solid var(--udx-line);border-radius:11px;padding:13px 15px;',
    'background:var(--udx-surface);min-width:0}',
    '.udx-wide{grid-column:1/-1}',
    '.udx-card-h{display:flex;justify-content:space-between;align-items:center;gap:8px;',
    'font-size:11.5px;font-weight:600;letter-spacing:.4px;color:var(--udx-text2);margin-bottom:8px}',
    '.udx-pill{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;',
    'border:1px solid transparent;white-space:nowrap}',
    '.udx-main{font-size:22px;font-weight:600;line-height:1.2;color:var(--udx-text);',
    'font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}',
    '.udx-main em{font-style:normal;font-size:13px;font-weight:400;color:var(--udx-text2);margin-left:5px}',
    '.udx-sp{display:flex;gap:14px;align-items:flex-end;margin-bottom:2px}',
    '.udx-sp>div{flex:1;min-width:0}',
    '.udx-lb{font-size:10.5px;color:var(--udx-text2);margin-bottom:1px}',
    '.udx-kv{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;',
    'color:var(--udx-text2);padding:2.5px 0}',
    '.udx-kv-k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.udx-kv-v{color:var(--udx-text);font-weight:600;text-align:right;',
    'font-variant-numeric:tabular-nums;word-break:break-all}',
    '.udx-bar{height:4px;border-radius:2px;background:var(--udx-bar);overflow:hidden;margin:9px 0 8px}',
    '.udx-bar i{display:block;height:100%;border-radius:2px;transition:width .35s ease}',
    '.udx-note{font-size:10.5px;color:var(--udx-text2);line-height:1.35;margin-top:7px;opacity:.85}',
    '.udx-banner{display:flex;gap:10px;align-items:flex-start;padding:10px 13px;',
    'border-radius:9px;border:1px solid;font-size:13px;margin-bottom:14px;line-height:1.5}',
    '.udx-banner[hidden]{display:none}',
    '.udx-banner .udx-ic{flex:0 0 auto;width:18px;height:18px;border-radius:50%;color:#fff;',
    'font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}',
    '.udx-panel{border:1px solid var(--udx-line);border-radius:11px;background:var(--udx-surface);',
    'margin-bottom:16px;overflow:hidden}',
    '.udx-panel-h{display:flex;justify-content:space-between;align-items:center;gap:12px;',
    'padding:10px 15px;background:var(--udx-surface2);border-bottom:1px solid var(--udx-line);',
    'font-size:12.5px;font-weight:600;color:var(--udx-text2)}',
    '.udx-panel-b{padding:6px 15px}',
    '.udx-btnrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:11px 15px;',
    'border-top:1px solid var(--udx-line)}',
    '.udx-btnrow .udx-right{margin-left:auto}',
    '.udx-evt{display:flex;gap:10px;padding:5px 0;font-size:12.5px;',
    'border-bottom:1px solid var(--udx-line)}',
    '.udx-evt:last-child{border-bottom:0}',
    '.udx-evt time{flex:0 0 46px;color:var(--udx-text2);font-variant-numeric:tabular-nums;opacity:.8}',
    '.udx-empty{padding:14px 15px;font-size:12.5px;color:var(--udx-text2)}',
    '.udx-disk{display:flex;align-items:center;gap:12px;padding:6px 0}',
    '.udx-disk+.udx-disk{border-top:1px solid var(--udx-line)}',
    '.udx-disk-nm{flex:0 0 108px;min-width:0;font-size:12px;color:var(--udx-text2)}',
    '.udx-disk-nm b{display:block;color:var(--udx-text);font-weight:600;overflow:hidden;',
    'text-overflow:ellipsis;white-space:nowrap}',
    '.udx-disk-bd{flex:1;min-width:60px}',
    '.udx-disk-bd .udx-bar{margin:0}',
    '.udx-disk-vl{flex:0 0 140px;text-align:right;font-size:12px;color:var(--udx-text2);',
    'font-variant-numeric:tabular-nums}',
    '.udx-disk-vl b{color:var(--udx-text);font-weight:600}',
    '.udx-steps{display:flex;gap:7px;flex-wrap:wrap;padding:0 15px 13px}',
    '.udx-step{font-size:11.5px;padding:3px 10px;border-radius:999px;',
    'border:1px solid var(--udx-line2);color:var(--udx-text2)}',
    '.udx-step.on-done{border-color:var(--success-color-low,#9fd4c4);',
    'background:var(--success-surface,#e8f5f0);color:var(--success-fg,#0f6e56)}',
    '.udx-step.on-cur{border-color:var(--warning-a15,#e9c78f);',
    'background:var(--warning-surface,#fdf4e3);color:var(--warning-fg,#8a5308);font-weight:600}',
    '.udx-step.on-fail{border-color:var(--destructive-a20,#efb7b5);',
    'background:var(--danger-surface,#fcedec);color:var(--danger-surface-fg,#a32d2d);font-weight:600}',
    '.udx-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;border-bottom:1px solid var(--udx-line)}',
    '.udx-tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;',
    'padding:7px 12px;font:inherit;font-size:13px;color:var(--udx-text2);cursor:pointer}',
    '.udx-tab:hover{color:var(--udx-text)}',
    '.udx-tab.on{color:var(--success-fg,#0f6e56);border-bottom-color:var(--success-fg,#0f6e56);',
    'font-weight:600}'
].join('');
function injectStyles() {
    if (STYLE_NODE || typeof document === 'undefined')
        return;
    STYLE_NODE = E('style', {type : 'text/css'}, CSS);
    document.head.appendChild(STYLE_NODE);
}
function pill(text, key) {
    var node = E('span', {class : 'udx-pill'});
    return setPill(node, text, key);
}
function setPill(node, text, key) {
    if (!node)
        return node;
    var t = tone(key);
    node.textContent = (text === null || text === undefined || text === '') ? '—'
                                                                          : String(text);
    node.style.color = t.fg;
    node.style.background = t.bg;
    node.style.borderColor = t.line;
    node.dataset.tone = key || 'neutral';
    return node;
}
function bar() {
    var fill = E('i', {style : 'width:0%'});
    return {node : E('div', {class : 'udx-bar'}, fill), fill : fill, set : function(pct, key) {
        var p = Number(pct);
        fill.style.width =
            (isFinite(p) ? Math.max(0, Math.min(100, p)) : 0).toFixed(1) + '%';
        fill.style.background = tone(key || 'neutral').solid;
    }};
}
function row(label) {
    var value = E('b', {class : 'udx-kv-v'});
    var node =
        E('div', {class : 'udx-kv'},
          [ E('span', {class : 'udx-kv-k'}, label), value ]);
    return {
        node : node,
        value : value,
        set : function(text, key) {
            value.textContent =
                (text === null || text === undefined || text === '') ? '—' : String(text);
            value.style.color = key ? tone(key).fg : '';
            return value.textContent;
        }
    };
}
function main(unit) {
    var value = E('span'), suffix = E('em', {}, unit || '');
    return {
        node : E('div', {class : 'udx-main'}, [ value, suffix ]),
        value : value,
        set : function(text, opts) {
            opts = opts || {};
            var empty = (text === null || text === undefined || text === '');
            value.textContent = empty ? '—' : String(text);
            /* A dash is not a measurement, so it must not carry a unit: "— Mbps"
             * reads as "zero megabits", when what it means is "no reading yet".
             * An explicit `opts.unit` still wins — the signal card passes one so
             * it can drop dBm from "Not available" while keeping it on a number. */
            suffix.textContent = (opts.unit !== undefined) ? (opts.unit || '')
                                                           : (empty ? '' : (unit || ''));
            value.style.color = opts.tone ? tone(opts.tone).fg : '';
        }
    };
}
function card(title, opts) {
    opts = opts || {};
    var badge = E('span', {class : 'udx-pill'});
    var body = E('div', {class : 'udx-card-b'});
    var node =
        E('section', {'class' : 'udx-card' + (opts.wide ? ' udx-wide' : ''), 'aria-label' : title},
          [ E('div', {class : 'udx-card-h'}, [ E('span', {}, title), badge ]), body ]);
    return {
        node : node,
        body : body,
        badge : badge,
        setBadge : function(text, key) {
            return setPill(badge, text, key);
        }
    };
}
/* Label + control + hint. Every settings block in this app is a stack of these,
 * so the shape lives here instead of in each view. */
function field(label, control, hint) {
    var body = [ control ];
    if (hint)
        body.push(E('div', {class : 'udx-note'}, hint));
    return E('div', {class : 'udx-field'},
             [ E('div', {class : 'udx-field-l'}, label), E('div', {class : 'udx-field-c'}, body) ]);
}
function panel(title, hint) {
    var head = E('div', {class : 'udx-panel-h'},
                 [ E('span', {}, title), E('span', {style : 'font-weight:400'}, hint || '') ]);
    var body = E('div', {class : 'udx-panel-b'});
    var foot = E('div', {class : 'udx-btnrow', hidden : true});
    var node = E('section', {class : 'udx-panel'}, [ head, body, foot ]);
    return {node : node, head : head, body : body, foot : foot};
}
function banner() {
    var icon = E('span', {class : 'udx-ic'}, 'i');
    var text = E('span', {});
    var node = E('div', {class : 'udx-banner', hidden : true}, [ icon, text ]);
    return {
        node : node,
        text : text,
        show : function(key, message) {
            var t = tone(key);
            node.hidden = false;
            node.style.color = t.fg;
            node.style.background = t.bg;
            node.style.borderColor = t.line;
            icon.style.background = t.solid;
            icon.textContent = (key === 'ok') ? 'i' : '!';
            text.textContent = message;
            node.dataset.tone = key;
            return node;
        },
        hide : function() {
            node.hidden = true;
            delete node.dataset.tone;
            return node;
        }
    };
}
/* Multi-step progress: the user must be able to say "it stopped at slot
 * switching", not "it errored". */
function steps(labels) {
    var items = labels.map(function(l, i) {
        return E('span', {class : 'udx-step'}, (i + 1) + '\u00a0' + l);
    });
    return {
        node : E('div', {class : 'udx-steps'}, items),
        reset : function() {
            items.forEach(function(n) {
                n.className = 'udx-step';
            });
        },
        current : function(i) {
            if (items[i])
                items[i].className = 'udx-step on-cur';
        },
        done : function(i) {
            if (items[i])
                items[i].className = 'udx-step on-done';
        },
        fail : function(i) {
            if (items[i])
                items[i].className = 'udx-step on-fail';
        }
    };
}
/* Run [{label, run}] in order, painting the matching step. The first failure
 * stops the chain, marks that step red, keeps the earlier ones green and gets
 * `failedStep` attached so notify() can name it. The rejection handler is the
 * second argument of then() so an inner failure does not mark the outer steps
 * red as well. */
function runSteps(widget, tasks) {
    function next(i) {
        if (i >= tasks.length)
            return Promise.resolve();
        widget.current(i);
        return Promise.resolve().then(tasks[i].run).then(function(r) {
            widget.done(i);
            return next(i + 1);
        }, function(e) {
            widget.fail(i);
            if (e && typeof e === 'object') {
                e.failedStep = tasks[i].label;
                e.failedIndex = i;
            }
            throw e;
        });
    }
    widget.reset();
    return next(0);
}
/* ---------------------------------------------------------------------------
 * Capability checks. Fail-open on purpose: a stale snapshot must not grey out
 * the page, the backend is the authority on what it can do.
 * ------------------------------------------------------------------------ */
function cellular(status) {
    return (status && status.cellular) || status || {};
}
function servingCell(status) {
    var cells = cellular(status).cells || [];
    return cells.filter(function(x) {
        return x.serving;
    }).sort(function(a, b) {
        return a.rat === 'nr' ? -1 : 1;
    })[0] || null;
}
function sessionReadonly() {
    try {
        var s = L.env && (L.env.session || L.env.acl);
        if (s && s.access && s.access.write === false)
            return true;
    } catch (e) {
    }
    return false;
}
function canOperate(status, operation) {
    var c = cellular(status);
    if (sessionReadonly())
        return false;
    if (!c || c.stale)
        return true;
    var ops = c.supported_operations;
    if (!Array.isArray(ops) || !ops.length)
        return true;
    return ops.indexOf(operation) >= 0;
}
function readonlyReason(status, operation) {
    return canOperate(status, operation)
               ? null
               : _('This firmware build does not support this operation on the current hardware.');
}
/* ---------------------------------------------------------------------------
 * Formatting helpers (all unit-bearing, all null-safe: a missing value renders
 * as an em dash, never as "undefined" or a bare unit).
 * ------------------------------------------------------------------------ */
function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}
function clockText(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function durationText(seconds) {
    var s = Math.floor(Number(seconds));
    if (seconds === null || seconds === undefined || !isFinite(s) || s < 0)
        return null;
    return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' +
           pad2(s % 60);
}
function ageText(seconds) {
    if (seconds === null || seconds === undefined || !isFinite(Number(seconds)))
        return null;
    var s = Math.max(0, Math.round(Number(seconds)));
    if (s < 60)
        return s + ' ' + _('seconds ago');
    if (s < 3600)
        return Math.round(s / 60) + ' ' + _('minutes ago');
    return Math.round(s / 3600) + ' ' + _('hours ago');
}
/* One formatter, two steps. Picking the unit first and rounding afterwards
 * leaves values that overshoot their own unit: 999 999 bytes is 999.999 KB,
 * and `toFixed(1)` prints that as "1000.0 KB" — a figure no user reads as
 * anything but a bug. So after the unit is chosen, promote once more while
 * the rounded figure would reach the next step (0.05 is where `toFixed(1)`
 * carries). The second loop is a loop, not an `if`, because 999 999 999 has to
 * walk B -> KB -> MB -> GB in one call. */
function sizeText(n, step) {
    if (n === null || n === undefined || !isFinite(Number(n)))
        return null;
    var v = Number(n), units = [ 'B', 'KB', 'MB', 'GB', 'TB' ], i = 0;
    while (v >= step && i < units.length - 1) {
        v /= step;
        i++;
    }
    while (v >= step - 0.05 && i < units.length - 1) {
        v /= step;
        i++;
    }
    return (i === 0 ? String(Math.round(v)) : v.toFixed(1)) + ' ' + units[i];
}
/* Storage: 1024 steps, because that is how the operating system, `df` and the
 * user's own file manager count a disk — a "512 GB" drive showing 476 GB is
 * the norm, not a fault. */
function bytesText(n) {
    return sizeText(n, 1024);
}
/* Traffic: 1000 steps, because that is how carriers bill. Carriers, data plans
 * and the service's own byte caps all count 1 MB = 1e6 bytes, so a 10 GB run
 * has to read back as "10.0 GB" and never as "9.3 GB". Keeping the two apart
 * is what stops "the page says 10 GB, the modem ran 9.3" from coming back:
 * the two numbers answer two different questions — "how much fits" and "what
 * will I be charged". Do not merge them. */
function dataText(n) {
    return sizeText(n, 1000);
}
function rateText(kbps) {
    if (kbps === null || kbps === undefined || kbps === '' || !isFinite(Number(kbps)))
        return null;
    var mbps = Number(kbps) / 1000;
    return (Math.round(mbps * 10) % 10 === 0) ? String(Math.round(mbps)) : mbps.toFixed(1);
}
function maskIccid(v) {
    var s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, '');
    if (!s)
        return null;
    return s.length <= 8 ? s : s.slice(0, 6) + ' ···· ' + s.slice(-4);
}
/* ---------------------------------------------------------------------------
 * Speed test / data burn
 *
 * Two functions, one service. They never share a parameter block, a result
 * block or a start button — only the service and this poll loop. Everything
 * numeric the service reports is bits per second, so bpsText() divides by 1e6
 * and returns a unit-less string; the caller supplies the "Mbps" suffix.
 * ------------------------------------------------------------------------ */
function bpsText(bps) {
    if (bps === null || bps === undefined || bps === '' || !isFinite(Number(bps)))
        return null;
    var mbps = Number(bps) / 1e6;
    return (mbps >= 1000) ? mbps.toFixed(0) : mbps.toFixed(1);
}
/* `status.stop_reason`, exactly as the service defines it. `null` means the
 * task never ran. `error` is a hard failure and must stay red and carry the
 * service's own text, not be folded into "stopped".
 *
 * Note the field name: in `status` it is `stop_reason` (a bare `reason` sits
 * next to `error` and would read as "why the error happened"), while the reply
 * to `stop` uses `reason`. They are read in different places on purpose.
 *
 * Each `text` is wrapped in `_()` *here*, at the literal, and not at the
 * lookup. A `_(row.text)` call is invisible to xgettext, so those six strings
 * never reached the .pot and shipped as English on a Chinese build. */
var STOP_REASONS = {
    user : {tone : 'neutral', text : _('Stopped by you')},
    byte_limit : {tone : 'warn', text : _('Stopped, the data cap for this run was reached')},
    time_limit : {tone : 'ok', text : _('Finished, the planned duration elapsed')},
    thermal : {tone : 'bad', text : _('Aborted, the device got too hot')},
    sim_removed : {tone : 'warn', text : _('Interrupted, the mobile network went away')},
    error : {tone : 'bad', text : _('The test failed')}
};
function stopReason(value) {
    if (!value)
        return null;
    var row = STOP_REASONS[value];
    return {raw : value, tone : row ? row.tone : 'warn',
            text : row ? row.text : _('The test ended for an unknown reason')};
}
/* Normalise `nodes` whether the service answers with an array or with an
 * object carrying a `nodes` list, and whether it identifies a node by id or by
 * name. */
function speedNodes(result) {
    var list = Array.isArray(result) ? result : ((result || {}).nodes || []);
    return list.map(function(n, i) {
        var rtt = (n.rtt_ms === undefined || n.rtt_ms === null) ? null : Number(n.rtt_ms);
        return {
            id : (n.id === undefined || n.id === null) ? String(n.name || n.url || i)
                                                       : String(n.id),
            name : n.name || n.url || ('#' + (i + 1)),
            url : n.url || '',
            group : n.group || '',
            groupLabel : n.group_label || n.group || '',
            enabled : (n.enabled === undefined) ? (n.state ? n.state === 'ready' : true)
                                                : !!n.enabled,
            state : n.state || null,
            note : n.note || null,
            rtt : (rtt === null || !isFinite(rtt) || rtt < 0) ? null : rtt,
            selected : !!n.selected
        };
    });
}
/* One poll loop for the whole page tree. The connection tab reads it to keep
 * the apply button disabled, the overview reads it to soften the stale banner,
 * and the two test tabs read it for their own progress. 1 s while a task runs,
 * 5 s when idle, and it stops once nothing is subscribed. */
var SPEED = {state : null, running : false, mode : null, error : null, subs : [], timer : null,
             inflight : false};
function speedNotify() {
    SPEED.subs.slice().forEach(function(fn) {
        try {
            fn(SPEED);
        } catch (e) {
        }
    });
}
function speedSchedule() {
    if (SPEED.timer) {
        window.clearTimeout(SPEED.timer);
        SPEED.timer = null;
    }
    if (!SPEED.subs.length)
        return;
    SPEED.timer = window.setTimeout(speedPoll, SPEED.running ? 1000 : 5000);
}
function speedPoll() {
    if (SPEED.inflight || !SPEED.subs.length)
        return;
    SPEED.inflight = true;
    speedStatusRPC().then(function(r) {
        SPEED.state = r || {};
        SPEED.running = !!(r && r.running);
        SPEED.mode = (r && r.mode) ? r.mode : null;
        SPEED.error = null;
    }, function(e) {
        SPEED.error = e;
    }).then(function() {
        SPEED.inflight = false;
        speedNotify();
        speedSchedule();
    });
}
/* Subscribe: the callback fires once immediately (with the cached state) and
 * again on every poll. Returns an unsubscribe function. */
function speedWatch(fn) {
    SPEED.subs.push(fn);
    if (SPEED.state || SPEED.error)
        speedNotify();
    else if (!SPEED.inflight)
        speedPoll();
    else
        speedSchedule();
    return function() {
        SPEED.subs = SPEED.subs.filter(function(x) {
            return x !== fn;
        });
        speedSchedule();
    };
}
function speedRunning(mode) {
    if (!SPEED.running)
        return false;
    return mode ? SPEED.mode === mode : true;
}
function speedStart(mode, args) {
    var call = (mode === 'burn') ? burnStartRPC : speedStartRPC;
    return call.apply(null, args).then(function(r) {
        if (!r || r.accepted === false) {
            if (r && r.busy) {
                var e = new Error(r.mode === 'burn'
                                      ? _('A data burn run is already in progress; stop it first.')
                                      : _('A speed test is already in progress; stop it first.'));
                e.busy = true;
                e.busyMode = r.mode || null;
                throw e;
            }
            var failure = new Error((r && r.error) || _('The test could not start.'));
            failure.busy = false;
            throw failure;
        }
        return r;
    });
}
/* The reply to `stop` uses `reason`, not `stop_reason`, and it answers a
 * different question: did *my click* stop it.
 *
 *   accepted:true                    -> the click stopped it, reason is always `user`
 *   accepted:false + reason=X        -> a guard had already stopped it (X is why),
 *                                       error says "The task has already stopped"
 *   accepted:false + reason:null     -> nothing was running ("No task is running")
 *
 * The third case is not a failure and the second must not be reported as "you
 * stopped it", so this never throws just to say what happened. */
function speedStop() {
    return speedStopRPC().then(function(r) {
        r = r || {};
        var alreadyStopped = (r.accepted === false) && !!r.reason;
        var idle = (r.accepted === false) && !r.reason;
        return {
            accepted : r.accepted !== false,
            reason : r.reason || null,
            error : r.error || null,
            alreadyStopped : alreadyStopped,
            idle : idle,
            /* What the user should be told about their click, not about the run:
             * the run's own outcome is painted from `status.stop_reason`. */
            text : (r.accepted !== false)
                       ? _('Stopped.')
                       : alreadyStopped ? _('It had already stopped by itself; refreshing to show why.')
                       : idle            ? _('No test was running.')
                                         : (r.error || _('The test could not be stopped.'))
        };
    });
}
function speedNodesFor(mode) {
    return speedNodesRPC(mode).then(speedNodes);
}
/* ---------------------------------------------------------------------------
 * Recent events: a front-end diff of successive snapshots. Nothing is written
 * to disk and nothing survives a reload — a persistent log would need a backend
 * field, which the plan defers. If the backend ever publishes `events`, that
 * list wins.
 * ------------------------------------------------------------------------ */
var EVENT_LIMIT = 20;
var EVENT_LOG = [];
var EVENT_SNAPSHOT = null;
var STATE_TEXT = {
    pdp_active : 'Data connection established',
    idle : 'Data connection closed',
    uncertain : 'Modem state unknown, refresh to confirm',
    waiting_sim : 'SIM card unavailable, waiting for a card',
    waiting_radio : 'Radio is off, waiting for it to be enabled',
    waiting_registration : 'Searching for network',
    waiting_attachment : 'Waiting for packet attachment',
    connecting : 'Connecting'
};
function pushEvent(key, text) {
    if (!text)
        return;
    if (EVENT_LOG.length && EVENT_LOG[0].key === key && EVENT_LOG[0].text === text)
        return;
    EVENT_LOG.unshift({key : key, text : text, time : clockText(Date.now())});
    if (EVENT_LOG.length > EVENT_LIMIT)
        EVENT_LOG.length = EVENT_LIMIT;
}
function eventSnapshot(status) {
    var c = cellular(status), serving = servingCell(status) || {}, qos = c.qos || {};
    return {
        state : c.state || null,
        sim : (c.sim || {}).state || null,
        slot : (c.physical_sim || {}).slot == null ? null
                                                   : Number(c.physical_sim.slot),
        radio : (c.radio_enabled === undefined || c.radio_enabled === null)
                    ? null
                    : !!c.radio_enabled,
        operator : (c.operator || {}).name || null,
        rat : serving.rat || null,
        pci : (serving.pci == null) ? null : String(serving.pci),
        ipv4 : (c.data_session || {}).ipv4 || null,
        qci : (qos.qci == null) ? null : String(qos.qci),
        kind : qos.kind || null,
        error : c.last_error || null
    };
}
function accumulateEvents(status) {
    if (!status)
        return EVENT_LOG.slice();
    var c = cellular(status);
    if (Array.isArray(c.events) && c.events.length) {
        return c.events.slice(0, EVENT_LIMIT)
            .map(function(e) {
                var t = (e.time === undefined) ? e.at : e.time;
                return {
                    key : e.key || (t === undefined ? e.text : t),
                    time : (typeof t === 'number') ? clockText(t * 1000) : (t || ''),
                    text : e.text || e.message || ''
                };
            })
            .filter(function(e) {
                return e.text;
            });
    }
    var next = eventSnapshot(status), prev = EVENT_SNAPSHOT;
    EVENT_SNAPSHOT = next;
    if (!prev)
        return EVENT_LOG.slice();
    if (prev.state !== next.state && next.state) {
        var text = _(STATE_TEXT[next.state] || 'State changed');
        if (next.state === 'pdp_active' && next.ipv4)
            text += ' (' + next.ipv4 + ')';
        pushEvent('state', text);
    }
    if (prev.sim !== next.sim && next.sim)
        pushEvent('sim', _('SIM card state') + ': ' + (prev.sim || '—') + ' → ' + next.sim);
    if (prev.slot !== next.slot && next.slot !== null)
        pushEvent('slot', _('Switched to slot') + ' ' + (next.slot + 1));
    if (prev.radio !== next.radio && next.radio !== null)
        pushEvent('radio', next.radio ? _('Radio enabled') : _('Radio disabled'));
    if (prev.operator !== next.operator && next.operator)
        pushEvent('operator',
                  _('Operator changed') + ': ' + (prev.operator || '—') + ' → ' + next.operator);
    if (prev.pci !== next.pci && next.pci)
        pushEvent('pci', _('Serving cell changed') + ': PCI ' + (prev.pci || '—') + ' → ' +
                             next.pci);
    if (prev.ipv4 !== next.ipv4 && next.ipv4)
        pushEvent('ipv4', _('IPv4 address changed') + ': ' + next.ipv4);
    if (prev.qci !== next.qci && next.qci)
        pushEvent('qci', _('Bearer changed') + ': ' +
                             qciInfo(prev.qci, prev.kind).badge + ' → ' +
                             qciInfo(next.qci, next.kind).badge);
    if (prev.error !== next.error && next.error)
        pushEvent('error', _('Last error') + ': ' + next.error);
    return EVENT_LOG.slice();
}
function failure(row) {
    var e = new Error(row.error || _('Operation failed'));
    e.code = row.code || null;
    e.result = row.result;
    e.uncertain = row.state === 'uncertain' || row.uncertain === true ||
                  /UNCERTAIN|uncertain/.test(String(row.error || ''));
    return e;
}
/* "Did the command take effect or not?" is a third outcome, not an error.
 * Replaying an uncertain command is the actual risk, so the wording must tell
 * the user to refresh and check before touching anything. */
function isUncertain(e) {
    return !!(e && (e.uncertain || /uncertain/i.test(String(e.message || ''))));
}
function uncertainText(e) {
    var text = _('The result is unknown: the command was sent but no confirmation came back, so it may already have taken effect. The system will not retry automatically; refresh first and check the current state.');
    if (e && e.failedStep)
        text += ' (' + _('failed at step') + ': ' + e.failedStep + ')';
    return text;
}
function failureText(e) {
    var text = (e && e.message) || _('Operation failed');
    if (e && e.failedStep)
        text += ' — ' + _('failed at step') + ': ' + e.failedStep;
    return text;
}
function result(row) {
    if (row.state !== 'complete')
        throw failure(row);
    return row.result || {};
}
/* Per-operation deadline instead of one hardcoded 360 s budget. The three
 * operations below re-read the module and can legitimately take minutes; a
 * fixed short deadline would report a timeout for a command that later lands. */
var OPERATION_TIMEOUTS = {
    default : 120000,
    physical_slot : 480000,
    band_lock : 480000,
    operators_scan : 480000,
    /* These wait on modem round trips in exactly the same way and used to fit
     * inside the old 360 s budget, so they keep a wide margin. */
    connect : 240000,
    disconnect : 240000,
    network_configure : 240000,
    modem_info : 240000,
    radio_options : 240000,
    advanced_refresh : 240000,
    cells_refresh : 240000,
    serving_refresh : 240000,
    neighbors_refresh : 240000,
    sms_refresh : 240000,
    at_debug : 240000
};
function operationTimeout(operation, override) {
    if (override)
        return override;
    return OPERATION_TIMEOUTS[operation] || OPERATION_TIMEOUTS.default;
}
function execute(operation, args, timeoutMs) {
    function task() {
        var deadline = Date.now() + operationTimeout(operation, timeoutMs);
        function submit() {
            return call(operation, args || {}).then(function(reply) {
                if (reply.busy && Date.now() < deadline)
                    return delay(600).then(submit);
                if (!reply.accepted)
                    throw failure(reply);
                if (reply.duplicate) {
                    if (reply.state === 'complete')
                        return result(reply);
                    throw failure(reply);
                }
                var ref = {
                    id : reply.operation_id,
                    boot_id : reply.boot_id,
                    broker_id : reply.broker_id
                };
                function wait() {
                    if (Date.now() >= deadline)
                        throw new Error(_('Operation timed out; it was not submitted again'));
                    return call('operation_status', ref).then(function(row) {
                        if (!row.accepted)
                            throw failure(row);
                        if (row.state === 'queued' || row.state === 'running')
                            return delay(500).then(wait);
                        return result(row);
                    });
                }
                return wait();
            });
        }
        return submit();
    }
    var pending = queue.then(task, task);
    queue = pending.catch(function() {});
    return pending;
}
function getStatus() {
    return Promise
        .all([ statusRPC(), L.resolveDefault(systemRPC(), {}), L.resolveDefault(boardRPC(), {}),
               L.resolveDefault(cellStatusRPC(), {available: false}), L.resolveDefault(wanRPC(), {}),
               L.resolveDefault(wan6RPC(), {}) ])
        .then(function(rows) {
            if (!rows[0].boot)
                throw failure(rows[0]);
            rows[0].memory = rows[1].memory || {};
            rows[0].swap = rows[1].swap || {};
            rows[0].system_info = rows[1];
            rows[0].board = rows[2];
            rows[0].cellular = rows[3];
            var addresses = [];
            [rows[4], rows[5]].forEach(function(network) {
                (network['ipv6-address'] || []).forEach(function(row) {
                    var ip = row.address || '';
                    if (ip && !/^fe[89ab]/i.test(ip) && ip !== '::' && ip !== '::1' && addresses.indexOf(ip) < 0)
                        addresses.push(ip);
                });
            });
            rows[0].cellular_kernel = {ipv6_global_addresses: addresses};
            rows[0].cellular_netifd = {wan: rows[4], wan6: rows[5]};
            return rows[0];
        });
}
/* Yes/no modal for actions that cost money or cannot be undone. Resolves false
 * on cancel and true only on the explicit button, so a stray Enter never
 * confirms. `style` is the cbi-button flavour of the confirm button. */
function confirmAction(title, message, okLabel, style) {
    return new Promise(function(resolve) {
        ui.showModal(title, [
            E('p', {}, message),
            E('div', {class : 'right'},
              [
                  E('button',
                    {
                        'class' : 'cbi-button',
                        click : function() {
                            ui.hideModal();
                            resolve(false);
                        }
                    },
                    _('Cancel')),
                  E('button',
                    {
                        'class' : 'cbi-button cbi-button-' + (style || 'negative'),
                        click : function() {
                            ui.hideModal();
                            resolve(true);
                        }
                    },
                    okLabel || _('Continue'))
              ])
        ]);
    });
}
/* `action` may be a promise-returning function. `message` is the success toast.
 * `incomplete` is the caller's own wording for "finished, but some items were
 * not applied" — there is no global fallback any more, because "some messages
 * were not deleted" was being shown for operations that touch no messages. */
function notify(action, message, incomplete) {
    return Promise.resolve()
        .then(action)
        .then(function(r) {
            if (r && r.complete === false) {
                var details = (r.items || [])
                                  .filter(function(x) {
                                      return !x.deleted && x.complete !== true;
                                  })
                                  .map(function(x) {
                                      return x.error || x.text || x.number || x.index;
                                  })
                                  .filter(function(x) {
                                      return x !== undefined && x !== null && x !== '';
                                  });
                var e = new Error(details.join('; ') || incomplete ||
                                  _('The request finished but some changes were not applied.'));
                e.result = r;
                throw e;
            }
            ui.addNotification(null,
                               E('p', {},
                                 r && r.waiting_for ? _('Waiting for') + ': ' + r.waiting_for
                                                    : message || _('Completed')),
                               'info');
            return r;
        })
        .catch(function(e) {
            if (isUncertain(e))
                ui.addNotification(null, E('p', {}, uncertainText(e)), 'warning');
            else
                ui.addNotification(null, E('p', {}, failureText(e)), 'error');
            throw e;
        });
}
function button(label, action, style) {
    var b = E('button', {
        type : 'button',
        class : 'cbi-button ' + (style || 'cbi-button-action'),
        click : function() {
            if (b.disabled)
                return;
            b.disabled = true;
            b.classList.add('spinning');
            return notify(action).catch(function() {}).finally(function() {
                b.disabled = false;
                b.classList.remove('spinning');
            });
        }
    },
              label);
    return b;
}
function table(title, rows) {
    var cells = rows.map(function() {
        return E('td', {class : 'td'}, '—');
    });
    var node = E('section', {class : 'cbi-section'}, [
        E('h3', {}, title), E('table', {class : 'table'}, rows.map(function(r, i) {
            return E('tr', {class : 'tr'}, [ E('td', {class : 'td'}, r[0]), cells[i] ]);
        }))
    ]);
    return {
        node : node,
        update : function(data) {
            rows.forEach(function(r, i) {
                var v = r[1](data);
                if (typeof r[3] === 'function') {
                    cells[i].textContent = '';
                    cells[i].appendChild(r[3](v, r[2]));
                }
                else {
                    cells[i].textContent = value(v, r[2]);
                }
            });
        }
    };
}
/* Only changed rows are inserted or removed. Input nodes in retained rows survive polling. */
function list(columns, key, selectable, action) {
    var entries = new Map(), rows = [], body = E('tbody'),
        header = E('tr', {class : 'tr table-titles'});
    if (selectable)
        header.appendChild(E('th', {class : 'th'}, _('Select')));
    columns.forEach(function(c) {
        header.appendChild(E('th', {class : 'th'}, c[0]));
    });
    if (action)
        header.appendChild(E('th', {class : 'th'}, _('Action')));
    var node = E('table', {class : 'table'}, [ E('thead', {}, header), body ]);
    return {
        node : node,
        update : function(next) {
            rows = next || [];
            var seen = new Set();
            rows.forEach(function(row, index) {
                var id = String(key(row)), entry = entries.get(id);
                seen.add(id);
                if (!entry) {
                    entry = {row : row, node : E('tr', {class : 'tr'}), cells : []};
                    if (selectable) {
                        entry.check =
                            E('input', {type : 'checkbox', 'aria-label' : _('Select message')});
                        entry.node.appendChild(E('td', {class : 'td'}, entry.check));
                    }
                    columns.forEach(function() {
                        var cell = E('td', {class : 'td'});
                        entry.cells.push(cell);
                        entry.node.appendChild(cell);
                    });
                    if (action)
                        entry.node.appendChild(E('td', {class : 'td'}, action(function() {
                                                     return entry.row;
                                                 })));
                    entries.set(id, entry);
                }
                entry.row = row;
                columns.forEach(function(c, i) {
                    var v = c[1](row);
                    if (typeof c[2] === 'function') {
                        entry.cells[i].textContent = '';
                        entry.cells[i].appendChild(c[2](v, row));
                    }
                    else {
                        entry.cells[i].textContent = value(v);
                    }
                });
                if (body.children[index] !== entry.node)
                    body.insertBefore(entry.node, body.children[index] || null);
            });
            entries.forEach(function(entry, id) {
                if (!seen.has(id)) {
                    entry.node.remove();
                    entries.delete(id);
                }
            });
        },
        selected : function(all) {
            return rows.filter(function(row) {
                var entry = entries.get(String(key(row)));
                return all || (entry.check && entry.check.checked);
            });
        }
    };
}
function watch(load, update, initial) {
    var error = E('p', {class : 'alert-message warning', hidden : true});
    if (initial)
        update(initial);
    poll.add(function() {
        return load()
            .then(function(data) {
                update(data);
                error.hidden = true;
            })
            .catch(function(e) {
                error.textContent = e.message;
                error.hidden = false;
            });
    }, 5);
    return error;
}
function usb(profile, acm) {
    return usbRPC(profile, acm).then(function(r) {
        if (!r.accepted)
            throw failure(r);
        var end = Date.now() + 300000;
        function wait() {
            return getStatus().then(
                function(d) {
                    var u = d.usb || {};
                    if (!u.pending && u.profile === profile && u.acm === (acm ? '1' : '0') &&
                        (u.result === '0' || u.result === 0))
                        return u;
                    if (!u.pending && u.result != null && String(u.result) !== '0')
                        throw new Error(_('USB configuration failed') + ': ' + u.result);
                    if (Date.now() >= end)
                        throw new Error(_('USB reconnection timed out'));
                    return delay(1500).then(wait);
                },
                function(e) {
                    if (Date.now() >= end)
                        throw e;
                    return delay(1500).then(wait);
                });
        }
        return delay(2000).then(wait);
    });
}
/* Refresh only this select after an explicit action; retain all other inputs. */
function setChoices(option, rows, selected) {
    var widget = option.getUIElement('main');
    option.keylist = [];
    option.vallist = [];
    rows.forEach(function(row) {
        option.value(String(row[0]), row[1]);
    });
    return Promise.resolve(option.renderWidget('main', 0, String(selected))).then(function(node) {
        widget.node.replaceWith(node);
    });
}
return baseclass.extend({
    setChoices : setChoices,
    frequencyStatus : frequencyRPC,
    frequencyApply : function(cpu, minimum, maximum) {
        return frequencyApplyRPC(cpu, +minimum, +maximum).then(function(r) {
            if (!r.accepted)
                throw failure(r);
            return r;
        });
    },
    value : value,
    signalQuality : signalQuality,
    signalBadge : signalBadge,
    /* design tokens and shared widgets */
    TOKENS : TOKENS,
    THRESHOLDS : THRESHOLDS,
    QCI_TABLE : QCI_TABLE,
    injectStyles : injectStyles,
    level : level,
    tone : tone,
    qciInfo : qciInfo,
    pill : pill,
    setPill : setPill,
    bar : bar,
    row : row,
    main : main,
    card : card,
    panel : panel,
    field : field,
    banner : banner,
    steps : steps,
    runSteps : runSteps,
    /* status access */
    cellular : cellular,
    servingCell : servingCell,
    canOperate : canOperate,
    readonlyReason : readonlyReason,
    accumulateEvents : accumulateEvents,
    /* formatting */
    durationText : durationText,
    ageText : ageText,
    bytesText : bytesText,
    dataText : dataText,
    rateText : rateText,
    bpsText : bpsText,
    stopReason : stopReason,
    speedNodes : speedNodes,
    speedWatch : speedWatch,
    speedRunning : speedRunning,
    speedStart : speedStart,
    speedStop : speedStop,
    speedNodesFor : speedNodesFor,
    speedState : function() {
        return SPEED.state;
    },
    maskIccid : maskIccid,
    clockText : clockText,
    uncertainText : uncertainText,
    failureText : failureText,
    isUncertain : isUncertain,
    confirm : confirmAction,
    execute : execute,
    notify : notify,
    button : button,
    table : table,
    list : list,
    watch : watch,
    getStatus : getStatus,
    getHistory : historyRPC,
    getSMS : smsRPC,
    getAPN : apnRPC,
    smsReceipt : receiptRPC,
    usb : usb,
    delay : delay,
    randomId : function() {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        return Array
            .from(a,
                  function(x) {
                      return x.toString(16).padStart(2, '0');
                  })
            .join('');
    }
});
