'use strict';
'require view';
'require form';
'require ui';
'require udx';

/* One page per task instead of one page per API: connection policy, bands and
 * cells, operator, APN, speed test and data burn all answer "my mobile network
 * does X, where do I change it". The tab is part of the URL so the legacy
 * /admin/udx/cellular route can land on the band tab.
 *
 * The speed test and the data burn test are two separate functions that happen
 * to share one service: separate parameter blocks, separate result blocks,
 * separate start and stop buttons. They only share the poll loop in udx.js. */
var TABS = [
    {id : 'connect', title : 'Connection'},
    {id : 'radio', title : 'Bands and cells'},
    {id : 'operator', title : 'Operators'},
    {id : 'apn', title : 'APN'},
    {id : 'speed', title : 'Speed test'},
    {id : 'burn', title : 'Data burn'}
];
var TAB_ALIAS = {bands : 'radio', cells : 'radio', ops : 'operator', operators : 'operator'};
var STEPS = [
    {key : 'policy', title : 'Connection policy'},
    {key : 'radio', title : 'Radio state'},
    {key : 'slot', title : 'SIM slot'},
    {key : 'mode', title : 'Network mode'},
    {key : 'dial', title : 'Data connection'}
];
var MODES = {
    auto : [ 'nr_lte', 'sa_nsa' ],
    sa : [ 'nr_only', 'sa_only' ],
    nsa : [ 'nr_lte', 'nsa_only' ],
    lte : [ 'lte_only', 'sa_nsa' ],
    all : [ 'nr_lte_wcdma_gsm', 'sa_nsa' ]
};
var MODE_TITLE = {
    auto : '5G / 4G automatic (SA + NSA)',
    sa : '5G SA only',
    nsa : '5G NSA',
    lte : '4G LTE only',
    all : '5G / 4G / 3G / 2G automatic'
};
var BRANDS = {
    china_mobile : 'China Mobile',
    china_unicom : 'China Unicom',
    china_telecom : 'China Telecom',
    china_broadnet : 'China Broadnet'
};
var LTE_BANDS = [ 'B1', 'B3', 'B5', 'B8', 'B34', 'B38', 'B39', 'B40', 'B41' ];
var NR_BANDS = [ 'n1', 'n3', 'n5', 'n8', 'n28', 'n41', 'n77', 'n78', 'n79' ];
var ACT_TITLE = {7 : 'LTE', 11 : 'NR', 13 : 'NR + LTE'};

function readTab() {
    var raw = String((window.location.search || '') + (window.location.hash || '')),
        found = /[?&#]tab=([a-z]+)/i.exec(raw), id = found ? found[1].toLowerCase() : 'connect';
    id = TAB_ALIAS[id] || id;
    return TABS.some(function(t) {
        return t.id === id;
    }) ? id
       : 'connect';
}
function writeTab(id) {
    try {
        var url = new URL(window.location.href);
        url.searchParams.set('tab', id);
        window.history.replaceState(null, '', url.toString());
    } catch (e) {
    }
}

/* ------------------------------------------------------------------------- */
/* small DOM helpers — plain controls so disabled states and inline messages
 * stay under our control instead of being rebuilt by a form engine */
function input(value, opts) {
    opts = opts || {};
    var node = E('input', {
        type : opts.password      ? 'password'
               : opts.number    ? 'number'
                                : 'text',
        'class' : 'cbi-input-' + (opts.number ? 'text' : 'text'),
        value : (value === null || value === undefined) ? '' : String(value)
    });
    if (opts.placeholder)
        node.placeholder = opts.placeholder;
    if (opts.min !== undefined)
        node.min = opts.min;
    if (opts.max !== undefined)
        node.max = opts.max;
    if (opts.step !== undefined)
        node.step = opts.step;
    node.style.maxWidth = opts.width || '220px';
    return node;
}
function select(options, selected) {
    var node = E('select', {'class' : 'cbi-input-select'}, options.map(function(o) {
        return E('option', {value : String(o[0]), selected : String(o[0]) === String(selected)},
                 o[1]);
    }));
    node.style.maxWidth = '260px';
    return node;
}
var field = udx.field;
/* Traffic rows must use the decimal formatter; `udx.bytesText` is 1024-based
 * and stays reserved for storage sizes. */
var dataText = udx.dataText;
function panel(title, hint) {
    var p = udx.panel(title, hint);
    p.foot.hidden = false;
    return p;
}
function note(text) {
    return E('div', {class : 'udx-empty'}, text);
}
function actionButton(label, run, opts) {
    opts = opts || {};
    var node = E('button', {
        type : 'button',
        'class' : 'cbi-button cbi-button-' + (opts.style || 'action')
    },
                 label);
    node.onclick = function() {
        if (node.disabled)
            return;
        node.disabled = true;
        node.classList.add('spinning');
        return udx.notify(run, opts.done).catch(function() {
        }).then(function() {
            node.disabled = false;
            node.classList.remove('spinning');
        });
    };
    return node;
}
/* Irreversible or paid actions get an explicit confirmation; the modal itself
 * is shared so the wording and the button order cannot drift per page. */
var confirm = udx.confirm;

/* ------------------------------------------------------------------------- */
/* "Connection" tab. The apply button is the only action in the product that
 * changes several things at once, so it has to say which of the five
 * operations failed instead of bubbling one toast. */
function buildConnection(status) {
    var current = udx.cellular(status);
    var physical = current.physical_sim || {}, slots = physical.slots || [];
    var activeSlot = slots.filter(function(x) {
        return x.slot === physical.slot;
    })[0];
    function selectedMode(c) {
        return c.mode === 'lte_only'                         ? 'lte'
               : c.mode === 'nr_only'                        ? 'sa'
               : c.mode === 'nr_lte_wcdma_gsm'               ? 'all'
               : (c.nr_capability || {}).mode === 'nsa_only' ? 'nsa'
                                                             : 'auto';
    }
    var m = new form.JSONMap({
        main : {
            data : current.data_requested ? '1' : '0',
            airplane : current.radio_enabled === false ? '1' : '0',
            slot : String(physical.slot == null ? '' : physical.slot),
            mode : selectedMode(current),
            roaming : current.roaming_allowed ? '1' : '0',
            auto : current.automatic_connect ? '1' : '0'
        }
    },
                             _('Connection'));
    var s = m.section(form.NamedSection, 'main', 'main');
    s.anonymous = true;
    var data = s.option(form.Flag, 'data', _('Mobile data'));
    data.description = _('When off, the data connection is torn down but the radio stays on.');
    var airplane = s.option(form.Flag, 'airplane', _('Airplane mode'));
    airplane.description = _('Turning this on shuts the radio down; every network service stops.');
    var slot = s.option(form.ListValue, 'slot', _('SIM slot'));
    slots.filter(function(x) {
        return x.switch_supported || x.slot === physical.slot;
    }).forEach(function(x) {
        slot.value(String(x.slot), 'SIM ' + (x.slot + 1) +
                                       (x.slot === physical.slot ? ' (' + _('Current') + ')' : ''));
    });
    if (physical.slot == null)
        slot.value('', _('No card'));
    slot.readonly = !activeSlot || !activeSlot.switch_supported;
    slot.description = slot.readonly
                           ? _('This SIM slot cannot be switched; it is fixed by the hardware.')
                           : _('Switching slots disconnects the network for about ten seconds.');
    var mode = s.option(form.ListValue, 'mode', _('Network mode'));
    Object.keys(MODE_TITLE).forEach(function(k) {
        mode.value(k, _(MODE_TITLE[k]));
    });
    var roaming = s.option(form.Flag, 'roaming', _('Data roaming'));
    var auto = s.option(form.Flag, 'auto', _('Reconnect automatically'));
    auto.description = _('Redial after boot or a dropped connection.');

    var steps = udx.steps(STEPS.map(function(x) {
        return _(x.title);
    }));
    var applyButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-apply'},
                        _('Apply changes'));
    var busyNote = E('span', {class : 'udx-note', hidden : true},
                     _('A speed test or a data burn is running. Stop it before changing the connection, otherwise the result is meaningless.'));
    applyButton.onclick = function() {
        if (applyButton.disabled)
            return;
        applyButton.disabled = true;
        applyButton.classList.add('spinning');
        return udx.notify(function() {
            return m.parse().then(function() {
                if (udx.speedRunning())
                    throw new Error(_('A speed test or a data burn is running. Stop it before changing the connection, otherwise the result is meaningless.'));
                var wanted = data.formvalue('main') === '1',
                    enabled = airplane.formvalue('main') !== '1',
                    roam = roaming.formvalue('main') === '1',
                    reconnect = auto.formvalue('main') === '1',
                    target = MODES[mode.formvalue('main')] || MODES.auto,
                    targetSlot = slot.readonly ? null : Number(slot.formvalue('main')),
                    fresh = udx.cellular(status);
                if (targetSlot !== null && targetSlot !== undefined && !isNaN(targetSlot) &&
                    targetSlot !== (fresh.physical_sim || {}).slot) {
                    var switchable = ((fresh.physical_sim || {}).slots || []).some(function(x) {
                        return x.slot === targetSlot && x.switch_supported;
                    });
                    if (!switchable)
                        throw new Error(_('The selected SIM slot cannot be switched on this device; choose another slot.'));
                }
                var tasks = [
                    {
                        label : _(STEPS[0].title),
                        run : function() {
                            return udx.execute('policy',
                                               {automatic_connect : reconnect, roaming : roam});
                        }
                    },
                    {
                        label : _(STEPS[1].title),
                        run : function() {
                            if (enabled === (fresh.radio_enabled !== false))
                                return null;
                            return udx.execute('radio', {enabled : enabled});
                        }
                    },
                    {
                        label : _(STEPS[2].title),
                        run : function() {
                            if (targetSlot === null || isNaN(targetSlot) ||
                                targetSlot === (fresh.physical_sim || {}).slot)
                                return null;
                            return udx.execute('physical_slot', {slot : targetSlot});
                        }
                    },
                    {
                        label : _(STEPS[3].title),
                        run : function() {
                            if (fresh.mode === target[0] &&
                                (fresh.nr_capability || {}).mode === target[1])
                                return null;
                            return udx.execute('network_configure',
                                               {mode : target[0], nr_capability : target[1]});
                        }
                    },
                    {
                        label : _(STEPS[4].title),
                        run : function() {
                            return udx.execute(wanted && enabled ? 'connect' : 'disconnect',
                                               wanted && enabled ? {automatic : false} : {});
                        }
                    }
                ];
                return udx.runSteps(steps, tasks).then(function() {
                    return {};
                });
            });
        }, _('All five steps finished.')).catch(function() {
        }).then(function() {
            applyButton.disabled = false;
            applyButton.classList.remove('spinning');
        });
    };
    var panelNode = panel(_('Connection'));
    panelNode.body.appendChild(E('div', {class : 'udx-note', style : 'margin-bottom:8px'},
                                 _('These five settings are sent to the modem as five separate commands, in the order shown below. Do not click twice; switching SIM slots drops the network for about ten seconds.')));
    panelNode.body.appendChild(steps.node);
    panelNode.foot.appendChild(applyButton);
    panelNode.foot.appendChild(busyNote);
    return {
        form : m.render(),
        panel : panelNode,
        onSpeed : function(state) {
            var busy = !!state.running;
            applyButton.disabled = busy;
            busyNote.hidden = !busy;
        }
    };
}

