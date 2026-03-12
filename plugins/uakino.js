(function () {
    'use strict';

    var mainUrl = 'https://uakino.best';

    function Uakino(object) {
        var network = Lampa.Network;
        var extract_file_regex = /file\s*:\s*["']([^"']+?)["']/g;
        var extract_subs_regex = /subtitle\s*:\s*["']([^"']+?)["']/g;

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

            network.silent(url, function (html) {
                Lampa.Loading.stop();
                var items = _this.parseSearch(html);
                if (items.length) {
                    _this.load(items[0].href);
                } else {
                    _this.empty();
                }
            }, function () {
                Lampa.Loading.stop();
                _this.empty();
            }, Lampa.Utils.paramsToQuery(data));
        };

        this.parseSearch = function (html) {
            var items = [];
            var dom = $(html);
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
            network.silent(url, function (html) {
                Lampa.Loading.stop();
                _this.parseDetails(html, url);
            }, function () {
                Lampa.Loading.stop();
                _this.empty();
            });
        };

        this.parseDetails = function (html, url) {
            var _this = this;
            var dom = $(html);
            var id = url.split('/').pop().split('-')[0];
            var is_serial = url.match(/(\/anime-series)|(\/seriesss)|(\/cartoonseries)/);

            if (is_serial) {
                var playlistUrl = mainUrl + '/engine/ajax/playlists.php?news_id=' + id + '&xfield=playlist&time=' + Date.now();
                Lampa.Loading.start();
                network.silent(playlistUrl, function (json) {
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
                }, function () {
                    Lampa.Loading.stop();
                    _this.empty();
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
            network.silent(url, function (html) {
                Lampa.Loading.stop();
                
                // Reset regex state for global flag
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
            }, function () {
                Lampa.Loading.stop();
                Lampa.Noty.show('Помилка завантаження плеєра');
            }, false, {
                headers: {
                    'Referer': mainUrl + '/'
                }
            });
        };

        this.empty = function () {
            Lampa.Noty.show('Нічого не знайдено на Uakino');
        };
    }

    function startPlugin() {
        // Register as a potential source for the "Play" menu
        Lampa.Component.add('uakino', Uakino);

        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var button = $('<div class="full-start__button selector view--uakino"><span>Uakino</span></div>');
                button.on('hover:enter', function () {
                    var uakino = new Uakino(e.data);
                    uakino.search();
                });
                
                // Adding the button to the container
                var container = e.object.activity.render().find('.full-start-new__buttons');
                if (container.length) {
                    container.append(button);
                } else {
                    // Fallback for older versions or different skins
                    var torrent_btn = e.object.activity.render().find('.view--torrent');
                    if (torrent_btn.length) torrent_btn.after(button);
                    else e.object.activity.render().find('.full-start__buttons').append(button);
                }

                // Important: Notify the controller that the collection of buttons has changed
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
