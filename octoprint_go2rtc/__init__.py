# coding=utf-8
from __future__ import absolute_import

import threading
import flask
import octoprint.plugin
import requests
from requests.exceptions import Timeout, ConnectionError
from octoprint.schema.webcam import Webcam, WebcamCompatibility, RatioEnum
from octoprint.util import yaml
from octoprint.webcams import WebcamNotAbleToTakeSnapshotException
from octoprint.access.permissions import Permissions, ADMIN_GROUP
from flask_babel import gettext


class go2rtcPlugin(octoprint.plugin.SettingsPlugin,
                   octoprint.plugin.AssetPlugin,
                   octoprint.plugin.TemplatePlugin,
                   octoprint.plugin.WebcamProviderPlugin,
                   octoprint.plugin.SimpleApiPlugin
                   ):

    def __init__(self, *args, **kwargs):
        super().__init__()
        self._plugin_settings = None
        self.streamTimeout = 15
        self.snapshotTimeout = 15
        self.cacheBuster = True
        self.snapshotSslValidation = True
        self.webRtcServers = []
        self._capture_mutex = threading.Lock()
        self._yaml_settings = None
        self._default_profile = {'name': 'Default',
                                 'URL': None,
                                 'snapshot': None,
                                 'stream_ratio': None,
                                 'flip_h': None,
                                 'flip_v': None,
                                 'rotate90': None,
                                 }

    ##~~ SettingsPlugin mixin

    def get_settings_defaults(self):
        return {
            "api_error": False,
            "is_valid_url": False,
            "server_url": "",
            "stream_profiles": {}
        }

    def on_settings_load(self):
        self._plugin_settings = self._settings.get([], merged=True)
        if not self._settings.get(["server_url"]) == "":
            config_url = self._settings.get(["server_url"]) + "/api/config"
            try:
                web_response = requests.get(config_url, timeout=(3, 10))
                if web_response.status_code == 200:
                    self._yaml_settings = yaml.load_from_file(web_response.content)
                    if not self._yaml_settings.get("api", {}).get("origin"):
                        self._plugin_settings["api_error"] = True
                    self._plugin_settings = octoprint.util.dict_merge(self._plugin_settings, self._yaml_settings)
                else:
                    self._plugin_settings["is_valid_url"] = False
            except ConnectionError:
                self._logger.error(f"connection error with {config_url}")
                self._plugin_settings["is_valid_url"] = False
            except Timeout:
                self._logger.error(f"timeout error with {config_url}")
                self._plugin_settings["is_valid_url"] = False

        self._logger.info(f"on_settings_load: {self._plugin_settings}")
        return self._plugin_settings

    def on_settings_save(self, data):
        self._logger.info(f"on_settings_save data: {data}")

        if data.get("server_url", "") != "":
            # strip trailing slash from server url
            if data.get("server_url", "").endswith("/"):
                data["server_url"] = data["server_url"][:-1]

        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)

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
        streams = {}
        profiles = self._settings.get(['stream_profiles'])
        go2rtc_server_url = self._settings.get(['server_url'])
        if go2rtc_server_url != "":
            config_url = f"{go2rtc_server_url}/api/config"
            try:
                web_response = requests.get(config_url, timeout=(3, 10))

                if web_response.status_code == 200:
                    yaml_settings = yaml.load_from_file(web_response.content)
                    streams = yaml_settings.get("streams", {})
            except ConnectionError:
                self._logger.error(f"connection error with {config_url}")
                streams = {}
            except Timeout:
                self._logger.error(f"timeout error with {config_url}")
                streams = {}

        def profile_to_webcam(stream_key):
            profile = profiles.get(stream_key, None) or self._default_profile
            flip_h = profile.get("flip_h", None) or False
            flip_v = profile.get("flip_v", None) or False
            rotate90 = profile.get("rotate90", None) or False
            snapshot = profile.get("snapshot", None) or f"{go2rtc_server_url}/api/frame.jpeg?src={stream_key}"
            stream = profile.get("URL", None) or f"{go2rtc_server_url}/api/ws?src={stream_key}"
            stream_ratio = profile.get("stream_ratio", None) or "4:3"
            can_snapshot = snapshot != "" and snapshot is not None
            name = stream_key

            webcam = Webcam(
                name=f"go2rtc/{name}",
                displayName=name,
                flipH=flip_h,
                flipV=flip_v,
                rotate90=rotate90,
                snapshotDisplay=snapshot,
                canSnapshot=can_snapshot,
                compat=WebcamCompatibility(
                    stream=stream,
                    streamTimeout=self.streamTimeout,
                    streamRatio=RatioEnum(stream_ratio),
                    cacheBuster=self.cacheBuster,
                    streamWebrtcIceServers=self.webRtcServers,
                    snapshot=snapshot,
                    snapshotTimeout=self.snapshotTimeout,
                    snapshotSslValidation=self.snapshotSslValidation,
                ),
                extras=dict(
                    stream=stream,
                    streamTimeout=self.streamTimeout,
                    streamRatio=stream_ratio,
                    cacheBuster=self.cacheBuster,
                ),
            )
            self._logger.debug(f"Webcam: {webcam}")
            return webcam

        return [profile_to_webcam(stream_key) for stream_key in streams]

    def lookup_webcam(self, webcam_name):
        webcam_configs = self.get_webcam_configurations()
        return [webcam_config for webcam_config in webcam_configs if webcam_config.name == webcam_name]

    def take_webcam_snapshot(self, provided_webcam):
        webcam = None
        if isinstance(provided_webcam, str):
            webcam_lookup = self.lookup_webcam(provided_webcam)
            if len(webcam_lookup) > 0:
                webcam = webcam_lookup[0]
        else:
            webcam = provided_webcam.config

        if webcam is None:
            raise WebcamNotAbleToTakeSnapshotException("provided_webcam is None")

        # using compat.snapshot because snapshotDisplay is supposedly only for user
        snapshot_url = webcam.compat.snapshot
        can_snapshot = snapshot_url is not None and snapshot_url != "http://" and snapshot_url != "https://" and snapshot_url != ""

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

    # SimpleApiPlugin mixin

    def get_api_commands(self):
        return {"add_stream": ["name", "src", "server_url"],
                "remove_stream": ["name", "server_url"],
                "enable_cors": ["server_url"],
                }

    def on_api_get(self, request):
        self._logger.debug(request.args)
        response = {"success": False}
        if request.args.get("server_url") != "":
            server_url = request.args.get("server_url", "")
            if server_url.endswith("/"):
                server_url = server_url[:-1]
            try:
                # pull a list of available ffmpeg devices detected by go2rtc
                if request.args.get("get_cams"):
                    available_cameras = requests.get(f"{server_url}/api/ffmpeg/devices", timeout=(3, 10))
                    if available_cameras.status_code == 200:
                        response = available_cameras.json()
                    else:
                        self._logger.error("Failed to get cameras")
                        response = {"sources": []}
                if request.args.get("test_url"):
                    config_url = f"{server_url}/api/config"
                    web_response = requests.get(config_url, timeout=(3, 10))

                    if web_response.status_code == 200:
                        yaml_settings = yaml.load_from_file(web_response.content)
                        if yaml_settings.get("api", {}).get("origin") == "*":
                            response = {"success": True, "api": True, "streams": yaml_settings.get("streams", {})}
                        else:
                            response = {"success": True, "api": False}
            except ConnectionError:
                self._logger.error(f"connection error with {server_url}")
                response["error"] = "connection error"
            except Timeout:
                self._logger.error(f"timeout error with {server_url}")
                response["error"] = "timeout error"

        return flask.jsonify(response)

    def on_api_command(self, command, data):
        if not Permissions.PLUGIN_GO2RTC_MANAGE.can():
            return flask.make_response("Insufficient rights", 403)

        if data.get("server_url", "") != "":
            server_url = data.get("server_url")
            if server_url.endswith("/"):
                server_url = server_url[:-1]
            webcam_name = data.get("name")
            response = flask.make_response("Something went wrong", 500)

            if command == "add_stream":
                webcam_src = data["src"]
                stream_add = requests.put(f"{server_url}/api/streams", params={'src': webcam_src, 'name': webcam_name},
                                          timeout=(3, 10))
                if stream_add.status_code == 200:
                    response = flask.jsonify({'success': True, 'src': webcam_src, 'name': webcam_name})
            elif command == "remove_stream":
                stream_delete = requests.delete(f"{server_url}/api/streams", params={'src': webcam_name}, timeout=(3, 10))
                if stream_delete.status_code == 200:
                    response = flask.jsonify({'success': True, 'name': webcam_name})
            elif command == "enable_cors":
                config_patch = requests.patch(f"{server_url}/api/config", data=yaml.dump({'api': {'origin': '*'}}),
                                              timeout=(3, 10))
                if config_patch.status_code == 200:
                    restart = requests.post(f"{server_url}/api/restart", timeout=(3, 10))
                    if restart.status_code == 200:
                        response = flask.jsonify({'success': True})
        else:
            response = flask.make_response("Invalid server url", 502)

        return response

    def is_template_autoescaped(self):
        return True

    def get_additional_permissions(self, *args, **kwargs):
        return [
            dict(key="MANAGE",
                 name="Manage go2rtc",
                 description=gettext("Allows management of go2rtc."),
                 roles=["admin"],
                 dangerous=False,
                 default_groups=[ADMIN_GROUP])
        ]

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
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        "octoprint.access.permissions": __plugin_implementation__.get_additional_permissions
    }