/* ------------------------------------------------------------------------- */
/* "Bands and cells" */
function buildBands(status) {
    var current = udx.cellular(status), limits = current.band_limits || {};
    var m = new form.JSONMap({
        main : {
            lte : (limits.lte || {}).unrestricted ? [] : (limits.lte || {}).bands || [],
            nr : (limits.nr || {}).unrestricted ? [] : (limits.nr || {}).bands || []
        }
    },
                             _('Bands and cells'));
    var s = m.section(form.NamedSection, 'main', 'main');
    s.anonymous = true;
    var lte = s.option(form.MultiValue, 'lte', _('LTE bands'));
    LTE_BANDS.forEach(function(b) {
        lte.value(b);
    });
    var nr = s.option(form.MultiValue, 'nr', _('NR bands'));
    NR_BANDS.forEach(function(b) {
        nr.value(b);
    });
    lte.description = nr.description = _('Leave empty for all bands.');

    var applied = udx.table(_('Applied band limits'), [
        [
            'LTE',
            function(d) {
                var r = (udx.cellular(d).band_limits || {}).lte || {};
                return r.unrestricted ? _('Unrestricted') : r.bands;
            }
        ],
        [
            'NR',
            function(d) {
                var r = (udx.cellular(d).band_limits || {}).nr || {};
                return r.unrestricted ? _('Unrestricted') : r.bands;
            }
        ]
    ]);
    var locks = udx.table(_('Cell locks'), [ 'lte', 'nr' ].map(function(rat) {
        return [
            rat.toUpperCase(),
            function(d) {
                var r = (udx.cellular(d).cell_locks || {})[rat] || {};
                return r.error || (r.locked === false ? _('Unlocked')
                                   : r.locked         ? r.arfcn + ' / PCI ' + r.pci
                                                      : null);
            }
        ];
    }));
    var cells = udx.list([
        [
            _('Type'),
            function(r) {
                return String(r.rat || '').toUpperCase() + ' ' +
                       (r.serving ? _('Serving') : _('Neighbour'));
            }
        ],
        [
            _('Band'),
            function(r) {
                return r.band || r.band_candidates;
            }
        ],
        [
            _('Frequency point'),
            function(r) {
                return r.arfcn;
            }
        ],
        [
            'PCI',
            function(r) {
                return r.pci;
            }
        ],
        [
            'RSRP',
            function(r) {
                return r.rsrp;
            },
            function(v) {
                return udx.signalBadge('rsrp', v, ' dBm');
            }
        ],
        [
            'SINR',
            function(r) {
                return r.sinr;
            },
            function(v) {
                return udx.signalBadge('sinr', v, ' dB');
            }
        ]
    ], function(r) {
        return [ r.rat, r.serving, r.arfcn, r.pci ].join(':');
    }, false, function(get) {
        return actionButton(_('Lock cell'), function() {
            var r = get();
            return udx.execute('cell_lock', {rat : r.rat, arfcn : r.arfcn, pci : r.pci});
        });
    });
    var queries = E('p', {class : 'udx-note'});

    var bands = panel(_('Band locking'));
    bands.foot.appendChild(actionButton(_('Apply bands'), function() {
        return udx.execute('band_lock', {lte : lte.formvalue('main') || [],
                                         nr : nr.formvalue('main') || []});
    }, {style : 'apply'}));
    bands.foot.appendChild(actionButton(_('Unlock all bands'), function() {
        return udx.execute('unlock', {scope : 'bands'});
    }));
    bands.foot.appendChild(actionButton(_('Read band and cell locks'), function() {
        return udx.execute('advanced_refresh', {});
    }));

    var cellPanel = panel(_('Serving and neighbouring cells'));
    cellPanel.body.appendChild(cells.node);
    cellPanel.body.appendChild(queries);
    cellPanel.foot.appendChild(actionButton(_('Refresh cells'), function() {
        return udx.execute('cells_refresh', {});
    }));
    cellPanel.foot.appendChild(actionButton(_('Refresh serving cell'), function() {
        return udx.execute('serving_refresh', {});
    }));
    cellPanel.foot.appendChild(actionButton(_('Refresh neighbours'), function() {
        return udx.execute('neighbors_refresh', {});
    }));
    cellPanel.foot.appendChild(actionButton(_('Unlock all cells'), function() {
        return udx.execute('unlock', {scope : 'cells', rat : 'lte'}).then(function() {
            return udx.execute('unlock', {scope : 'cells', rat : 'nr'});
        });
    }));

    return {
        form : m.render(),
        applied : applied,
        locks : locks,
        panel : bands,
        cellPanel : cellPanel,
        update : function(d) {
            applied.update(d);
            locks.update(d);
            cells.update(udx.cellular(d).cells || []);
            var errors = udx.cellular(d).cell_query_errors || {};
            queries.textContent = Object.keys(errors).map(function(k) {
                return k + ': ' + errors[k];
            }).join('; ');
        }
    };
}

