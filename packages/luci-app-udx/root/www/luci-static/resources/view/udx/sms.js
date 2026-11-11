'use strict';
'require view';
'require form';
'require udx';

return view.extend({
    load : function() {
        return Promise.all(
            [ L.resolveDefault(udx.getHistory(), {}), L.resolveDefault(udx.getSMS(), {}) ]);
    },
    render : function(initial) {
        var settings = initial[0].settings || {}, pending = null, receipt = E('p'),
            storageKey = 'udx-sms-pending-request';
        try {
            pending = sessionStorage.getItem(storageKey);
            if (!/^[0-9a-f]{32}$/.test(pending || ''))
                pending = null;
        } catch (e) {
        }
        function remember(id) {
            pending = id;
            try {
                if (id)
                    sessionStorage.setItem(storageKey, id);
                else
                    sessionStorage.removeItem(storageKey);
            } catch (e) {
            }
        }
        var m = new form.JSONMap({
            main : {
                number : '',
                text : '',
                max_count : String(settings.max_count || 50),
                max_sent_count : String(settings.max_sent_count || 10),
                direct_receive : settings.direct_receive ? '1' : '0'
            }
        },
                                 _('SMS management'));
        var s = m.section(form.NamedSection, 'main', 'main');
        s.anonymous = true;
        /* Reading first, writing second: sending a message is the action people
         * come here for often enough that it should not be the fourth tab. */
        s.tab('inbox', _('Inbox'));
        s.tab('compose', _('Send message'));
        s.tab('sent', _('Sent'));
        s.tab('storage', _('Modem storage'));
        s.tab('settings', _('Settings'));
        function embed(tab, key, node) {
            var o = s.taboption(tab, form.DummyValue, key, '');
            o.renderWidget = function() {
                return node;
            };
        }
        function action(tab, key, label, fn) {
            var o = s.taboption(tab, form.Button, key, label);
            o.inputtitle = label;
            o.inputstyle = 'action';
            o.onclick = function() {
                return udx.notify(fn);
            };
            return o;
        }
        function timestamp(r) {
            var t = r.timestamp || r.received_at;
            return typeof t === 'number' ? new Date(t * 1000).toLocaleString() : t;
        }
        var columns = [
            [
                _('Number'),
                function(r) {
                    return r.peer || r.number;
                }
            ],
            [ _('Time'), timestamp ],
            [
                _('Message'),
                function(r) {
                    return r.text == null ? r.binary_hex || r.decode_error : r.text;
                }
            ],
            [
                _('Status'),
                function(r) {
                    return r.state || (r.read ? _('Read') : _('Unread'));
                }
            ]
        ];
        var inbox = udx.list(columns, function(r) {
            return r.id;
        }, true);
        var sent = udx.list(columns, function(r) {
            return r.id;
        }, true);
        var stored = udx.list(columns, function(r) {
            return r.index + ':' + r.pdu_sha256;
        }, true);
        /* One wording for all three lists. Three different ways of saying "there
         * is nothing here" reads like three different features. */
        var EMPTY_TEXT = _('No messages in this folder.');
        function emptyNote() {
            return E('div', {class : 'udx-empty'}, EMPTY_TEXT);
        }
        function reload() {
            return Promise.all([ udx.getHistory(), udx.getSMS() ]).then(update);
        }
        /* Deleting 120 messages sends three batches. A failure in the first one
         * must not silently skip the other two, and the user has to be told
         * exactly which messages are still there — "deletion incomplete" on its
         * own leaves them clicking the button again. */
        function remove(list, folder, all) {
            var picked = list.selected(all).map(function(r) {
                return {
                    row : r,
                    args : folder ? {folder : folder, id : r.id}
                                  : {index : r.index, pdu_sha256 : r.pdu_sha256}
                };
            });
            if (!picked.length)
                throw new Error(_('No messages selected'));
            var left = [];
            function label(entry) {
                var r = entry.row;
                return (r.peer || r.number || ('#' + (r.index + 1)));
            }
            function note(entry, reason) {
                left.push(label(entry) + (reason ? ' (' + reason + ')' : ''));
            }
            function batch() {
                if (!picked.length)
                    return reload();
                var chunk = picked.splice(0, 50);
                return udx.execute('sms_delete_batch', {
                    items : chunk.map(function(x) {
                        return x.args;
                    })
                }).then(function(r) {
                    var results = r.items || [];
                    chunk.forEach(function(entry, i) {
                        var res = results[i] || {};
                        if (!res.deleted)
                            note(entry, res.error);
                    });
                    return batch();
                }, function(e) {
                    /* The whole batch was rejected: every message in it is still
                     * there, so name all of them and carry on with the next one. */
                    chunk.forEach(function(entry) {
                        note(entry, e && e.message);
                    });
                    return batch();
                });
            }
            return batch().then(function(r) {
                if (!left.length)
                    return r;
                var e = new Error(_('Some messages were not deleted') + ' (' + left.length + '): ' +
                                  left.join('; '));
                e.items = left;
                throw e;
            });
        }
        var emptyNotes = {};
        [[ 'inbox', inbox, 'inbox' ], [ 'sent', sent, 'sent' ], [ 'storage', stored, null ]]
            .forEach(function(spec) {
                emptyNotes[spec[0]] = emptyNote();
                embed(spec[0], '_' + spec[0], E('div', {}, [ emptyNotes[spec[0]], spec[1].node ]));
                action(spec[0], '_delete_' + spec[0], _('Delete selected'), function() {
                    return remove(spec[1], spec[2], false);
                });
                action(spec[0], '_clear_' + spec[0], _('Clear folder'), function() {
                    return remove(spec[1], spec[2], true);
                });
            });
        action('inbox', '_refresh', _('Read messages'), function() {
            return udx.execute('sms_refresh', {}).then(reload);
        });
        var number = s.taboption('compose', form.Value, 'number', _('Recipient number'));
        number.placeholder = '+8613800000000';
        var text = s.taboption('compose', form.TextValue, 'text', _('Message'));
        text.rows = 5;
        embed('compose', '_receipt', receipt);
        action('compose', '_send', _('Send'), function() {
            if (pending)
                throw new Error(
                    _('Check the previous send result before starting another message'));
            var args = {
                number : number.formvalue('main') || '',
                text : text.formvalue('main') || '',
                request_id : udx.randomId()
            };
            remember(args.request_id);
            receipt.textContent = _('Sending');
            return udx.execute('sms_send', args)
                .then(function(r) {
                    remember(null);
                    receipt.textContent = _('Submitted to modem');
                    return reload().then(function() {
                        return r;
                    });
                })
                .catch(function(e) {
                    receipt.textContent = e.message;
                    throw e;
                });
        });
        action('compose', '_check_send', _('Check send result'), function() {
            if (!pending) {
                receipt.textContent = _('No pending message');
                return {};
            }
            return udx.smsReceipt(pending).then(function(r) {
                if (!r.available)
                    throw new Error(r.error || _('Send result unavailable'));
                receipt.textContent =
                    r.state === 'complete' ? _('Submitted to modem') : r.error || r.state;
                if (r.state === 'complete' || r.state === 'failed')
                    remember(null);
                return r;
            });
        });
        action('compose', '_new_message', _('Start another message'), function() {
            remember(null);
            receipt.textContent = '';
            return {};
        });
        if (pending)
            receipt.textContent = _('A previous send result needs checking');
        var maxInbox = s.taboption('settings', form.Value, 'max_count', _('Inbox limit'));
        maxInbox.datatype = 'range(10,150)';
        var maxSent = s.taboption('settings', form.Value, 'max_sent_count', _('Sent limit'));
        maxSent.datatype = 'range(1,50)';
        var direct = s.taboption('settings', form.Flag, 'direct_receive', _('Direct reception'));
        action('settings', '_save_settings', _('Apply settings'), function() {
            return udx.execute('sms_settings', {
                max_count : Number(maxInbox.formvalue('main')),
                max_sent_count : Number(maxSent.formvalue('main')),
                direct_receive : direct.formvalue('main') === '1'
            });
        });
        function fill(list, note, data) {
            list.update(data);
            /* An empty table with only headings looks like a failed load. */
            note.hidden = data.length > 0;
            list.node.hidden = data.length === 0;
        }
        function update(rows) {
            fill(inbox, emptyNotes.inbox, rows[0].inbox || []);
            fill(sent, emptyNotes.sent, rows[0].sent || []);
            fill(stored, emptyNotes.storage, rows[1].messages || []);
        }
        var error = udx.watch(function() {
            return Promise.all([ udx.getHistory(), udx.getSMS() ]);
        }, update, initial);
        return m.render().then(function(node) {
            return E('div', {}, [ node, error ]);
        });
    },
    handleSaveApply : null,
    handleSave : null,
    handleReset : null
});
