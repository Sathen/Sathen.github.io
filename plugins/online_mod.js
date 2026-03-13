/**
 * Uakino Lampa Plugin
 * Adds a "Uakino" button on movie/series detail pages, searches uakino.best,
 * and plays M3U8 streams via the Lampa player.
 */
(function () {
    'use strict';

    var BASE_URL  = 'https://uakino.best';
    var BLACKLIST = /\/news\/|\/franchise\//;

    // ── CORS proxy support ────────────────────────────────────────────────────
    // On Android TV, network.native() uses Android's native HTTP (no CORS).
    // In a browser, prepend the proxy URL from Lampa's shared setting.

    function prox(url) {
        var p = Lampa.Storage.get('online_proxy_all', '');
        if (!p) return url;
        if (p.slice(-1) !== '/') p += '/';
        return p + url;
    }

    // ── Template fallback (provided by online.js when installed) ─────────────

    function ensureTemplates() {
        try { Lampa.Template.get('online', {}); }
        catch (e) {
            Lampa.Template.add('online',
                '<div class="online selector">' +
                '<div class="online__body">' +
                '<div class="online__title">{title}</div>' +
                '<div class="online__quality">{quality}{info}</div>' +
                '</div></div>'
            );
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    function titleSimilarity(a, b) {
        if (!a || !b) return 0;
        a = a.toLowerCase().trim();
        b = b.toLowerCase().trim();
        if (a === b) return 1;
        if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.8;
        var wa = a.split(/\s+/);
        var wb = b.split(/\s+/);
        var common = wa.filter(function (w) { return wb.indexOf(w) >= 0; }).length;
        return common / Math.max(wa.length, wb.length);
    }

    // ── Component ─────────────────────────────────────────────────────────────

    function UakinoComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Files(object);
        var fltr    = new Lampa.Filter(object);

        var results      = [];
        var filter_items = { voice: [] };
        var choice       = { voice: 0, voice_name: '' };
        var last;
        var last_filter;
        var comp = this;

        function minus() {
            scroll.minus(window.innerWidth > 580 ? false : files.render().find('.files__left'));
        }
        window.addEventListener('resize', minus, false);
        minus();
        scroll.body().addClass('torrent-list');

        // ── Public Lampa component interface ─────────────────────────────────

        this.create = function () {
            this.activity.loader(true);

            fltr.onBack = function () { comp.start(); };

            fltr.render().find('.selector').on('hover:focus', function (e) {
                last_filter = e.target;
            });

            fltr.onSelect = function (type, a, b) {
                if (type !== 'filter') return;
                if (a.reset) {
                    comp.reset();
                    renderFilter();
                    appendItems(filtered());
                } else {
                    choice[a.stype] = b.index;
                    if (a.stype === 'voice') choice.voice_name = filter_items.voice[b.index];
                    comp.reset();
                    renderFilter();
                    appendItems(filtered());
                    saveChoice();
                }
            };

            files.append(scroll.render());
            scroll.append(fltr.render());
            doSearch();
            return this.render();
        };

        this.start = function (first_select) {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (first_select) {
                var views = scroll.render().find('.selector');
                last = views.eq(2)[0];
            }

            Lampa.Background.immediately(Lampa.Utils.cardImgBackground(object.movie));

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) {
                        if (scroll.render().find('.selector').slice(2).index(last) === 0 && last_filter) {
                            Lampa.Controller.collectionFocus(last_filter, scroll.render());
                        } else {
                            Navigator.move('up');
                        }
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down:  function () { Navigator.move('down'); },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else fltr.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left:  function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: comp.back
            });

            Lampa.Controller.toggle('content');
        };

        this.render  = function () { return files.render(); };
        this.back    = function () { Lampa.Activity.backward(); };
        this.pause   = function () {};
        this.stop    = function () {};

        this.destroy = function () {
            network.clear();
            files.destroy();
            scroll.destroy();
            network = null;
            window.removeEventListener('resize', minus);
        };

        this.reset = function () {
            last = false;
            scroll.render().find('.empty').remove();
            fltr.render().detach();
            scroll.clear();
            scroll.append(fltr.render());
        };

        this.append = function (item) {
            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(item);
        };

        this.loading = function (status) {
            if (status) {
                this.activity.loader(true);
            } else {
                this.activity.loader(false);
                this.activity.toggle();
            }
        };

        this.empty = function (msg) {
            var empty = Lampa.Template.get('list_empty');
            if (msg) empty.find('.empty__descr').text(msg);
            scroll.append(empty);
            comp.loading(false);
        };

        this.filter = function (fi, ch) {
            var select = [];
            select.push({ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true });

            if (fi.voice && fi.voice.length > 1) {
                var subitems = fi.voice.map(function (name, i) {
                    return { title: name, selected: i === ch.voice, index: i };
                });
                select.push({
                    title:    Lampa.Lang.translate('torrent_parser_voice'),
                    subtitle: fi.voice[ch.voice],
                    stype:    'voice',
                    items:    subitems
                });
            }

            Lampa.Storage.set('online_filter', ch);
            fltr.set('filter', select);
            comp.selected(fi);
        };

        this.selected = function (fi) {
            var sel = [];
            if (fi.voice && fi.voice.length > 1) {
                sel.push(Lampa.Lang.translate('torrent_parser_voice') + ': ' + fi.voice[choice.voice]);
            }
            fltr.chosen('filter', sel);
        };

        // ── Search & load logic ───────────────────────────────────────────────

        function doSearch() {
            var movie     = object.movie;
            var title     = movie.title || movie.name || '';
            var origTitle = movie.original_title || movie.original_name || '';

            // Restore saved voice choice
            var saved      = Lampa.Storage.cache('online_choice_uakino', 500, {});
            var savedChoice = saved[movie.id] || {};
            Lampa.Arrays.extend(choice, savedChoice, true);

            network.clear();
            network.timeout(15000);

            network.native(
                prox(BASE_URL + '/ua/'),
                function (html) {
                    var doc   = (new DOMParser()).parseFromString(html, 'text/html');
                    var items = doc.querySelectorAll('div.movie-item.short-item');
                    var best  = null;
                    var bestScore = -1;

                    for (var i = 0; i < items.length; i++) {
                        var el     = items[i];
                        var linkEl = el.querySelector('a.movie-title, a.full-movie');
                        if (!linkEl) continue;
                        var href = linkEl.getAttribute('href') || '';
                        if (BLACKLIST.test(href)) continue;
                        var itemTitle = (linkEl.textContent || '').trim();
                        var score = Math.max(
                            titleSimilarity(itemTitle, title),
                            titleSimilarity(itemTitle, origTitle)
                        );
                        if (score > bestScore) { bestScore = score; best = href; }
                    }

                    if (best) {
                        loadContent(best);
                    } else {
                        comp.empty(
                            Lampa.Lang.translate('online_query_start') + ' (' + title + ') ' +
                            Lampa.Lang.translate('online_query_end')
                        );
                    }
                },
                function (a, c) { comp.empty(network.errorDecode(a, c)); },
                { do: 'search', subaction: 'search', story: title.replace(/ /g, '+') },
                { dataType: 'text' }
            );
        }

        function loadContent(movieUrl) {
            // Extract news_id: last path segment, digits before first '-'
            var segments = movieUrl.replace(/\.html$/, '').split('/');
            var lastSeg  = segments[segments.length - 1] || '';
            var newsId   = lastSeg.split('-')[0];

            if (!newsId || isNaN(parseInt(newsId, 10))) {
                // Fallback to movie mode
                loadMovie(movieUrl);
                return;
            }

            var apiUrl = BASE_URL + '/engine/ajax/playlists.php?news_id=' + newsId +
                         '&xfield=playlist&time=' + Date.now();

            network.clear();
            network.timeout(15000);

            network.native(
                prox(apiUrl),
                function (json) {
                    if (json && json.success && json.response) {
                        loadSeries(json.response);
                    } else {
                        loadMovie(movieUrl);
                    }
                },
                function () { loadMovie(movieUrl); },
                null,
                { headers: { 'Referer': BASE_URL, 'X-Requested-With': 'XMLHttpRequest' } }
            );
        }

        function loadSeries(htmlResponse) {
            var doc = (new DOMParser()).parseFromString(htmlResponse, 'text/html');
            var lis = doc.querySelectorAll('div.playlists-videos li');

            results      = [];
            filter_items = { voice: [] };
            var voiceMap = {};

            for (var i = 0; i < lis.length; i++) {
                var li        = lis[i];
                var playerUrl = (li.getAttribute('data-file') || '').trim();
                var voiceName = (li.getAttribute('data-voice') || '').trim();
                var epTitle   = (li.textContent || '').trim();

                if (!playerUrl) continue;
                if (!playerUrl.startsWith('http')) playerUrl = 'https:' + playerUrl;

                if (!(voiceName in voiceMap)) {
                    voiceMap[voiceName] = filter_items.voice.length;
                    filter_items.voice.push(voiceName);
                }
                results.push({
                    title:       epTitle,
                    voice:       voiceName,
                    voice_index: voiceMap[voiceName],
                    playerjs_url: playerUrl
                });
            }

            if (results.length === 0) {
                comp.empty('Епізоди не знайдено');
                return;
            }

            // Restore saved voice
            if (choice.voice_name) {
                var inx = filter_items.voice.indexOf(choice.voice_name);
                choice.voice = inx >= 0 ? inx : 0;
            }

            renderFilter();
            appendItems(filtered());
            comp.loading(false);
        }

        function loadMovie(movieUrl) {
            network.clear();
            network.timeout(15000);

            network.native(
                prox(movieUrl),
                function (html) {
                    var doc       = (new DOMParser()).parseFromString(html, 'text/html');
                    var iframe    = doc.querySelector('iframe#pre');
                    var iframeSrc = iframe && (iframe.getAttribute('data-src') || iframe.getAttribute('src'));

                    if (!iframeSrc) {
                        comp.empty('Відео не знайдено на сторінці');
                        return;
                    }

                    extractPlayerJs(iframeSrc, function (extra) {
                        if (!extra || !extra.file) {
                            comp.empty('Не вдалося отримати M3U8 посилання');
                            return;
                        }
                        results = [{
                            title:        object.movie.title || object.movie.name || 'Movie',
                            voice:        '',
                            voice_index:  0,
                            playerjs_url: iframeSrc,
                            m3u8:         extra.file,
                            subtitle:     extra.subtitle
                        }];
                        filter_items = { voice: [] };
                        renderFilter();
                        appendItems(results);
                        comp.loading(false);
                    });
                },
                function (a, c) { comp.empty(network.errorDecode(a, c)); },
                null,
                { dataType: 'text' }
            );
        }

        function extractPlayerJs(url, callback) {
            if (url.indexOf('http') !== 0) url = 'https:' + url;
            var net2 = new Lampa.Reguest();
            net2.timeout(15000);
            net2.native(
                prox(url),
                function (html) {
                    var fm = html.match(/file\s*:\s*['"]([^'"]+?)['"]/);
                    var sm = html.match(/subtitle\s*:\s*['"]([^'"]+?)['"]/);
                    if (fm) {
                        var m3u8 = fm[1];
                        if (m3u8.indexOf('http') !== 0) m3u8 = 'https:' + m3u8;
                        callback({ file: m3u8, subtitle: sm ? sm[1] : null });
                    } else {
                        callback(null);
                    }
                },
                function () { callback(null); },
                null,
                { dataType: 'text' }
            );
        }

        function filtered() {
            if (!filter_items.voice.length) return results;
            return results.filter(function (ep) {
                return ep.voice_index === choice.voice;
            });
        }

        function renderFilter() {
            comp.filter(filter_items, choice);
        }

        function saveChoice() {
            var data = Lampa.Storage.cache('online_choice_uakino', 500, {});
            data[object.movie.id] = { voice: choice.voice, voice_name: choice.voice_name };
            Lampa.Storage.set('online_choice_uakino', data);
        }

        function appendItems(items) {
            comp.reset();
            var viewed = Lampa.Storage.cache('online_view', 5000, []);

            items.forEach(function (episode) {
                var hashBase  = [episode.title, object.movie.original_title || object.movie.title, episode.voice].join('');
                var hash      = Lampa.Utils.hash(hashBase);
                var view      = Lampa.Timeline.view(hash);
                var hash_file = Lampa.Utils.hash(hashBase + 'uakino');

                var item = Lampa.Template.get('online', {
                    title:   episode.title,
                    quality: '',
                    info:    episode.voice ? ' / ' + Lampa.Utils.shortText(episode.voice, 50) : ''
                });

                item.addClass('video--stream');
                episode.timeline = view;
                item.append(Lampa.Timeline.render(view));

                if (Lampa.Timeline.details) {
                    item.find('.online__quality').append(Lampa.Timeline.details(view, ' / '));
                }

                if (viewed.indexOf(hash_file) !== -1) {
                    item.append('<div class="torrent-item__viewed">' +
                        Lampa.Template.get('icon_star', {}, true) + '</div>');
                }

                item.on('hover:enter', (function (ep, v, hf) {
                    return function () {
                        if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);

                        function doPlay(extra) {
                            if (!extra || !extra.file) {
                                Lampa.Noty.show('Не вдалося отримати посилання');
                                return;
                            }

                            var first = {
                                url:      extra.file,
                                timeline: v,
                                title:    ep.title
                            };
                            if (extra.subtitle) first.subtitles = extra.subtitle;

                            var playlist = filtered().map(function (e2) {
                                return {
                                    title:     e2.title,
                                    url:       e2.m3u8 || null,
                                    timeline:  e2.timeline,
                                    playerjs:  e2.playerjs_url
                                };
                            });

                            if (playlist.length > 1) first.playlist = playlist;

                            Lampa.Player.play(first);
                            Lampa.Player.playlist(playlist.length > 1 ? playlist : [first]);

                            if (viewed.indexOf(hf) === -1) {
                                viewed.push(hf);
                                item.append('<div class="torrent-item__viewed">' +
                                    Lampa.Template.get('icon_star', {}, true) + '</div>');
                                Lampa.Storage.set('online_view', viewed);
                            }
                        }

                        if (ep.m3u8) {
                            doPlay({ file: ep.m3u8, subtitle: ep.subtitle });
                        } else {
                            extractPlayerJs(ep.playerjs_url, doPlay);
                        }
                    };
                })(episode, view, hash_file));

                comp.append(item);
            });

            comp.start(true);
        }
    }

    // ── Button injection ──────────────────────────────────────────────────────

    var BUTTON_HTML =
        '<div class="full-start__button selector view--uakino">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:1em;height:1em;vertical-align:middle">' +
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>' +
        '</svg>' +
        '<span>Uakino</span>' +
        '</div>';

    function addButton(e) {
        if (e.type !== 'complite') return;
        var btn = $(BUTTON_HTML);
        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                url:       '',
                title:     'Uakino',
                component: 'uakino',
                movie:     e.data.movie,
                page:      1
            });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function initPlugin() {
        ensureTemplates();
        Lampa.Component.add('uakino', UakinoComponent);
        Lampa.Listener.follow('full', addButton);
    }

    if (window.Lampa && Lampa.Component) {
        initPlugin();
    } else {
        var checkInterval = setInterval(function () {
            if (window.Lampa && Lampa.Component) {
                clearInterval(checkInterval);
                initPlugin();
            }
        }, 100);
    }

})();
