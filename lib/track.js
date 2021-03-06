// Generated by CoffeeScript 1.10.0
(function() {
  var Logger, Path, Track, async, babelPolyfill, cleanEmptyDirs, clone, deepMap, domain, fixPathPiece, fs, getSpotID, id3, makeB64, mkdirp, objTypeof, process, ref, request, sformat,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  process = require("process");

  async = require("async");

  fs = require("fs");

  mkdirp = require("mkdirp");

  id3 = require("node-id3");

  domain = require("domain");

  request = require("request");

  Path = require("path");

  Logger = require("./log");

  Logger = new Logger();

  clone = require("clone");

  sformat = require("string-format");

  babelPolyfill = require("babel-polyfill");

  ref = require("./util"), cleanEmptyDirs = ref.cleanEmptyDirs, makeB64 = ref.makeB64, objTypeof = ref.objTypeof, deepMap = ref.deepMap, fixPathPiece = ref.fixPathPiece, getSpotID = ref.getSpotID;

  Track = (function() {
    var padDigits;

    function Track(uri, config, data, callback1) {
      this.uri = uri;
      this.config = config;
      this.data = data;
      this.callback = callback1;
      this.writeMetadata = bind(this.writeMetadata, this);
      this.closeStream = bind(this.closeStream, this);
      this.downloadFile = bind(this.downloadFile, this);
      this.downloadCover = bind(this.downloadCover, this);
      this.cleanDirs = bind(this.cleanDirs, this);
      this.createDirs = bind(this.createDirs, this);
      this.process = bind(this.process, this);
      this.track = {};
      this.file = {};
      this.retryCounter = 0;
    }

    Track.init = function() {
      return process.on("SIGINT", function() {
        var ref1, ref2, tasks;
        Logger.Log("\nCLOSING [SIGINT]");
        tasks = [(ref1 = Track.cur) != null ? ref1.closeStream : void 0, (ref2 = Track.cur) != null ? ref2.cleanDirs : void 0].map(function(f) {
          return f != null ? f : function(cb) {
            return typeof cb === "function" ? cb() : void 0;
          };
        });
        return async.series(tasks, function(err) {
          if (err) {
            Logger.Error("Error while closing: " + err);
          } else {
            Logger.Success("-- CLEANED --");
          }
          return process.exit(0);
        });
      });
    };

    Track.prototype.setSpotify = function(spotify) {
      this.spotify = spotify;
    };

    Track.prototype.process = function(uri, config, data, callback1) {
      this.uri = uri;
      this.config = config;
      this.data = data;
      this.callback = callback1;
      Track.cur = this;
      return this.spotify.get(this.uri, (function(_this) {
        return function(err, track) {
          var error;
          if (err) {
            return typeof _this.callback === "function" ? _this.callback(err) : void 0;
          }
          _this.track = track;
          _this.retryCounter = 0;
          try {
            return _this.createDirs();
          } catch (error) {
            err = error;
            Logger.Error("Error on track: \"" + _this.track.artist[0].name + " - " + _this.track.name + "\" : " + err + " \n\n" + err.stack);
            return typeof _this.callback === "function" ? _this.callback() : void 0;
          }
        };
      })(this));
    };

    Track.prototype.createDirs = function() {
      var _path, err, error, fields, fixStrg, i, j, len, len1, makeArtists, o, pathFormat, ref1, ref2, ref3, ref4, stats, trackCopy;
      this.config.directory = Path.resolve(this.config.directory);
      if (this.config.folder && typeof this.config.folder === "string") {
        if (this.config.folder === "legacy") {
          pathFormat = "{artist.name}/{album.name} [{album.year}]/{artist.name} - {track.name}";
        } else {
          pathFormat = this.config.folder;
        }
      } else {
        pathFormat = "{artist.name} - {track.name}";
      }
      trackCopy = clone(this.track);
      trackCopy.name = trackCopy.name.replace(/\//g, " - ");
      fixStrg = (function(_this) {
        return function(obj) {
          if (objTypeof(obj) === "[object String]") {
            obj = obj.replace(/\//g, "-");
            if (_this.config.onWindows) {
              obj = fixPathPiece(obj);
            }
          }
          return obj;
        };
      })(this);
      deepMap.call({
        fn: fixStrg
      }, trackCopy);
      ref1 = [trackCopy, trackCopy.album].concat(trackCopy.artist);
      for (i = 0, len = ref1.length; i < len; i++) {
        o = ref1[i];
        o.id = getSpotID(o.uri);
      }
      ref2 = [trackCopy, trackCopy.album].concat(trackCopy.artist);
      for (j = 0, len1 = ref2.length; j < len1; j++) {
        o = ref2[j];
        o.b64uri = makeB64(o.uri);
      }
      fields = {
        track: trackCopy,
        artist: trackCopy.artist[0],
        album: trackCopy.album,
        playlist: {}
      };
      fields.album.year = fields.album.date.year;
      makeArtists = (function(_this) {
        return function(artists) {
          var ref3;
          return (artists.map(function(a) {
            return a.name;
          })).join((ref3 = _this.config._artists_token_delimiter) != null ? ref3 : ",");
        };
      })(this);
      fields.album.artists = makeArtists(trackCopy.album.artist);
      fields.track.artists = makeArtists(trackCopy.artist);
      if ((ref3 = this.data.type) === "album" || ref3 === "playlist" || ref3 === "library") {
        fields.playlist.name = this.data.name;
        fields.playlist.uri = this.data.uri;
        fields.playlist.id = this.data.id;
        fields.playlist.b64uri = this.data.b64uri;
      }
      if ((ref4 = this.data.type) === "playlist" || ref4 === "library") {
        fields.index = fields.track.index = padDigits(this.data.index, String(this.data.trackCount).length);
        fields.playlist.trackCount = this.data.trackCount;
        fields.playlist.user = this.data.user;
      }
      fields.id = this.data.id;
      fields.b64uri = this.data.b64uri;
      fields.user = this.config.username;
      try {
        _path = sformat(pathFormat, fields);
      } catch (error) {
        err = error;
        Logger.Error("Invalid path format: " + err, 1);
        return typeof this.callback === "function" ? this.callback() : void 0;
      }
      if (!_path.endsWith(".mp3")) {
        _path += ".mp3";
      }
      this.file.path = Path.join(this.config.directory, _path);
      this.file.directory = Path.dirname(this.file.path);
      if (fs.existsSync(this.file.path)) {
        stats = fs.statSync(this.file.path);
        if (stats.size !== 0) {
          Logger.Info("Already downloaded: " + this.track.artist[0].name + " - " + this.track.name, 1);
          return typeof this.callback === "function" ? this.callback() : void 0;
        }
      }
      if (!fs.existsSync(this.file.directory)) {
        mkdirp.sync(this.file.directory);
      }
      Logger.Log("Downloading: " + this.track.artist[0].name + " - " + this.track.name, 1);
      this.downloadCover();
      return this.downloadFile();
    };

    Track.prototype.cleanDirs = function(callback) {
      var clean;
      clean = (function(_this) {
        return function(fn, cb) {
          return fs.stat(fn, function(err, stats) {
            if (!err) {
              return fs.unlink(fn, cb);
            } else {
              return typeof cb === "function" ? cb() : void 0;
            }
          });
        };
      })(this);
      return async.map([this.file.path, this.file.path + ".jpg"], clean, (function(_this) {
        return function(err) {
          if (err) {
            return typeof callback === "function" ? callback(err) : void 0;
          } else {
            return cleanEmptyDirs(_this.file.directory, callback);
          }
        };
      })(this));
    };

    Track.prototype.downloadCover = function() {
      var coverPath, coverUrl, image, images, ref1, ref2;
      coverPath = this.file.path + ".jpg";
      images = (ref1 = this.track.album.coverGroup) != null ? ref1.image : void 0;
      image = (ref2 = images != null ? images[2] : void 0) != null ? ref2 : images != null ? images[0] : void 0;
      if (!image) {
        Logger.Error("Can't download cover: " + this.track.artist[0].name + " - " + this.track.name, 2);
        return;
      }
      coverUrl = "" + image.uri;
      request.get(coverUrl).on("error", (function(_this) {
        return function(err) {
          return Logger.Error("Error while downloading cover: " + err);
        };
      })(this)).pipe(fs.createWriteStream(coverPath));
      return Logger.Success("Cover downloaded: " + this.track.artist[0].name + " - " + this.track.name, 2);
    };

    Track.prototype.downloadFile = function() {
      var d;
      d = domain.create();
      d.on("error", (function(_this) {
        return function(err) {
          Logger.Error("Error received: " + err, 2);
          if (("" + err).indexOf("Rate limited") > -1) {
            if (_this.retryCounter < 2) {
              _this.retryCounter++;
              Logger.Info(err + " ... { Retrying in 10 seconds }", 2);
              return setTimeout(_this.downloadFile, 10000);
            } else {
              _this.cleanDirs();
              Logger.Error("Unable to download song. Continuing", 2);
              return typeof _this.callback === "function" ? _this.callback() : void 0;
            }
          } else {
            _this.cleanDirs();
            return typeof _this.callback === "function" ? _this.callback() : void 0;
          }
        };
      })(this));
      return d.run((function(_this) {
        return function() {
          var err, error;
          _this.out = fs.createWriteStream(_this.file.path);
          try {
            _this.strm = _this.track.play();
            return _this.strm.pipe(_this.out).on("finish", function() {
              Logger.Success("Done: " + _this.track.artist[0].name + " - " + _this.track.name, 2);
              return _this.writeMetadata();
            });
          } catch (error) {
            err = error;
            _this.cleanDirs();
            Logger.Error("Error while downloading track! " + err, 2);
            return typeof _this.callback === "function" ? _this.callback() : void 0;
          }
        };
      })(this));
    };

    Track.prototype.closeStream = function(callback) {
      var ref1;
      if ((ref1 = this.strm) != null) {
        ref1.unpipe(this.out);
      }
      return typeof callback === "function" ? callback() : void 0;
    };

    Track.prototype.writeMetadata = function() {
      var _artists, meta, ref1;
      meta = {
        album: this.track.album.name,
        title: this.track.name,
        year: "" + this.track.album.date.year,
        trackNumber: "" + this.track.number,
        image: this.file.path + ".jpg"
      };
      _artists = this.track.artist;
      meta.artist = _artists.length > 1 && !this.config.singleArtist ? (_artists.map(function(a) {
        return a.name;
      })).join((ref1 = this.config._artists_id3_delimiter) != null ? ref1 : "/") : _artists[0].name;
      id3.write(meta, this.file.path);
      fs.unlink(meta.image);
      return typeof this.callback === "function" ? this.callback() : void 0;
    };

    padDigits = function(number, digits) {
      return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
    };

    return Track;

  })();

  module.exports = Track;

}).call(this);
