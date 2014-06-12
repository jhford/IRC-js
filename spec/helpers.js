var path = require("path");
var fs   = require("fs");
var irc  = require(path.join(__dirname, "..", "lib", "irc"));
var fxtp = path.join(__dirname, "fixtures");
var srv  = require("./server");

function readFixture(fileName, fp) {
  return JSON.parse(fs.readFileSync(path.join(fp || fxtp, fileName), "utf8"));
}

var conf = path.join(__dirname, "lib", "config.json");
var cobj = JSON.parse(fs.readFileSync(conf, "utf8"));

var server = srv.server;

server.listen(cobj.server.port, cobj.server.address);
var bot = irc.connect(cobj);

// Convenience wrapper around `it`, with added bottage/servage
function bit(desc, f) {
  server.removeAllListeners("message");
  if (!f) {
    return it(desc);
  }
  it(desc, f.bind(bot));
}

exports.bit         = bit;
exports.conf        = cobj;
exports.readFixture = readFixture;
