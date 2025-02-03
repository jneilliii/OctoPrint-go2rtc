# coding=utf-8
from __future__ import absolute_import

import json
import os.path
import octoprint.plugin
from octoprint.util import yaml
import requests
import threading
from octoprint.schema.webcam import RatioEnum, Webcam, WebcamCompatibility
from octoprint.webcams import WebcamNotAbleToTakeSnapshotException, get_webcams


class go2rtcPlugin(octoprint.plugin.SettingsPlugin,
                   octoprint.plugin.AssetPlugin,
                   octoprint.plugin.TemplatePlugin,
                   octoprint.plugin.WebcamProviderPlugin
                   ):

    def __init__(self, *args, **kwargs):
        self._plugin_settings = None
        self.streamTimeout = 15
        self.snapshotTimeout = 15
        self.cacheBuster = True
        self.snapshotSslValidation = True
        self.webRtcServers = []
        self._capture_mutex = threading.Lock()

    ##~~ SettingsPlugin mixin

    def get_settings_defaults(self):
        return {
            "server_url": "http://localhost:1984",
            "streams": "",
            "stream_profiles": {'Default': {'name': 'Default',
                                            'URL': octoprint.settings.settings().get(["webcam", "stream"]),
                                            'snapshot': octoprint.settings.settings().get(["webcam", "snapshot"]),
                                            'streamRatio': octoprint.settings.settings().get(["webcam", "streamRatio"]),
                                            'flipH': octoprint.settings.settings().get(["webcam", "flipH"]),
                                            'flipV': octoprint.settings.settings().get(["webcam", "flipV"]),
                                            'rotate90': octoprint.settings.settings().get(["webcam", "rotate90"]),
                                            'isButtonEnabled': 'true'
                                            }}
        };

    def on_settings_load(self):
        self._plugin_settings = self._settings.get([], merged=True)
        if not self._settings.get(["server_url"]) == "":
            config_url = self._settings.get(["server_url"]) + "/api/config"
            web_response = requests.get(config_url)

            if web_response.status_code == 200:
                self._plugin_settings = octoprint.util.dict_merge(self._plugin_settings,
                                                                  yaml.load_from_file(web_response.content))

        self._logger.info(self._plugin_settings)
        return self._plugin_settings

    def on_settings_save(self, data):
        self._logger.info(data)
        # config_file = os.path.join(self._settings.get_plugin_data_folder(), "go2rtc.yaml")
        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
        settings_to_save = self._settings.get([], merged=True)
        # overwrite saved streams if they don't match
        if data.get("streams", False) != self._plugin_settings.get("streams", False):
            settings_to_save["streams"] = data["streams"]
        else:
            settings_to_save["streams"] = self._plugin_settings.get("streams", {})

        config_url = self._settings.get(["server_url"]) + "/api/config"
        restart_url = self._settings.get(["server_url"]) + "/api/restart"
        config_response = requests.post(config_url, data=yaml.dump(settings_to_save))

        if config_response.status_code == 200:
            self._logger.info(f"Settings saved, attempting restart")
            restart_response = requests.post(restart_url)
            if restart_response.status_code == 200:
                self._logger.info(f"Server restarted")
            else:
                self._logger.error(f"Server restart response {restart_response.status_code}")
        else:
            self._logger.error(f"Server config response {config_response.status_code}")

    ##~~ AssetPlugin mixin

    def get_assets(self):
        return {
            "js": ["js/ko.observableDictionary.js",
                   "js/video-rtc.js",
                   "js/video-stream.js",
                   "js/go2rtc.js"],
        }

    ##~~ TemplatePlugin mixin

    def get_template_vars(self):
        return {"plugin_version": self._plugin_version}

    def get_template_configs(self):
        webcams = self.get_webcam_configurations()

        def webcam_to_template(webcam):
            return {'type': "webcam", 'template': "go2rtc_webcam.jinja2", 'custom_bindings': True,
                    'div': f"go2rtc_{webcam.displayName}", 'name': webcam.displayName}

        webcam_templates = list(map(webcam_to_template, list(webcams)))

        return webcam_templates

    # ~~ WebcamProviderPlugin API

    def get_webcam_configurations(self):
        streams = self._settings.get(['streams'])
        profiles = self._settings.get(['stream_profiles'])

        def profile_to_webcam(stream_key):
            profile = profiles.get(stream_key, None) or profiles.get("Default")
            flipH = profile.get("flipH", None) or False
            flipV = profile.get("flipV", None) or False
            rotate90 = profile.get("rotate90", None) or False
            snapshot = profile.get("snapshot", None)
            stream = profile.get("URL", None) or ""
            streamRatio = profile.get("streamRatio", None) or "4:3"
            canSnapshot = snapshot != "" and snapshot is not None
            name = stream_key

            webcam = Webcam(
                name=f"go2rtc/{name}",
                displayName=name,
                flipH=flipH,
                flipV=flipV,
                rotate90=rotate90,
                snapshotDisplay=snapshot,
                canSnapshot=canSnapshot,
                compat=WebcamCompatibility(
                    stream=stream,
                    streamTimeout=self.streamTimeout,
                    streamRatio=streamRatio,
                    cacheBuster=self.cacheBuster,
                    streamWebrtcIceServers=self.webRtcServers,
                    snapshot=snapshot,
                    snapshotTimeout=self.snapshotTimeout,
                    snapshotSslValidation=self.snapshotSslValidation,
                ),
                extras=dict(
                    stream=stream,
                    streamTimeout=self.streamTimeout,
                    streamRatio=streamRatio,
                    cacheBuster=self.cacheBuster,
                ),
            )
            self._logger.debug(f"Webcam: {webcam}")
            return webcam

        return [profile_to_webcam(stream_key) for stream_key in streams]

    def take_webcam_snapshot(self, provided_webcam):
        webcam = provided_webcam.config

        if webcam is None:
            raise WebcamNotAbleToTakeSnapshotException("provided_webcam is None")

        # using compat.snapshot because snapshotDisplay is supposedly only for user
        snapshot_url = webcam.compat.snapshot
        can_snapshot = snapshot_url is not None and snapshot_url != "http://" and snapshot_url != ""

        if not can_snapshot:
            raise WebcamNotAbleToTakeSnapshotException(webcam.name)

        with self._capture_mutex:
            self._logger.debug(f"Capturing image from {snapshot_url}")
            r = requests.get(
                snapshot_url,
                stream=True,
                timeout=self.snapshotTimeout,
                verify=self.snapshotSslValidation,
            )
            r.raise_for_status()
            return r.iter_content(chunk_size=1024)

    ##~~ Softwareupdate hook

    def get_update_information(self):
        return {
            "go2rtc": {
                "displayName": "go2rtc",
                "displayVersion": self._plugin_version,

                # version check: github repository
                "type": "github_release",
                "user": "jneilliii",
                "repo": "OctoPrint-go2rtc",
                "current": self._plugin_version,

                # update method: pip
                "pip": "https://github.com/jneilliii/OctoPrint-go2rtc/archive/{target_version}.zip",
            }
        }


__plugin_name__ = "go2rtc"
__plugin_pythoncompat__ = ">=3,<4"  # Only Python 3


def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = go2rtcPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
