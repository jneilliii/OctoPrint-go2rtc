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
            self.disabled_streams = ko.observableDictionary();
            self.ffmpeg_sources = ko.observableArray([]);
            self.streams_updated = ko.observable(false);
            self.is_valid_url = ko.observable(false);
            self.verifying_url = ko.observable(false);
            self.server_url = "";

            // Helper function to get or create stream profile
            self.get_stream_profile = function(stream_key) {
                try {
                    if (!self.settingsViewModel.settings.plugins.go2rtc.stream_profiles) {
                        self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = {};
                    }
                    if (!self.settingsViewModel.settings.plugins.go2rtc.stream_profiles[stream_key]) {
                        self.settingsViewModel.settings.plugins.go2rtc.stream_profiles[stream_key] = {
                            flip_h: ko.observable(false),
                            flip_v: ko.observable(false),
                            rotate90: ko.observable(false)
                        };
                    } else {
                        // Ensure observables exist
                        const profile = self.settingsViewModel.settings.plugins.go2rtc.stream_profiles[stream_key];
                        if (typeof profile.flip_h !== 'function') {
                            profile.flip_h = ko.observable(profile.flip_h || false);
                        }
                        if (typeof profile.flip_v !== 'function') {
                            profile.flip_v = ko.observable(profile.flip_v || false);
                        }
                        if (typeof profile.rotate90 !== 'function') {
                            profile.rotate90 = ko.observable(profile.rotate90 || false);
                        }
                    }
                    return self.settingsViewModel.settings.plugins.go2rtc.stream_profiles[stream_key];
                } catch (e) {
                    console.error('Error in get_stream_profile:', e);
                    // Return safe defaults if there's an error
                    return {
                        flip_h: ko.observable(false),
                        flip_v: ko.observable(false),
                        rotate90: ko.observable(false)
                    };
                }
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
                                if (data.streams) {
                                    self.streams.removeAll();
                                    self.streams.pushAll(data.streams);
                                }
                                self.server_url = self.settingsViewModel.settings.plugins.go2rtc.server_url();
                                self.streams_updated(true);
                            } else {
                                let error_message = "Unable to validate server url."
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
                    self.streams = ko.observableDictionary(ko.toJS(self.settingsViewModel.settings.plugins.go2rtc.streams));
                    self.is_valid_url(self.settingsViewModel.settings.plugins.go2rtc.is_valid_url());

                    // Initialize stream_profiles if it doesn't exist or is invalid
                    if (!self.settingsViewModel.settings.plugins.go2rtc.stream_profiles ||
                        typeof self.settingsViewModel.settings.plugins.go2rtc.stream_profiles !== 'object') {
                        self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = {};
                    }

                    // Convert existing stream profiles to observables
                    const profiles = self.settingsViewModel.settings.plugins.go2rtc.stream_profiles;

                    for (const key in profiles) {
                        if (profiles.hasOwnProperty(key)) {
                            const profile = profiles[key];
                            if (!profile || typeof profile !== 'object') continue;

                            // Ensure all values are observables
                            if (typeof profile.flip_h !== 'function') {
                                profile.flip_h = ko.observable(profile.flip_h || false);
                            }
                            if (typeof profile.flip_v !== 'function') {
                                profile.flip_v = ko.observable(profile.flip_v || false);
                            }
                            if (typeof profile.rotate90 !== 'function') {
                                profile.rotate90 = ko.observable(profile.rotate90 || false);
                            }
                        }
                    }
                } catch (e) {
                    console.error('go2rtc: Fatal error in onBeforeBinding', e);
                    // Initialize with safe defaults
                    self.streams = ko.observableDictionary({});
                    self.is_valid_url(false);
                    self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = {};
                }
            };

            self.onAfterBinding = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() !== "") {
                    if (!self.is_valid_url()) {
                        self.validate_url();
                    }
                    if (!self.settingsViewModel.settings.plugins.go2rtc.api_error() && self.is_valid_url()) {
                        ko.utils.arrayForEach(self.streams.items(), function (item) {
                            const stream_key = item.key();
                            if(self.settingsViewModel.settings.plugins.go2rtc.disabled_streams.indexOf(stream_key) === -1) {
                                /** @type {VideoStream} */
                                const video = document.createElement('video-stream');
                                video.src = self.get_stream_src(stream_key);
                                video.background = false;
                                video.visibilityThreshold = 1;

                                // Get transform settings from profile
                                const profile = self.get_stream_profile(stream_key);
                                video.setAttribute('data-flip-h', ko.unwrap(profile.flip_h) || false);
                                video.setAttribute('data-flip-v', ko.unwrap(profile.flip_v) || false);
                                video.setAttribute('data-rotate90', ko.unwrap(profile.rotate90) || false);

                                document.getElementById('go2rtc_' + stream_key).appendChild(video);
                            } else {
                                self.disabled_streams.set(stream_key, item.value());
                            }
                        });
                        ko.utils.arrayForEach(self.disabled_streams.items(), function (item) {
                            self.streams.remove(item);
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
            };

            self.onSettingsBeforeSave = function () {
                if (self.settingsViewModel.settings.plugins.go2rtc.server_url() === "") {
                    self.is_valid_url(false);
                }
                self.settingsViewModel.settings.plugins.go2rtc.disabled_streams = self.disabled_streams.keys();
                self.settingsViewModel.settings.plugins.go2rtc.is_valid_url(self.is_valid_url());

                // Ensure stream_profiles exists before processing
                if (!self.settingsViewModel.settings.plugins.go2rtc.stream_profiles) {
                    self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = {};
                }

                // Check if transform settings have changed and convert observables to plain values
                let transformsChanged = false;
                const profiles = self.settingsViewModel.settings.plugins.go2rtc.stream_profiles;
                const plainProfiles = {};

                for (const key in profiles) {
                    if (profiles.hasOwnProperty(key)) {
                        const profile = profiles[key];
                        const flip_h = ko.unwrap(profile.flip_h) || false;
                        const flip_v = ko.unwrap(profile.flip_v) || false;
                        const rotate90 = ko.unwrap(profile.rotate90) || false;

                        // Check if any transform setting is enabled
                        if (flip_h || flip_v || rotate90) {
                            transformsChanged = true;
                        }

                        // Store plain values
                        plainProfiles[key] = {
                            flip_h: flip_h,
                            flip_v: flip_v,
                            rotate90: rotate90
                        };
                    }
                }

                // Store if transforms changed for later notification
                self.transformsChanged = transformsChanged;

                // Replace the profiles object with plain values for saving
                self.settingsViewModel.settings.plugins.go2rtc.stream_profiles = plainProfiles;
            };

            self.onSettingsHidden = function (payload) {
                // Check if transform settings changed and show notification
                if (self.transformsChanged) {
                    new PNotify({
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
                    self.transformsChanged = false;
                }

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
                let webcam_name = data["name"] ? data["name"].replace(/[^a-zA-Z0-9_]/g, '_') : $("#new_stream_id").val().replace(/[^a-zA-Z0-9_]/g, '_');
                let src = data["url"] ? data["url"] : $("#new_stream_value").val();

                OctoPrint.simpleApiCommand("go2rtc", "add_stream", {
                    "name": webcam_name,
                    "src": src,
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                    'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                }).done(function (response) {
                    if (response.success) {
                        self.streams.set(webcam_name, src);
                        self.streams_updated(true);
                    } else {
                        self.pop_error("Unable to add stream.");
                    }
                }).fail(function (response) {
                    console.log(response);
                });
            };

            self.disable_stream = function (data) {
                self.streams.remove(data);
                self.disabled_streams.set(data.key(), data.value());
                self.streams_updated(true);
            };

            self.enable_stream = function (data) {
                self.disabled_streams.remove(data);
                self.streams.set(data.key(), data.value());
                self.streams_updated(true);
            };

            self.remove_stream = function (data) {
                OctoPrint.simpleApiCommand("go2rtc", "remove_stream", {
                    "name": data.key(),
                    "server_url": self.settingsViewModel.settings.plugins.go2rtc.server_url(),
                    'ignore_ssl_validation': self.settingsViewModel.settings.plugins.go2rtc.ignore_ssl_validation(),
                }).done(function (response) {
                    if (response.success) {
                        self.streams.remove(data);
                        self.streams_updated(true);
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

