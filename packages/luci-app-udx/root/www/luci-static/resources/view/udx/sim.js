'use strict';
'require view';
'require udx';

/* Where a user goes after swapping a card: one screen that answers "did the
 * device see the new card, and who is it".
 *
 * Three blocks, in the order the questions get asked: what the modem currently
 * reports about the card, what happened recently (a swap that failed leaves no
 * trace in the snapshot), and only then the one action on the page — which is
 * deliberately still disabled, with a full sentence saying why instead of a
 * dead button. */
var BRANDS = {
    china_mobile : 'China Mobile',
    china_unicom : 'China Unicom',
    china_telecom : 'China Telecom',
    china_broadnet : 'China Broadnet'
};
var SIM_STATE = {
    READY : {text : 'Ready', tone : 'ok'},
    REFRESHING : {text : 'Reading the card', tone : 'warn'},
    ABSENT : {text : 'No card', tone : 'bad'},
    BLOCKED : {text : 'Card blocked', tone : 'bad'},
    ERROR : {text : 'Card error', tone : 'bad'}
};
/* Only these events describe the card or the identity derived from it. */
var IDENTITY_KEYS = {sim : 1, slot : 1, operator : 1, error : 1};

return view.extend({
    load : function() {
        return udx.getStatus();
    },
    render : function(initial) {
        udx.injectStyles();
        var banner = udx.banner(), events = [];

        /* ---- 1. what the modem reports ---- */
        var rows = udx.table(_('Identification result'), [
            [
                _('Card state'),
                function(d) {
                    var state = (udx.cellular(d).sim || {}).state;
                    var info = SIM_STATE[state];
                    return {
                        text : info ? _(info.text) : (state || _('No card')),
                        tone : info ? info.tone : 'neutral'
                    };
                },
                null,
                function(v) {
                    return udx.pill(v ? v.text : null, v ? v.tone : 'neutral');
                }
            ],
            [
                _('Slot'),
                function(d) {
                    var slot = (udx.cellular(d).physical_sim || {}).slot;
                    return (slot === null || slot === undefined) ? _('No card')
                                                                 : 'SIM ' + (slot + 1);
                }
            ],
            [
                'ICCID',
                function(d) {
                    var c = udx.cellular(d);
                    return ((c.sim || {}).state === 'READY' && udx.maskIccid(c.iccid)) ||
                           null;
                }
            ],
            [
                'IMSI',
                function(d) {
                    var c = udx.cellular(d);
                    return ((c.sim || {}).state === 'READY' && udx.maskIccid(c.imsi)) || null;
                }
            ],
            [
                _('Operator'),
                function(d) {
                    var c = udx.cellular(d), op = c.operator || {};
                    if (BRANDS[op.brand])
                        return _(BRANDS[op.brand]);
                    return op.name || op.short_name || null;
                }
            ],
            [
                _('Home network'),
                function(d) {
                    return udx.cellular(d).home_plmn;
                }
            ],
            [
                _('Last identified'),
                function(d) {
                    var c = udx.cellular(d), now = c.uptime, at = c.modem_info_uptime;
                    if (now === null || now === undefined || at === null || at === undefined)
                        return null;
                    return udx.ageText(Math.max(0, Number(now) - Number(at)));
                }
            ]
        ]);
        /* A card that is missing or unreadable is not "seven dashes": say what
         * is wrong and what to do about it in one place. */
        var empty = E('div', {class : 'udx-empty', hidden : true});
        var emptyTitle = E('div', {style : 'font-weight:600;margin-bottom:4px'});
        var emptyBody = E('div', {});
        empty.appendChild(emptyTitle);
        empty.appendChild(emptyBody);

        /* ---- 2. recent identity events ---- */
        var recordList = udx.list([
            [
                _('Time'),
                function(r) {
                    return r.time;
                }
            ],
            [
                _('What happened'),
                function(r) {
                    return r.text;
                }
            ]
        ], function(r) {
            return r.key + ':' + r.text + ':' + r.time;
        }, false);
        var noRecords = E('div', {class : 'udx-empty'},
                          _('No card activity seen since this page was opened. Swapping the card now would show up here.'));
        var records = udx.panel(_('Recent card activity'),
                                _('Collected while this page is open'));

        /* ---- 3. the only action ---- */
        var actions = udx.panel(_('Re-identify'));
        actions.body.appendChild(
            E('div', {class : 'udx-note', style : 'opacity:1;margin-bottom:8px'},
              _('Inserting or swapping a card does not always make the modem re-read it. Re-identifying would close the radio, re-read the card and open the radio again, which drops the network for about ten seconds.')));
        var reidentify =
            E('button',
              {
                  type : 'button',
                  'class' : 'cbi-button cbi-button-action',
                  disabled : true,
                  title : _('This firmware build has no modem re-attach entry point yet, so re-identification cannot be triggered from the web interface. Remove and reinsert the card, or reboot the device.')
              },
              _('Re-identify now'));
        actions.foot.hidden = false;
        actions.foot.appendChild(reidentify);

        function update(d) {
            var c = udx.cellular(d), sim = c.sim || {}, state = sim.state;
            var info = SIM_STATE[state], ready = (state === 'READY');

            /* Banner priority: reading > missing/unreadable > stale. An old
             * snapshot is amber, a missing card is red. */
            if (state === 'REFRESHING')
                banner.show('warn', _('The card is being read. Identity fields stay blank until the modem answers.'));
            else if (!ready)
                banner.show('bad',
                            _('The SIM card is not readable. Check that the card is seated the right way round and in the right slot; if it is, the card itself may have failed.'));
            else if (c.stale)
                banner.show('warn', udx.ageText(c.snapshot_age_seconds)
                                        ? _('The data may be out of date; last updated') + ' ' +
                                              udx.ageText(c.snapshot_age_seconds)
                                        : _('The data may be out of date; refresh to update it.'));
            else
                banner.hide();

            rows.update(d);

            /* Anything short of READY means there is no identity to show, so the
             * table is replaced by a sentence instead of seven dashes. */
            var nothing = !ready;
            empty.hidden = !nothing;
            rows.node.hidden = nothing;
            if (nothing) {
                emptyTitle.textContent =
                    (state === 'REFRESHING') ? _('Waiting for the card')
                    : (state === 'ABSENT' || !state) ? _('No SIM card detected')
                                                     : _(info ? info.text : 'Card error');
                emptyBody.textContent =
                    (state === 'REFRESHING')
                        ? _('The modem is reading the card. This normally takes a few seconds; the details appear here as soon as it finishes.')
                    : (state === 'ABSENT' || !state)
                        ? _('Insert a SIM card into the slot printed on the label, then wait about ten seconds. If a card is already inserted, take it out and put it back in.')
                        : _('The card is present but the modem cannot read its identity. Power the device off and reseat the card; if the problem persists the card itself may have failed.');
            }

            events = udx.accumulateEvents(d).filter(function(e) {
                return !!IDENTITY_KEYS[e.key];
            });
            recordList.update(events);
            noRecords.hidden = events.length > 0;
        }

        var error = udx.watch(udx.getStatus, update, initial);
        records.body.appendChild(noRecords);
        records.body.appendChild(recordList.node);

        return E('div', {class : 'udx-page'}, [
            E('p', {class : 'udx-note', style : 'margin:0 0 14px;font-size:12.5px;opacity:1'},
              _('Card identity and card activity. Everything else about the connection is on "Overview" and "Mobile network".')),
            banner.node, error, rows.node, empty, records.node, actions.node
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
