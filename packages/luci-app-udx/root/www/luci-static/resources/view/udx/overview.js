'use strict';
'require view';
'require udx';

/* Overview is a read-only dashboard: it answers "is it up, how good is the
 * signal, what am I paying for" in one screen. No form, no readonly inputs, no
 * configuration — changing anything lives in "Mobile network". */
var BRANDS = {
    china_mobile : 'China Mobile',
    china_unicom : 'China Unicom',
    china_telecom : 'China Telecom',
    china_broadnet : 'China Broadnet'
};
var STATE_LABEL = {
    pdp_active : {text : 'Connected', tone : 'ok'},
    idle : {text : 'Disconnected', tone : 'neutral'},
    uncertain : {text : 'Status uncertain', tone : 'warn'},
    waiting_sim : {text : 'Waiting for SIM', tone : 'warn'},
    waiting_radio : {text : 'Waiting for radio', tone : 'warn'},
    waiting_registration : {text : 'Searching for network', tone : 'warn'},
    waiting_attachment : {text : 'Waiting for packet attachment', tone : 'warn'},
    connecting : {text : 'Connecting', tone : 'warn'}
};
var SIM_STATE = {
    READY : {text : 'Ready', tone : 'ok'},
    REFRESHING : {text : 'Reading', tone : 'warn'}
};
/* Most important volume first: a full overlay loses the configuration, a full
 * /tmp only the running state. Never merge them into one percentage. */
var MOUNT_ORDER = [ '/overlay', '/tmp', '/', '/rom' ];
/* The dashboard names a mount by what it is *for*; the path itself is printed
 * underneath, so nothing is hidden. `rootfs` / `overlay` / `tmpfs` are the
 * kernel's own words and stay on the hardware page, where the column header
 * literally reads "Mount point" and a reader is already in df territory. */
var MOUNT_LABEL = {
    '/' : _('System partition'),
    '/rom' : _('System partition, read-only image'),
    '/overlay' : _('Settings and installed packages'),
    '/tmp' : _('Temporary files')
};

