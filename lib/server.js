/** @module server
 */

"use strict";

var net       = require('net');
var tls       = require('tls');

var constants = require("./constants");
var format    = require("util").format;
var util      = require("./util");

var COMMAND   = constants.COMMAND;
var id        = util.id;


var DEFAULT_PORT  = 6667;

var serverCache   = new Map();

/** @constructor
 *  @param {string}     name
 *  @param {number=}    port
 *  @param {bool}       ssl
 *  @property {string}  name
 *  @property {number}  port
 *  @property {bool}    ssl
 */
function Server(name, port, ssl) {
  this.client = null;
  this.name   = name;
  this.port   = port;
  this.ssl    = ssl;
}

/** Serialize server into string
 *  @return {string}
 */
Server.prototype.toString = function() {
  return this.name;
}

Server.prototype.getVersion = function(callback) {
  this.client.send(message(COMMAND.VERSION, [this.name]));
  return this;
}

/** Create a socket connection
 * @return {Socket}
 */
Server.prototype.connect = function() {
  if (this.ssl) {
    return tls.connect(this.port, this.name, this.ssl);
  } else {
    return net.connect(this.port, this.name);
  }
}

/** Make a Server object
 *  @throws {TypeError}
 *  @param  {string} name
 *  @return {Channel}
 */
function server(name, port) {
  if (!name) {
    throw new TypeError();
  }
  var sid = util.id(name);
  if (serverCache.has(sid)) {
    return serverCache.get(sid);
  }
  var server = new Server(name, port ? port : DEFAULT_PORT);
  serverCache.set(server.id, server);
  return server;
}

exports.Server  = Server;
exports.server  = server;
