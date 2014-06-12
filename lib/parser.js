/** @module parser
 */

"use strict";

var channel   = require("./channel").channel;
var message   = require("./message").message;
var person    = require("./person").person;
var server    = require("./server").server;
var format    = require("util").format;

// A couple of char codes for convenience.
var BELL  = 0x7;  // BOOP!

var LINE_FEED         = 0x0A;
var CARRIAGE_RETURN   = 0x0D;
var SPACE             = 0x20;
var EXCLAMATION_MARK  = 0x21;
var NUMBER_SIGN       = 0x23;
var AMPERSAND         = 0x26;
var COMMA             = 0x2C;
var COLON             = 0x3A;
var COMMERCIAL_AT     = 0x40;

var LEFT_SQUARE_BRACKET   = 0x5B;
var RIGHT_SQUARE_BRACKET  = 0x5D;

var LEFT_CURLY_BRACKET   = 0x7B;
var RIGHT_CURLY_BRACKET  = 0x7D;

var PLUS_SIGN     = 0x2B;
var HYPHEN_MINUS  = 0x2D;

var END_OF_FILE = 0x0;

/** @constructor
 *  @param  {string=}   message
 */
function ParseError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);
  this.name     = this.constructor.name;
  this.message  = message ? message : "";
}

ParseError.prototype.__proto__  = Error.prototype;

/** @contructor
 *  @param    {Buffer?} buffer
 *  @property {Buffer}  buffer
 *  @property {number}  index
 *  @property {number}  chr
 */
function Parser(buffer) {
  this.buffer = null;
  this.index  = 0;
  this.chr    = END_OF_FILE;
  if (Buffer.isBuffer(buffer)) {
    this.buffer = buffer;
    this.chr    = buffer[0];
  }
}

Parser.prototype.advance = function() {
  this.chr = this.buffer[++this.index] || END_OF_FILE;
};

/** @param  {Buffer}  buffer
 *  @throws {ParseError}
 *  @return {Message}
 */
Parser.prototype.parse = function(buffer) {
  this.buffer = buffer;
  this.index  = 0;
  this.chr    = buffer[0];
  var msg   = this.parseMessage();
  this.reset();
  return msg;
};

Parser.prototype.reset = function() {
  this.buffer = null;
  this.index  = 0;
  this.chr    = END_OF_FILE;
};

/** Parse a complete message.
 *  @throws {ParseError}
 *  @return {Message}
 */
Parser.prototype.parseMessage = function() {
  var prefix  = this.isPrefix() ? this.parsePrefix() : null;
  var command = this.skipSpaces() || this.parseCommand();
  var params  = this.skipSpaces() || this.parseParams();

  if (!this.isEndOfMessage()) {
    this.throwParseError(format("expected '%s', followed by '%s'",
      printCC(CARRIAGE_RETURN), printCC(LINE_FEED)));
  }
  return message(prefix, command, params);
};

/** @return {Person|Server} */
Parser.prototype.parsePrefix = function() {
  this.advance();
  var start = this.index;
  while (true) {
    var chr = this.chr;
    if (chr === SPACE) {
      return server(this.buffer.toString(null, start, this.index));
    }
    if (chr === EXCLAMATION_MARK || chr === COMMERCIAL_AT) {
      return this.parsePerson(this.buffer.toString(null, start, this.index));
    }
    this.advance();
  }
};

/** @throws {ParseError}
 *  @param  {string}      nick  The already-parsed nick.
 *  @return {Person}
 */
Parser.prototype.parsePerson = function(nick) {
  let user = null;
  let host = null;
  if (this.chr === EXCLAMATION_MARK) {
    this.advance();
    var start = this.index;
    while (true) {
      if (this.chr === COMMERCIAL_AT) {
        break;
      }
      if (isTerminating(this.chr)) {
        this.throwParseError("premature end of input while parsing message prefix");
      }
      this.advance();
    }
    user = this.buffer.toString(null, start, this.index);
  }
  if (this.chr === COMMERCIAL_AT) {
    this.advance();
    var start = this.index;
    while (true) {
      if (this.chr === SPACE) {
        break;
      }
      this.advance();
    }
    host = this.buffer.toString(null, start, this.index);
  }
  return person(nick, user, host);
};

/** @return {string} */
Parser.prototype.parseCommand = function() {
  var start = this.index;
  if (isNumber(this.chr)) {
    this.advance();
    this.advance();
    this.advance();
    return this.buffer.toString(null, start, this.index);
  }
  while (isLetter(this.chr)) {
    this.advance();
  }
  var command = this.buffer.toString(null, start, this.index);
  return command;
};