return view.extend({
    load : function() {
        return udx.getStatus();
    },
    render : function(initial) {
        udx.injectStyles();
        var snapshot = initial || {};

        function c(d) {
            return udx.cellular(d);
        }
        function operatorText(d) {
            var op = c(d).operator || {};
            return BRANDS[op.brand] ? _(BRANDS[op.brand])
                                    : (op.name || op.short_name || null);
        }
        function ratText(d) {
            var cell = udx.servingCell(d) || {};
            if (!cell.rat)
                return null;
            if (cell.rat === 'nr')
                return ((c(d).nr_capability || {}).mode === 'nsa_only') ? _('5G NSA')
                                                                        : _('5G NR');
            return (cell.rat === 'lte') ? _('4G LTE') : String(cell.rat).toUpperCase();
        }
        function ipv6List(d) {
            var list = (d.cellular_kernel || {}).ipv6_global_addresses || [];
            return list.map(function(x) {
                return (x && x.address) ? x.address : x;
            }).filter(function(x) {
                return typeof x === 'string' && x.length > 0;
            });
        }
        /* Two `mono()` seconds in the same clock domain: the snapshot time minus
         * the moment the PDP came up. netifd's wan.uptime is only a fallback for
         * old firmware that has no connected_uptime yet. */
        function sessionUptime(d) {
            var cellular = c(d), session = cellular.data_session || {},
                wan = ((d.cellular_netifd || {}).wan || {});
            if (session.connected_uptime !== undefined && session.connected_uptime !== null &&
                cellular.uptime !== undefined && cellular.uptime !== null)
                return Math.max(0, Number(cellular.uptime) - Number(session.connected_uptime));
            if (session.uptime !== undefined && session.uptime !== null)
                return Number(session.uptime);
            if (cellular.state === 'pdp_active' && wan.uptime !== undefined && wan.uptime !== null)
                return Number(wan.uptime);
            return null;
        }
        function identifyAge(d) {
            var cellular = c(d), now = cellular.uptime, at = cellular.modem_info_uptime;
            if (now === undefined || now === null || at === undefined || at === null)
                return null;
            return Math.max(0, Number(now) - Number(at));
        }
        /* A pill coloured by an arbitrary signal colour rather than by a token. */
        function setSignalPill(node, quality, fallback) {
            udx.setPill(node, quality ? quality.label : fallback, 'neutral');
            if (quality) {
                node.style.color = quality.color;
                node.style.background = 'transparent';
                node.style.borderColor = quality.color;
            }
            return node;
        }
        /* `error` describes the whole probe object and is populated in perfectly
         * healthy states: "No IPv6 address" on every v4-only session, and
         * "Not sampled yet" for the first second after boot. Painting the row
         * red on a non-empty error turns every v4-only user into a fake alarm,
         * so the message is only ever used as the reason text; red is reserved
         * for a probe that actually failed.
         *
         * Freshness comes from `age_seconds`, never from subtracting `at`
         * against the browser clock (the device RTC can jump). */
        function latency(d, family) {
            var value = d.latency;
            if (!value)
                return {text : _('Not enabled'), tone : null, reason : null};

            var error = String(value.error || '');
            /* No `ping` in the image: nothing will ever fill these rows in, so
             * they must not sit on "Measuring" forever and must not go red —
             * the link is fine, the probe simply cannot run. Grey, with the
             * reason stated once underneath. */
            if (/ping is not installed/i.test(error))
                return {text : _('No ping tool'), tone : null,
                        reason : _('This firmware has no ping tool installed, so latency cannot be measured.')};
            var age = (value.age_seconds === null || value.age_seconds === undefined ||
                       !isFinite(Number(value.age_seconds))) ? null
                                                                : Number(value.age_seconds);
            var reason = error || null;
            if (age !== null && age >= 60)
                reason = (reason ? reason + ' · ' : '') + _('last sample: %s')
                                                             .replace('%s', udx.ageText(age) || '');

            if (family === 'ipv6' && !ipv6List(d).length)
                return {text : _('No IPv6 address'), tone : null, reason : reason};

            var ms = value[family + '_ms'];
            if (ms !== null && ms !== undefined && isFinite(Number(ms)))
                return {text : Math.round(Number(ms)) + ' ms',
                        /* A number nobody refreshed is not a fresh measurement. */
                        tone : (age !== null && age >= 60) ? null : udx.level('latency', ms),
                        reason : reason};

            if (value.at === null || value.at === undefined)
                return {text : _('Measuring'), tone : null, reason : reason};
            if (/not sampled/i.test(error))
                return {text : _('Measuring'), tone : null, reason : reason};
            if (/no ipv6/i.test(error))
                return {text : _('No IPv6 address'), tone : null, reason : reason};
            if (new RegExp(family, 'i').test(error))
                return {text : (age !== null && age >= 60) ? _('Not available') : _('Timed out'),
                        tone : (age !== null && age >= 60) ? null : 'bad',
                        reason : reason};
            return {text : _('Not available'), tone : null, reason : reason};
        }

        /* ---------------- card 1: signal ---------------- */
        var signal = udx.card(_('Signal'));
        var signalMain = udx.main('dBm'), signalBar = udx.bar();
        var rsrq = udx.row('RSRQ'), sinr = udx.row('SINR');
        signal.body.appendChild(signalMain.node);
        signal.body.appendChild(signalBar.node);
        signal.body.appendChild(rsrq.node);
        signal.body.appendChild(sinr.node);

        /* ---------------- card 2: network ---------------- */
        var network = udx.card(_('Network'));
        var operator = udx.main();
        var band = udx.row(_('Band / bandwidth')), pci = udx.row(_('PCI / ARFCN'));
        network.body.appendChild(operator.node);
        network.body.appendChild(band.node);
        network.body.appendChild(pci.node);

        /* ---------------- card 3: SIM ---------------- */
        var sim = udx.card(_('SIM'));
        var simMain = udx.main();
        var iccid = udx.row('ICCID'), identified = udx.row(_('Last identified'));
        sim.body.appendChild(simMain.node);
        sim.body.appendChild(iccid.node);
        sim.body.appendChild(identified.node);

        /* ---------------- card 4: data ---------------- */
        var data = udx.card(_('Data'));
        var uptime = udx.main();
        var ipv4 = udx.row('IPv4'), ipv6 = udx.row('IPv6');
        data.body.appendChild(uptime.node);
        data.body.appendChild(ipv4.node);
        data.body.appendChild(ipv6.node);

        /* ---------------- card 5: rate and class ---------------- */
        var rate = udx.card(_('Rate and class'));
        var down = udx.main('Mbps'), up = udx.main('Mbps');
        var downBox = E('div', {}, [ E('div', {class : 'udx-lb'}, '↓ ' + _('Downlink')),
                                     down.node ]);
        var upBox = E('div', {}, [ E('div', {class : 'udx-lb'}, '↑ ' + _('Uplink')), up.node ]);
        var classLine = E('div', {class : 'udx-note',
                                  style : 'font-size:11.5px;margin:3px 0 7px;padding-bottom:7px;' +
                                          'border-bottom:1px solid var(--udx-line);opacity:1'});
        var mbr = udx.row(_('MBR peak up / down'));
        var ping4 = udx.row(_('IPv4 latency')), ping6 = udx.row(_('IPv6 latency'));
        /* A permanently missing `ping` is not a fault of the network and not a
         * temporary state, so it needs one plain visible sentence — the row
         * value alone would leave the user guessing why it says nothing. */
        var latencyNote = E('div', {class : 'udx-note'});
        rate.body.appendChild(E('div', {class : 'udx-sp'}, [ downBox, upBox ]));
        rate.body.appendChild(classLine);
        rate.body.appendChild(mbr.node);
        rate.body.appendChild(ping4.node);
        rate.body.appendChild(ping6.node);
        rate.body.appendChild(latencyNote);
        /* The device can only read the value the network granted. Labelling it
         * "plan rate" would send users to their carrier page to compare. */
        rate.body.appendChild(E('div', {class : 'udx-note'},
                                _('Session-AMBR granted by the network. It usually equals the plan rate and shows the throttled value once throttling applies.')));

        /* ---------------- card 6: temperature ---------------- */
        var thermal = udx.card(_('Device temperature'));
        var thermalMain = udx.main('℃'), thermalBar = udx.bar();
        var socRow = udx.row(_('SoC')), modemRow = udx.row(_('Baseband'));
        thermal.body.appendChild(thermalMain.node);
        thermal.body.appendChild(thermalBar.node);
        thermal.body.appendChild(socRow.node);
        thermal.body.appendChild(modemRow.node);

        /* ---------------- card 7: storage (wide) ---------------- */
        var storage = udx.card(_('Disk space'), {wide : true});

        /* ---------------- recent events + actions ---------------- */
        var events = udx.panel(_('Recent events'), _('Last 20, this session only'));
        var eventBody = E('div', {});
        events.body.appendChild(eventBody);
        events.foot.hidden = false;
        var refresh = udx.button(_('Refresh'), function() {
            return udx.getStatus().then(function(d) {
                update(d);
                return d;
            });
        });
        var reconnect = udx.button(_('Reconnect data'), function() {
            return udx.execute('disconnect', {}).then(function() {
                return udx.execute('connect', {automatic : false});
            });
        });
        var diagnose = E('a', {class : 'cbi-button cbi-button-action', href : L.url('admin/udx/sim')},
                         _('SIM problem? Go to diagnostics'));
        events.foot.appendChild(refresh);
        events.foot.appendChild(reconnect);
        events.foot.appendChild(E('span', {class : 'udx-right'}, diagnose));

        var banner = udx.banner();

        function sensorValue(d, names) {
            var rows = d.thermal || [], found = [];
            rows.forEach(function(r) {
                if (names.indexOf(r.name) >= 0 && r.temperature_c !== null &&
                    r.temperature_c !== undefined)
                    found.push(Number(r.temperature_c));
            });
            return found.length ? Math.max.apply(null, found) : null;
        }
        function storageRows(d) {
            var rows = (d.storage || []).slice();
            rows.sort(function(a, b) {
                var ai = MOUNT_ORDER.indexOf(a.mount), bi = MOUNT_ORDER.indexOf(b.mount);
                return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
            });
            return rows;
        }

        function updateEvents(d) {
            var list = udx.accumulateEvents(d);
            eventBody.textContent = '';
            if (!list.length) {
                eventBody.appendChild(E('div', {class : 'udx-empty'},
                                        _('No events yet. Network, SIM and cell changes will be listed here.')));
                return;
            }
            list.forEach(function(e) {
                eventBody.appendChild(E('div', {class : 'udx-evt'}, [
                    E('time', {}, e.time || '--:--'), E('span', {}, e.text)
                ]));
            });
        }

        /* Top banner, in priority order: a card being read, a card that cannot
         * be read, an uncertain modem state, a speed test in progress, a stale
         * snapshot. The first three are real problems and stay loud. A speed
         * test makes the telemetry lag by design, so during a run the stale
         * warning drops to a grey line instead of an amber alarm — and it is
         * not simply hidden, because "the numbers are a bit old" is still
         * information the user needs. */
        function paintBanner(d) {
            if (!d)
                return;
            var cellular = c(d), simState = (cellular.sim || {}).state;
            if (simState === 'REFRESHING')
                banner.show('warn', _('The card is being read. Identity fields stay blank until the modem answers.'));
            else if (simState !== 'READY')
                banner.show('bad',
                            _('The SIM card is not readable. Check that the card is seated the right way round and in the right slot; if it is, the card itself may have failed.'));
            else if (cellular.state === 'uncertain')
                banner.show('warn', udx.uncertainText({}));
            else if (udx.speedRunning())
                banner.show('neutral', _('A speed test is running, so status refresh may lag.'));
            else if (cellular.stale) {
                var age = udx.ageText(cellular.snapshot_age_seconds);
                banner.show('warn', age ? _('The data may be out of date; last updated') + ' ' + age
                                        : _('The data may be out of date; refresh to update it.'));
            }
            else
                banner.hide();
        }

        function update(d) {
            snapshot = d;
            var cellular = c(d), cell = udx.servingCell(d) || {}, simState = (cellular.sim || {}).state;
            var live = cellular.state === 'pdp_active';

            paintBanner(d);

            /* ---- 1 signal ---- */
            var quality = udx.signalQuality('rsrp', cell.rsrp);
            setSignalPill(signal.badge, quality, live ? _('Not available') : _('Searching'));
            signalMain.set(quality ? String(cell.rsrp) : (live ? _('Not available')
                                                               : _('Searching')),
                           {unit : quality ? 'dBm' : ''});
            signalBar.set(quality ? quality.score : 0, 'neutral');
            if (quality) {
                signalBar.fill.style.background = quality.color;
                var rq = udx.signalQuality('rsrq', cell.rsrq),
                    sq = udx.signalQuality('sinr', cell.sinr);
                rsrq.set((cell.rsrq === undefined || cell.rsrq === null)
                             ? _('Not available')
                             : String(cell.rsrq) + ' dB');
                rsrq.value.style.color = rq ? rq.color : '';
                sinr.set((cell.sinr === undefined || cell.sinr === null)
                             ? _('Not available')
                             : String(cell.sinr) + ' dB');
                sinr.value.style.color = sq ? sq.color : '';
            }
            else {
                rsrq.set(_('Not available'));
                sinr.set(_('Not available'));
            }

            /* ---- 2 network ---- */
            var op = operatorText(d), rat = ratText(d);
            network.setBadge(rat || (live ? _('Unknown') : _('Searching')),
                             rat ? 'teal' : 'neutral');
            operator.set(op || (live ? _('Unknown') : _('Searching')));
            var bandwidth = (cell.bandwidth_mhz === undefined || cell.bandwidth_mhz === null)
                                ? null
                                : cell.bandwidth_mhz + ' MHz';
            band.set([ cell.band || cell.band_candidates, bandwidth ]
                         .filter(function(x) {
                             return x !== null && x !== undefined && x !== '';
                         }).join(' · ') ||
                     _('Not available'));
            pci.set([ (cell.pci === undefined || cell.pci === null) ? null : 'PCI ' + cell.pci,
                      (cell.arfcn === undefined || cell.arfcn === null) ? null
                                                                       : 'ARFCN ' + cell.arfcn ]
                        .filter(Boolean).join(' · ') ||
                    _('Not available'));

            /* ---- 3 SIM ---- */
            var physical = cellular.physical_sim || {}, slot = physical.slot;
            var simInfo = SIM_STATE[simState] || {text : simState, tone : 'bad'};
            sim.setBadge(simState ? _(simInfo.text) : _('No card'), simInfo.tone);
            if (slot === undefined || slot === null) {
                simMain.set(_('No card detected'), {tone : 'bad'});
                iccid.set(_('Not available'));
                identified.set(_('Not available'));
            }
            else {
                simMain.set('SIM ' + (slot + 1));
                iccid.set(simState === 'READY' ? (udx.maskIccid(cellular.iccid) || _('Not available'))
                                               : _('Not available'));
                var age = identifyAge(d);
                identified.set(simState === 'READY'
                                   ? (udx.ageText(age) || _('Not available'))
                                   : _('Not available'));
            }

            /* ---- 4 data ---- */
            var label = STATE_LABEL[cellular.state] || {text : cellular.state, tone : 'neutral'};
            data.setBadge(label.text ? _(label.text) : _('Unknown'), label.tone);
            uptime.set(udx.durationText(sessionUptime(d)));
            var addresses = ipv6List(d);
            ipv4.set((cellular.data_session || {}).ipv4 || _('Not available'));
            ipv6.set(addresses.length ? addresses[0] : _('Not available'));

            /* ---- 5 rate and class ---- */
            var qos = cellular.qos || {}, info = udx.qciInfo(qos.qci, qos.kind);
            rate.setBadge(info.badge, info.tone);
            down.set(udx.rateText(qos.ambr_downlink_kbps));
            up.set(udx.rateText(qos.ambr_uplink_kbps));
            down.value.style.color = up.value.style.color = '';
            classLine.textContent = '';
            classLine.appendChild(E('b', {style : 'color:var(--udx-text);font-weight:600'},
                                   info.text));
            var mbrUp = udx.rateText(qos.mbr_uplink_kbps),
                mbrDown = udx.rateText(qos.mbr_downlink_kbps);
            mbr.set(mbrUp || mbrDown ? [ mbrUp || '—', mbrDown || '—' ].join(' / ') + ' Mbps'
                                     : null);
            var l4 = latency(d, 'ipv4'), l6 = latency(d, 'ipv6');
            ping4.set(l4.text, l4.tone);
            ping6.set(l6.text, l6.tone);
            /* The probe's own wording ("No IPv6 address", "IPv4 probe failed")
             * is the only thing that explains a grey or red row, so keep it. */
            ping4.node.title = l4.reason || '';
            ping6.node.title = l6.reason || '';
            latencyNote.textContent =
                /ping is not installed/i.test(String(((d.latency || {}).error) || ''))
                    ? _('This firmware has no ping tool installed, so latency cannot be measured.')
                    : '';

            /* ---- 6 temperature: max, never the average ---- */
            var temps = (d.thermal || []).filter(function(r) {
                return r.temperature_c !== null && r.temperature_c !== undefined &&
                       isFinite(Number(r.temperature_c));
            });
            if (!temps.length) {
                thermal.setBadge(_('No data'), 'neutral');
                thermalMain.set(_('Not available'));
                thermalBar.set(0, 'neutral');
                socRow.set(_('Not available'));
                modemRow.set(_('Not available'));
            }
            else {
                var hottest = temps.reduce(function(a, b) {
                    return Number(a.temperature_c) >= Number(b.temperature_c) ? a : b;
                });
                var peak = Number(hottest.temperature_c), key = udx.level('temperature', peak);
                thermal.setBadge(key === 'bad' ? _('Overheating')
                                                : key === 'warn' ? _('Warm') : _('Normal'),
                                 key || 'neutral');
                thermalMain.set(peak.toFixed(1), {tone : key});
                thermalBar.set((peak - 20) / 75 * 100, key);
                var soc = sensorValue(d, [ 'soc-thermal' ]),
                    modem = sensorValue(d, [ 'nrcp-thermal' ]);
                socRow.set(soc === null ? _('Not available') : soc.toFixed(1) + ' ℃',
                           udx.level('temperature', soc));
                modemRow.set(modem === null ? _('Not available') : modem.toFixed(1) + ' ℃',
                             udx.level('temperature', modem));
            }

            /* ---- 7 storage: one row per volume ---- */
            var rows = storageRows(d);
            storage.body.textContent = '';
            storage.body.appendChild(E('div', {class : 'udx-note', style : 'margin:0 0 4px;opacity:1'},
                                       _('Below 70% is normal, 70-85% is filling up, above 85% needs attention. Read-only volumes are listed but not coloured.')));
            if (!rows.length) {
                storage.body.appendChild(E('div', {class : 'udx-empty'},
                                           _('No filesystem information available.')));
            }
            rows.forEach(function(volume) {
                var total = volume.total_bytes, free = volume.free_bytes;
                var used = (total === null || total === undefined || free === null ||
                            free === undefined)
                               ? null
                               : Number(total) - Number(free);
                var pct = (used === null || !Number(total)) ? null : used / Number(total) * 100;
                var key2 = volume.readonly ? 'neutral' : udx.level('storage', pct);
                var volumeBar = udx.bar();
                volumeBar.set(volume.readonly ? 100 : (pct === null ? 0 : pct),
                              volume.readonly ? 'neutral' : (key2 || 'neutral'));
                var valueText;
                if (volume.readonly) {
                    valueText = E('span', {}, [
                        E('b', {}, udx.bytesText(total) || '—'), ' · ' + _('Read only')
                    ]);
                }
                else if (used === null) {
                    valueText = E('span', {}, _('Not available'));
                }
                else {
                    valueText = E('span', {}, [
                        E('b', {style : 'color:' + udx.tone(key2).fg}, udx.bytesText(used)),
                        ' / ' + (udx.bytesText(total) || '—')
                    ]);
                }
                storage.body.appendChild(E('div', {class : 'udx-disk'}, [
                    E('div', {class : 'udx-disk-nm'}, [
                        E('b', {}, MOUNT_LABEL[volume.mount] || volume.mount),
                        E('span', {style : 'font-size:10.5px;opacity:.8'},
                          volume.mount + (volume.readonly ? ' · ' + _('Read only') : ''))
                    ]),
                    E('div', {class : 'udx-disk-bd'}, volumeBar.node),
                    E('div', {class : 'udx-disk-vl'}, valueText)
                ]));
            });

            updateEvents(d);

            /* ---- action availability: fail-open on stale snapshots ---- */
            var reason = udx.readonlyReason(d, 'connect');
            reconnect.disabled = !!reason;
            reconnect.title = reason || '';
            refresh.disabled = false;
        }

        var error = udx.watch(udx.getStatus, update, initial);
        /* The banner depends on the test state as well as the snapshot, and the
         * snapshot may be up to five seconds old when a run starts or ends. */
        udx.speedWatch(function() {
            paintBanner(snapshot);
        });
        return E('div', {class : 'udx-page'}, [
            E('p', {class : 'udx-note', style : 'margin:0 0 14px;font-size:12.5px;opacity:1'},
              _('Read-only dashboard. Change settings in "Mobile network"; diagnose SIM problems in "SIM card".')),
            banner.node, error,
            E('div', {class : 'udx-cards'},
              [ signal.node, network.node, sim.node, data.node, rate.node, thermal.node,
                storage.node ]),
            events.node
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
