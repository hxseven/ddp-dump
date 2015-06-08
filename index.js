#!/usr/bin/env node
'use strict';

var fs = require('fs');
var util = require('util');
var url = require('url');
var async = require('async');
var nopt = require('nopt');
var DDPClient = require('ddp');

var log = console.log;
var error = console.error;

var defaultTimeout = 800;

var options;
var ddp;
var pathToCollectionMapping;

/* Command line related functions */

var cmdOptions = {
  'url': String,
  'host': String,
  'port': Number,
  'ssl': Boolean,
  'output': [String, Array],
  'all': Boolean,
  'timeout': Number,
  'compress': Boolean,
  'ddpv': ['1', 'pre2', 'pre1'],
  'sockjs': Boolean,
  'verbose': Boolean,
  'debug': Boolean,
  'version': Boolean,
  'help': Boolean
};

var shorthands = {
  'u': ['--url'],
  'h': ['--host'],
  'p': ['--port'],
  's': ['--ssl'],
  'o': ['--output'],
  'a': ['--all'],
  't': ['--timeout'],
  'c': ['--compress'],
  'd': ['--ddpv'],
  'k': ['--sockjs'],
  'v': ['--verbose'],
  'V': ['--version'],
  '?': ['--help']
};

function usage(){
  log('Usage: ddp-dump [options] [collection(s) to subscribe ...]');
}

function printOptions(){
  log('\nDumps Meteor collections by using Meteor\'s DDP (' +
    'Distributed Data Protocol).');

  log('\nOptions:');
  log('  -u, --url       Websocket endpoint URL');
  log('  -h, --host      Hostname - default: localhost');
  log('  -p, --port      Port - default: 80 or 433 if SSL is true');
  log('  -s, --ssl       SSL - default: false');
  log('  -a, --all       Include all collections that are received');
  log('  -o, --output    Output JSON file(s), otherwise will dump to stdout');
  log('                  Note: %s will be replaced by the collection name');
  log('                  and multiple collections will be merged to one');
  log('                  big JSON structure when only one file is given');
  log('  -t, --timeout   How long to wait for data after the last');
  log('                  message (in ms) - default: ' + defaultTimeout);
  log('                  if -all is set, otherwise 0');
  log('  -c, --compress  Compress JSON - default: false');
  log('  -d, --ddpv      DDP Protocol Version (1, pre2, pre1) - default: 1');
  log('  -k, --sockjs    Use the SockJs protocol - default: false');
  log('  -?, --help      Display a help message and exit.');
  log('  -v, --verbose   Verbose mode.');
  log('      --debug     Debug mode.');
  log('  -V, --version   Display version information and exit.');

  log('\nExamples:');
  log('  Dump all collections of the local Meteor WebSocket server:');
  log('    ddp-dump --all');
  log('    ddp-dump --all > all_collections.json');
  log('    ddp-dump --all -o col_%s.json');
  log('');
  log('  Dump a specific collection:');
  log('    ddp-dump cats > cats.json');
  log('    ddp-dump -h localhost -p 80 cats > cats.json');
  log('    ddp-dump -u ws://local cats --all -o cats_and_others.json');
  log('    ddp-dump -h example.org --ssl dogs > dogs.json');
  log('    ddp-dump -u wss://example.org lizards -o %s.json');
  log('');
  log('  Merge multiple collections to one JSON:');
  log('    ddp-dump -h meteor.local cats dogs lizards > cute_animals.json');
  log('    ddp-dump -h meteor.local cats dogs lizards -o cute_animals.json');
  log('');
  log('  Save collections to separate JSON files:');
  log('    ddp-dump -h meteor.local -o cats.json -o birds.json cats birds');
  log('    ddp-dump -h meteor.local -o %s.json cats birds');
}

function info(){
  log(util.format.apply(null, arguments));
}

function processCliOptions(o){

  // Apply data from an websocket URL
  if (o.url){
    var u = url.parse(o.url);
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:'){
      error('Error: Unknown protocol "%s"', u.protocol);
      return process.exit(1);
    }
    o.ssl = (u.protocol === 'wss:');
    o.port = u.port;
    o.host = u.hostname;
  }

  // Set defaults
  o.host = o.host ? o.host : 'localhost';

  if (!o.port) {
    o.port = o.ssl ? 443 : 80;
  }

  if (!o.timeout) {
    o.timeout = o.all ? defaultTimeout : 0;
  }

  o.ddpv = o.ddpv ? o.ddpv : '1';

  // Process output file settings
  o.files = o.output ? o.output : [];
  o.saveToFile = o.files.length > 0;

  o.mergeCollections = true;

  if (o.saveToFile){
    if (o.files[0].indexOf('%s') !== -1){
      // Handle '%s' output options
      o.mergeCollections = false;

      if (o.files.length > 1){
        error('Error: Only one output option is supported when using "%s".');
        return process.exit(1);
      }

      // Fill files array with '%s' entry if collections are given
      if (o.colls.length > 0){
        o.files = o.colls.map(function(){
          return o.files[0];
        });
      }

    } else if (o.files.length === o.colls.length) {
      // Write every collection to the matching file
      o.mergeCollections = false;

    } else if (o.files.length > 1){
      error('Error: More output files then collections given.');
      return process.exit(1);
    }
    // else => only one filepath without %s given
  }

  return o;
}

function printConnectionInfo(o){
  var ws = {
    protocol: o.ssl ? 'wss:' : 'ws:',
    slashes: true,
    port: o.port,
    hostname: o.host
  };

  info(
    'Connecting to: %s (DDP Version %s)%s',
    url.format(ws),
    o.ddpv,
    o.sockjs ? ' (SockJS enabled)' : ''
  );
}

