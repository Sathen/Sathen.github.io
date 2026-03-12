(function () {
    'use strict';

    var mainUrl = 'https://uakino.best';

    function Uakino(object) {
        var network = new Lampa.Reguest();
        var extract_file_regex = /file\s*:\s*["']([^"']+?)["']/g;
        var extract_subs_regex = /subtitle\s*:\s*["']([^"']+?)["']/g;

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

        function cleanHTML(html) {
            return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                       .replace(/<link\b[^>]*>/gi, "")
                       .replace(/<img\b[^>]*>/gi, "");
        }

        this.search = function () {
            var _this = this;
            var url = mainUrl + '/ua/';
            var data = {
                'do': 'search',
                'subaction': 'search',
                'story': object.movie.title || object.movie.name
            };

            Lampa.Loading.start(function(){
                network.clear();
                Lampa.Loading.stop();
            });

            var postData = Object.keys(data).map(function(key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
            }).join('&');

            network.silent(getProxy(url), function (html) {
                Lampa.Loading.stop();
                var items = _this.parseSearch(html);
                if (items.length) {
                    _this.load(items[0].href);
                } else {
                    _this.empty();
                }
            }, function (a, c) {
                Lampa.Loading.stop();
                _this.empty(network.errorDecode(a, c));
            }, postData, {dataType: 'text'});
        };

        this.parseSearch = function (html) {
            var items = [];
            var dom = $(cleanHTML(html));
            dom.find('div.movie-item.short-item').each(function () {
                var el = $(this);
                var a = el.find('a.movie-title, a.full-movie');
                var href = a.attr('href');
                if (href && !href.match(/(\/news\/)|(\/franchise\/)/)) {
                    items.push({
                        title: a.text().trim(),
                        href: href
                    });
                }
            });
            return items;
        };

        this.load = function (url) {
            var _this = this;
            Lampa.Loading.start();
            network.silent(getProxy(url), function (html) {
                Lampa.Loading.stop();
                _this.parseDetails(html, url);
            }, function (a, c) {
                Lampa.Loading.stop();
                _this.empty(network.errorDecode(a, c));
            }, false, {dataType: 'text'});
        };

        this.parseDetails = function (html, url) {
            var _this = this;
            var dom = $(cleanHTML(html));
            var id = url.split('/').pop().split('-')[0];
            var is_serial = url.match(/(\/anime-series)|(\/seriesss)|(\/cartoonseries)/);

            if (is_serial) {
                var playlistUrl = mainUrl + '/engine/ajax/playlists.php?news_id=' + id + '&xfield=playlist&time=' + Date.now();
                Lampa.Loading.start();
                network.silent(getProxy(playlistUrl), function (json) {
                    Lampa.Loading.stop();
                    if (json && json.success) {
                        var eps_dom = $('<div>' + json.response + '</div>');
                        var episodes = [];
                        eps_dom.find('div.playlists-videos li').each(function () {
                            var el = $(this);
                            episodes.push({
                                name: el.text().trim(),
                                file: el.attr('data-file'),
                                voice: el.attr('data-voice')
                            });
                        });
                        _this.showEpisodes(episodes);
                    } else {
                        _this.empty();
                    }
                }, function (a, c) {
                    Lampa.Loading.stop();
                    _this.empty(network.errorDecode(a, c));
                }, false, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
            } else {
                var iframe = dom.find('iframe#pre').attr('data-src') || dom.find('iframe#pre').attr('src');
                if (iframe) {
                    if (iframe.indexOf('//') === 0) iframe = 'https:' + iframe;
                    _this.extractPlayer(iframe, object.movie.title || object.movie.name);
                } else {
                    _this.empty();
                }
            }
        };

        this.showEpisodes = function (episodes) {
            var _this = this;
            var items = episodes.map(function (eps) {
                return {
                    title: eps.name,
                    subtitle: eps.voice,
                    eps: eps
                };
            });

            Lampa.Select.show({
                title: 'Серії',
                items: items,
                onSelect: function (a) {
                    var file = a.eps.file;
                    if (file && file.indexOf('//') === 0) file = 'https:' + file;
                    _this.extractPlayer(file, a.eps.voice || a.eps.name);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        };

        this.extractPlayer = function (url, sourceName) {
            var _this = this;
            Lampa.Loading.start();
            network.silent(getProxy(url), function (html) {
                Lampa.Loading.stop();
                
                extract_file_regex.lastIndex = 0;
                extract_subs_regex.lastIndex = 0;

                var m3u8_match = extract_file_regex.exec(html);
                var subs_match = extract_subs_regex.exec(html);
                
                var video_url = m3u8_match ? m3u8_match[1] : '';
                var subs_url = subs_match ? subs_match[1] : '';

                if (video_url) {
                    var video = {
                        url: video_url,
                        title: (object.movie.title || object.movie.name) + (sourceName ? ' / ' + sourceName : ''),
                        subtitles: []
                    };

                    if (subs_url) {
                        var label = subs_url.substring(subs_url.lastIndexOf('[') + 1, subs_url.lastIndexOf(']'));
                        var src = subs_url.substring(subs_url.lastIndexOf(']') + 1);
                        video.subtitles.push({
                            label: label || 'Укр',
                            url: src
                        });
                    }

                    Lampa.Player.play(video);
                    Lampa.Player.callback(function () {
                        Lampa.Controller.toggle('content');
                    });
                } else {
                    Lampa.Noty.show('Посилання не знайдено');
                }
            }, function (a, c) {
                Lampa.Loading.stop();
                Lampa.Noty.show(network.errorDecode(a, c));
            }, false, {dataType: 'text'});
        };

        this.empty = function (error) {
            Lampa.Noty.show(error || 'Нічого не знайдено на Uakino');
        };
    }

    function startPlugin() {
        Lampa.Component.add('uakino', Uakino);

        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var button = $('<div class="full-start__button selector view--uakino"><span>Uakino</span></div>');
                button.on('hover:enter', function () {
                    var uakino = new Uakino(e.data);
                    uakino.search();
                });
                
                var container = e.object.activity.render().find('.full-start-new__buttons');
                if (container.length) {
                    container.append(button);
                } else {
                    var torrent_btn = e.object.activity.render().find('.view--torrent');
                    if (torrent_btn.length) torrent_btn.after(button);
                    else e.object.activity.render().find('.full-start__buttons').append(button);
                }

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
