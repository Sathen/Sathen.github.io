(function () {
    'use strict';

    var mainUrl = 'https://uakino.best';

    /**
     * Helper to get proxy URL for browser environments
     */
    function getProxy(url) {
        if (Lampa.Platform.is('android')) return url;
        
        var prox = 'https://apn-latest.onrender.com/ip/';
        var host = 'https://uakino.best';
        var user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
        
        var prox_enc = 'param/Origin=' + encodeURIComponent(host) + '/';
        prox_enc += 'param/Referer=' + encodeURIComponent(host + '/') + '/';
        prox_enc += 'param/User-Agent=' + encodeURIComponent(user_agent) + '/';
        
        return prox + prox_enc + url;
    }

    /**
     * Strip scripts and other heavy tags to prevent 404s and execution during parsing
     */
    function cleanHTML(html) {
        if (!html) return '';
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                   .replace(/<link\b[^>]*>/gi, "")
                   .replace(/<img\b[^>]*>/gi, "");
    }

    /**
     * Ensure URLs are absolute and have protocol
     */
    function fixUrl(url) {
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        if (url.indexOf('http') !== 0) return mainUrl + (url.indexOf('/') === 0 ? '' : '/') + url;
        return url;
    }

    function Uakino(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask: true, over: true, scroll_by_item: true});
        var items = [];
        var active = 0;
        var extract_file_regex = /file\s*:\s*["']([^"']+?)["']/g;
        var extract_subs_regex = /subtitle\s*:\s*["']([^"']+?)["']/g;
        var episodes = [];
        var _this = this;

        this.create = function () {
            this.activity.loader(true);

            var url = mainUrl + '/ua/';
            var data = {
                'do': 'search',
                'subaction': 'search',
                'story': object.movie.title || object.movie.name
            };

            var postData = Object.keys(data).map(function(key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
            }).join('&');

            network.silent(getProxy(url), function (html_str) {
                var dom = $(cleanHTML(html_str));
                var found = [];
                dom.find('div.movie-item.short-item').each(function () {
                    var a = $(this).find('a.movie-title, a.full-movie');
                    var href = a.attr('href');
                    if (href && !href.match(/(\/news\/)|(\/franchise\/)/)) {
                        found.push({title: a.text().trim(), href: fixUrl(href)});
                    }
                });

                if (found.length) {
                    _this.load(found[0].href);
                } else {
                    _this.empty();
                }
            }, function (a, c) {
                _this.empty(network.errorDecode(a, c));
            }, postData, {dataType: 'text'});

            return this.render();
        };

        this.load = function (url) {
            network.silent(getProxy(url), function (html_str) {
                var id_match = url.split('/').pop().match(/^(\d+)/);
                var id = id_match ? id_match[1] : '';
                var is_serial = url.match(/(\/anime-series)|(\/seriesss)|(\/cartoonseries)/);

                if (is_serial && id) {
                    var playlistUrl = mainUrl + '/engine/ajax/playlists.php?news_id=' + id + '&xfield=playlist&time=' + Date.now();
                    network.silent(getProxy(playlistUrl), function (json) {
                        if (json && json.success && json.response) {
                            var eps_dom = $('<div>' + json.response + '</div>');
                            episodes = [];
                            eps_dom.find('div.playlists-videos li').each(function () {
                                var el = $(this);
                                episodes.push({
                                    title: el.text().trim(),
                                    file: el.attr('data-file'),
                                    voice: el.attr('data-voice')
                                });
                            });
                            if (episodes.length) _this.build();
                            else _this.empty();
                        } else _this.empty();
                    }, function (a, c) { _this.empty(network.errorDecode(a, c)); }, false, {
                        headers: {'X-Requested-With': 'XMLHttpRequest'}
                    });
                } else {
                    var dom = $(cleanHTML(html_str));
                    var iframe = dom.find('iframe#pre').attr('data-src') || dom.find('iframe#pre').attr('src');
                    if (iframe) {
                        episodes = [{title: object.movie.title || object.movie.name, file: fixUrl(iframe)}];
                        _this.build();
                    } else _this.empty();
                }
            }, function (a, c) { _this.empty(network.errorDecode(a, c)); }, false, {dataType: 'text'});
        };

        this.build = function () {
            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            items = [];
            scroll.clear();
            
            episodes.forEach(function (element, index) {
                var hash = Lampa.Utils.hash(element.title + (object.movie.original_title || object.movie.original_name));
                var view = Lampa.Timeline.view(hash);
                
                var item = Lampa.Template.get('online', {
                    title: element.title,
                    quality: 'HD'
                });

                item.append(Lampa.Timeline.render(view));
                
                if (viewed.indexOf(hash) !== -1) {
                    item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                }

                item.on('hover:enter', function () {
                    active = index;
                    _this.play(element);
                    
                    if (viewed.indexOf(hash) === -1) {
                        viewed.push(hash);
                        item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                        Lampa.Storage.set('online_view', viewed);
                    }
                }).on('hover:focus', function(){
                    active = index;
                });

                scroll.append(item);
                items.push(item);
            });

            this.activity.loader(false);
            this.activity.toggle();
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(items[active] ? items[active][0] : false, scroll.render());
                },
                up: function () {
                    if (active > 0) {
                        active--;
                        Lampa.Controller.collectionFocus(items[active][0], scroll.render());
                        scroll.update(items[active]);
                    } else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (active < items.length - 1) {
                        active++;
                        Lampa.Controller.collectionFocus(items[active][0], scroll.render());
                        scroll.update(items[active]);
                    }
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        };

        this.play = function (element) {
            Lampa.Loading.start();

            function getStream(el, callback, error) {
                var stream_url = fixUrl(el.file);
                network.silent(getProxy(stream_url), function (html_player) {
                    extract_file_regex.lastIndex = 0;
                    extract_subs_regex.lastIndex = 0;
                    
                    var m3u8_match = extract_file_regex.exec(html_player);
                    var subs_match = extract_subs_regex.exec(html_player);
                    
                    if (m3u8_match) {
                        var video = {
                            url: m3u8_match[1],
                            title: el.title,
                            subtitles: []
                        };
                        if (subs_match) {
                            var label = subs_match[1].substring(subs_match[1].lastIndexOf('[') + 1, subs_match[1].lastIndexOf(']'));
                            var src = subs_match[1].substring(subs_match[1].lastIndexOf(']') + 1);
                            video.subtitles.push({label: label || 'Укр', url: src});
                        }
                        callback(video);
                    } else error();
                }, error, false, {dataType: 'text'});
            }

            getStream(element, function (video) {
                Lampa.Loading.stop();
                
                var playlist = episodes.map(function (el) {
                    if (el === element) return video;
                    return {
                        title: el.title,
                        url: function (call) {
                            getStream(el, function (v) {
                                call(v.url, v.subtitles);
                            }, function () { call(''); });
                        }
                    };
                });

                Lampa.Player.play(video);
                Lampa.Player.playlist(playlist);
            }, function () {
                Lampa.Loading.stop();
                Lampa.Noty.show('Помилка завантаження потоку');
            });
        };

        this.empty = function (error) {
            this.activity.loader(false);
            Lampa.Noty.show(error || 'Нічого не знайдено на Uakino');
            Lampa.Activity.backward();
        };

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return scroll.render();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            items = [];
        };
    }

    function startPlugin() {
        Lampa.Component.add('uakino', Uakino);

        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var button = $('<div class="full-start__button selector view--uakino"><span>Uakino</span></div>');
                button.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: 'Uakino',
                        component: 'uakino',
                        movie: e.data.movie,
                        page: 1
                    });
                });
                
                var container = e.object.activity.render().find('.full-start-new__buttons');
                if (container.length) container.append(button);
                else e.object.activity.render().find('.view--torrent').after(button);

                if(e.object.items && e.object.items.length) e.object.items[0].emit('groupButtons');
            }
        });
    }

    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }
})();
