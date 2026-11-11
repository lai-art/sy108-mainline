'use strict';
'require view';
'require ui';
'require udx';

/* Advanced. Everything on this page talks to the baseband directly, so the
 * warning is a permanent red bar at the top rather than a dismissible toast: a
 * user who scrolls here from a search result must not be able to miss it.
 *
 * Two separate panels, not two tabs of one form: the AT terminal is a
 * read-and-poke tool with no save step, the IMEI block writes an identity.
 * Sharing one form made it look like both were "apply on save". */

var QUICK = [
    'AT',
    'AT+CFUN?',
    'AT+CPIN?',
    'AT+COPS?',
    'AT+CSQ',
    'AT+SPIMEI?',
    'AT+CCID',
    'AT+CIMI',
    'AT+SPLBAND=0',
    'AT+SPLBAND=3',
    'AT+SPFORCEFRQ=12,3',
    'AT+SPFORCEFRQ=16,3',
    'AT+CGDCONT?',
    'AT+CGEQOSRDP'
];

function luhnOk(value) {
    if (!/^\d{15}$/.test(value || ''))
        return false;
    var sum = 0;
    for (var i = 0; i < 15; i++) {
        var n = Number(value[i]) * (i % 2 ? 2 : 1);
        sum += Math.floor(n / 10) + n % 10;
    }
    return sum % 10 === 0;
}