/* ------------------------------------------------------------------------- */
/* "Operators" */
function buildOperators() {
    var operators = [], scanned = false;
    var list = udx.list([
        [
            _('Operator'),
            function(r) {
                return r.name || r.short_name || r.plmn;
            }
        ],
        [
            'PLMN',
            function(r) {
                return r.plmn;
            }
        ],
        [
            _('Technology'),
            function(r) {
                return ACT_TITLE[r.act] || r.act;
            }
        ],
        [
            _('Status'),
            function(r) {
                return [ _('Unknown'), _('Available'), _('Current'), _('Forbidden') ][r.status] ||
                       _('Unknown');
            }
        ]
    ], function(r) {
        return r.plmn + ':' + r.act;
    }, false, function(get) {
        return actionButton(_('Register'), function() {
            var r = get();
            return udx.execute('operator_select', {plmn : r.plmn, act : Number(r.act)});
        });
    });
    var emptyNote = note(_('No scan results yet. Scan for operators to see what is available here.'));

    var plmn = input('', {placeholder : '46000', width : '140px'});
    var act = select([ [ 7, 'LTE' ], [ 11, 'NR' ], [ 13, 'NR + LTE' ] ], 7);

    var scanPanel = panel(_('Operator scan'));
    scanPanel.body.appendChild(emptyNote);
    scanPanel.body.appendChild(list.node);
    scanPanel.foot.appendChild(actionButton(_('Scan operators'), function() {
        return udx.execute('operators_scan', {}).then(function(r) {
            operators = r.operators || [];
            scanned = true;
            list.update(operators);
            emptyNote.hidden = operators.length > 0;
            return r;
        });
    }, {done : _('Scan finished.')}));
    scanPanel.foot.appendChild(actionButton(_('Automatic operator selection'), function() {
        return udx.execute('operator_auto', {});
    }));

    var manualPanel = panel(_('Manual registration'));
    manualPanel.body.appendChild(field('MCC/MNC', plmn));
    manualPanel.body.appendChild(field(_('Technology'), act));
    manualPanel.foot.appendChild(actionButton(_('Register manually'), function() {
        var value = (plmn.value || '').trim();
        if (!/^\d{5,6}$/.test(value))
            throw new Error(_('Enter a 5 or 6 digit MCC/MNC, for example 46000.'));
        return udx.execute('operator_select', {plmn : value, act : Number(act.value)});
    }));

    var registration = udx.table(_('Registration'), [
        [
            _('Operator'),
            function(d) {
                var op = udx.cellular(d).operator || {};
                return BRANDS[op.brand] ? _(BRANDS[op.brand]) : (op.name || op.short_name);
            }
        ],
        [
            _('Home network'),
            function(d) {
                return udx.cellular(d).home_plmn;
            }
        ],
        [
            _('Status'),
            function(d) {
                var c = udx.cellular(d), reg = c.registration || {};
                return reg.registered ? _('Registered')
                       : c.state === 'waiting_registration' ? _('Searching for network')
                                                            : _('Not registered');
            }
        ],
        [
            _('Roaming'),
            function(d) {
                return udx.cellular(d).roaming;
            }
        ]
    ]);
    var regPanel = panel(_('Registration'));
    regPanel.body.appendChild(registration.node);

    return {
        panel : regPanel,
        scanPanel : scanPanel,
        manualPanel : manualPanel,
        update : function(d) {
            registration.update(d);
            if (!scanned)
                emptyNote.hidden = false;
        }
    };
}

