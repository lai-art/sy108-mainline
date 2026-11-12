'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require udx';

/* Hardware and platform. The page is a list of named blocks and nothing else:
 * adding a block means appending one entry to `registry`, not editing a `titles`
 * map somewhere else and remembering to unshift the form into the right array.
 * CPU frequency is its own tab rather than a form appended to the end of the
 * sensor tab, where it had no heading and looked like a stray widget. */
return view.extend({
    load : function() {
        return Promise.all([ udx.getStatus(), uci.load('udx-usb'), udx.frequencyStatus() ]);
    },
    render : function(initial) {
        var m = new form.Map('udx-usb');
        var s = m.section(form.NamedSection, 'main', 'gadget');
        s.anonymous = true;
        var clocks = new form.JSONMap({main : {}});
        var f = clocks.section(form.NamedSection, 'main', 'frequency');
        f.anonymous = true;

        function mib(v) {
            return v == null ? null : (v / 1048576).toFixed(1) + ' MiB';
        }
        function mhz(v) {
            return v == null ? null : (v / 1000000).toFixed(0) + ' MHz';
        }
        /* A section wrapper for lists that have no heading of their own. */
        function block(title, node, hint) {
            var body = [ E('h3', {}, title) ];
            if (hint)
                body.push(E('p', {}, hint));
            body.push(node);
            return E('section', {class : 'cbi-section'}, body);
        }

        var board = udx.table(_('Board information'), [
            [
                _('Model'),
                function(d) {
                    return (d.board || {}).model;
                }
            ],
            [
                _('Board name'),
                function(d) {
                    return (d.board || {}).board_name;
                }
            ],
            [
                _('System'),
                function(d) {
                    return (d.board || {}).system;
                }
            ],
            [
                _('Hostname'),
                function(d) {
                    return (d.board || {}).hostname;
                }
            ],
            [
                _('Firmware version'),
                function(d) {
                    return ((d.board || {}).release || {}).description;
                }
            ],
            [
                _('Kernel'),
                function(d) {
                    return (d.board || {}).kernel;
                }
            ],
            [
                _('Target'),
                function(d) {
                    return ((d.board || {}).release || {}).target;
                }
            ],
            [
                _('Uptime'),
                function(d) {
                    return Math.floor((d.system_info || {}).uptime || d.sample_uptime || 0);
                },
                ' s'
            ],
            [
                _('Load average'),
                function(d) {
                    return ((d.system_info || {}).load || []).map(function(x) {
                        return (x / 65536).toFixed(2);
                    });
                }
            ]
        ]);
        var memory = udx.table(_('Memory'), [
            [
                _('Total'),
                function(d) {
                    return mib((d.memory || {}).total);
                }
            ],
            [
                _('Available memory'),
                function(d) {
                    return mib((d.memory || {}).available);
                }
            ],
            [
                _('Free'),
                function(d) {
                    return mib((d.memory || {}).free);
                }
            ],
            [
                _('Buffered'),
                function(d) {
                    return mib((d.memory || {}).buffered);
                }
            ],
            [
                _('Page cache'),
                function(d) {
                    return mib((d.memory || {}).cached);
                }
            ],
            [
                _('Swap total'),
                function(d) {
                    return mib((d.swap || {}).total);
                }
            ],
            [
                _('Swap free'),
                function(d) {
                    return mib((d.swap || {}).free);
                }
            ]
        ]);
        var runtime = udx.table(_('Platform services'), [
            [
                _('Core service'),
                function(d) {
                    return (d.runtime || {}).core;
                }
            ],
            [
                _('Modem service'),
                function(d) {
                    return (d.runtime || {}).baseband;
                }
            ],
            [
                _('CP/NV error'),
                function(d) {
                    return (d.runtime || {}).cpnv_error;
                }
            ],
            [
                _('Runtime error'),
                function(d) {
                    return (d.runtime || {}).error || _('None');
                }
            ]
        ]);

        /* Thermal zone names are kernel device-tree labels; map the known ones to
         * readable names and fall back to the raw label minus the -thermal suffix. */
        var SENSOR_LABELS = {
            'apcpu0-thermal' : _('AP core 0'),
            'apcpu1-thermal' : _('AP core 1'),
            'nrcp-thermal' : _('5G baseband'),
            'ank0-thermal' : _('ANK core 0'),
            'ank1-thermal' : _('ANK core 1'),
            'cluster0-thermal' : _('CPU cluster 0'),
            'soc-thermal' : _('SoC'),
            'pa-thermal' : _('4G power amplifier'),
            'pa5g-thermal' : _('5G power amplifier'),
            'board-thermal' : _('Board')
        };
        function sensorLabel(name) {
            if (SENSOR_LABELS[name])
                return SENSOR_LABELS[name];
            return String(name || '').replace(/-thermal$/, '') || '—';
        }
        /* Colour bands come from the shared token table in udx.js so this page
         * and the overview cannot disagree about what "hot" means. The bar maps
         * 20..95 C onto 0..100 %. */
        function temperatureBar(v) {
            if (v === null || v === undefined || v === '')
                return E('span', {}, '—');
            var t = Number(v);
            if (!isFinite(t))
                return E('span', {}, '—');
            var color = udx.tone(udx.level('temperature', t) || 'neutral').solid;
            var pct = Math.max(0, Math.min(100, (t - 20) / 75 * 100));
            return E('div', {style : 'display:flex;align-items:center;gap:10px'},
                     [ E('div',
                         {style : 'flex:1 1 120px;height:8px;border-radius:4px;' +
                                   'background:rgba(128,128,128,0.25);overflow:hidden'},
                         E('div',
                           {style : 'height:100%;border-radius:4px;background:' + color +
                                     ';width:' + pct.toFixed(1) + '%'})),
                       E('span',
                         {style : 'font-variant-numeric:tabular-nums;font-weight:600;color:' +
                                   color + ';min-width:76px;text-align:right'},
                         t.toFixed(1) + ' °C') ]);
        }
        var temperatures = udx.list([
            [
                _('Sensor'),
                function(r) {
                    return sensorLabel(r.name);
                }
            ],
            [
                _('Temperature'),
                function(r) {
                    return r.temperature_c;
                },
                function(v) {
                    return temperatureBar(v);
                }
            ]
        ], function(r) {
            return r.id || r.name;
        }, false);
        var cpus = udx.list([
            [
                _('CPU policy'),
                function(r) {
                    return r.policy;
                }
            ],
            [
                _('Current frequency'),
                function(r) {
                    return r.current_khz == null ? null : r.current_khz / 1000 + ' MHz';
                }
            ],
            [
                _('Governor'),
                function(r) {
                    return r.governor;
                }
            ],
            [
                _('Minimum frequency'),
                function(r) {
                    return r.min_khz == null ? null : r.min_khz / 1000 + ' MHz';
                }
            ],
            [
                _('Maximum frequency'),
                function(r) {
                    return r.max_khz == null ? null : r.max_khz / 1000 + ' MHz';
                }
            ]
        ], function(r) {
            return r.policy;
        }, false);
        var ddr = udx.list([
            [
                _('Device'),
                function(r) {
                    return r.name;
                }
            ],
            [
                _('Current frequency'),
                function(r) {
                    return mhz(r.current_hz);
                }
            ],
            [
                _('Available frequencies'),
                function(r) {
                    return (r.available_frequencies || '').trim().split(/\s+/)
                        .filter(Boolean).map(function(hz) { return mhz(+hz); }).join(', ');
                }
            ]
        ], function(r) {
            return r.name;
        }, false);

        var frequency = initial[2] || {}, cpuPolicy = frequency.cpu || {};
        function setting(key, title, options, selected, numeric) {
            var o = f.option(form.ListValue, key, title);
            options.forEach(function(v) {
                o.value(String(v), numeric ? (v / numeric) + ' MHz' : v);
            });
            o.cfgvalue = function() {
                return selected == null ? null : String(selected);
            };
            o.rmempty = false;
            return o;
        }
        var cpuGovernor = setting('_cpu_governor', _('CPU governor'), cpuPolicy.governors || [],
                                  cpuPolicy.governor);
        var cpuMinimum = setting('_cpu_minimum', _('CPU minimum frequency'),
                                 cpuPolicy.frequencies_khz || [], cpuPolicy.min_khz, 1000);
        var cpuMaximum = setting('_cpu_maximum', _('CPU maximum frequency'),
                                 cpuPolicy.frequencies_khz || [], cpuPolicy.max_khz, 1000);
        cpuMaximum.description = _('Set the same minimum and maximum for a fixed CPU frequency.');
        var frequencyApply =
            f.option(form.Button, '_frequency_apply', _('Apply CPU frequency settings'));
        frequencyApply.inputtitle = _('Apply');
        frequencyApply.inputstyle = 'apply';
        frequencyApply.description = _('Settings are saved and restored at startup.');
        frequencyApply.onclick = function() {
            return udx.notify(function() {
                if (+cpuMinimum.formvalue('main') > +cpuMaximum.formvalue('main'))
                    throw new Error(_('Minimum frequency must not exceed maximum frequency.'));
                return udx.frequencyApply(cpuGovernor.formvalue('main'),
                                          cpuMinimum.formvalue('main'),
                                          cpuMaximum.formvalue('main'));
            });
        };

        var boot = udx.table(_('Boot information'), [
            [
                _('Running system'),
                function(d) {
                    return (d.boot || {}).target;
                }
            ],
            [
                _('Boot policy'),
                function(d) {
                    return (d.boot || {}).policy;
                }
            ],
            [
                _('Root filesystem'),
                function(d) {
                    return (d.board || {}).rootfs_type;
                }
            ],
            [
                _('Root marker'),
                function(d) {
                    return (d.boot || {}).root_marker;
                }
            ]
        ]);
        var filesystems = udx.list([
            [
                _('Mount point'),
                function(r) {
                    return r.mount;
                }
            ],
            [
                _('Filesystem'),
                function(r) {
                    return r.type;
                }
            ],
            [
                _('Total'),
                function(r) {
                    return mib(r.total_bytes);
                }
            ],
            [
                _('Available'),
                function(r) {
                    return mib(r.free_bytes);
                }
            ],
            [
                _('Read only'),
                function(r) {
                    return r.readonly;
                }
            ]
        ], function(r) {
            return r.mount;
        }, false);
        var volumes = udx.list([
            [
                _('Volume'),
                function(r) {
                    return r.name;
                }
            ],
            [
                _('Device'),
                function(r) {
                    return r.device;
                }
            ],
            [
                _('Type'),
                function(r) {
                    return r.type;
                }
            ],
            [
                _('Data size'),
                function(r) {
                    return mib(r.data_bytes);
                }
            ],
            [
                _('Reserved eraseblocks'),
                function(r) {
                    return r.reserved_ebs;
                }
            ]
        ], function(r) {
            return r.device;
        }, false);

        var profile = s.option(form.ListValue, 'profile', _('USB mode'));
        profile.value('ncm', _('NCM hardware acceleration'));
        profile.value('ncm-software', _('NCM software mode'));
        profile.value('rndis', _('RNDIS hardware acceleration'));
        profile.value('rndis-software', _('RNDIS software mode'));
        profile.value('ecm', _('CDC-ECM mode'));
        var acm = s.option(form.Flag, 'acm', _('Authenticated ACM console'));
        var apply = s.option(form.Button, '_apply', _('Apply USB configuration'));
        apply.inputtitle = _('Apply');
        apply.inputstyle = 'apply';
        apply.description = _('Changing USB mode restarts the device. Changing ACM reconnects USB.');
        apply.onclick = function() {
            return udx.notify(function() {
                return udx.usb(profile.formvalue('main'), acm.formvalue('main') === '1');
            });
        };
        var usb = udx.table(_('USB status'), [
            [
                _('Mode'),
                function(d) {
                    return (d.usb || {}).profile;
                }
            ],
            [
                _('ACM console'),
                function(d) {
                    var r = (d.usb || {}).acm;
                    return r == null ? null : r === '1';
                }
            ],
            [
                'UDC',
                function(d) {
                    return (d.usb || {}).udc;
                }
            ],
            [
                _('Connection'),
                function(d) {
                    return (d.usb || {}).state;
                }
            ],
            [
                _('Speed'),
                function(d) {
                    return (d.usb || {}).speed;
                }
            ],
            [
                _('Hardware acceleration'),
                function(d) {
                    var r = (d.usb || {}).offload_state;
                    return r == null ? null : /\brunning=1\b/.test(r);
                }
            ],
            [
                _('Device MAC'),
                function(d) {
                    return (d.usb || {}).dev_mac;
                }
            ],
            [
                _('Host MAC'),
                function(d) {
                    return (d.usb || {}).host_mac;
                }
            ],
            [
                _('Serial number'),
                function(d) {
                    return (d.usb || {}).serial;
                }
            ],
            [
                _('Apply result'),
                function(d) {
                    return (d.usb || {}).result;
                }
            ]
        ]);

        var error = udx.watch(udx.getStatus, function(d) {
            board.update(d);
            memory.update(d);
            runtime.update(d);
            boot.update(d);
            usb.update(d);
            temperatures.update(d.thermal || []);
            cpus.update(d.cpu || []);
            ddr.update(d.ddr || []);
            filesystems.update(d.storage || []);
            volumes.update(d.ubi || []);
        }, initial[0]);

        return Promise.all([ m.render(), clocks.render() ]).then(function(forms) {
            /* Order here is the order of the tabs on screen. */
            var registry = [
                {
                    id : 'system',
                    title : _('Board and system'),
                    render : function() {
                        return [ board.node, memory.node, runtime.node ];
                    }
                },
                {
                    id : 'sensors',
                    title : _('Sensors'),
                    render : function() {
                        return [
                            block(_('Temperatures'), temperatures.node)
                        ];
                    }
                },
                {
                    id : 'frequency',
                    title : _('CPU frequency'),
                    render : function() {
                        return [
                            block(_('CPU clocks'), cpus.node),
                            block(_('DDR clocks'), ddr.node,
                                  _('DDR is managed automatically by firmware. Monitoring only.')),
                            E('p', {class : 'udx-note', style : 'opacity:1;margin-bottom:8px'},
                              _('Changing the governor or the frequency range applies immediately and survives a reboot.')),
                            forms[1]
                        ];
                    }
                },
                {
                    id : 'storage',
                    title : _('Boot and storage'),
                    render : function() {
                        return [
                            boot.node, block(_('Filesystems'), filesystems.node),
                            block(_('UBI volumes'), volumes.node)
                        ];
                    }
                },
                {
                    id : 'usb',
                    title : _('USB'),
                    render : function() {
                        return [ forms[0], usb.node ];
                    }
                }
            ];
            var tabs = E('div', {}, registry.map(function(p) {
                return E('div', {'data-tab' : p.id, 'data-tab-title' : p.title}, p.render());
            }));
            var page = E('div', {}, [ E('h2', {}, _('Hardware and platform')), tabs, error ]);
            ui.tabs.initTabGroup(tabs.childNodes);
            return page;
        });
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
