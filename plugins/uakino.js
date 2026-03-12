(function () {
    'use strict';

    var network = new Lampa.Reguest();
    var mainUrl = 'https://uakino.best';

    function Uakino(object) {
        var comp = new Lampa.InteractionMain(object);
        var extract_file_regex = /file\s*:\s*["']([^"']+?)["']/g;
        var extract_subs_regex = /subtitle\s*:\s*["']([^"']+?)["']/g;

        comp.create = function () {
            this.activity.loader(true);
            this.search();
            return this.render();
        };

        comp.search = function () {
            var _this = this;
            var url = mainUrl + '/ua/';
            var data = {
                'do': 'search',
                'subaction': 'search',
                'story': object.movie.title
            };

            network.silent(url, function (html) {
                var items = _this.parseSearch(html);
                if (items.length) {
                    _this.load(items[0].href);
                } else {
                    _this.empty();
                }
            }, function () {
                _this.empty();
            }, Lampa.Utils.paramsToQuery(data));
        };

        comp.parseSearch = function (html) {
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

        comp.load = function (url) {
            var _this = this;
            network.silent(url, function (html) {
                _this.parseDetails(html, url);
            }, function () {
                _this.empty();
            });
        };

        comp.parseDetails = function (html, url) {
            var _this = this;
            var dom = $(html);
            var id = url.split('/').pop().split('-')[0];
            var is_serial = url.match(/(\/anime-series)|(\/seriesss)|(\/cartoonseries)/);

            if (is_serial) {
                var playlistUrl = mainUrl + '/engine/ajax/playlists.php?news_id=' + id + '&xfield=playlist&time=' + Date.now();
                network.silent(playlistUrl, function (json) {
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
                    _this.empty();
                });
            } else {
                var iframe = dom.find('iframe#pre').attr('data-src') || dom.find('iframe#pre').attr('src');
                if (iframe) {
                    if (iframe.indexOf('//') === 0) iframe = 'https:' + iframe;
                    _this.extractPlayer(iframe, object.movie.title);
                } else {
                    _this.empty();
                }
            }
        };

        comp.showEpisodes = function (episodes) {
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

        comp.extractPlayer = function (url, sourceName) {
            var _this = this;
            this.activity.loader(true);
            network.silent(url, function (html) {
                _this.activity.loader(false);
                var m3u8_match = extract_file_regex.exec(html);
                var subs_match = extract_subs_regex.exec(html);
                
                var video_url = m3u8_match ? m3u8_match[1] : '';
                var subs_url = subs_match ? subs_match[1] : '';

                if (video_url) {
                    var video = {
                        url: video_url,
                        title: object.movie.title + (sourceName ? ' / ' + sourceName : ''),
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
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка завантаження плеєра');
            }, false, {
                headers: {
                    'Referer': mainUrl + '/'
                }
            });
        };

        comp.empty = function () {
            this.activity.loader(false);
            Lampa.Noty.show('Нічого не знайдено на Uakino');
        };
    }

    function startPlugin() {
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
                    e.object.activity.render().find('.view--torrent').after(button);
                }
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