return view.extend({
    load : function() {
        return Promise.resolve();
    },
    render : function() {
        udx.injectStyles();
        var warning = udx.banner();
        warning.show('bad',
                     _('Commands on this page are sent straight to the baseband. A wrong band, frequency or IMEI value can leave the device unable to register on any network, and rewriting an IMEI is illegal in many countries. There is no undo here.'));
        /* Sticky so it stays on screen while scrolling a long AT response. */
        warning.node.style.position = 'sticky';
        warning.node.style.top = '0';
        warning.node.style.zIndex = '5';

        /* ---------------- panel 1: AT terminal ---------------- */
        var command = E('input', {type : 'text', 'class' : 'cbi-input-text', value : 'AT'});
        command.style.maxWidth = '420px';
        command.style.fontFamily = 'monospace';
        var timeout = E('input', {type : 'number', 'class' : 'cbi-input-text', value : '10',
                                  min : '1', max : '120', step : '1'});
        timeout.style.maxWidth = '110px';
        var quick = E('select', {'class' : 'cbi-input-select'}, QUICK.map(function(x) {
            return E('option', {value : x}, x);
        }));
        quick.style.maxWidth = '300px';

        var output = E('pre', {'aria-live' : 'polite',
                               style : 'min-height:80px;max-height:340px;overflow:auto;' +
                                       'white-space:pre-wrap;word-break:break-all;' +
                                       'font-family:monospace;font-size:12.5px;' +
                                       'margin:0;padding:8px 10px;border-radius:6px;' +
                                       'background:var(--background-color-low,#f6f7f9);' +
                                       'border:1px solid var(--border-color-low,#e6e8ec)'});
        var outputNote = udx.banner();
        outputNote.node.hidden = true;

        var runButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-action'},
                          _('Send command'));
        /* Each button sits next to the input it sends, so "which one does this
         * send" never has to be guessed. */
        var quickButton = E('button', {type : 'button', 'class' : 'cbi-button'},
                            _('Send quick command'));

        /* One code path for both buttons: print what was sent before the modem
         * answers, then the answer, then the outcome. */
        function wire(text) {
            var ms = Number(timeout.value);
            if (!text)
                throw new Error(_('Enter an AT command first.'));
            if (!isFinite(ms) || ms < 1 || ms > 120)
                throw new Error(_('The timeout must be between 1 and 120 seconds.'));
            output.textContent = '> ' + text + '\n';
            outputNote.hide();
            return udx.execute('at_debug', {command : text, timeout : ms}).then(function(r) {
                output.textContent = '> ' + text + '\n' + (r.response || _('(no answer)'));
                return r;
            }, function(e) {
                var partial = (e.result || {}).response || '';
                output.textContent = '> ' + text + '\n' + (partial || _('(no answer)'));
                /* An uncertain outcome means the command may or may not have
                 * landed. That is a separate, amber case: it is the one state
                 * where trying again can make things worse. */
                if (udx.isUncertain(e))
                    outputNote.show('warn', udx.uncertainText(e));
                else
                    outputNote.show('bad', udx.failureText(e));
                return null;
            });
        }
        runButton.onclick = function() {
            runButton.disabled = true;
            return Promise.resolve()
                .then(function() {
                    return wire((command.value || '').trim());
                })
                .catch(function(e) {
                    ui.addNotification(null, E('p', {}, e.message), 'error');
                })
                .then(function() {
                    runButton.disabled = false;
                });
        };
        quickButton.onclick = function() {
            quickButton.disabled = true;
            return Promise.resolve()
                .then(function() {
                    return wire(quick.value);
                })
                .catch(function(e) {
                    ui.addNotification(null, E('p', {}, e.message), 'error');
                })
                .then(function() {
                    quickButton.disabled = false;
                });
        };

        var at = udx.panel(_('AT terminal'), _('Sent verbatim, one command per click'));
        at.body.appendChild(udx.field(_('AT command'), command,
                                  _('Type the command without a trailing carriage return.')));
        at.body.appendChild(udx.field(_('Timeout (seconds)'), timeout,
                                  _('How long to wait for the modem before giving up.')));
        at.body.appendChild(udx.field(_('Quick command'),
                                      E('div',
                                        {style : 'display:flex;gap:8px;align-items:center;' +
                                                 'flex-wrap:wrap'},
                                        [ quick, quickButton ]),
                                      _('The list covers the commands needed for diagnosis; type anything else above.')));
        at.body.appendChild(E('div', {class : 'udx-field-l', style : 'margin:10px 0 4px'}, _('Response')));
        at.body.appendChild(outputNote.node);
        at.body.appendChild(output);
        at.foot.hidden = false;
        at.foot.appendChild(runButton);

        /* ---------------- panel 2: IMEI ---------------- */
        var identities = [];
        var readback = udx.list([
            [
                _('Identity'),
                function(r) {
                    return 'IMEI ' + r.slot;
                }
            ],
            [
                'IMEI',
                function(r) {
                    return r.imei;
                }
            ],
            [
                _('Status'),
                function(r) {
                    return r.error || (r.written ? _('Written') : _('Read from the device'));
                }
            ]
        ], function(r) {
            return r.slot;
        }, false);

        var index = E('select', {'class' : 'cbi-input-select'});
        index.style.maxWidth = '200px';
        var imeiInput = E('input', {type : 'text', 'class' : 'cbi-input-text', value : '',
                                    placeholder : '15 digits'});
        imeiInput.style.maxWidth = '220px';
        imeiInput.style.fontFamily = 'monospace';
        var imeiNote = E('div', {class : 'udx-note'});
        var imeiResult = udx.banner();
        imeiResult.node.hidden = true;

        var readButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-action'},
                           _('Read IMEI'));
        var writeButton = E('button', {type : 'button', 'class' : 'cbi-button cbi-button-negative'},
                            _('Write IMEI'));
        writeButton.disabled = true;
        writeButton.title =
            _('Read the current IMEI first; writing without a readback risks putting a wrong value on the card slot.');

        function rebuildIdentities() {
            index.textContent = '';
            if (!identities.length) {
                index.appendChild(E('option', {value : ''}, _('Not read yet')));
                index.disabled = true;
                writeButton.disabled = true;
                writeButton.title =
                    _('Read the current IMEI first; writing without a readback risks putting a wrong value on the card slot.');
                return;
            }
            identities.forEach(function(x) {
                index.appendChild(E('option', {value : String(x.slot)}, 'IMEI ' + x.slot));
            });
            /* With one identity there is nothing to choose. */
            index.disabled = identities.length < 2;
            writeButton.disabled = false;
            writeButton.title = '';
            selectIdentity();
        }
        function selectIdentity() {
            var found = identities.filter(function(x) {
                return String(x.slot) === String(index.value);
            })[0] || identities[0];
            if (found) {
                imeiInput.value = found.imei || '';
                imeiNote.textContent =
                    found.slot === 1 ? _('Slot 1 is the identity the modem presents by default.') : '';
            }
        }
        index.onchange = selectIdentity;

        readButton.onclick = function() {
            readButton.disabled = true;
            imeiNote.textContent = _('Reading…');
            imeiResult.hide();
            return udx.execute('imei_read', {}).then(function(r) {
                identities = (r && r.identities) || [];
                readback.update(identities);
                rebuildIdentities();
                if (!identities.length)
                    imeiNote.textContent =
                        _('The modem returned no identity slots, so there is nothing to select.');
                return r;
            }, function(e) {
                imeiNote.textContent = '';
                if (udx.isUncertain(e))
                    imeiResult.show('warn', udx.uncertainText(e));
                else
                    imeiResult.show('bad', udx.failureText(e));
                return null;
            }).then(function() {
                readButton.disabled = false;
            });
        };

        writeButton.onclick = function() {
            var value = (imeiInput.value || '').trim();
            if (!luhnOk(value)) {
                imeiNote.textContent = /^\d{15}$/.test(value)
                                           ? _('The IMEI check digit is wrong; copy it again from the label.')
                                           : _('An IMEI is exactly 15 digits.');
                return null;
            }
            var slot = String(index.value);
            if (!identities.some(function(x) {
                    return String(x.slot) === slot;
                })) {
                imeiNote.textContent = _('Read the current IMEI first.');
                return null;
            }
            writeButton.disabled = true;
            imeiResult.hide();
            return udx
                .confirm(_('Overwrite this IMEI?'),
                         _('Writing an IMEI is permanent for this identity slot. If the value is wrong the modem may refuse to register on any network, and there is no undo from this page. Write') +
                             ' ' + value + ' ' + _('to IMEI') + ' ' + slot + '?',
                         _('Write it'))
                .then(function(ok) {
                    if (!ok)
                        return null;
                    return udx.execute('imei_write', {slot : Number(slot), imei : value})
                        .then(function(r) {
                            identities = (r && r.identities) || identities;
                            readback.update(identities);
                            rebuildIdentities();
                            imeiNote.textContent = _('Written. Read it back to confirm.');
                            return r;
                        }, function(e) {
                            /* The one case where retrying is dangerous: the write
                             * may have landed even though the answer never came. */
                            if (udx.isUncertain(e))
                                imeiResult.show('warn', udx.uncertainText(e));
                            else
                                imeiResult.show('bad', udx.failureText(e));
                            return null;
                        });
                })
                .then(function() {
                    writeButton.disabled = false;
                });
        };

        var imeiPanel = udx.panel(_('IMEI'), _('Read before writing; the readback is the safety net'));
        imeiPanel.body.appendChild(readback.node);
        imeiPanel.body.appendChild(udx.field(_('Identity slot'), index,
                                         _('A device with one slot has nothing to choose here.')));
        imeiPanel.body.appendChild(udx.field('IMEI', imeiInput,
                                         _('15 digits. The last digit is a check digit and is verified before writing.')));
        imeiPanel.body.appendChild(imeiResult.node);
        imeiPanel.body.appendChild(imeiNote);
        imeiPanel.foot.hidden = false;
        imeiPanel.foot.appendChild(readButton);
        imeiPanel.foot.appendChild(writeButton);

        rebuildIdentities();
        readback.update([]);

        return E('div', {class : 'udx-page'}, [
            E('p', {class : 'udx-note', style : 'margin:0 0 12px;font-size:12.5px;opacity:1'},
              _('Diagnostics that do not fit anywhere else. Nothing here is needed for normal use.')),
            warning.node, at.node, imeiPanel.node
        ]);
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