/* ------------------------------------------------------------------------- */
/* "APN" */
function buildApn(status, initialApn) {
    var cellular = udx.cellular(status), profile = cellular.profile || {},
        auth = cellular.auth || {};
    var templates = (initialApn || {}).templates || [];
    var m = new form.JSONMap({
        main : {
            apn_mode : cellular.apn_mode === 'manual' ? 'manual' : 'auto',
            apn : profile.apn || '',
            pdp_type : profile.pdp_type || 'IPV4V6',
            username : auth.username || '',
            password : '',
            auth_method : auth.auth_method || 'none',
            template_name : ''
        }
    },
                             _('APN'));
    var s = m.section(form.NamedSection, 'main', 'main');
    s.anonymous = true;
    var apnMode = s.option(form.ListValue, 'apn_mode', _('APN mode'));
    apnMode.value('auto', _('Automatic'));
    apnMode.value('manual', _('Manual'));
    var apn = s.option(form.Value, 'apn', 'APN');
    apn.depends('apn_mode', 'manual');
    var pdp = s.option(form.ListValue, 'pdp_type', _('PDP type'));
    [ 'IPV4V6', 'IP', 'IPV6' ].forEach(function(x) {
        pdp.value(x);
    });
    pdp.depends('apn_mode', 'manual');
    var username = s.option(form.Value, 'username', _('Username'));
    username.depends('apn_mode', 'manual');
    var password = s.option(form.Value, 'password', _('Password'));
    password.password = true;
    password.depends('apn_mode', 'manual');
    password.placeholder = auth.password_set ? _('Unchanged') : '';
    var authMethod = s.option(form.ListValue, 'auth_method', _('Authentication'));
    authMethod.value('none', _('None'));
    authMethod.value('pap', 'PAP');
    authMethod.value('chap', 'CHAP');
    authMethod.depends('apn_mode', 'manual');
    var templateName = s.option(form.Value, 'template_name', _('New template name'));
    templateName.depends('apn_mode', 'manual');

    var templateSelect = select([ [ '0', _('Select a template') ] ], '0');
    function rebuildTemplates() {
        templateSelect.textContent = '';
        templateSelect.appendChild(E('option', {value : '0'}, _('Select a template')));
        templates.forEach(function(t) {
            templateSelect.appendChild(
                E('option', {value : String(t.id)}, t.name + ' — ' + t.apn));
        });
        templateSelect.disabled = !templates.length;
    }
    function refreshTemplates() {
        return udx.getAPN().then(function(r) {
            templates = (r && (r.templates || (r.apn || {}).templates)) || [];
            rebuildTemplates();
            return r;
        });
    }
    var templateList = udx.list([
        [
            _('Name'),
            function(r) {
                return r.name;
            }
        ],
        [ 'APN', function(r) {
            return r.apn;
        } ],
        [
            _('PDP type'),
            function(r) {
                return r.pdp_type;
            }
        ]
    ], function(r) {
        return r.id;
    }, false);

    var providerList = udx.list([
        [ _('Operator'), function(r) {
            return r.name;
        } ],
        [ 'MCC/MNC', function(r) {
            return r.plmn;
        } ],
        [ 'APN', function(r) {
            return r.apn;
        } ]
    ], function(r) {
        return r.plmn + ':' + r.apn;
    }, false, function(get) {
        return actionButton(_('Use APN'), function() {
            var r = get();
            return udx.execute('apn', {
                apn : r.apn,
                pdp_type : r.pdp_type,
                cid : 1,
                username : r.username || '',
                password : r.password || '',
                auth_method : r.auth_method || 'none'
            });
        });
    });
    var providerEmpty = note(_('Read the APNs stored on the SIM to see the carrier defaults.'));

    var edit = panel(_('Current APN'));
    /* The APN currently in use, so the form is not the only source of truth. */
    var current = udx.table(_('In use'), [
        [
            _('APN mode'),
            function(d) {
                return udx.cellular(d).apn_mode === 'manual' ? _('Manual') : _('Automatic');
            }
        ],
        [ 'APN', function(d) {
            return (udx.cellular(d).profile || {}).apn;
        } ],
        [
            _('PDP type'),
            function(d) {
                return (udx.cellular(d).profile || {}).pdp_type;
            }
        ],
        [
            _('Authentication'),
            function(d) {
                return (udx.cellular(d).auth || {}).auth_method;
            }
        ]
    ]);
    edit.body.appendChild(current.node);
    edit.foot.appendChild(actionButton(_('Apply APN'), function() {
        if (apnMode.formvalue('main') === 'auto')
            return udx.execute('apn_select', {mode : 'auto', template_id : 0});
        var value = (apn.formvalue('main') || '').trim();
        if (!value)
            throw new Error(_('Enter an APN name before applying a manual profile.'));
        return udx.execute('apn', {
            apn : value,
            pdp_type : pdp.formvalue('main'),
            cid : 1,
            username : username.formvalue('main') || '',
            password : password.formvalue('main') || null,
            auth_method : authMethod.formvalue('main')
        });
    }, {style : 'apply'}));
    edit.foot.appendChild(actionButton(_('Save as template'), function() {
        var name = (templateName.formvalue('main') || '').trim();
        if (!name)
            throw new Error(_('Enter a template name before saving.'));
        return udx.execute('apn_template_save', {
            id : 0,
            name : name,
            apn : apn.formvalue('main') || '',
            pdp_type : pdp.formvalue('main'),
            username : username.formvalue('main') || '',
            password : password.formvalue('main') || '',
            auth_method : authMethod.formvalue('main')
        }).then(refreshTemplates);
    }));
    edit.foot.appendChild(actionButton(_('Read SIM operator APNs'), function() {
        return udx.execute('operator_catalog', {}).then(function(r) {
            var rows = r.home_candidates || [];
            providerList.update(rows);
            providerEmpty.hidden = rows.length > 0;
            return r;
        });
    }));

    var templatePanel = panel(_('Templates'));
    templatePanel.body.appendChild(templateSelect);
    templatePanel.body.appendChild(templateList.node);
    templatePanel.body.appendChild(E('div', {class : 'udx-note'},
                                     _('Deleting a template only removes it from this device; the APN currently in use is not changed.')));
    templatePanel.foot.appendChild(actionButton(_('Use template'), function() {
        if (!templateSelect.value || templateSelect.value === '0')
            throw new Error(_('Choose a template first.'));
        return udx.execute('apn_select',
                           {mode : 'manual', template_id : Number(templateSelect.value)});
    }));
    templatePanel.foot.appendChild(actionButton(_('Delete template'), function() {
        if (!templateSelect.value || templateSelect.value === '0')
            throw new Error(_('Choose a template first.'));
        return udx.execute('apn_template_delete', {id : Number(templateSelect.value)})
            .then(refreshTemplates);
    }, {style : 'reset'}));

    var providerPanel = panel(_('Carrier APNs'));
    providerPanel.body.appendChild(providerEmpty);
    providerPanel.body.appendChild(providerList.node);
    providerPanel.foot.appendChild(actionButton(_('Read APNs'), function() {
        return udx.execute('operator_catalog', {}).then(function(r) {
            var rows = r.home_candidates || [];
            providerList.update(rows);
            providerEmpty.hidden = rows.length > 0;
            return r;
        });
    }));

    rebuildTemplates();
    templateList.update(templates);

    return {
        form : m.render(),
        panel : edit,
        templatePanel : templatePanel,
        providerPanel : providerPanel,
        update : function(d) {
            current.update(d);
        }
    };
}

/* ------------------------------------------------------------------------- */
/* "Speed test" and "Data burn" share nothing but the service and its poll
 * loop: their own parameters, their own result block, their own buttons. */
/* A live speed curve. The service samples the wwan0 byte counter once a second
 * (and speed_now every 500 ms), so the samples array grows during a run and the
 * front end re-paints this chart on every poll — the line, the area under it
 * and the trailing dot all advance in real time. */