/* I/O functions */

function stringify(v, compress){
  if (compress){
    return JSON.stringify(v);
  }
  return JSON.stringify(v, null, 2);
}

function writeLog(path, data, compress, cb){
  log(stringify(data, compress));
  cb();
}

function writeJSON(path, data, compress, cb){
  info('Writing data to file "%s"', path);
  fs.writeFile(path, stringify(data, compress), cb);
}

function formatPath(filename, name){
  if (typeof filename === 'undefined' || filename === ''){
    filename = '%s.json';
  }
  if (filename.indexOf('%') !== -1){
    filename = util.format(filename, name);
  }
  return filename;
}

function generateFilename(collName, i){
  // null == Console output
  var path = null;
  if (options.saveToFile){
    path = formatPath(
      options.mergeCollections ? options.files[0] : options.files[i],
      collName
    );
  }
  return path;
}

/* Main functions */

function addPathToMapping(mapping, path, collName){
  if (!mapping[path]){
    mapping[path] = [];
  }

  mapping[path].push(collName);
  return mapping;
}

function subscribeToCollection(name, callback){
  info('Subscribing to collection: %s', name);
  ddp.subscribe(name, [], function (err) {
    callback(null, { name: name, err: err });
  });
}

// We need to wait a bit because there is no 'all-data-received' event
// or something similar. So if the user wants to capture all the data
// that the Meteor server sends after connecting this was the only
// solution I found. You are welcome to suggest a better way.
function waitForTimeout(){
  setTimeout(function(){
    var now = new Date();
    if (now.getTime() - options.lastMessageDate.getTime() > options.timeout){
      receivedLastDDPMessage();
    } else {
      waitForTimeout();
    }
  }, options.timeout);
}

function processSubscribtionResults(err, results){
  results.map(function(r){
    if (r.err !== undefined){
      // Exit here?
      error(
        'Error: Could not subscribe to collection "%s":\n%s',
        r.name,
        r.err.message
      );
    } else {
      var rowCount = Object.keys(ddp.collections[r.name] || {}).length;
      info('Subscription of "%s" was successful (%s rows)', r.name, rowCount);
    }
  });

  waitForTimeout();
}

function receivedLastDDPMessage(){
  if (options.all && Object.keys(ddp.collections).length > 0){
    // Add all unknown and new collections to our mapping
    Object.keys(ddp.collections).map(function(collName){
      if (options.colls.indexOf(collName) === -1){
        var rowCount = Object.keys(ddp.collections[collName] || {}).length;
        info('Received unknown collection "%s" (%s rows)', collName, rowCount);
        var path = generateFilename(collName, 0);
        addPathToMapping(pathToCollectionMapping, path, collName);
        options.colls.push(collName);
      }
    });
  }

  var filepaths = Object.keys(pathToCollectionMapping);
  if (filepaths.length === 0){
    info('No collections received');
  }

  async.map(filepaths, writeData, finish);
}

function writeData(path, callback){

  var buffer = pathToCollectionMapping[path].reduce(function(data, col){

    if (ddp.collections[col] === undefined){
      // info('Warning: Collection "%s" doesn\'t exist.', col);
      // (Removed because the subscribe command will probably
      // also fail and output a message to the user)
      return data;
    }

    data[col] = ddp.collections[col];
    return data;
  }, {});

  var writer = options.saveToFile ? writeJSON : writeLog;
  writer(path, buffer, options.compress, callback);
}

function finish(err){
  if (err){
    log('An error occured during saving of files:');
    log(err);
  }
  ddp.close();
}

/* Main application logic */

options = nopt(cmdOptions, shorthands);

if (!options.verbose){
  // Silence messages ;)
  info = function(){};
}

if (options.version){
  log(require('./package').version);
  return process.exit(0);
}

if (options.help){
  usage();
  printOptions();
  return process.exit(0);
}

options.colls = options.argv.remain;

if (options.colls.length === 0 && !options.all){
  error('Error: Please specify at least one collection');
  error('or use the --all option.\n');
  usage();
  log('\nTry `ddp-dump --help´ for more information.');
  return process.exit(1);
}

options = processCliOptions(options);

// Create a 'JSON output path' => [collections...] mapping to
// simplify the export code
pathToCollectionMapping = options.colls.reduce(function(mapping, collName, i){
  var path = generateFilename(collName, i);
  addPathToMapping(mapping, path, collName);
  return mapping;
}, {});

if (options.verbose){
  printConnectionInfo(options);
}

/* Etablish DDP connection */

options.lastMessageDate = new Date();

ddp = new DDPClient({
  host: options.host,
  port: options.port,
  ssl: options.ssl || false,
  maintainCollections: true,
  ddpVersion: options.ddpv,
  useSockJs: options.sockjs && true
});

ddp.on('message', function(msg) {
  options.lastMessageDate = new Date();
  if (options.debug){
    log('Received DDP message: ', msg);
  }
});

// Connect to the Meteor Server
ddp.connect(function(ddpErr) {

  if (ddpErr) {
    info('Error: DDP connection failed');
    return;
  }

  info('DDP connection was successful');

  if (options.colls.length === 0){
    waitForTimeout();
  } else {
    // Subscribe to all collections given by the user
    async.map(options.colls, subscribeToCollection, processSubscribtionResults);
  }
});

if (options.verbose){
  ddp.on('socket-close', function(code, message) {
    log('Connection closed: %s %s', code, message);
  });
}

ddp.on('socket-error', function(err) {
  log(err.message);
});
