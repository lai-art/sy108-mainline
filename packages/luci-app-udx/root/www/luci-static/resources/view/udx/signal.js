'use strict';
'require view';
'require udx';

/*
 * UDX710 信号看板
 *
 * 看板本体是一份独立的单页应用（/luci-static/udx/signal.html），
 * 数据层直接走 ubus JSON-RPC（/cgi-bin/luci/admin/ubus）。
 * 这里用 iframe 嵌入，避免看板自带的深色样式与 LuCI 主题互相污染。
 */
return view.extend({
    load : function() {
        return udx.getStatus();
    },
    render : function(initial) {
        var st = initial || {};
        var cell = st.cellular || {};
        var reg = cell.registration || {};
        var sig = cell.signal || {};
        var rsrp = (sig.rssi_dbm === null || sig.rssi_dbm === undefined) ? '—' : sig.rssi_dbm;
        var regText = reg.registered
            ? (reg.roaming ? _('registered (roaming)') : _('registered'))
            : _('not registered');

        var banner = E('div', { 'class' : 'cbi-map-descr' }, [
            E('p', {}, _('Signal dashboard reads directly from the device over ubus. '
                + 'Current link: %s / %s, RSRP %s dBm.')
                .format(cell.mode || '—', regText, rsrp))
        ]);

        var frame = E('iframe', {
            'src' : '/luci-static/udx/signal.html',
            'style' : 'width:100%;height:calc(100vh - 150px);min-height:640px;border:0;border-radius:8px;background:#0b1220;display:block',
            'title' : _('UDX710 signal dashboard')
        });

        return E('div', { 'class' : 'cbi-section' }, [ banner, frame ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