function spotChart() {
    var W = 600, H = 168, L = 54, R = 12, T = 12, B = 24;
    var uid = udx.randomId();
    var svg = E('svg', {viewBox : '0 0 ' + W + ' ' + H, preserveAspectRatio : 'none',
                        style : 'width:100%;height:' + H + 'px;display:block'});
    var defs = E('defs', {});
    var grad = E('linearGradient', {id : 'udxArea' + uid, x1 : '0', y1 : '0', x2 : '0', y2 : '1'});
    grad.appendChild(E('stop', {offset : '0',
                                style : 'stop-color:var(--success,#16a34a);stop-opacity:.30'}));
    grad.appendChild(E('stop', {offset : '1',
                                style : 'stop-color:var(--success,#16a34a);stop-opacity:0'}));
    defs.appendChild(grad);
    svg.appendChild(defs);

    /* Horizontal grid lines with a compact Mbps label each. The top label also
     * carries the unit so the others can stay as bare numbers. */
    var gridLabels = [], gridLines = [];
    for (var g = 0; g <= 4; g++) {
        var gy = T + (H - T - B) * g / 4;
        gridLines.push(E('line', {x1 : L, y1 : gy, x2 : W - R, y2 : gy,
                                  style : 'stroke:var(--udx-line,#e3e6ea);stroke-width:1'}));
        gridLabels.push(E('text', {x : L - 7, y : gy + 3, 'text-anchor' : 'end',
                                   style : 'font-size:9.5px;fill:var(--udx-text2,#5b6472);' +
                                           'font-variant-numeric:tabular-nums'}));
        svg.appendChild(gridLines[g]);
        svg.appendChild(gridLabels[g]);
    }
    var unitLabel = E('text', {x : L - 7, y : T - 4, 'text-anchor' : 'end',
                               style : 'font-size:9px;fill:var(--udx-text2,#5b6472);' +
                                       'opacity:.75'});

    var area = E('path', {fill : 'url(#udxArea' + uid + ')', stroke : 'none'});
    var glow = E('polyline', {fill : 'none',
                              style : 'stroke:var(--success,#16a34a);stroke-width:6;' +
                                      'stroke-opacity:.18;stroke-linejoin:round;' +
                                      'stroke-linecap:round'});
    var line = E('polyline', {fill : 'none',
                              style : 'stroke:var(--success,#16a34a);stroke-width:2;' +
                                      'stroke-linejoin:round;stroke-linecap:round'});
    var dot = E('circle', {r : '3.5', style : 'fill:var(--success,#16a34a);' +
                                              'filter:drop-shadow(0 0 4px var(--success,#16a34a))'});

    svg.appendChild(unitLabel);
    svg.appendChild(area);
    svg.appendChild(glow);
    svg.appendChild(line);
    svg.appendChild(dot);

    var live = E('div', {class : 'udx-chart-live', style : 'visibility:hidden'});
    var caption = E('div', {class : 'udx-note'});

    function niceCeil(v) {
        if (!(v > 0))
            return 1;
        var exp = Math.floor(Math.log(v) / Math.LN10), base = Math.pow(10, exp), m = v / base;
        return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * base;
    }

    return {
        node : E('div', {class : 'udx-chart'}, [ svg, live, caption ]),
        set : function(samples, unit) {
            var points = (samples || []).filter(function(x) {
                return isFinite(Number(x));
            }).map(Number);
            if (!points.length) {
                area.setAttribute('d', '');
                glow.setAttribute('points', '');
                line.setAttribute('points', '');
                dot.setAttribute('cx', '');
                dot.setAttribute('cy', '');
                live.textContent = '';
                live.style.visibility = 'hidden';
                caption.textContent = _('No samples yet.');
                return;
            }
            var max = niceCeil(Math.max.apply(null, points));
            var innerW = W - L - R, innerH = H - T - B;
            var coords = points.map(function(v, i) {
                var x = points.length === 1 ? L + innerW / 2 : L + i / (points.length - 1) * innerW;
                var y = T + (1 - v / max) * innerH;
                return [ x, y ];
            });
            var pts = coords.map(function(p) {
                return p[0].toFixed(1) + ',' + p[1].toFixed(1);
            }).join(' ');
            line.setAttribute('points', pts);
            glow.setAttribute('points', pts);
            var d = 'M' + coords[0][0].toFixed(1) + ',' + (H - B).toFixed(1);
            coords.forEach(function(p) {
                d += 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
            });
            d += 'L' + coords[coords.length - 1][0].toFixed(1) + ',' + (H - B).toFixed(1) + 'Z';
            area.setAttribute('d', d);
            var last = coords[coords.length - 1];
            dot.setAttribute('cx', last[0].toFixed(1));
            dot.setAttribute('cy', last[1].toFixed(1));
            /* Grid labels read off the nice ceiling so they stay round numbers;
             * the top one also carries the unit. */
            for (var g = 0; g <= 4; g++)
                gridLabels[g].textContent = udx.bpsText(max * (4 - g) / 4);
            unitLabel.textContent = _('Mbps');
            /* Live read-out: the freshest point, so the eye lands on a number
             * that changes every poll rather than a static caption. */
            live.style.visibility = 'visible';
            live.textContent = unit(points[points.length - 1]);
            caption.textContent = _('Top of the chart') + ': ' + unit(max) + ' · ' +
                                  points.length + ' ' + _('samples');
        }
    };
}
/* A status snapshot right after `start` may carry no counters yet. Treat such
 * a snapshot as "no result", otherwise the panel blanks out the previous run
 * it was still showing. */
function hasResult(data) {
    return data.total_bytes !== undefined && data.total_bytes !== null ||
           data.p90 !== undefined && data.p90 !== null ||
           data.avg !== undefined && data.avg !== null ||
           data.sample_count > 0 || Array.isArray(data.samples) && data.samples.length > 0;
}
function confidenceNote(state) {
    var stable = (state.stable_samples === undefined) ? null : Number(state.stable_samples);
    if (stable === null || isNaN(stable))
        return null;
    if (stable >= 5)
        return null;
    return _('Fewer than 5 stable samples, so this result is indicative only.');
}

