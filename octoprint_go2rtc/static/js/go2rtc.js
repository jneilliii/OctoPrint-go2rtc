/*
 * View model for OctoPrint-go2rtc
 *
 * Author: jneilliii
 * License: AGPLv3
 */

$(function() {
    function go2rtcViewModel(parameters) {
        const self = this;

        self.settingsViewModel = parameters[0];
        self.streams = ko.observableDictionary();
        self.ffmpeg_sources = ko.observableArray([]);

        self.onBeforeBinding = function() {
            self.streams = ko.observableDictionary(ko.toJS(self.settingsViewModel.settings.plugins.go2rtc.streams));
        };

        self.onAllBound = function() {
            ko.utils.arrayForEach(self.streams.items(), function(item) {
                const stream_key = item.key();
                /** @type {VideoStream} */
                const video = document.createElement('video-stream');
                video.src = self.get_stream_src(stream_key);
                video.background = false;
                video.visibilityThreshold = 1;
                document.getElementById('go2rtc_' + stream_key).appendChild(video);
            });
        };

        self.onSettingsShown = function() {
            let url = self.settingsViewModel.settings.plugins.go2rtc.server_url() + "/api/ffmpeg/devices";

            $.ajax({
				url: url,
				type: "GET",
				dataType: "json",
				contentType: "application/json; charset=UTF-8"
			}).done(function(data){
				if(data.sources){
					self.ffmpeg_sources(data.sources);
				}
				});
        };

        self.onSettingsBeforeSave = function() {
            self.settingsViewModel.settings.plugins.go2rtc.streams = self.streams;
        };

        self.add_ffmpeg_device = function(data) {
            self.streams.set(data["name"], data["url"]);
        };

        self.add_stream = function() {
            let new_stream_id = $("#new_stream_id").val();
            let new_stream_value = $("#new_stream_value").val();
            if (new_stream_id !== "" && new_stream_value !== "") {
                self.streams.set(new_stream_id, $("#new_stream_value").val());
                $("#new_stream_id, #new_stream_value").val("");
            }
        };

        self.remove_stream = function(data) {
            self.streams.remove(data);
        };

        self.get_stream_src = function(data){
            return new URL('api/ws?src=' + encodeURIComponent(data), self.settingsViewModel.settings.plugins.go2rtc.server_url()).toString();
        };
    }

    function getWebcamInstances() {
        let elements = ["#settings_plugin_go2rtc"];
        // get the number of webcam instances from the dom
        $('#webcam-group').children().each(function(index, element) {
            if (element.id.startsWith("go2rtc_")) {
                elements.push("#"+element.id);
            }
        });

        return elements;
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: go2rtcViewModel,
        dependencies: [ "settingsViewModel" ],
        elements: getWebcamInstances()
    });
});
