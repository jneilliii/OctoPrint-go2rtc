/*
 * View model for OctoPrint-go2rtc
 *
 * Author: jneilliii
 * License: AGPLv3
 */

$(function () {
        function go2rtcViewModel(parameters) {
            const self = this;

            self.settingsViewModel = parameters[0];
            self.streams = ko.observableDictionary();
            self.ffmpeg_sources = ko.observableArray([]);
            self.streams_updated = ko.observable(false);
            self.is_valid_url = ko.observable(false);
            self.server_url = "";

            self.validate_url = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() === "") {
                    self.is_valid_url(false);
                } else {
                    OctoPrint.simpleApiGet("go2rtc", {
                        'data': {
                            'test_url': true,
                            'server_url': self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                        }
                    })
                        .done(function (data) {
                            if (data.success) {
                                self.is_valid_url(true);
                                if (data.api) {
                                    self.settingsViewModel.settings.plugins.go2rtc.api_error(false);
                                    self.get_webcams();
                                } else {
                                    self.settingsViewModel.settings.plugins.go2rtc.api_error(true);
                                }
                                if (data.streams) {
                                    self.streams.removeAll();
                                    self.streams.pushAll(data.streams);
                                }
                                self.server_url = self.settingsViewModel.settings.plugins.go2rtc.server_url();
                                self.streams_updated(true);
                            }
                        });
                }
            };

            self.onBeforeBinding = function () {
                self.streams = ko.observableDictionary(ko.toJS(self.settingsViewModel.settings.plugins.go2rtc.streams));
                self.is_valid_url(self.settingsViewModel.settings.plugins.go2rtc.is_valid_url());
            };

            self.onAfterBinding = function () {
                if(self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    if(!self.is_valid_url()) {
                        self.validate_url();
                    }
                    if (!self.settingsViewModel.settings.plugins.go2rtc.api_error() && self.is_valid_url()) {
                        ko.utils.arrayForEach(self.streams.items(), function (item) {
                            const stream_key = item.key();
                            /** @type {VideoStream} */
                            const video = document.createElement('video-stream');
                            video.src = self.get_stream_src(stream_key);
                            video.background = false;
                            video.visibilityThreshold = 1;
                            document.getElementById('go2rtc_' + stream_key).appendChild(video);
                        });
                    }
                }
            };

            self.get_webcams = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    OctoPrint.simpleApiGet("go2rtc", {
                        'data': {
                            'get_cams': true,
                            'server_url': self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                        }
                    })
                        .done(function (data) {
                            if (data.hasOwnProperty("sources")) {
                                self.ffmpeg_sources(data.sources);
                            } else {
                                self.ffmpeg_sources.removeAll();
                            }
                        });
                }
            };

            self.onSettingsShown = function () {
                if(self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "" && self.is_valid_url()) {
                    self.get_webcams();
                }
            };

            self.onSettingsBeforeSave = function () {
                if(self.settingsViewModel.settings.plugins.go2rtc.server_url() === "") {
                    self.is_valid_url(false);
                }
                self.settingsViewModel.settings.plugins.go2rtc.is_valid_url(self.is_valid_url());
            };

            self.onSettingsHidden = function (payload) {
                if (self.streams_updated()) {
                    const buttons = [];
                    if (self.settingsViewModel.settings.server.commands.serverRestartCommand() !== null && self.settingsViewModel.settings.server.commands.serverRestartCommand() !== "") {
                        buttons.push({
                            text: 'Restart now',
                            addClass: 'btn-primary',
                            click: function (notice) {
                                OctoPrint.system.executeCommand("core", "restart");
                                notice.remove();
                            }
                        });
                    } else {
                        buttons.push({addClass: 'hidden'});
                    }
                    buttons.push({
                        text: 'Close',
                        addClass: 'btn-danger',
                        click: function (notice) {
                            notice.remove();
                        }
                    });

                    new PNotify({
                        title: 'Restart required',
                        text: "The go2rtc plugin has been updated. Please restart OctoPrint to apply the changes.",
                        type: 'info',
                        hide: false,
                        buttons: {
                            closer: false,
                            sticker: false
                        },
                        confirm: {
                            confirm: true,
                            buttons: buttons
                        }
                    });
                }
            };

            self.enable_cors = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    OctoPrint.simpleApiCommand("go2rtc", "enable_cors", {
                       'server_url': self.settingsViewModel.settings.plugins.go2rtc.server_url()
                    })
                        .done(function (data) {
                            if (data.success) {
                                self.validate_url();
                            }
                        });
                }
            };

            self.add_stream = function (data) {
                let webcam_name = data["name"] ? data["name"].replace(/[^a-zA-Z0-9_]/g, '_') : $("#new_stream_id").val().replace(/[^a-zA-Z0-9_]/g, '_');
                let src = data["url"] ? data["url"] : $("#new_stream_value").val();

                OctoPrint.simpleApiCommand("go2rtc", "add_stream", {
                    "name": webcam_name,
                    "src": src,
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url()
                }).done(function (response) {
                    if (response.success) {
                        self.streams.set(webcam_name, src);
                        self.streams_updated(true);
                    }
                }).fail(function (response) {
                    console.log(response);
                });
            };

            self.remove_stream = function (data) {
                OctoPrint.simpleApiCommand("go2rtc", "remove_stream", {
                    "name": data.key(),
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url()
                }).done(function (response) {
                    if (response.success) {
                        self.streams.remove(data);
                        self.streams_updated(true);
                    }
                }).fail(function (response) {
                    console.log(response);
                });
            };

            self.get_stream_src = function (data) {
                return new URL('api/ws?src=' + encodeURIComponent(data), self.settingsViewModel.settings.plugins.go2rtc.server_url()).toString();
            };
        }

        function getWebcamInstances() {
            let elements = ["#settings_plugin_go2rtc"];
            // get the number of webcam instances from the dom
            $('#webcam-group').children().each(function (index, element) {
                if (element.id.startsWith("go2rtc_")) {
                    elements.push("#" + element.id);
                }
            });

            return elements;
        }

        OCTOPRINT_VIEWMODELS.push({
            construct: go2rtcViewModel,
            dependencies: ["settingsViewModel"],
            elements: getWebcamInstances()
        });
    }
)

