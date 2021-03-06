var stream  = require('stream'),
    util    = require('util'),
    net     = require('net'),
    tls     = require('tls'),
    ipaddr  = require('ipaddr.js');

var SocksConnection = function (remote_options, socks_options) {
    var that = this;

    stream.Duplex.call(this);

    this.remote_options = defaults(remote_options, {
        host: 'localhost',
        ssl: false,
        rejectUnauthorized: false
    });
    socks_options = defaults(socks_options, {
        localAddress: '0.0.0.0',
        allowHalfOpen: false,
        host: 'localhost',
        port: 1080,
        user: null,
        pass: null
    });

    this._socksSetup = false;

    this.socksAddress = null;
    this.socksPort = null;

    this.socksSocket = net.createConnection({
        host: socks_options.host,
        port: socks_options.port,
        localAddress: socks_options.localAddress,
        allowHalfOpen: socks_options.allowHalfOpen
    }, socksConnected.bind(this, !(!socks_options.user)));

    this.socksSocket.on('error', function (err) {
        that.emit('error', err);
    });

    socksAuth.call(this, {user: socks_options.user, pass: socks_options.pass});

    this.outSocket = this.socksSocket;
};

util.inherits(SocksConnection, stream.Duplex);

SocksConnection.connect = function (remote_options, socks_options, connection_listener) {
    var socks_connection = new SocksConnection(remote_options, socks_options);
    if (typeof connection_listener === 'function') {
        socks_connection.on('connect', connection_listener);
    }
    return socks_connection;
};

SocksConnection.prototype._read = function () {
    var data;
    if (this._socksSetup) {
        while ((data = this.outSocket.read()) !== null) {
            if ((this.push(data)) === false) {
                break;
            }
        }
    } else {
        this.push('');
    }
};

SocksConnection.prototype._write = function (chunk, encoding, callback) {
    if (this._socksSetup) {
        this.outSocket.write(chunk, 'utf8', callback);
    } else {
        callback("Not connected");
    }
};

SocksConnection.prototype.dispose = function () {
    this.outSocket.destroy();
    this.outSocket.removeAllListeners();
    if (this.outSocket !== this.socksSocket) {
        this.socksSocket.destroy();
        this.socksSocket.removeAllListeners();
    }
    this.removeAllListeners();
};

var getData = function (socket, bytes, callback) {
    var dataReady = function () {
        var data = socket.read(bytes);
        if (data !== null) {
            socket.removeListener('readable', dataReady);
            callback(data);
        } else {
            socket.on('readable', dataReady);
        }
    };
    dataReady();
};

var socksConnected = function (auth) {
    if (auth) {
        this.socksSocket.write('\x05\x02\x02\x00'); // SOCKS version 5, supporting two auth methods
                                                    // username/password and 'no authentication'
    } else {
        this.socksSocket.write('\x05\x01\x00');     // SOCKS version 5, only supporting 'no auth' scheme
    }

};

var socksAuth = function (auth) {
    var that = this;
    getData(this.socksSocket, 2, function (data) {
        if (data.readUInt8(0) !== 5) {
            that.emit('error', 'Only SOCKS version 5 is supported');
            that.socksSocket.destroy();
            return;
        }
        switch (data.readUInt8(1)) {
        case 255:
            that.emit('error', 'SOCKS: No acceptable authentication methods');
            that.socksSocket.destroy();
            return;
        case 2:
            that.socksSocket.write(Buffer.concat([
                new Buffer([1]),
                new Buffer([Buffer.byteLength(auth.user)]),
                new Buffer(auth.user),
                new Buffer([Buffer.byteLength(auth.pass)]),
                new Buffer(auth.pass)
            ]));
            socksAuthStatus.call(that);
            break;
        default:
            socksRequest.call(that, that.remote_options.host, that.remote_options.port);
        }
    });
};

var socksAuthStatus = function (data) {
    var that = this;
    getData(this.socksSocket, 2, function (data) {
        if (data.readUInt8(1) === 0) {
            socksRequest.call(that, that.remote_options.host, that.remote_options.port);
        } else {
            that.emit('error', 'SOCKS: Authentication failed');
            that.socksSocket.destroy();
        }
    });
};