function buildSpeed() {
    var nodes = [], nodeState = 'loading', nodeError = null;
    var params = {node : ''};
    var nodeSelect = select([ [ '', _('Automatic (best round trip)') ] ], '');
    /* The list can fail to load or come back empty; without this the control
     * just sits there looking normal and the user cannot tell why. */
    var nodeHint = E('div', {class : 'udx-note'});
    var threadSelect = select([ 1, 2, 4, 6, 8 ].map(function(n) {
        return [ String(n), String(n) ];
    }), '4');
    var startButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-apply'},
                        _('Start speed test'));
    var stopButton = E('button', {type : 'button', 'class' : 'cbi-button'}, _('Stop speed test'));
    stopButton.disabled = true;
    var stateBadge = udx.pill(_('Not started'), 'neutral');
    var main = udx.main('Mbps');
    var avg = udx.row(_('Average')), peak = udx.row(_('Peak')),
        current = udx.row(_('Current')), idlePing = udx.row(_('Idle latency')),
        loadPing = udx.row(_('Latency under load')),
        bytes = udx.row(_('Data used')), elapsed = udx.row(_('Elapsed'));
    var message = E('div', {class : 'udx-note'});
    var chart = spotChart();

    function rebuildNodes() {
        nodeSelect.textContent = '';
        var auto = E('option', {value : ''}, _('Automatic (best round trip)'));
        nodeSelect.appendChild(auto);
        nodes.forEach(function(n) {
            var label = n.name + (n.rtt !== null ? ' · ' + n.rtt + ' ms' : '') +
                        (n.enabled ? '' : ' · ' + _('unavailable'));
            var option = E('option', {value : n.id}, label);
            if (!n.enabled)
                option.disabled = true;
            nodeSelect.appendChild(option);
        });
        nodeSelect.disabled = (nodeState === 'loading');
        nodeHint.textContent = nodeError || '';
    }
    function loadNodes() {
        nodeState = 'loading';
        nodeError = null;
        rebuildNodes();
        return udx.speedNodesFor('speed').then(function(list) {
            nodes = list;
            nodeState = nodes.length ? 'ready' : 'empty';
            if (!nodes.length)
                nodeError = _('No measurement node is reachable right now; the service picks one when the test starts.');
            var preferred = nodes.filter(function(n) {
                return n.selected;
            })[0] ||
                            nodes.filter(function(n) {
                                return n.enabled;
                            })[0];
            params.node = preferred ? preferred.id : '';
            rebuildNodes();
            nodeSelect.value = params.node;
        }, function(e) {
            nodeState = 'error';
            nodeError = (e && e.message) || _('The node list could not be read.');
            rebuildNodes();
        });
    }
    startButton.onclick = function() {
        if (startButton.disabled)
            return;
        startButton.disabled = true;
        /* The node id is passed explicitly: the service must not have to guess
         * which node the user picked, and an empty id means "auto". */
        return udx.speedStart('speed', [ 'speed', nodeSelect.value || '', Number(threadSelect.value) ])
            .catch(function(e) {
                startButton.disabled = false;
                ui.addNotification(null, E('p', {}, e.message), 'error');
            });
    };
    stopButton.onclick = function() {
        stopButton.disabled = true;
        return udx.speedStop().then(function(r) {
            /* A guard may have stopped the run a moment before this click; then
             * the honest message is "it had already stopped", and the real
             * reason comes from the next status poll. */
            ui.addNotification(null, E('p', {}, r.text), r.accepted ? 'info' : 'warning');
            /* Nothing was actually stopped, so let the user try again instead of
             * leaving the button dead until the next poll. */
            if (!r.accepted)
                stopButton.disabled = false;
            return r;
        }, function(e) {
            ui.addNotification(null, E('p', {}, udx.failureText(e)), 'error');
            stopButton.disabled = false;
        });
    };

    var paramsPanel = panel(_('Speed test parameters'),
                            _('Runs for a fixed time; the service decides the data cap'));
    paramsPanel.body.appendChild(field(_('Measurement node'), nodeSelect));
    paramsPanel.body.appendChild(nodeHint);
    paramsPanel.body.appendChild(field(_('Threads'), threadSelect,
                                       _('More threads give a more accurate figure on fast links.')));
    paramsPanel.body.appendChild(
        E('div', {class : 'udx-note'},
          _('The run stops at 20 seconds or 300 MB, whichever comes first. Above 120 Mbps the data cap ends it first, so a shorter run with fewer samples — and a rougher P90 — is normal there, not a fault.')));
    paramsPanel.foot.appendChild(startButton);

    var resultPanel = panel(_('Speed test result'));
    resultPanel.body.appendChild(E('div', {class : 'udx-card-h'},
                                   [ E('span', {}, _('Ninety percent of samples are faster than this')),
                                     stateBadge ]));
    resultPanel.body.appendChild(main.node);
    resultPanel.body.appendChild(chart.node);
    resultPanel.body.appendChild(message);
    [ avg, peak, current, idlePing, loadPing, bytes, elapsed ].forEach(function(r) {
        resultPanel.body.appendChild(r.node);
    });
    resultPanel.foot.appendChild(stopButton);

    rebuildNodes();
    /* The last snapshot that belonged to a speed run. Kept so that when a burn
     * run takes the service over and then ends, this tab goes back to showing
     * its own result instead of leaving "Data burn is running" on screen. */
    var last = null;
    function paint(data, running) {
        if (running) {
            udx.setPill(stateBadge, _('Running'), 'teal');
            message.textContent =
                _('Keep the page open; the result stays available after the run ends.');
        }
        else if (data.error) {
            udx.setPill(stateBadge, _('Failed'), 'bad');
            message.textContent = data.error;
        }
        else {
            /* `status.stop_reason`, not the stop reply's `reason`. */
            var reason = udx.stopReason(data.stop_reason);
            /* null means the service has no run to describe; that is not a
             * finished run, so do not badge it as one. */
            udx.setPill(stateBadge, reason ? reason.text
                                           : hasResult(data) ? _('Finished') : _('Not started'),
                        reason ? reason.tone : 'neutral');
            /* A failed run shows the service's own text instead of the sample
             * hint; "fewer than 5 stable samples" is meaningless when there is
             * no result at all. */
            message.textContent = (reason && reason.raw === 'error' && data.error)
                                      ? data.error
                                      : (confidenceNote(data) || '');
        }
        /* p90 only exists for a speed run; the service returns null for a burn
         * run, so it must never be treated as a zero. */
        main.set(udx.bpsText(data.p90));
        avg.set(udx.bpsText(data.avg) ? udx.bpsText(data.avg) + ' Mbps' : null);
        peak.set(udx.bpsText(data.peak) ? udx.bpsText(data.peak) + ' Mbps' : null);
        current.set(udx.bpsText(data.speed_now) ? udx.bpsText(data.speed_now) + ' Mbps' : null);
        idlePing.set(data.idle_latency_ms == null ? _('Not measured')
                                                  : Math.round(data.idle_latency_ms) + ' ms');
        loadPing.set(data.latency_ms == null ? _('Not measured')
                                             : Math.round(data.latency_ms) + ' ms',
                     data.latency_ms == null ? null : udx.level('latency', data.latency_ms));
        bytes.set(dataText(data.total_bytes));
        elapsed.set(udx.durationText(data.elapsed));
        chart.set(data.samples, function(v) {
            return udx.bpsText(v) + ' Mbps';
        });
    }
    return {
        panel : paramsPanel,
        resultPanel : resultPanel,
        warmUp : loadNodes,
        onSpeed : function(state) {
            var data = state.state || {}, running = !!state.running;
            var mine = data.mode === 'speed';
            if (mine && hasResult(data))
                last = data;
            if (!mine && running) {
                udx.setPill(stateBadge, data.mode === 'burn' ? _('Data burn is running') : _('Busy'),
                            'warn');
                message.textContent =
                    data.mode === 'burn'
                        ? _('A data burn run is in progress. Stop it before measuring speed.')
                        : _('Another test is running. Stop it first.');
                startButton.disabled = true;
                stopButton.disabled = true;
                return;
            }
            /* A node list that is still loading means the test cannot start. */
            startButton.disabled = running || nodeState === 'loading';
            stopButton.disabled = !running;
            if (mine)
                paint(data, running);
            else if (last)
                paint(last, false);
        }
    };
}

