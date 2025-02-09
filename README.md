# go2rtc

This plugin allows for the configuration and embedding of [go2rtc](https://github.com/AlexxIT/go2rtc) streams inside OctoPrint's UI directly.

## Requirements

You must have a running go2rtc server/service. There are many [options](https://github.com/AlexxIT/go2rtc#fast-start) available for running go2rtc. For OctoPi 1.0.0+ images I have created [installation steps](https://gist.github.com/jneilliii/93b412cb0bbf6b7bfd76f7e10d612f24?permalink_comment_id=4993013#gistcomment-4993013) to get you started for replacing the default streamers with go2rtc.

## Configuration

Once installed, enter the server address of your go2rtc installation and click verify.

![verify screenshot](screenshot_settings_verify.png)

The plugin will validate the server url is reachable and that the necessary configuration settings are set. If a required setting is not detected you will be presented with a warning and direction on changing. The plugin can make this change for you as mentioned in the warning.

![cors screenshot](screenshot_settings_cors.png)

Once the required settings are applied, a list of saved streams will display and inputs for adding additional streams. You can either manually enter a stream configuration (see go2rtc's documentation) or click the add button next to one of the ffmpeg detected devices.

![streams screenshot](screenshot_settings.png)

Click Save and you will need to restart OctoPrint to get the newly added webcams added to the Control tab properly.

 ![restart screenshot](screenshot_restart.png)

