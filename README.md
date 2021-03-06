# ddp-dump
[![Current Version](https://img.shields.io/npm/v/ddp-dump.svg)](https://www.npmjs.org/package/ddp-dump)
[![Dependency Status](https://david-dm.org/hxseven/ddp-dump.svg)](https://david-dm.org/hxseven/ddp-dump)

This utility allows you capture all collections that a [Meteor server][1]
sends out by default or to subscribe to specific Meteor collections.
The resulting data is exported as JSON and can be merged into one file or
split into separate files.

Have a look at the Meteor documentation for more details about the
[DDP (Distributed Data Protocol)][2].

## Installation

Install through NPM into your local repository:

```bash
npm install ddp-dump

# Then call it by using
./node_modules/.bin/ddp-dump --help
```
or as globally available tool:

```bash
$ npm install -g ddp-dump

# Then call it by using
ddp-dump --help
```
or clone the GIT repository:
```bash
git clone git://github.com/hxseven/ddp-dump.git
cd ddp-dump && npm install

# Then call it by using
node . --help
```

## Usage

```
ddp-dump [options] [collection(s) to subscribe ...]

Options:
  -u, --url       Websocket endpoint URL
  -h, --host      Hostname - default: localhost
  -p, --port      Port - default: 80 or 433 if SSL is true
  -s, --ssl       SSL - default: false
  -U, --user      Username
  -P, --password  Password
  -a, --all       Include all collections that are received
  -o, --output    Output JSON file(s), otherwise will dump to stdout
                  Note: %s will be replaced by the collection name
                  and multiple collections will be merged to one
                  big JSON structure when only one file is given
  -t, --timeout   How long to wait for data after the last
                  message (in ms) - default: 800
                  if -all is set, otherwise 0
  -c, --compress  Compress JSON - default: false
  -d, --ddpv      DDP Protocol Version (1, pre2, pre1) - default: 1
  -S, --sockjs    Use the SockJs protocol - default: false
  -?, --help      Display this help message and exit
  -v, --verbose   Verbose mode
      --debug     Debug mode
  -V, --version   Display version information and exit
```

### Examples

```
Dump all collections of the local Meteor WebSocket server:
  ddp-dump --all
  ddp-dump --all > all_collections.json
  ddp-dump --all -o col_%s.json

Dump a specific collection:
  ddp-dump cats > cats.json
  ddp-dump -h localhost -p 80 cats > cats.json
  ddp-dump -u ws://local cats --all -o cats_and_others.json
  ddp-dump -h example.org --ssl dogs > dogs.json
  ddp-dump -u wss://example.org lizards -o %s.json

Merge multiple collections to one JSON:
  ddp-dump -h meteor.local cats dogs lizards > cute_animals.json
  ddp-dump -h meteor.local cats dogs lizards -o cute_animals.json

Save collections to separate JSON files:
  ddp-dump -h meteor.local -o cats.json -o birds.json cats birds
  ddp-dump -h meteor.local -o %s.json cats birds

Authenticate using plain-text login data:
  ddp-dump -h meteor.local -U user -P pwd privateCatColl -o cats.json
```

## Design Decisions

### Command line module

After trying a lot of cool and fancy command line
modules (minimist, yargs, commander, nomnom, cli, ...) I decided to use the
rather basic **[nopt module][3]** because I wanted to keep the module dependencies
down to a minimum and nopt had only one. I also disliked some details of the
generated usage and option list output of the other modules.
The disadvantage with nopt is that it doesn't generate any usage or option list
at all. But I found that to be a reasonable tradeoff for this small tool
and I also don't expect that the option list will change that often.

### Why async and not promises?

Actually I used promises in the first prototype, but then somehow I got the
impression that the [promises library I used][4] had a lot of dependencies and
that [async][5] was more lightweight and so I switched to it. However as I
wrote this text and verified that again, I noticed that the promises module
is actually much more lightweight. But now I'm too lazy to change it again ;)

## Credits

Thanks to the Authors of the [ddp Node.js module][6] which enabled me to
write this tool.

## License

Copyright © 2015 Jonas David John

Distributed under the **[MIT License][7]**.

[1]: https://www.meteor.com/
[2]: https://www.meteor.com/ddp
[3]: https://www.npmjs.com/package/nopt
[4]: https://www.npmjs.com/package/promise
[5]: https://www.npmjs.com/package/async
[6]: https://www.npmjs.com/package/ddp
[7]: http://opensource.org/licenses/MIT
