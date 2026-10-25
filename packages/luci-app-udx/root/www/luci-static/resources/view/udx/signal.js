'use strict';
'require view';
'require udx';

/*
 * UDX710 信号看板
 *
 * 看板本体是一份独立的单页应用（/luci-static/udx/signal.html），
 * 数据层直接走 ubus JSON-RPC（/cgi-bin/luci/admin/ubus）。
 * 这里用 iframe 嵌入，避免看板自带的深色样式与 LuCI 主题互相污染。
 *
 * iframe 高度按视口计算，页面自身滚动；看板内部不再套一层滚动容器。
 */
return view.extend({
    load : function() {
        return udx.getStatus();
    },
    render : function(initial) {
        var frame = E('iframe', {
            'src' : '/luci-static/udx/signal.html',
            'style' : 'width:100%;height:calc(100vh - 190px);min-height:560px;'
                    + 'border:0;border-radius:8px;background:#0b1220;display:block',
            'title' : _('UDX710 signal dashboard')
        });

        return E('div', { 'class' : 'cbi-section' }, [
            E('div', { 'class' : 'cbi-map-descr' }, [
                E('p', {}, _('实时蜂窝状态。数据直接来自设备 ubus，每 10 秒刷新一次。'))
            ]),
            frame
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
