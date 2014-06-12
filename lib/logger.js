/** @module logger
 *  Exists only because I can't figure out how to set log levels
 *  or anything in Node.
 */

"use strict";

var TEST      = process.env["IRCJS_TEST"] ? true : false;
var constants = require("./constants");
var fmt       = require("util").format;
var fs        = require("fs");
var path      = require("path");

var LEVEL = constants.LEVEL;

var dummyOutput = [];

function dummyWrite(text) {
  console.log(text);
  dummyOutput.unshift(text);
}

// Logger cache
var loggers = new Map();
// All loggers are in the same time zone, I think...
var lastLog = new Date(0);
var rowSep  = "\n";

// Default log path if none provided.
var logPath = path.join(process.cwd(), "logs");

/** Get a Logger by name, or create it if it doesn't already exist.
 *  @param {string} name
 *  @param {LEVEL|string=} level
 *  @return {Logger}
 */
function get(name, level) {
  var argc  = arguments.length;
  var log   = loggers.get(name);
  if (log) {
    return log;
  }
  if (2 === argc) {
    level = LEVEL.ALL & level ? level : LEVEL.fromString(level);
  }
  else {
    level = LEVEL.ALL;
  }
  var newLog = new Logger(name, level);
  loggers.set(name, newLog);
  return newLog;
}

/** Construct a shiny logger.
 *  Most should use <code>logger.get(name)</code>, not this constructor.
 *  @constructor
 *  @param {string}  name
 *  @param {LEVEL}   level
 *  @param {string}  path   Path to log file directory.
 */
function Logger(name, level, path) {
  if (!(LEVEL.ALL & level)) {
    throw new Error(fmt("Unknown level: %s", level));
  }
  this.name   = name;
  this.level  = level;
  this.path   = path;
  if (!path) {
    this.path = logPath;
    this.info("No log path provided, using %s", logPath);
  }
  this.file   = null;
}

/** Write to log, if levels say so.
 *  Any additional args are used for string formatting.
 *  @param {LEVEL} level
 *  @param {...*}  args
 */
Logger.prototype.log = function(level/*, arg, arg...*/) {
  if (!(this.level & level))
    return;
  var args = [];
  args.push.apply(args, arguments);
  args.shift();  // Get rid of level arg
  this.write(fmt.apply(null, args));
};

/** Write to log file.
 *  Each uniquely named {@link Logger} gets a file per day.
 *  @this   {Logger}
 *  @param  {string}  text
 */
function write(text) {
  var now = new Date();
  if (!this.file || newDaySince(now, lastLog)) {
    // Something like 2012-07-08-ircjs.log
    var fileName = fmt("%s-%s.log", now.toISOString().slice(0, 10), this.name);
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path, parseInt(766, 8));
    }
    this.file = path.join(this.path, fileName);
  }
  lastLog.setTime(now);
  // appendFile creates the file if it does not exist.
  // @todo Find and use an appropriate standard log format.
  fs.appendFile(this.file, now.toISOString() + " " + text + rowSep);
}

Logger.prototype.write = TEST ? dummyWrite : write;

// My brain broke; this seems silly.
function newDaySince(time, other) {
  var oldDays = ~~(other / 86400);
  var newDays = ~~(time / 86400);
  return newDays > oldDays;
}

/** Generate some convenience methods */
var PAD = 10;

["debug", "info", "warn", "error"].forEach(function(name) {
  var nameUpper = name.toUpperCase();
  var prefixPad = Array(PAD - name.length - 1).join(" "); // Ugh...
  var logPrefix = fmt("[%s]%s", nameUpper, prefixPad);
  Logger.prototype[name] = function() {
    var args = [];
    args.push.apply(args, arguments);
    args.splice(0, 1, logPrefix + args[0]);
    args.unshift(LEVEL[nameUpper]);
    this.log.apply(this, args);
    return this;
  };
});

if (TEST) {
  exports._output = dummyOutput;
}

exports.Logger  = Logger;
exports.get     = get;
