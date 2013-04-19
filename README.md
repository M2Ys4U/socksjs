socksjs
=======

A SOCKS (v5) client library for node.js

## Installation ##

`` $ npm install socksjs ``

## API ##

`` var SocksConnection = require('socksjs');``

SocksConnection implements node's Duplex Stream. See the Node documentation for [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable) and [Writable](http://nodejs.org/api/stream.html#stream_class_stream_writable) streams to see what methods and events are available in addition to those listed below.

### Creating a new SocksConnection ###
`` var sock = new SocksConnection(remote_options, sock_options); ``
`` var sock = SocksConnection.connect(remote_options, sock_options, connect_handler);``

**remote_options**
* ``host`` - The hostname or IP to connect to through the SOCKS proxy (optional, default: ``'localhost'``)
* ``port`` - The port to connect to (mandatory)
* ``ssl`` - Connect using SSL (optional, default ``false``)
* ``rejectUnauthorised`` - If ``true``, the server certificate is verified against the list of supplied CAs. An ``'error'`` event is emitted if verification fails (optional, default: ``false``)

**socks_options**
* ``host`` - The hostname or IP of the SOCKS proxy (optional, default: ``localhost``)
* ``port`` - The SOCKS proxy's port (optional, default: ``1080``)
* ``user`` - The username to use to authenticate to the SOCKS proxy (optional, default: ``null``)
* ``pass`` - The password to use to authenticate to the SOCKS proxy (optional, default: ``null``)

**connection_listener**

Function to attach to the 'connect' event of the SocksConnection

### Events ###
#### ``connect`` ####
SocksConnection will emit a ``connect`` event when it has successfully connected to the target host

#### ``error`` ####
SocksConnection will emit an ``error`` event if it cannot connect to the SOCKS proxy, target host or if there is an error during the connection's lifetime.

## Contributing ##
### Tests ###
socksjs needs tests. Pull requests with testcases are much appreciated.

## License ##
socksjs (C) 2013 Jack Allnutt and is licensed under the [MIT license](http://opensource.org/licenses/MIT), a copy of which can be found in the LICENSE file.