/** @return {Array.<string>} */
Parser.prototype.parseParams  = function() {
  var params = [];
  while (true) {
    params.push(this.parseParam());
    this.skipSpaces();
    if (isTerminating(this.chr) || this.isEndOfBuffer()) {
      break;
    }
  }
  return params;
};

/** @return {string} */
Parser.prototype.parseParam = function() {
  var start = this.index;
  var isTrailing = this.chr === COLON;
  while (true) {
    if (isTerminating(this.chr) ||
        (!isTrailing && this.chr === SPACE) ||
        this.isEndOfBuffer()) {
      break;
    }
    this.advance();
  }
  return this.buffer.toString(null, start, this.index);
};

// Additional parsers, not used when parsing a message.

/** @throws {ParseError}
 *  @return {Map}
 */
Parser.prototype.parseMode = function() {
  var map = new Map();
  map.set(PLUS_SIGN, []);
  map.set(HYPHEN_MINUS, []);
  while (true) {
    var chr = this.chr;
    if (!(chr === PLUS_SIGN || chr === HYPHEN_MINUS)) {
      this.throwParseError(format("expected '%s' or '%s'",
        PLUS_SIGN.toString(16), HYPHEN_MINUS.toString(16)));
    }
    var sign = chr;
    var arr  = map.get(sign);
    this.advance();
    while (isLetter(this.chr)) {
      arr.push(String.fromCharCode(this.chr));
      this.advance();
    }
    if (this.isEndOfBuffer()) {
      break;
    }
  }
  return map;
};

/** @throws {ParseError}
 *  @return {Channel}
 */
Parser.prototype.parseChannel = function() {
  var prefix = this.chr;
  if (!(prefix === EXCLAMATION_MARK || prefix === NUMBER_SIGN ||
      prefix === AMPERSAND || prefix === PLUS_SIGN)) {
    this.throwParseError(format("expected one of '%s', '%s', '%s', or '%s'",
      printCC(EXCLAMATION_MARK), printCC(NUMBER_SIGN),
      printCC(AMPERSAND), printCC(PLUS_SIGN)));
  }
  while (true) {
    var chr = this.chr;
    if (chr === SPACE || chr === BELL || chr === COMMA || chr === COLON) {
      this.throwParseError("can not be used in channel name");
    }
    this.advance();
    if (this.isEndOfBuffer()) {
      break;
    }
  }
  return channel(this.buffer.toString());
};

/** @return {boolean} */
Parser.prototype.isPrefix = function() {
  return this.chr === COLON && this.index === 0;
};

/** @return {boolean} */
Parser.prototype.isEndOfMessage = function() {
  return this.chr === CARRIAGE_RETURN &&
    this.buffer[this.index + 1] === LINE_FEED;
};

/** @return {boolean} */
Parser.prototype.isEndOfBuffer = function() {
  return this.index >= this.buffer.length;
};

/** Advance until next non-space char. */
Parser.prototype.skipSpaces = function() {
  while (this.chr === SPACE) {
    this.advance();
  }
};

/** @throws {ParseError}
 *  @param  {string=}     expected
 */
Parser.prototype.throwParseError = function(expected) {
  var expectation = expected ? "; " + expected : "";
  var message = format("Unexpected char '%s' at index %d%s",
    printCC(this.chr), this.index, expectation);
  throw new ParseError(message);
};

/** @param  {number}  chr
 *  @return {boolean}
 */
function isLetter(chr) {
  return (0x41 <= chr && chr <= 0x5A) ||
    (0x61 <= chr && chr <= 0x7A);
}

/** @param  {number}  chr
 *  @return {boolean}
 */
function isNumber(chr) {
  return 0x30 <= chr && chr <= 0x39;
}

/** @param  {number}  chr
 *  @return {boolean}
 */
function isAlphaNumeric(chr) {
  return isLetter(chr) || isNumber(chr);
}

/** @param  {number}  chr
 *  @return {boolean}
 */
function isTerminating(chr) {
  return chr === CARRIAGE_RETURN || chr === LINE_FEED;
}

// Convenience functions.

var parser = new Parser(null);

/** @param  {Buffer}
 *  @return {Message}
 */
function parse(buf) {
  return parser.parse(buf);
}

/** @param  {Buffer|string}
 *  @return {Message}
 */
function parseMode(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = new Buffer(buf);
  }
  return new Parser(buf).parseMode();
}

/** @param  {Buffer|string}
 *  @return {Message}
 */
function parseChannel(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = new Buffer(buf);
  }
  return new Parser(buf).parseChannel();
}

function printCC(cc) {
  return "0x" + cc.toString(16).toUpperCase();
}

exports.Parser        = Parser;
exports.ParseError    = ParseError;
exports.parse         = parse;
exports.parseChannel  = parseChannel;
exports.parseMode     = parseMode;

exports.isTerminating = isTerminating;
