'use strict';
'require view';
'require form';
'require ui';
'require udx';

/* One page per task instead of one page per API: connection policy, bands and
 * cells, operator, APN and the data panel all answer "my mobile network does X,
 * where do I change it". The tab is part of the URL so the legacy
 * /admin/udx/cellular route can land on the band tab.
 *
 * The built-in speed test tab was removed on user request (2026-11-23); the
 * 网络面板 (FlowLoss) tab stays and keeps its own independent measurement. */
var TABS = [
    {id : 'connect', title : 'Connection'},
    {id : 'radio', title : 'Bands and cells'},
    {id : 'operator', title : 'Operators'},
    {id : 'apn', title : 'APN'},
    {id : 'burn', title : '网络面板'}
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
    });
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
    /* 五个步骤的胶囊条已按用户 2026-11-23 要求去掉：卡片标题已经写着「连接」，
       下面紧跟一排 1~5 的步骤名再加一条「连接」大标题，三层标题叠在一起。
       steps 组件本身保留，runSteps 仍靠它记录哪一步失败(只是不挂进 DOM)。 */
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
    });
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

    var registration = udx.table(null, [
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
/* ---------------- 流量消耗页：嵌入移植的 FlowLoss 面板 ----------------
 * 用户 2026-11-23 要求「一模一样」，直接移植了上游源码
 * （https://github.com/arsnyeon/FlowLoss_SpeedTestPanel ，MIT）：
 * 在 .fl/src 里改品牌名、隐藏首页/关于导航、base 设为 /fl/ 后构建，
 * 产物随本包装到 /www/fl/，这里用 iframe 铺满内容区。
 * 说明：该面板是纯前端测速（浏览器直连节点），不走本机的 udx-speedtest 服务。
 */
function burnPanel() {
    var frame = E('iframe', {
        src : '/fl/',
        'class' : 'bn-frame',
        style : 'width:100%;height:calc(100vh - 148px);border:0;border-radius:12px;' +
                'background:#0a0a0a;display:block'
    });
    return {
        node : E('div', {class : 'bn-embed'}, [ frame ]),
        onSpeed : function() {
            /* 面板自带测速引擎，与本地 speedtest 任务互不影响 */
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
                var burn = burnPanel(status);
                return Promise
                    .all([ connection.form, bands.form, apn.form ])
                    .then(function(forms) {
                        return {
                            status : status,
                            connection : connection,
                            bands : bands,
                            operators : operators,
                            apn : apn,
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

        /* ---- data panel (FlowLoss): its own embedded measurement UI ---- */
        panels.burn = E('div', {class : 'udx-tabpanel'},
                        [ parts.burn.node ]);

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
        /* One subscriber drives the connection guard and the data panel. */
        udx.speedWatch(function(state) {
            parts.connection.onSpeed(state);
            parts.burn.onSpeed(state);
            if (udx.speedRunning())
                banner.show('neutral', _('A speed test is running, so status refresh may lag.'));
        });

        return E('div', {class : 'udx-page'}, [
            banner.node, watchError, tabbar, body
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