function buildBurn() {
    var gbInput = input('1', {number : true, min : 0.1, max : 10, step : 0.1, width : '120px'});
    var secondsInput = input('300', {number : true, min : 30, max : 1800, step : 30,
                                     width : '120px'});
    var threadSelect = select([ 1, 2, 4, 6, 8 ].map(function(n) {
        return [ String(n), String(n) ];
    }), '4');
    var startButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-apply'},
                        _('Start data burn'));
    var stopButton = E('button', {type : 'button', 'class' : 'cbi-button'}, _('Stop data burn'));
    stopButton.disabled = true;
    var stateBadge = udx.pill(_('Not started'), 'neutral');
    var main = udx.main('GB');
    var limitBar = udx.bar();
    var used = udx.row(_('Used / cap')), avg = udx.row(_('Average')),
        current = udx.row(_('Current')), elapsed = udx.row(_('Elapsed')),
        remain = udx.row(_('Remaining')), estimated = udx.row(_('Estimated cost'));
    var message = E('div', {class : 'udx-note'});
    /* What the service actually armed, read back from `status.max_bytes` /
     * `status.max_seconds` after the run starts. The pane must quote this and
     * never the figure the user typed: the service clamps to its own bounds,
     * and a page that keeps saying 10 GB while 9.3 GB runs is a lie. */
    var capHint = E('div', {class : 'udx-note'});
    var chart = spotChart();
    /* What the user asked for, kept only to explain a clamp. */
    var requested = null;

    startButton.onclick = function() {
        var gb = Number(gbInput.value), seconds = Number(secondsInput.value);
        if (!isFinite(gb) || gb <= 0)
            return ui.addNotification(null, E('p', {}, _('Enter a data cap in GB greater than zero.')),
                                      'error');
        if (!isFinite(seconds) || seconds < 30)
            return ui.addNotification(null,
                                      E('p', {}, _('Enter a duration of at least 30 seconds.')),
                                      'error');
        /* Decimal on purpose: the service compares raw bytes and clamps to
         * 100 MB .. 10 GB expressed the same way, so 1 GB has to mean 1e9 and
         * not 1024^3 — otherwise every intermediate size overshoots by 7% and
         * the 10 GB ceiling silently becomes 9.3 GB. */
        var cap = Math.round(gb * 1e9), secs = Math.round(seconds);
        var cost = (gb * 3).toFixed(2);
        return confirm(_('Start the data burn test?'),
                       _('This uses mobile data on purpose: up to') + ' ' + gb + ' GB, ' +
                           _('for up to') + ' ' + seconds + ' ' + _('seconds') + '. ' +
                           _('At roughly 3 yuan per GB that is about') + ' ' + cost + ' ' +
                           _('yuan of traffic. You can stop it at any time.') + ' ' +
                           _('This is an estimate, not the rate you are actually billed.'),
                       _('Start and use data'))
            .then(function(ok) {
                if (!ok)
                    return null;
                startButton.disabled = true;
                requested = cap;
                /* The service takes INT64/INT32 only: a value that arrives as a
                 * float (e.g. 1.073741824e9) is rejected and the run falls back
                 * to the default cap without a word in the log. Hence the
                 * Math.round on every number sent here. */
                return udx
                    .speedStart('burn', [ 'burn', secs, cap,
                                          Math.round(Number(threadSelect.value)) ])
                    .catch(function(e) {
                        startButton.disabled = false;
                        ui.addNotification(null, E('p', {}, e.message), 'error');
                    });
            });
    };
    stopButton.onclick = function() {
        stopButton.disabled = true;
        return udx.speedStop().then(function(r) {
            /* A guard may have stopped the run a moment before this click; then
             * the honest message is "it had already stopped", and the real
             * reason comes from the next status poll. */
            ui.addNotification(null, E('p', {}, r.text), r.accepted ? 'info' : 'warning');
            /* Nothing was actually stopped, so let the user try again instead of
             * leaving the button dead until the next poll. */
            if (!r.accepted)
                stopButton.disabled = false;
            return r;
        }, function(e) {
            ui.addNotification(null, E('p', {}, udx.failureText(e)), 'error');
            stopButton.disabled = false;
        });
    };

    var paramsPanel = panel(_('Data burn parameters'),
                            _('This is not a speed test: it keeps using data on purpose'));
    paramsPanel.body.appendChild(field(_('Data cap (GB)'), gbInput));
    paramsPanel.body.appendChild(field(_('Duration (seconds)'), secondsInput));
    paramsPanel.body.appendChild(field(_('Threads'), threadSelect));
    paramsPanel.body.appendChild(capHint);
    paramsPanel.foot.appendChild(startButton);

    var resultPanel = panel(_('Data burned'));
    resultPanel.body.appendChild(E('div', {class : 'udx-card-h'},
                                   [ E('span', {}, _('Total consumed since the run started')),
                                     stateBadge ]));
    resultPanel.body.appendChild(main.node);
    resultPanel.body.appendChild(limitBar.node);
    resultPanel.body.appendChild(chart.node);
    resultPanel.body.appendChild(message);
    [ used, avg, current, elapsed, remain, estimated ].forEach(function(r) {
        resultPanel.body.appendChild(r.node);
    });
    resultPanel.foot.appendChild(stopButton);

    /* Same pattern as the speed tab: remember our own last run so the panel
     * goes back to it after the other mode finishes. `p90` is deliberately
     * absent here — the service returns null for a burn run and a null is not
     * a number to display. */
    var last = null;
    function paint(data, running) {
        if (running) {
            udx.setPill(stateBadge, _('Running'), 'teal');
            message.textContent =
                _('Keep the page open. Stop the run as soon as you have seen enough.');
        }
        else if (data.error) {
            udx.setPill(stateBadge, _('Failed'), 'bad');
            message.textContent = data.error;
        }
        else {
            /* `status.stop_reason`, not the stop reply's `reason`. */
            var reason = udx.stopReason(data.stop_reason);
            /* null means the service has no run to describe; that is not a
             * finished run, so do not badge it as one. */
            udx.setPill(stateBadge, reason ? reason.text
                                           : hasResult(data) ? _('Finished') : _('Not started'),
                        reason ? reason.tone : 'neutral');
            /* No confidence note here: this tab has no P90, so "fewer than 5
             * stable samples" would warn about a number it never shows.
             * `error` is the one case that still needs words: the badge alone
             * would leave the user with "it failed" and no reason. */
            message.textContent =
                (reason && reason.raw === 'error' && data.error) ? data.error : '';
        }
        var total = Number(data.total_bytes || 0);
        /* Decimal, same basis as the request: 1 GB = 1e9 bytes. */
        var gb = total / 1e9;
        main.set(gb >= 0.01 ? gb.toFixed(2) : (total ? '< 0.01' : '0.00'));
        /* The cap is whatever the service armed, never the number typed above. */
        var cap = Number(data.max_bytes || 0), secs = Number(data.max_seconds || 0);
        limitBar.set(cap ? total / cap * 100 : 0, cap && total >= cap ? 'warn' : 'teal');
        used.set((dataText(total) || '0 B') + ' / ' +
                 (cap ? (dataText(cap) || _('no cap')) : _('no cap')));
        avg.set(udx.bpsText(data.avg) ? udx.bpsText(data.avg) + ' Mbps' : null);
        current.set(udx.bpsText(data.speed_now) ? udx.bpsText(data.speed_now) + ' Mbps' : null);
        var spent = udx.durationText(data.elapsed), allowed = udx.durationText(secs);
        elapsed.set(spent ? (allowed ? spent + ' / ' + allowed : spent) : null);
        remain.set(cap ? dataText(Math.max(0, cap - total)) : null);
        /* Cost is always quoted off what was actually burned, never off the
         * cap: a run that stopped at 1.2 GB must not look like it billed 10. */
        estimated.set(total ? (total / 1e9 * 3).toFixed(2) + ' ' + _('yuan') : null);
        if (!cap)
            capHint.textContent = '';
        else if (requested && cap !== requested)
            /* The silent clamp, spelled out instead of hidden. One template
             * rather than three glued fragments, so a translation can order
             * the two numbers its own way. */
            capHint.textContent = _('You asked for %s, but the service applied %s.')
                                      .replace('%s', dataText(requested))
                                      .replace('%s', dataText(cap));
        else
            capHint.textContent = _('Effective limit for this run') + ': ' + dataText(cap) +
                                  (secs ? ' / ' + udx.durationText(secs) : '');
        chart.set(data.samples, function(v) {
            return udx.bpsText(v) + ' Mbps';
        });
    }

    return {
        panel : paramsPanel,
        resultPanel : resultPanel,
        onSpeed : function(state) {
            var data = state.state || {}, running = !!state.running;
            var mine = data.mode === 'burn';
            if (mine && hasResult(data))
                last = data;
            if (!mine && running) {
                udx.setPill(stateBadge,
                            data.mode === 'speed' ? _('Speed test is running') : _('Busy'),
                            'warn');
                message.textContent =
                    data.mode === 'speed'
                        ? _('A speed test is in progress. Stop it before burning data.')
                        : _('Another test is running. Stop it first.');
                startButton.disabled = true;
                stopButton.disabled = true;
                return;
            }
            startButton.disabled = running;
            stopButton.disabled = !running;
            if (mine)
                paint(data, running);
            else if (last)
                paint(last, false);
        }
    };
}

