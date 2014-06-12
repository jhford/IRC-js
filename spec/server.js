/** @module server
 *  The idea is to test against this as if it were a standard IRC server.
 *  Still quite some code away from that.
 */
var net = require("net");
var prs = require("../lib/parser");

var MSG = /(.+)(\r\n)?/g;
var SEP = "\r\n";

var log = {
  received: [],
  sent: []
};

var mockServer = new net.Server(function(s) {
  var buf = [];

  s.setEncoding("ascii");
  mockServer.received = [];
  mockServer.sent = [];

  s.on("data", function(data) {
    var parts = data.match(MSG);
    var out = [];
    var i = 0;
    var l = 0;
    var msg = null;
    if (buf.length) {
      parts.unshift.apply(parts, buf.splice(0))
    }
    for (l = parts.length ; i < l; ++i) {
      out.push(parts[i]);
      if (parts[i].lastIndexOf(SEP) === parts[i].length - SEP.length) {
        msg = out.splice(0).join("");
        mockServer.received.unshift(msg);
        mockServer.emit("message", msg);
      }
    }
    if (out.length) {
      buf.push.apply(buf, out);
    }
  });

  mockServer.on("recite", function(data) {
    if (s.readyState !== "open") {
      return "GTFO";
    }
    mockServer.sent.unshift(data);
    s.write(data);
  });

  s.on("end", function() {
    mockServer.emit("end");
  });
});

mockServer.recite = function(stuff) {
  mockServer.emit("recite", stuff);
}

function onJoin(msg) {
  var ch = prs.parseChannel(msg.params[0]);
}

exports.server  = mockServer;
exports.log     = log;