var socksRequest = function (host, port) {
    var header, type, hostBuf, portBuf;
    if (net.isIP(host)) {
        if (net.isIPv4(host)) {
            type = new Buffer([1]);
        } else if (net.isIPv6(host)) {
            type = new Buffer([4]);
        }
        hostBuf = new Buffer(ipaddr.parse(host).toByteArray());
    } else {
        type = new Buffer([3]);
        hostBuf = new Buffer(host);
        hostBuf = Buffer.concat([new Buffer([Buffer.byteLength(host)]), hostBuf]);
    }
    header = new Buffer([5, 1, 0]);
    portBuf = new Buffer(2);
    portBuf.writeUInt16BE(port, 0);
    this.socksSocket.write(Buffer.concat([header, type, hostBuf, portBuf]));
    socksReply.call(this);
};

var socksReply = function (data) {
    var that = this;
    getData(this.socksSocket, 4, function (data) {
        var status, err, cont;

        cont = function (addr, port) {
            that.socksAddress = addr;
            that.socksPort = port;

            if (that.remote_options.ssl) {
                startTLS.call(that);
            } else {
                proxyData.call(that);
                that.emit('connect');
            }
        };
        status = data.readUInt8(1);
        if (status === 0) {
            switch(data.readUInt8(3)) {
            case 1:
                getData(that.socksSocket, 6, function (data2) {
                    var addr = '', port, i;
                    for (i = 0; i < 4; i++) {
                        if (i !== 0) {
                            addr += '.';
                        }
                        addr += data2.readUInt8(i).toString();
                    }
                    port = data2.readUInt16BE(4);
                    cont(addr, port);
                });
                break;
            case 3:
                getData(that.socksSocket, 1, function (data2) {
                    var length = data2.readUInt8(0);
                    getData(that.socksSocket, length + 2, function (data3) {
                        var addr, port;
                        addr = (data3.slice(0, -2)).toString();
                        port = data3.readUInt16BE(length);
                        cont(addr, port);
                    });
                });
                break;
            case 4:
                getData(that.socksSocket, 18, function (data2) {
                    var addr = '', port, i;
                    for (i = 0; i < 16; i++) {
                        if (i !== 0) {
                            addr += ':';
                        }
                        addr += data2.readUInt8(i);
                    }
                    port = data2.readUInt16BE(16);
                    cont(addr, port);
                });
                break;
            default:
                that.emit('error', "Invalid address type");
                that.socksSocket.destroy();
                break;
            }
        } else {
            switch (status) {
            case 1:
                err = 'SOCKS: general SOCKS server failure';
                break;
            case 2:
                err = 'SOCKS: Connection not allowed by ruleset';
                break;
            case 3:
                err = 'SOCKS: Network unreachable';
                break;
            case 4:
                err = 'SOCKS: Host unreachable';
                break;
            case 5:
                err = 'SOCKS: Connection refused';
                break;
            case 6:
                err = 'SOCKS: TTL expired';
                break;
            case 7:
                err = 'SOCKS: Command not supported';
                break;
            case 8:
                err = 'SOCKS: Address type not supported';
                break;
            default:
                err = 'SOCKS: Unknown error';
            }
            that.emit('error', err);
        }
    });
};

var startTLS = function () {
    var that = this;
    var plaintext = tls.connect({
        socket: this.socksSocket,
        rejectUnauthorized: this.remote_options.rejectUnauthorized,
        key: this.remote_options.key,
        cert: this.remote_options.cert,
        requestCert: this.remote_options.requestCert
    });

    plaintext.on('error', function (err) {
        that.emit('error', err);
    });

    plaintext.on('secureConnect', function () {
        that.emit('connect');
    });

    this.outSocket = plaintext;
    this.getPeerCertificate = function(){ return plaintext.getPeerCertificate(); };

    proxyData.call(this);
};

var proxyData = function () {
    var that = this;

    this.outSocket.on('readable', function () {
        var data;
        while ((data = that.outSocket.read()) !== null) {
            if ((that.push(data)) === false) {
                break;
            }
        }
    });

    this.outSocket.on('end', function () {
        that.push(null);
    });

    this.outSocket.on('close', function (had_err) {
        that.emit('close', had_err);
    });

    this._socksSetup = true;
};

var defaults = function(obj) {
    Array.prototype.slice.call(arguments, 1).forEach(function(source) {
        if (source) {
            for (var prop in source) {
                if (obj[prop] === null) {
                    obj[prop] = source[prop];
                }
            }
        }
    });
    return obj;
};

module.exports = SocksConnection;