return view.extend({
    load : function() {
        return Promise.all([ udx.getStatus(), L.resolveDefault(udx.getAPN(), {}) ])
            .then(function(rows) {
                var status = rows[0], apnState = rows[1];
                var connection = buildConnection(status);
                var bands = buildBands(status);
                var operators = buildOperators();
                var apn = buildApn(status, apnState);
                var speed = buildSpeed();
                var burn = buildBurn();
                return Promise
                    .all([ connection.form, bands.form, apn.form ])
                    .then(function(forms) {
                        return {
                            status : status,
                            connection : connection,
                            bands : bands,
                            operators : operators,
                            apn : apn,
                            speed : speed,
                            burn : burn,
                            forms : forms
                        };
                    });
            });
    },
    render : function(initial) {
        udx.injectStyles();
        var parts = initial, panels = {}, tabs = {}, banner = udx.banner();

        /* ---- connection ---- */
        parts.connection.panel.body.appendChild(parts.forms[0]);
        panels.connect = E('div', {class : 'udx-tabpanel'}, parts.connection.panel.node);

        /* ---- bands and cells ---- */
        parts.bands.panel.body.appendChild(parts.forms[1]);
        parts.bands.panel.body.appendChild(parts.bands.applied.node);
        panels.radio = E('div', {class : 'udx-tabpanel'}, [
            parts.bands.panel.node, parts.bands.cellPanel.node,
            (function() {
                var p = panel(_('Cell locks'));
                p.body.appendChild(parts.bands.locks.node);
                return p.node;
            })()
        ]);

        /* ---- operators ---- */
        panels.operator = E('div', {class : 'udx-tabpanel'},
                            [ parts.operators.panel.node, parts.operators.scanPanel.node,
                              parts.operators.manualPanel.node ]);

        /* ---- APN ---- */
        parts.apn.panel.body.appendChild(parts.forms[2]);
        panels.apn = E('div', {class : 'udx-tabpanel'},
                       [ parts.apn.panel.node, parts.apn.templatePanel.node,
                         parts.apn.providerPanel.node ]);

        /* ---- speed test and data burn: two independent pages ----
         * Parameters first, result under the button: the first visit shows an
         * actionable block instead of two empty panels, and the number appears
         * where the eye already is after the click. */
        panels.speed = E('div', {class : 'udx-tabpanel'},
                         [ parts.speed.panel.node, parts.speed.resultPanel.node ]);
        panels.burn = E('div', {class : 'udx-tabpanel'},
                        [ parts.burn.panel.node, parts.burn.resultPanel.node ]);

        var tabbar = E('div', {class : 'udx-tabs', role : 'tablist'});
        TABS.forEach(function(t) {
            var button = E('button', {
                type : 'button',
                'class' : 'udx-tab',
                role : 'tab',
                click : function() {
                    select(t.id);
                }
            },
                           _(t.title));
            tabs[t.id] = button;
            tabbar.appendChild(button);
        });
        var body = E('div', {});
        Object.keys(panels).forEach(function(id) {
            body.appendChild(panels[id]);
        });

        function select(id) {
            Object.keys(panels).forEach(function(key) {
                panels[key].hidden = (key !== id);
                tabs[key].className = 'udx-tab' + (key === id ? ' on' : '');
                tabs[key].setAttribute('aria-selected', key === id ? 'true' : 'false');
            });
            writeTab(id);
        }

        function update(d) {
            var c = udx.cellular(d);
            parts.bands.update(d);
            parts.operators.update(d);
            parts.apn.update(d);
            /* Same rule as the overview: stale is amber, an uncertain modem
             * state is amber too, and neither is a failure. While a speed test
             * runs the telemetry legitimately lags, so say so in grey instead
             * of flashing a warning. */
            if (udx.speedRunning())
                banner.show('neutral', _('A speed test is running, so status refresh may lag.'));
            else if (c.state === 'uncertain')
                banner.show('warn', udx.uncertainText({}));
            else if (c.stale)
                banner.show('warn', udx.ageText(c.snapshot_age_seconds)
                                        ? _('The data may be out of date; last updated') + ' ' +
                                              udx.ageText(c.snapshot_age_seconds)
                                        : _('The data may be out of date; refresh to update it.'));
            else
                banner.hide();
        }

        update(parts.status);
        select(readTab());
        /* Refreshing matters here: bands, cells, locks and the live APN are all
         * backend-derived, and the banner must clear itself once a speed test
         * stops instead of waiting for the next manual reload. */
        var watchError = udx.watch(udx.getStatus, update, null);
        /* One subscriber drives the connection guard and both test tabs. */
        udx.speedWatch(function(state) {
            parts.connection.onSpeed(state);
            parts.speed.onSpeed(state);
            parts.burn.onSpeed(state);
            if (udx.speedRunning())
                banner.show('neutral', _('A speed test is running, so status refresh may lag.'));
        });
        /* Warm the node list once on entry: the first call may block for a few
         * seconds while the service measures round trip times. */
        parts.speed.warmUp();

        return E('div', {class : 'udx-page'}, [
            E('p', {class : 'udx-note', style : 'margin:0 0 14px;font-size:12.5px;opacity:1'},
              _('Everything that changes how the device connects lives here. Status and diagnostics are on "Overview" and "SIM card".')),
            banner.node, watchError, tabbar, body
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
