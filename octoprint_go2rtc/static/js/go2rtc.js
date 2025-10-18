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
            // TODO: Convert observableDictionaries to observableArrays?
            self.stream_profiles = ko.observableDictionary();
            self.disabled_streams = ko.observableDictionary();
            self.ffmpeg_sources = ko.observableArray([]);
            self.restart_needed = false;
            self.is_valid_url = ko.observable(false);
            self.verifying_url = ko.observable(false);
            self.server_url = "";
            self.original_stream_keys = [];
            self.original_stream_transforms = {};
            self.refresh_needed = false;
            self.pop_up = null;

            self._default_profile = {
                'name': '',
                'URL': null,
                'snapshot': null,
                'stream_ratio': null,
                'flip_h': null,
                'flip_v': null,
                'rotate90': null
            };

            self.validate_url = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() === "") {
                    self.is_valid_url(false);
                } else {
                    self.verifying_url(true);
                    OctoPrint.simpleApiGet("go2rtc", {
                        'data': {
                            'test_url': true,
                            'server_url': self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                            'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
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
                                if (data.stream_profiles) {
                                    self.stream_profiles.removeAll();
                                    self.stream_profiles.pushAll(data.stream_profiles);
                                    self.original_stream_keys = self.stream_profiles.keys();
                                }
                                self.server_url = self.settingsViewModel.settings.plugins.go2rtc.server_url();

                                if(JSON.stringify(self.original_stream_keys.sort()) !== JSON.stringify(self.stream_profiles.keys().sort())) {
                                    self.restart_needed = true;
                                }
                            } else {
                                let error_message = "Unable to validate server url.";
                                if (data.error) {
                                    error_message = 'There was a "' + data.error + '", unable to validate server url.';
                                }
                                self.pop_error(error_message);
                            }
                            self.verifying_url(false);
                        });
                }
            };

            self.onBeforeBinding = function () {
                try {
                    self.stream_profiles = ko.observableDictionary(ko.toJS(self.settingsViewModel.settings.plugins.go2rtc.stream_profiles));
                    self.disabled_streams = ko.observableDictionary(ko.toJS(self.settingsViewModel.settings.plugins.go2rtc.disabled_streams));
                    self.is_valid_url(self.settingsViewModel.settings.plugins.go2rtc.is_valid_url());
                } catch (e) {
                    console.error('go2rtc: Fatal error in onBeforeBinding', e);
                    // Initialize with safe defaults
                    self.stream_profiles = ko.observableDictionary({});
                    self.disabled_streams = ko.observableDictionary({});
                    self.is_valid_url(false);
                }
            };

            self.onAfterBinding = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    if (!self.is_valid_url()) {
                        self.validate_url();
                    }
                    if (!self.settingsViewModel.settings.plugins.go2rtc.api_error() && self.is_valid_url()) {
                        // remove disabled streams from all available stream profiles
                        ko.utils.arrayForEach(self.disabled_streams.items(), function (item) {
                            self.stream_profiles.remove(item);
                        });
                        self.original_stream_keys = self.stream_profiles.keys();
                        // loop through stream profiles and add video element to container template
                        ko.utils.arrayForEach(self.original_stream_keys, function (stream_key) {
                            if(!self.settingsViewModel.settings.plugins.go2rtc.disabled_streams.hasOwnProperty(stream_key) && self.settingsViewModel.settings.plugins.go2rtc.stream_profiles.hasOwnProperty(stream_key)) {
                                /** @type {VideoStream} */
                                const video = document.createElement('video-stream');
                                video.src = self.get_stream_src(stream_key);
                                video.background = false;
                                video.visibilityThreshold = 1;

                                // Get transform settings from profile
                                const profile = self.stream_profiles.get(stream_key);
                                video.setAttribute('data-flip-h', profile().flip_h);
                                video.setAttribute('data-flip-v', profile().flip_v);
                                video.setAttribute('data-rotate90', profile().rotate90);

                                $('#go2rtc_' + stream_key).append(video);

                                self.original_stream_transforms[stream_key] = {
                                    'flip_h': profile().flip_h,
                                    'flip_v': profile().flip_v,
                                    'rotate90': profile().rotate90
                                };
                            }
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
                            'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                        }
                    })
                        .done(function (data) {
                            if (data.hasOwnProperty("sources")) {
                                self.ffmpeg_sources(data.sources);
                            } else {
                                self.ffmpeg_sources.removeAll();
                                self.pop_error("Unable to get webcams");
                            }
                        });
                }
            };

            self.onSettingsShown = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "" && self.is_valid_url()) {
                    self.get_webcams();
                }
                if (self.pop_up) {
                    self.pop_up.remove();
                    self.pop_up = null;
                }
            };

            self.onSettingsBeforeSave = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() === "") {
                    self.is_valid_url(false);
                }
                self.settingsViewModel.settings.plugins.go2rtc.is_valid_url(self.is_valid_url());
                self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = self.stream_profiles;
                self.settingsViewModel.settings.plugins.go2rtc.disabled_streams = self.disabled_streams;
                self.settingsViewModel.settings.plugins.go2rtc["remove_disabled_streams"] = self.stream_profiles.keys();
                self.settingsViewModel.settings.plugins.go2rtc["remove_stream_profiles"] = self.disabled_streams.keys();
                if(JSON.stringify(self.original_stream_keys.sort()) !== JSON.stringify(self.stream_profiles.keys().sort())){
                    self.restart_needed = true;
                }
                const new_stream_transforms = {};
                ko.utils.arrayForEach(self.stream_profiles.keys(), function (stream_key) {
                    new_stream_transforms[stream_key] = {
                        'flip_h': self.stream_profiles.get(stream_key)().flip_h,
                        'flip_v': self.stream_profiles.get(stream_key)().flip_v,
                        'rotate90': self.stream_profiles.get(stream_key)().rotate90
                    };
                    if ($('#go2rtc_' + stream_key).length === 0) {
                        self.restart_needed = true;
                    }
                });

                if (JSON.stringify(self.original_stream_transforms) !== JSON.stringify(new_stream_transforms)) {
                    self.refresh_needed = true;
                }
            };

            self.onSettingsHidden = function (payload) {
                if (self.restart_needed) {
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

                    self.pop_up = new PNotify({
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
                } else if (self.refresh_needed) {
                    self.pop_up = new PNotify({
                        title: 'Refresh required',
                        text: "Stream transform settings have been updated. Please refresh the page to see the changes.",
                        type: 'info',
                        hide: false,
                        buttons: {
                            closer: false,
                            sticker: false
                        },
                        confirm: {
                            confirm: true,
                            buttons: [{
                                text: 'Refresh now',
                                addClass: 'btn-primary',
                                click: function (notice) {
                                    location.reload();
                                    notice.remove();
                                }
                            }, {
                                text: 'Later',
                                addClass: 'btn-secondary',
                                click: function (notice) {
                                    notice.remove();
                                }
                            }]
                        }
                    });
                }
            };

            self.enable_cors = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    OctoPrint.simpleApiCommand("go2rtc", "enable_cors", {
                        'server_url': self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                        'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                    })
                        .done(function (data) {
                            if (data.success) {
                                self.validate_url();
                            } else {
                                self.pop_error("Unable to enable CORS.");
                            }
                        });
                }
            };

            self.add_stream = function (data) {
                const webcam_name = data["name"] ? data["name"].replace(/[^a-zA-Z0-9_]/g, '_') : $("#new_stream_id").val().replace(/[^a-zA-Z0-9_]/g, '_');
                const src = data["url"] ? data["url"] : $("#new_stream_value").val();

                OctoPrint.simpleApiCommand("go2rtc", "add_stream", {
                    "name": webcam_name,
                    "src": src,
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                    'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                }).done(function (response) {
                    if (response.success) {
                        let profile = self._default_profile;
                        profile.name = webcam_name;
                        profile.URL = src;
                        self.stream_profiles.push(webcam_name, profile);
                    } else {
                        self.pop_error("Unable to add stream.");
                    }
                }).fail(function (response) {
                    console.log(response);
                });
            };

            self.disable_stream = function (data) {
                self.stream_profiles.remove(data);
                self.disabled_streams.push(data);
                // self.disabled_streams.set(data.key(), ko.unwrap(data.value().URL));
            };

            self.enable_stream = function (data) {
                self.disabled_streams.remove(data);
                self.stream_profiles.set(data.key(), data.value());
            };

            self.remove_stream_profile = function (data) {
                OctoPrint.simpleApiCommand("go2rtc", "remove_stream", {
                    "name": data.key(),
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                    'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                }).done(function (response) {
                    if (response.success) {
                        self.stream_profiles.remove(data);
                    } else {
                        self.pop_error("Unable to remove stream.");
                    }
                }).fail(function (response) {
                    console.log(response);
                });
            };

            self.get_stream_src = function (data) {
                return new URL(self.settingsViewModel.settings.plugins.go2rtc.server_url() + '/api/ws?src=' + encodeURIComponent(data)).toString();
            };

            self.pop_error = function (error_message) {
                new PNotify({
                    title: 'go2rtc error',
                    text: error_message,
                    type: 'error',
                    hide: false,
                    buttons: {
                        closer: false,
                        sticker: false
                    },
                    confirm: {
                        confirm: true,
                        buttons: [{addClass: 'hidden'}, {
                            text: 'Close',
                            addClass: 'btn-danger',
                            click: function (notice) {
                                notice.remove();
                            }
                        }]
                    }
                });
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

