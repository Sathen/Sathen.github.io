/**
 * UA Онлайн Lampa Plugin
 * Multi-provider Ukrainian streaming plugin. Supports Uakino, Eneyida, KinoTron,
 * Цікава Ідея, KinoVezha, Serialno, UAFlix, AnimeON.
 */
(function () {
    'use strict';

    // ── Provider definitions ──────────────────────────────────────────────────

    var PROVIDERS = [
        {
            id: 'uakino',   name: 'Uakino',
            url: 'https://uakino.best',
            engine: 'dle',
            searchPath: '/ua/',
            searchSelector: 'div.movie-item.short-item',
            searchLink: 'a.movie-title, a.full-movie',
            blacklist: /\/news\/|\/franchise\//
        },
        {
            id: 'eneyida',  name: 'Eneyida',
            url: 'https://eneyida.tv',
            engine: 'iframe',
            searchPath: '/',
            searchSelector: 'article.short',
            searchLink: 'a.short_title',
            iframeSelector: '.tabs_b.visible iframe, .video-box iframe'
        },
        {
            id: 'kinotron', name: 'KinoTron',
            url: 'https://kinotron.tv',
            engine: 'iframe',
            searchPath: '/index.php',
            searchSelector: '.th-item',
            searchLink: '.th-in',
            iframeAttr: 'data-src',
            iframeSelector: '.video-box iframe'
        },
        {
            id: 'cikavaid', name: 'Цікава Ідея',
            url: 'https://cikava-ideya.top',
            engine: 'iframe',
            searchPath: '/',
            searchSelector: '.th-item',
            searchLink: '.th-in',
            iframeSelector: '.video-box iframe'
        },
        {
            id: 'kinovezha', name: 'KinoVezha',
            url: 'https://kinovezha.tv',
            engine: 'iframe',
            searchPath: '/',
            searchSelector: '.movie-item',
            searchLink: '.movie-item__link',
            iframeSelector: '.video-responsive > iframe',
            obfuscated: true
        },
        {
            id: 'serialno', name: 'Serialno',
            url: 'https://serialno.tv',
            engine: 'iframe',
            searchPath: '/',
            searchSelector: '.th-item',
            searchLink: '.th-in',
            iframeSelector: '.video-box iframe',
            obfuscated: true
        },
        {
            id: 'uaflix',   name: 'UAFlix',
            url: 'https://uafix.net',
            engine: 'iframe',
            searchMethod: 'get',
            searchPath: '/index.php',
            searchSelector: '.sres-wrap',
            searchLink: '.sres-wrap',
            iframeSelector: '.video-box iframe'
        },
        {
            id: 'animeon',  name: 'AnimeON',
            url: 'https://animeon.club',
            engine: 'animeon'
        },
        {
            id: 'anitube',  name: 'AniTube',
            url: 'https://anitube.in.ua',
            engine: 'dle',
            userHash: true,
            searchPath: '/',
            searchSelector: 'article.story',
            searchLink: '.story_c h2 a, div.text_content a'
        }
    ];

    var savedProviderId = Lampa.Storage.get('uakino_default_provider', 'uakino');
    var current_provider = PROVIDERS.filter(function(p){ return p.id === savedProviderId; })[0] || PROVIDERS[0];

    // ── CORS proxy support ────────────────────────────────────────────────────

    function prox(url) {
        var p = Lampa.Storage.get('uakino_proxy', '') || Lampa.Storage.get('online_proxy_all', '');
        if (!p) return url;
        var last = p.slice(-1);
        if (last !== '/' && last !== '?' && last !== '=') p += '/';
        return p + url;
    }

    // ── Templates + CSS ──────────────────────────────────────────────────────

    function ensureTemplates() {
        // Prestige card — register only if not already available (e.g. from BanderaOnline)
        try { Lampa.Template.get('bandera_online_full', { title:'', info:'', quality:'', time:'' }); }
        catch (e) {
            Lampa.Template.add('bandera_online_full',
                '<div class="online-prestige online-prestige--full selector">' +
                '<div class="online-prestige__img"><img alt=""><div class="online-prestige__loader"></div></div>' +
                '<div class="online-prestige__body">' +
                '<div class="online-prestige__head">' +
                '<div class="online-prestige__title">{title}</div>' +
                '<div class="online-prestige__time">{time}</div>' +
                '</div>' +
                '<div class="online-prestige__timeline"></div>' +
                '<div class="online-prestige__footer">' +
                '<div class="online-prestige__info">{info}</div>' +
                '<div class="online-prestige__quality">{quality}</div>' +
                '</div></div></div>'
            );
        }

        // Inject CSS once (skipped if BanderaOnline already did it)
        if (!$('#ua-online-css').length) {
            $('body').append('<style id="ua-online-css">' +
                '.online-prestige{position:relative;border-radius:.3em;background:rgba(0,0,0,.3);display:flex}' +
                '.online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}' +
                '.online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}' +
                '.online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em;opacity:0;transition:opacity .3s}' +
                '.online-prestige__img--loaded>img{opacity:1}' +
                '.online-prestige__episode-number{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em}' +
                '.online-prestige__loader{position:absolute;top:50%;left:50%;width:2em;height:2em;margin-left:-1em;margin-top:-1em;background:url(./img/loader.svg) no-repeat center;background-size:contain}' +
                '.online-prestige__viewed{position:absolute;top:.6em;left:.6em;background:rgba(0,0,0,.45);border-radius:100%;padding:.25em;font-size:.76em}' +
                '.online-prestige__viewed>svg{width:1.5em!important;height:1.5em!important}' +
                '.online-prestige__head,.online-prestige__footer{display:flex;justify-content:space-between;align-items:center}' +
                '.online-prestige__timeline{margin:.8em 0}' +
                '.online-prestige__timeline>.time-line{display:block!important}' +
                '.online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}' +
                '.online-prestige__time{padding-left:2em;white-space:nowrap}' +
                '.online-prestige__info{display:flex;align-items:center}' +
                '.online-prestige__info>*{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}' +
                '.online-prestige__quality{padding-left:1em;white-space:nowrap}' +
                '.online-prestige-split{font-size:.8em;margin:0 .8em;flex-shrink:0}' +
                '.online-prestige.focus::after{content:"";position:absolute;top:-.6em;left:-.6em;right:-.6em;bottom:-.6em;border-radius:.7em;border:solid .3em #fff;z-index:-1;pointer-events:none}' +
                '.online-prestige+.online-prestige{margin-top:1.5em}' +
                '@media(max-width:480px){.online-prestige__img{width:7em;min-height:6em}.online-prestige__body{padding:.8em 1.2em}.online-prestige__title{font-size:1.4em}}' +
                '</style>'
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

    // ── parsePlayerJson — normalise nested dub/season/episode JSON ────────────

    function parsePlayerJson(data) {
        var flat = [];

        function addEp(title, file, voice, seasonName, subtitle) {
            if (!file) return;
            if (file.indexOf('http') !== 0) file = 'https:' + file;
            flat.push({
                title:       title || 'Серія',
                voice:       voice || '',
                season_name: seasonName || null,
                m3u8:        file,
                subtitle:    subtitle || null
            });
        }

        function walk(node, voice, seasonName) {
            if (!node) return;
            if (node.file) { addEp(node.title, node.file, voice, seasonName, node.subtitle); return; }
            if (!node.folder) return;
            var first = node.folder[0];
            if (first && first.folder) {
                // node = dub, node.folder = seasons
                node.folder.forEach(function(season) {
                    if (season.folder) {
                        season.folder.forEach(function(ep){
                            addEp(ep.title, ep.file, node.title, season.title, ep.subtitle);
                        });
                    } else {
                        addEp(season.title, season.file, node.title, null, season.subtitle);
                    }
                });
            } else {
                // node = dub, node.folder = episodes
                node.folder.forEach(function(ep){
                    addEp(ep.title, ep.file, node.title, seasonName, ep.subtitle);
                });
            }
        }

        if (Array.isArray(data)) {
            if (data.length && data[0].folder) {
                data.forEach(function(n){ walk(n, ''); });
            } else {
                data.forEach(function(n){ addEp(n.title, n.file, '', null, n.subtitle); });
            }
        } else {
            walk(data, '');
        }
        return flat;
    }

    // ── Component ─────────────────────────────────────────────────────────────

    function UakinoComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var fltr    = new Lampa.Filter(object);

        var results      = [];
        var filter_items = { voice: [], season: [], season_ids: [] };
        var choice       = { voice: 0, voice_name: '', season: 0, season_id: null };
        var last;
        var last_filter;
        var comp = this;

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
                    choice = { voice: 0, voice_name: '', season: 0, season_id: null };
                    comp.reset();
                    renderFilter();
                    appendItems(filtered());
                } else if (a.stype === 'source') {
                    current_provider = PROVIDERS[b.index];
                    Lampa.Storage.set('uakino_default_provider', current_provider.id);
                    choice = { voice: 0, voice_name: '', season: 0, season_id: null };
                    filter_items = { voice: [], season: [], season_ids: [] };
                    comp.loading(true);
                    comp.reset();
                    renderFilter();
                    doSearch();
                } else {
                    choice[a.stype] = b.index;
                    if (a.stype === 'voice')  choice.voice_name = filter_items.voice[b.index];
                    if (a.stype === 'season') choice.season_id  = filter_items.season_ids[b.index];
                    comp.reset();
                    renderFilter();
                    appendItems(filtered());
                    saveChoice();
                }
            };

            files.appendFiles(scroll.render());
            files.appendHead(fltr.render());
            scroll.minus(files.render().find('.explorer__files-head'));
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
        };

        this.reset = function () {
            last = false;
            scroll.render().find('.empty').remove();
            scroll.clear();
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

            // Source dropdown (always shown)
            var sourceItems = PROVIDERS.map(function(p, i) {
                return { title: p.name, selected: p.id === current_provider.id, index: i };
            });
            select.push({
                title:    'Джерело',
                subtitle: current_provider.name,
                stype:    'source',
                items:    sourceItems
            });

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

            if (fi.season && fi.season.length > 1) {
                var seasonItems = fi.season.map(function (name, i) {
                    return { title: name, selected: i === ch.season, index: i };
                });
                select.push({
                    title:    Lampa.Lang.translate('torrent_serial_season'),
                    subtitle: fi.season[ch.season],
                    stype:    'season',
                    items:    seasonItems
                });
            }

            Lampa.Storage.set('online_filter', ch);
            fltr.set('filter', select);
            comp.selected(fi);
        };

        this.selected = function (fi) {
            var sel = [];
            sel.push('Джерело: ' + current_provider.name);
            if (fi.voice && fi.voice.length > 1) {
                sel.push(Lampa.Lang.translate('torrent_parser_voice') + ': ' + fi.voice[choice.voice]);
            }
            if (fi.season && fi.season.length > 1) {
                sel.push(Lampa.Lang.translate('torrent_serial_season') + ': ' + fi.season[choice.season]);
            }
            fltr.chosen('filter', sel);
        };

        // ── Search & load logic ───────────────────────────────────────────────

        function doSearch() {
            var provider  = current_provider;
            var movie     = object.movie;
            var title     = movie.title || movie.name || '';
            var origTitle = movie.original_title || movie.original_name || '';

            // Restore saved voice/season choice for this movie+provider
            var saved      = Lampa.Storage.cache('online_choice_uakino', 500, {});
            var key        = (movie.id || '') + '_' + provider.id;
            var savedChoice = saved[key] || {};
            Lampa.Arrays.extend(choice, savedChoice, true);

            // Always show Source badge immediately, even before results arrive
            filter_items = { voice: [], season: [], season_ids: [] };
            renderFilter();

            network.clear();
            network.timeout(15000);

            // ── AnimeON: pure JSON REST API ──
            if (provider.engine === 'animeon') {
                var animeSearchUrl = provider.url + '/api/anime/search?text=' + encodeURIComponent(title);
                network.native(
                    prox(animeSearchUrl),
                    function (json) {
                        var best = null, bestScore = -1;
                        (json.result || json || []).forEach(function(item) {
                            var score = Math.max(
                                titleSimilarity(item.titleUa, title),
                                titleSimilarity(item.titleUa, origTitle),
                                titleSimilarity(item.titleEn, title),
                                titleSimilarity(item.titleEn, origTitle)
                            );
                            if (score > bestScore) { bestScore = score; best = item; }
                        });
                        if (best) {
                            loadAnimeONSeries(provider, best.id);
                        } else {
                            comp.empty('Не знайдено: ' + title);
                        }
                    },
                    function (a, c) { comp.empty(network.errorDecode(a, c)); },
                    null
                );
                return;
            }

            // ── Generic HTML search with fallback candidates ──
            // Build search candidates: full title → non-CJK original → short title (before colon)
            var isCJK = function (s) { return /[\u3000-\u9fff\uf900-\ufaff]/.test(s); };
            var searchCandidates = (function () {
                var seen = {}, list = [];
                function add(s) {
                    s = (s || '').trim();
                    if (s && !seen[s]) { seen[s] = true; list.push(s); }
                }
                add(title);
                if (!isCJK(origTitle)) add(origTitle);
                add(title.replace(/\s*[:\-–—].*$/, ''));     // short localized
                if (!isCJK(origTitle)) add(origTitle.replace(/\s*[:\-–—].*$/, ''));
                return list;
            })();

            var isGet = provider.searchMethod === 'get';

            function runSearch(idx) {
                if (idx >= searchCandidates.length) {
                    comp.empty('Не знайдено: ' + title);
                    return;
                }
                var query = searchCandidates[idx];
                var url   = provider.url + provider.searchPath;
                if (isGet) url += '?do=search&subaction=search&search_start=0&story=' + encodeURIComponent(query);

                network.native(
                    prox(url),
                    function (html) {
                        var doc   = (new DOMParser()).parseFromString(html, 'text/html');
                        var items = doc.querySelectorAll(provider.searchSelector);

                        // No results from provider → try next candidate
                        if (!items.length) { runSearch(idx + 1); return; }

                        var best = null, bestScore = -1;
                        for (var i = 0; i < items.length; i++) {
                            var el     = items[i];
                            var linkEl = el.querySelector(provider.searchLink);
                            if (!linkEl) {
                                if (el.matches && el.matches(provider.searchLink)) linkEl = el;
                                else continue;
                            }
                            var href = linkEl.getAttribute('href') || '';
                            if (provider.blacklist && provider.blacklist.test(href)) continue;
                            var itemTitle = (linkEl.getAttribute('title') || linkEl.textContent || '').trim();
                            var score = Math.max(
                                titleSimilarity(itemTitle, title),
                                titleSimilarity(itemTitle, origTitle),
                                titleSimilarity(itemTitle, query)   // also score against the actual query used
                            );
                            if (score > bestScore) { bestScore = score; best = href; }
                        }

                        if (best) {
                            if (best.indexOf('http') !== 0) best = provider.url + best;
                            loadContent(provider, best);
                        } else {
                            runSearch(idx + 1);
                        }
                    },
                    function (a, c) { comp.empty(network.errorDecode(a, c)); },
                    isGet ? null : { do: 'search', subaction: 'search', story: query.replace(/ /g, '+') },
                    { dataType: 'text' }
                );
            }

            runSearch(0);
        }

        function loadContent(provider, movieUrl) {
            if (provider.engine === 'dle') {
                // Extract news_id: last path segment, digits before first '-'
                var segments = movieUrl.replace(/\.html$/, '').split('/');
                var lastSeg  = segments[segments.length - 1] || '';
                var newsId   = lastSeg.split('-')[0];

                if (!newsId || isNaN(parseInt(newsId, 10))) {
                    loadMoviePage(provider, movieUrl);
                    return;
                }

                if (provider.userHash) {
                    // AniTube requires dle_login_hash from the page before calling the API
                    network.clear();
                    network.timeout(15000);
                    network.native(
                        prox(movieUrl),
                        function (html) {
                            var hm = html.match(/dle_login_hash\s*=\s*'([^']+)'/);
                            var hash = hm ? hm[1] : '';
                            var apiUrl = provider.url + '/engine/ajax/playlists.php?news_id=' + newsId +
                                         '&xfield=playlist&user_hash=' + hash;
                            callDlePlaylistApi(provider, apiUrl, movieUrl);
                        },
                        function (a, c) { comp.empty(network.errorDecode(a, c)); },
                        null,
                        { dataType: 'text' }
                    );
                } else {
                    var apiUrl = provider.url + '/engine/ajax/playlists.php?news_id=' + newsId +
                                 '&xfield=playlist&time=' + Date.now();
                    callDlePlaylistApi(provider, apiUrl, movieUrl);
                }
                return;
            }

            // iframe engine
            loadMoviePage(provider, movieUrl);
        }

        function callDlePlaylistApi(provider, apiUrl, movieUrl) {
            network.clear();
            network.timeout(15000);
            network.native(
                prox(apiUrl),
                function (json) {
                    if (json && json.success && json.response) {
                        loadSeries(json.response);
                    } else {
                        loadMoviePage(provider, movieUrl);
                    }
                },
                function () { loadMoviePage(provider, movieUrl); },
                null,
                { headers: { 'Referer': provider.url, 'X-Requested-With': 'XMLHttpRequest' } }
            );
        }

        function loadSeries(htmlResponse) {
            var doc = (new DOMParser()).parseFromString(htmlResponse, 'text/html');

            var seasonLabels = {};
            var playerLis = doc.querySelectorAll('.playlists-players li[data-id]:not([data-file]):not([data-voice])');
            playerLis.forEach(function(li) {
                var sid = li.getAttribute('data-id');
                if (sid) seasonLabels[sid] = li.textContent.trim();
            });

            var lis = doc.querySelectorAll('div.playlists-videos li');

            results      = [];
            filter_items = { voice: [], season: [], season_ids: [] };
            var voiceMap  = {};
            var seasonMap = {};

            for (var i = 0; i < lis.length; i++) {
                var li        = lis[i];
                var playerUrl = (li.getAttribute('data-file') || '').trim();
                var voiceName = (li.getAttribute('data-voice') || '').trim();
                var epTitle   = (li.textContent || '').trim();
                var seasonId  = (li.getAttribute('data-id') || '').trim();

                if (!playerUrl) continue;
                if (playerUrl.indexOf('http') !== 0) playerUrl = 'https:' + playerUrl;

                if (!(voiceName in voiceMap)) {
                    voiceMap[voiceName] = filter_items.voice.length;
                    filter_items.voice.push(voiceName);
                }

                if (seasonId && !(seasonId in seasonMap)) {
                    seasonMap[seasonId] = filter_items.season.length;
                    var label = seasonLabels[seasonId] || (Lampa.Lang.translate('torrent_serial_season') + ' ' + seasonId);
                    filter_items.season.push(label);
                    filter_items.season_ids.push(seasonId);
                }

                results.push({
                    title:        epTitle,
                    voice:        voiceName,
                    voice_index:  voiceMap[voiceName],
                    season_id:    seasonId || null,
                    playerjs_url: playerUrl,
                    m3u8:         null,
                    subtitle:     null
                });
            }

            if (results.length === 0) { comp.empty('Епізоди не знайдено'); return; }

            if (choice.voice_name) {
                var inx = filter_items.voice.indexOf(choice.voice_name);
                choice.voice = inx >= 0 ? inx : 0;
            }

            if (choice.season_id !== null) {
                var sinx = filter_items.season_ids.indexOf(choice.season_id);
                choice.season = sinx >= 0 ? sinx : 0;
                if (sinx < 0) choice.season_id = filter_items.season_ids[0] || null;
            }

            renderFilter();
            appendItems(filtered());
            comp.loading(false);
        }

        function loadMoviePage(provider, movieUrl) {
            network.clear();
            network.timeout(15000);

            network.native(
                prox(movieUrl),
                function (html) {
                    var doc = (new DOMParser()).parseFromString(html, 'text/html');
                    var sel = provider.engine === 'dle' ? 'iframe#pre' : (provider.iframeSelector || 'iframe');
                    var iframeEl = doc.querySelector(sel);
                    var iframeSrc = iframeEl && (iframeEl.getAttribute('data-src') || iframeEl.getAttribute('src'));

                    if (!iframeSrc) {
                        comp.empty('Відео не знайдено на сторінці');
                        return;
                    }

                    if (provider.engine === 'dle') {
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
                            filter_items = { voice: [], season: [], season_ids: [] };
                            renderFilter();
                            appendItems(results);
                            comp.loading(false);
                        });
                    } else {
                        loadSeriesFromIframe(provider, iframeSrc);
                    }
                },
                function (a, c) { comp.empty(network.errorDecode(a, c)); },
                null,
                { dataType: 'text' }
            );
        }

        function loadSeriesFromIframe(provider, iframeSrc) {
            if (iframeSrc.indexOf('http') !== 0) iframeSrc = 'https:' + iframeSrc;
            var net2 = new Lampa.Reguest();
            net2.timeout(15000);
            net2.native(
                prox(iframeSrc),
                function (html) {
                    var fm = html.match(/file\s*:\s*'([^']+?)'/) || html.match(/file\s*:\s*"([^"]+?)"/);
                    if (!fm) { comp.empty('Плеєр не знайдено'); return; }

                    var fileData = fm[1];
                    if (provider.obfuscated) {
                        try { fileData = atob(fileData).split('').reverse().join(''); }
                        catch (e) { comp.empty('Помилка декодування'); return; }
                    }

                    var data;
                    try {
                        data = JSON.parse(fileData);
                    } catch (e) {
                        if (fileData.indexOf('.m3u8') !== -1 || fileData.indexOf('.mp4') !== -1) {
                            data = [{ title: object.movie.title || 'Movie', file: fileData }];
                        } else {
                            comp.empty('Помилка парсингу'); return;
                        }
                    }

                    var episodes = parsePlayerJson(data);
                    if (!episodes.length) { comp.empty('Епізоди не знайдено'); return; }

                    results      = [];
                    filter_items = { voice: [], season: [], season_ids: [] };
                    var voiceMap  = {};
                    var seasonMap = {};

                    episodes.forEach(function(ep) {
                        var vn = ep.voice || '';
                        var sn = ep.season_name || null;

                        if (!(vn in voiceMap)) {
                            voiceMap[vn] = filter_items.voice.length;
                            filter_items.voice.push(vn);
                        }

                        if (sn && !(sn in seasonMap)) {
                            seasonMap[sn] = filter_items.season.length;
                            filter_items.season.push(sn);
                            filter_items.season_ids.push(sn);
                        }

                        results.push({
                            title:       ep.title,
                            voice:       vn,
                            voice_index: voiceMap[vn],
                            season_id:   sn,
                            m3u8:        ep.m3u8,
                            subtitle:    ep.subtitle || null,
                            playerjs_url: null,
                            animeon_episode_url: null
                        });
                    });

                    // Restore saved voice/season
                    if (choice.voice_name) {
                        var inx = filter_items.voice.indexOf(choice.voice_name);
                        choice.voice = inx >= 0 ? inx : 0;
                    }
                    if (choice.season_id !== null) {
                        var sinx = filter_items.season_ids.indexOf(choice.season_id);
                        choice.season = sinx >= 0 ? sinx : 0;
                        if (sinx < 0) choice.season_id = filter_items.season_ids[0] || null;
                    }

                    renderFilter();
                    appendItems(filtered());
                    comp.loading(false);
                },
                function () { comp.empty('Помилка завантаження'); },
                null,
                { dataType: 'text' }
            );
        }

        function loadAnimeONSeries(provider, animeId) {
            network.clear();
            network.timeout(15000);
            network.native(
                prox(provider.url + '/api/player/fundubs/' + animeId),
                function (json) {
                    var fundubs = json || [];
                    if (!fundubs.length) { comp.empty('Аніме не знайдено'); return; }

                    results      = [];
                    filter_items = { voice: [], season: [], season_ids: [] };
                    var voiceMap = {};
                    var pending  = fundubs.length;

                    fundubs.forEach(function(dub) {
                        var dubName  = dub.fundub.name;
                        var playerId = dub.player[0] && dub.player[0].id;
                        var fundubId = dub.fundub.id;
                        var epUrl    = provider.url + '/api/player/episodes/' + animeId +
                                       '?playerId=' + playerId + '&fundubId=' + fundubId;
                        var net3 = new Lampa.Reguest();
                        net3.timeout(15000);
                        net3.native(
                            prox(epUrl),
                            function (epJson) {
                                var episodes = (epJson && epJson.episodes) || [];
                                if (!(dubName in voiceMap)) {
                                    voiceMap[dubName] = filter_items.voice.length;
                                    filter_items.voice.push(dubName);
                                }
                                episodes.forEach(function(ep) {
                                    results.push({
                                        title:               'Серія ' + ep.episode,
                                        voice:               dubName,
                                        voice_index:         voiceMap[dubName],
                                        season_id:           null,
                                        animeon_episode_url: provider.url + '/api/player/episode/' + ep.id,
                                        playerjs_url:        null,
                                        m3u8:                null,
                                        subtitle:            null
                                    });
                                });
                                if (--pending === 0) finalize();
                            },
                            function () { if (--pending === 0) finalize(); },
                            null
                        );
                    });

                    function finalize() {
                        results.sort(function(a, b) {
                            if (a.voice_index !== b.voice_index) return a.voice_index - b.voice_index;
                            return parseInt(a.title.replace('Серія ', ''), 10) -
                                   parseInt(b.title.replace('Серія ', ''), 10);
                        });
                        if (!results.length) { comp.empty('Епізоди не знайдено'); return; }

                        if (choice.voice_name) {
                            var inx = filter_items.voice.indexOf(choice.voice_name);
                            choice.voice = inx >= 0 ? inx : 0;
                        }

                        renderFilter();
                        appendItems(filtered());
                        comp.loading(false);
                    }
                },
                function (a, c) {
                    var msg = network.errorDecode(a, c);
                    comp.empty('AnimeON: ' + (msg || 'помилка сервера'));
                },
                null
            );
        }

        function extractAnimeONVideo(episodeApiUrl, callback) {
            var net2 = new Lampa.Reguest();
            net2.timeout(15000);
            net2.native(
                prox(episodeApiUrl),
                function (json) {
                    var videoUrl = json && json.videoUrl;
                    if (!videoUrl) { callback(null); return; }
                    // videoUrl from AnimeON is a direct media URL, not a player page
                    if (videoUrl.indexOf('http') !== 0) videoUrl = 'https:' + videoUrl;
                    callback({ file: videoUrl, subtitle: json.subtitleUrl || null });
                },
                function () { callback(null); },
                null
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
            return results.filter(function (ep) {
                var voiceOk  = !filter_items.voice.length  || ep.voice_index === choice.voice;
                var seasonOk = !filter_items.season.length || ep.season_id === filter_items.season_ids[choice.season];
                return voiceOk && seasonOk;
            });
        }

        function renderFilter() {
            comp.filter(filter_items, choice);
        }

        function saveChoice() {
            var data = Lampa.Storage.cache('online_choice_uakino', 500, {});
            var key  = (object.movie.id || '') + '_' + current_provider.id;
            data[key] = {
                voice: choice.voice, voice_name: choice.voice_name,
                season: choice.season, season_id: choice.season_id
            };
            Lampa.Storage.set('online_choice_uakino', data);
        }

        function appendItems(items) {
            comp.reset();
            var viewed         = Lampa.Storage.cache('online_view', 5000, []);
            var scroll_to_el   = false;
            var scroll_to_mark = false;
            var backdropPath   = object.movie.backdrop_path || object.movie.poster_path || '';

            items.forEach(function (episode, index) {
                var hashBase  = [episode.title, object.movie.original_title || object.movie.title, episode.voice].join('');
                var hash      = Lampa.Utils.hash(hashBase);
                var hash_file = Lampa.Utils.hash(hashBase + 'uakino');
                var view      = Lampa.Timeline.view(hash);
                episode.timeline = view;

                // Episode number overlay (01, 02, …)
                var epNumStr = (function () {
                    var m = episode.title.match(/(\d+)/);
                    var n = m ? parseInt(m[1], 10) : (index + 1);
                    return n < 10 ? '0' + n : String(n);
                })();

                // Info line: voice [/ season]
                var infoParts = [];
                if (episode.voice) infoParts.push(episode.voice);
                if (episode.season_id) infoParts.push(episode.season_id);
                var infoHtml = infoParts.map(function (p, i) {
                    return (i > 0 ? '<span class="online-prestige-split">/</span>' : '') +
                           '<span>' + p.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
                }).join('');

                var html = Lampa.Template.get('bandera_online_full', {
                    title:   episode.title,
                    info:    infoHtml,
                    quality: '',
                    time:    ''
                });

                // Image thumbnail (movie backdrop) + episode number overlay
                var imgWrap = html.find('.online-prestige__img');
                imgWrap.append('<div class="online-prestige__episode-number">' + epNumStr + '</div>');
                if (backdropPath) {
                    var imgEl = html.find('.online-prestige__img img')[0];
                    if (imgEl) {
                        imgEl.onload  = function () { imgWrap.addClass('online-prestige__img--loaded'); imgWrap.find('.online-prestige__loader').remove(); };
                        imgEl.onerror = function () { imgWrap.find('.online-prestige__loader').remove(); };
                        imgEl.src = Lampa.TMDB.image('t/p/w300' + backdropPath);
                    }
                } else {
                    imgWrap.find('.online-prestige__loader').remove();
                }

                // Timeline bar
                if (Lampa.Timeline.render) {
                    html.find('.online-prestige__timeline').append(Lampa.Timeline.render(view));
                }
                if (Lampa.Timeline.details) {
                    html.find('.online-prestige__quality').append(Lampa.Timeline.details(view, ' / '));
                }

                // Viewed star
                var isViewed = viewed.indexOf(hash_file) !== -1;
                if (isViewed) {
                    imgWrap.append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                    if (!scroll_to_mark) scroll_to_mark = html;
                }

                // Track last-in-progress episode for scroll-to
                if (view && view.percent > 0 && view.percent < 90) {
                    scroll_to_el = html;
                }

                // Focus: update scroll position
                html.on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                // Enter: play
                html.on('hover:enter', (function (ep, v, hf, card, iw) {
                    return function () {
                        if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);

                        function doPlay(extra) {
                            if (!extra || !extra.file) {
                                Lampa.Noty.show('Не вдалося отримати посилання');
                                return;
                            }
                            var first = { url: extra.file, timeline: v, title: ep.title };
                            if (extra.subtitle) first.subtitles = extra.subtitle;

                            var playlist = filtered().map(function (e2) {
                                return { title: e2.title, url: e2.m3u8 || null, timeline: e2.timeline, playerjs: e2.playerjs_url };
                            });

                            Lampa.Player.play(first);
                            Lampa.Player.playlist(playlist.length > 1 ? playlist : [first]);

                            if (viewed.indexOf(hf) === -1) {
                                viewed.push(hf);
                                iw.append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                                Lampa.Storage.set('online_view', viewed);
                            }
                        }

                        if (ep.animeon_episode_url) {
                            extractAnimeONVideo(ep.animeon_episode_url, doPlay);
                        } else if (ep.m3u8) {
                            doPlay({ file: ep.m3u8, subtitle: ep.subtitle });
                        } else {
                            extractPlayerJs(ep.playerjs_url, doPlay);
                        }
                    };
                })(episode, view, hash_file, html, imgWrap));

                scroll.append(html);
            });

            // Scroll to last-in-progress or last-viewed
            if (scroll_to_el)        last = scroll_to_el[0];
            else if (scroll_to_mark) last = scroll_to_mark[0];

            comp.start(true);
        }
    }

    // ── Button injection ──────────────────────────────────────────────────────

    var BUTTON_HTML =
        '<div class="full-start__button selector view--uakino">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:1em;height:1em;vertical-align:middle">' +
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>' +
        '</svg>' +
        '<span>UA Онлайн</span>' +
        '</div>';

    function addButton(e) {
        if (e.type !== 'complite') return;
        var btn = $(BUTTON_HTML);
        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                url:       '',
                title:     'UA Онлайн',
                component: 'uakino',
                movie:     e.data.movie,
                page:      1
            });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    function addSettings() {
        Lampa.Params.select('uakino_proxy', '', '');

        Lampa.Template.add('settings_uakino',
            '<div>' +
            '<div class="settings-param selector" data-type="input" data-name="uakino_proxy" placeholder="https://cors-proxy.example.com/">' +
                '<div class="settings-param__name">UA Онлайн Proxy URL</div>' +
                '<div class="settings-param__value"></div>' +
                '<div class="settings-param__descr">CORS proxy for browser/web use. Leave empty on Android TV.</div>' +
            '</div>' +
            '</div>'
        );

        if (Lampa.Settings.main && !Lampa.Settings.main().render().find('[data-component="uakino"]').length) {
            var folder = $(
                '<div class="settings-folder selector" data-component="uakino">' +
                '<div class="settings-folder__icon">' +
                '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:2em;height:2em">' +
                '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>' +
                '</svg>' +
                '</div>' +
                '<div class="settings-folder__name">UA Онлайн</div>' +
                '</div>'
            );
            Lampa.Settings.main().render().find('[data-component="more"]').after(folder);
            Lampa.Settings.main().update();
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function initPlugin() {
        ensureTemplates();
        Lampa.Component.add('uakino', UakinoComponent);
        Lampa.Listener.follow('full', addButton);

        if (window.appready) addSettings();
        else Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addSettings();
        });
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
