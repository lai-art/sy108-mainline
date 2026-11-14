'use strict';
'require view';
'require ui';

/* The old page is gone but people bookmark it. An alias in menu.d cannot carry
 * a query string, so this ten-line shell forwards to the band tab, which is
 * what "Bands, cells and APN" used to open on. */
return view.extend({
    load : function() {
        return Promise.resolve();
    },
    render : function() {
        var target = L.url('admin/udx/network') + '?tab=radio';
        window.setTimeout(function() {
            window.location.replace(target);
        }, 0);
        return E('div', {class : 'cbi-section'}, [
            E('p', {}, _('This page has moved to "Mobile network".')),
            E('p', {}, E('a', {href : target}, _('Open the mobile network page')))
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
