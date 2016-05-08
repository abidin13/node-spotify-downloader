fs = require("fs")
mkdirp = require("mkdirp")
id3 = require("node-id3")
domain = require("domain")
Path = require("path")
Logger = require("./log")
Logger = new Logger()
clone = require("clone")
sformat = require("string-format")
{objTypeof, deepMap} = require("./util")

class Track
	constructor: (@uri, @config, @callback) ->
		@track = {}
		@file = {}
		@retryCounter = 0

	setSpotify: (@spotify) ->

	process: (@uri, @config, @callback) =>
		@spotify.get @uri, (err, track) =>
#			restriction = track.restriction[0]
#			if !restriction.countriesForbidden? and restriction.countriesAllowed == ""
#				Logger.Error "Song is not available anymore."
#				@callback?()
			if err
				return @callback? err

			@track = track
			@createDirs()

	fixPathPiece: (piece) ->
		#piece.replace /[/\\?%*:|"<>]/g, ""
		piece.split(/[/\\?%*:|"<>]+/g).filter((i)->!!i).join(" ")

	createDirs: =>
		@config.directory = Path.resolve @config.directory

		pathFormat = @config.format || "{artist.name} - {track.name}"
		#pathFormat ||= "{artist.name}\/{album.name} [{album.year}]\/{track.name}"

		trackCopy = clone(@track)
		trackCopy.name = trackCopy.name.replace(/\//g, " - ")

		if @config.onWindows
			fixStrg = (obj) =>
				if objTypeof(obj) == "[object String]" then @fixPathPiece(obj) else obj
			deepMap.call({fn: fixStrg}, trackCopy)

		fields =
			track: trackCopy
			artist: trackCopy.artist[0]
			album: trackCopy.album
		fields.album.year = fields.album.date.year

		_path = sformat pathFormat, fields
		if !_path.endsWith ".mp3"
			_path += ".mp3"

		@file.path = Path.join @config.directory, _path
		@file.directory = Path.dirname @file.path

		if fs.existsSync @file.path
			stats = fs.statSync @file.path
			if stats.size != 0
				Logger.Info "Already downloaded: #{@track.artist[0].name} - #{@track.name}"
				return @callback?()

		if !fs.existsSync @file.directory
			mkdirp.sync @file.directory

		@downloadFile()

	downloadFile: =>
		Logger.Log "Downloading: #{@track.artist[0].name} - #{@track.name}"

		d = domain.create()
		d.on "error", (err) =>
			Logger.Error "Error received: #{err}"
			if "#{err}".indexOf("Rate limited") > -1
				Logger.Info "#{err} ... { Retrying in 10 seconds }"
				if @retryCounter < 2
					@retryCounter++
					setTimeout @downloadFile, 10000
				else
					Logger.Error "Unable to download song. Continuing"
					@callback?()
			else
				return @callback?()
		d.run =>
			out = fs.createWriteStream @file.path
			try
				@track.play().pipe(out).on "finish", =>
					Logger.Log "Done: #{@track.artist[0].name} - #{@track.name}"
					@writeMetadata()
			catch err
				Logger.Error "Error while downloading track! #{err}"
				@callback?()

	writeMetadata: =>
		meta =
			artist: @track.artist[0].name
			album: @track.album.name
			title: @track.name
			year: "#{@track.album.date.year}"
			trackNumber: "#{@track.number}"

		id3.write meta, @file.path
		return @callback?()

module.exports = Track
