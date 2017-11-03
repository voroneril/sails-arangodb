/*jshint node: true, esversion:6 */
'use strict';

var Connection = require('./connection');
var Processor = require('./processor');
var Q = require('q');
var _ = require('lodash');
var u = require('util');
var aqb = require('aqb');
var debug = require('debug')('sails-arangodb:adapter');
debug.log = console.log.bind(console);

debug('loaded');

// suppress bluebird warnings
var Promise = require('bluebird');
Promise.config({
  warnings: false
});     

/**
 * sails-arangodb
 *
 * Most of the methods below are optional.
 *
 * If you don't need / can't get to every method, just implement what you have
 * time for. The other methods will only fail if you try to call them!
 *
 * For many adapters, this file is all you need. For very complex adapters, you
 * may need more flexiblity. In any case, it's probably a good idea to start
 * with one file and refactor only if necessary. If you do go that route, it's
 * conventional in Node to create a `./lib` directory for your private
 * submodules and load them at the top of the file with other dependencies. e.g.
 * var update = `require('./lib/update')`;
 * @module
 * @name adapter
 */
module.exports = (function() {

  // You'll want to maintain a reference to each connection
  // that gets registered with this adapter.
  var connections = {};

  // You may also want to store additional, private data
  // per-connection (esp. if your data store uses persistent
  // connections).
  //
  // Keep in mind that models can be configured to use different databases
  // within the same app, at the same time.
  //
  // i.e. if you're writing a MariaDB adapter, you should be aware that one
  // model might be configured as `host="localhost"` and another might be
  // using
  // `host="foo.com"` at the same time. Same thing goes for user, database,
  // password, or any other config.
  //
  // You don't have to support this feature right off the bat in your
  // adapter, but it ought to get done eventually.
  //
  var getConn = function(config, collections) {
    debug('getConn() get connection');
    return Connection.create(config, collections);
  };

  var adapter = {

    // Set to true if this adapter supports (or requires) things like data
    // types, validations, keys, etc.
    // If true, the schema for models using this adapter will be
    // automatically synced when the server starts.
    // Not terribly relevant if your data store is not SQL/schemaful.
    //
    // If setting syncable, you should consider the migrate option,
    // which allows you to set how the sync will be performed.
    // It can be overridden globally in an app (config/adapters.js)
    // and on a per-model basis.
    //
    // IMPORTANT:
    // `migrate` is not a production data migration solution!
    // In production, always use `migrate: safe`
    //
    // drop => Drop schema and data, then recreate it
    // alter => Drop/add columns as necessary.
    // safe => Don't change anything (good for production DBs)
    //
    syncable: false,

    // Primary key format is string (_key|_id)
    pkFormat: 'string',

    /**
     * get the db connection
     * @function
     * @name getConnection
     * @param {object} config       configuration
     * @param {array}  collections list of collections
     */
    getConnection: getConn,

    /**
     * This method runs when a model is initially registered at
     * server-start-time. This is the only required method.
     * @function
     * @name registerConnection
     * @param {object}   connection DB Connection
     * @param {array}    collection Array of collections
     * @param {function} cb         callback
     */
    registerConnection: function(connection, collections, cb) {
      debug('registerConnection() connection:', connection);

      /* istanbul ignore next */
      if (!connection.identity)
        return cb(new Error('Connection is missing an identity.'));
      /* istanbul ignore next */
      if (connections[connection.identity])
        return cb(new Error('Connection is already registered.'));
      // Add in logic here to initialize connection
      // e.g. connections[connection.identity] = new Database(connection,
      // collections);

      getConn(connection, collections).then(function(helper) {
        connections[connection.identity] = helper;
        cb();
      });
    },

    /**
     * Fired when a model is unregistered, typically when the server is
     * killed. Useful for tearing-down remaining open connections, etc.
     * @function
     * @name teardown
     * @param {object} conn Connection
     * @param {function} cb callback
     */
    // Teardown a Connection
    teardown: function(conn, cb) {
      debug('teardown()');

      /* istanbul ignore if */
      if (typeof conn == 'function') {
        cb = conn;
        conn = null;
      }
      /* istanbul ignore if */
      if (!conn) {
        connections = {};
        return cb();
      }
      /* istanbul ignore if */
      if (!connections[conn])
        return cb();

      delete connections[conn];
      cb();
    },

    // Return attributes
    // TODO: Is this required? if not, delete
    describe: /* istanbul ignore next */ function(connection, collection, cb) {
      debug('describe()');
      // Add in logic here to describe a collection (e.g. DESCRIBE TABLE
      // logic)

      connections[connection].collection.getProperties(collection,
        function(res, err) {
          cb(err, res);
        });

    },

    /**
     *
     * REQUIRED method if integrating with a schemaful (SQL-ish) database.
     *
     */
    // TODO: Is this required? if not, delete
    define: /* istanbul ignore next */ function(connection, collection, definition, cb) {
      debug('define()');
      // Add in logic here to create a collection (e.g. CREATE TABLE
      // logic)
      var deferred = Q.defer();
      connections[connection].createCollection(collection, function(db) {
        deferred.resolve(db);
      });
      return deferred.promise;
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful (SQL-ish) database.
     *
     */
    drop: function(connection, collection, relations, cb) {
      // Add in logic here to delete a collection (e.g. DROP TABLE logic)
      connections[connection].drop(collection, relations, cb);
    },

    /**
     *
     * REQUIRED method if users expect to call Model.find(),
     * Model.findOne(), or related.
     *
     * You should implement this method to respond with an array of
     * instances. Waterline core will take care of supporting all the other
     * different find methods/usages.
     *
     */
    //Gets the underlying arango instance used by adapter
    getDB: function(connectionName, collectionName, cb) {
      debug('getDB()');
      return connections[connectionName].getDB(cb);
    },

    /**
     * Implements find method
     * @function
     * @name find
     * @param   {string} connectionName Name of the connection
     * @param   {string} collectionName Name of the collection
     * @param   {object} searchCriteria Search criterial (passed from waterline)
     * @param   {function} cb           callback (err, results)
     */
    find: function(connectionName, collectionName, searchCriteria, cb) {
      debug('adaptor find() connectionName:', connectionName, 'collectionName:', collectionName, 'searchCriteria:', searchCriteria);

      connections[connectionName].find(collectionName, searchCriteria, function (err, r) {
        /* istanbul ignore if */
        if (err) {
          return cb(err);
        }
        debug('find results before cast:', r);
        var processor = new Processor(connections[connectionName].collections);
        var cast_r = processor.cast(collectionName, {_result: r});
        debug('find results after cast:', cast_r);
        return cb(null, cast_r);
      });
    },

    /**
     * @function
     * @name query
     * Send an AQL query to Arangodb
     * @param   {string}   connectionName Name of the connection
     * @param   {string}   collectionName Name of the collection
     * @param   {string}   query          AQL Query
     * @param   {function} cb             callback
     * @returns {promise}
     */
    query: function(connectionName, collectionName, query, cb) {
      return connections[connectionName].query(collectionName, query, cb);
    },

    /**
     * Create a named graph - dynamically instead of via the defined schema
     * @function
     * @name  createGraph
     * @param   {string} connectionName Name of the connection
     * @param   {string} collectionName Name of the collection
     * @param   {string}   graphName          Graph name
     * @param   {array}    edgeDefs           Array of edge definitions
     * @param   {function} cb                 Optional Callback (err, res)
     * @returns {Promise}
     *
     * example of edgeDefs:
     * ```
     * [{
     *   collection: 'edges',
     *   from: ['start-vertices'],
     *   to: ['end-vertices']
     * }, ...]
     * ```
     */
    createGraph: function(connectionName, collectionName, graphName, edgeDefs, cb){
      debug('createGraph()');

      var db = connections[connectionName].db;

      return connections[connectionName].createGraph(db, graphName, edgeDefs, cb);
    },

    /**
     * Delete a named graph
     * @function
     * @name  deleteGraph
     * @param   {string} connectionName Name of the connection
     * @param   {string} collectionName Name of the collection
     * @param   {string}   graphName          Graph name
     * @param   {boolean}  dropCollections    if true delete collections associated with the graph
     * @param   {function} cb                 Optional Callback (err, res)
     * @returns {Promise}
     */
    deleteGraph: function(connectionName, collectionName, graphName, dropCollections, cb){
      debug('deleteGraph()');

      var db = connections[connectionName].db;

      return connections[connectionName].deleteGraph(db, graphName, dropCollections, cb);
    },

    /**
     * Get neighbours of a document's start _id via either a named graph
     * or a list of edges.
     * @function
     * @name  neighbors
     * @param   {string} connectionName Name of the connection
     * @param   {string} collectionName Name of the collection
     * @param   {string} startId Document _id to start graph neighbors search from
     * @param   {string|array} graphNameOrEdges Graph name or alternatively an
     *                                          array of edge collection names
     *                                          (anonymous graph)
     * @returns {Promise}
     */
    neighbors: function(connectionName, collectionName, startId, graphNameOrEdges, cb){
      debug('neighbors()');

      var db = connections[connectionName].db;
      var col = db.collection(collectionName);

      var target = `${graphNameOrEdges}`;
      if (_.isArray(graphNameOrEdges)) {
        target = graphNameOrEdges.join(',');
      }

      var q = `
FOR n IN ANY '${startId}'
  ${_.isArray(graphNameOrEdges) ? target : `GRAPH '${target}'`}
  OPTIONS {bfs: true, uniqueVertices: 'global'}
  RETURN n
`;

      debug('-------------------');
      debug(startId);
      debug(graphNameOrEdges);
      debug(q);
      debug('-------------------');

      return db.query(q)
      .then((res) => {
        var results = res._result;
        if (cb) {
          cb(null, results);
        }
        return Promise.resolve(results);
      })
      .catch((err) => {
        if (cb) {
          cb(err);
        }
        return Promise.reject(err);
      });
    },

    /**
     * Create an edge
     *
     * This method will be bound to WaterlineORM objects, E.g:
     * `User.createEdge`
     * But it's not using the User in any way...
     *
     * @function
     * @name createEdge
     * @param   {string}   connectionName     Connection name
     * @param   {string}   collectionName     Collection name
     * @param   {string}   edgeCollectionName Edge collection name
     * @param   {string}   id1                From id (must be _id)
     * @param   {string}   id2                To id (must be _id)
     * @param   {object}   attributes         Attributes to be added to the edge
     * @param   {function} cb                 Optional Callback (err, res)
     * @returns {Promise}
     */
    createEdge: function(connectionName, collectionName, edgeCollectionName, id1, id2, attributes, cb){
      debug('createEdge() connectionName:', connectionName, 'collectionName:', collectionName,
            'edgeCollectionName:', edgeCollectionName, 'id1:', id1, 'id2:', id2,
            'attributes:', attributes, 'cb:', cb);

      var db = connections[connectionName].db;

      if (cb === undefined && typeof attributes === 'function'){
        cb = attributes;
        attributes = {};
      }

      var data = _.merge(attributes, {
        _from: id1,
        _to: id2,
      });

      var edges = db.edgeCollection(edgeCollectionName);
      return edges.save(data)
      .then((res) => {
        if (cb) {
          cb(null, res);
        }
        return Promise.resolve(res);
      })
      .catch((err) => {
        if (cb) {
          cb(err);
        }
        return Promise.reject(err);
      });
    },

    /**
     * Delete an edge
     *
     * @function
     * @name deleteEdge
     * @param   {string}   connectionName     Connection name
     * @param   {string}   collectionName     Collection name
     * @param   {string}   edgeCollectionName Edge collection name
     * @param   {string}   id                 Edge id (must be _id)
     * @param   {function} cb                 Optional Callback (err, res)
     * @returns {Promise}
    */
    deleteEdge: function(connectionName, collectionName, edgeCollectionName, id, cb){
      debug('deleteEdge()');

      var db = connections[connectionName].db;

      var edges = db.edgeCollection(edgeCollectionName);
      return edges.remove(id)
      .then((res) => {
        if (cb) {
          cb(null, res);
        }
        return Promise.resolve(res);
      })
      .catch((err) => {
        if (cb) {
          cb(err);
        }
        return Promise.reject(err);
      });
    },

    /**
     * Implements create method
     * @function
     * @name create
     * @param   {string}   connectionName Connection Name
     * @param   {string}   collectionName Collection Name
     * @param   {object}   data           Document data to create
     * @param   {function} cb             Callback (err, data)
     */
    create: function(connectionName, collectionName, data, cb) {
      debug('create() collectionName:', collectionName, 'data:', data);
      var col = connections[connectionName].db.collection(collectionName);
      return col.save(data, true, function (err, doc) {
        /* istanbul ignore if */
        if (err) {
          debug('create err:', err);
          return cb(err);
        }

        var processor = new Processor(connections[connectionName].collections);
        debug('create err:', err, 'returning doc.new:', doc.new);
        cb(null, processor.cast(collectionName, {_result: doc.new}));
      });
    },

    // Although you may pass .update() an object or an array of objects,
    // it will always return an array of objects.
    // Any string arguments passed must be the ID of the record.
    // If you specify a primary key (e.g. 7 or 50c9b254b07e040200000028)
    // instead of a criteria object, any .where() filters will be ignored.
    /**
     * Implements update method
     * @function
     * @name update
     * @param   {string}   connectionName Connection Name
     * @param   {string}   collectionName Collection Name
     * @param   {object}   searchCriteria Search Criteria
     * @param   {object}   values         Document data to update
     * @param   {function} cb             Callback (err, data)
     */
    update: function(connectionName, collectionName, searchCriteria , values , cb) {
      debug('update() collection:', collectionName, 'values:', values);
      var col = connections[connectionName]
      .update(collectionName, searchCriteria, values, function (err, docs) {
        /* istanbul ignore if */
        if (err) {
          debug('update err:', err);
          return cb(err);
        }

        var processor = new Processor(connections[connectionName].collections);
        debug('update err:', err, 'returning docs:', docs);
        cb(null, processor.cast(collectionName, {_result: docs}));
      });
    },

    destroy: function(connectionName, collectionName, options, cb) {
      debug('destroy() options:', options);
      return connections[connectionName]
      .destroy(collectionName, options, (err, docs) => {
        /* istanbul ignore if */
        if (err) {
          debug('destroy err:', err);
          return cb(err);
        }

        var processor = new Processor(connections[connectionName].collections);
        debug('destroy err:', err, 'returning docs:', docs);
        cb(null, processor.cast(collectionName, {_result: docs}));
      });
    },

/*
    // @TODO: Look into ArangoJS for similar & better functions
    _limitFormatter: function(searchCriteria) {
      debug('_limitFormatter()');
      var r = '';
      if (searchCriteria.LIMIT){
        r = 'LIMIT ';
        if (searchCriteria.SKIP){
          r += searchCriteria.SKIP;
          delete searchCriteria.SKIP;
        }
        r += searchCriteria.LIMIT;
        delete searchCriteria.LIMIT;
      }
      return r;
    },

    _updateStringify: function (values) {
      debug('_updateStringify()');
      var r = '';
      r = JSON.stringify(values);

      // remove leading and trailing {}'s
      return r.replace(/(^{|}$)/g, '');
    },

    // @TODO: Prevent injection
    _queryParamWrapper: function(param) {
      console.log('_queryParamWrapper() param:', param);
      if (typeof param === 'string'){
        return "'" + param + "'";
      }
      else if (typeof param === 'object') {
        var s, ii;
        if (Object.prototype.toString.call(param) === '[object Array]') {
          s = '[';
          for (ii=0; ii < param.length; ii++) {
            if (ii) s += ',';
            s += this._queryParamWrapper(param[ii]);
          }
          s += ']';
        }
        else {
          s = '{';
          for (ii in param) {
            s += ii + ':';
            s += this._queryParamWrapper(param[ii]);
          }
          s += '}';
        }
        return s;
      }
      return param;
    },
*/

    /**
     * Quote a value for AQL
     * @param   {string} connection Connection name
     * @param   {string} collection Collection name
     * @param   {any}    val        Value to quote
     * @returns {string} Quoted value for AQL
     */
    quote: function(connection, collection, val) {
      debug('quote() connection:', connection, 'collection:', collection, 'val:', val);  
      return connections[connection].quote(val);
    },

    /**
     * Implements join method for .populate()
     * @function
     * @name join
     * @param   {string}   connection Connection Name
     * @param   {string}   collection Collection Name
     * @param   {object}   criteria   Document data to create
     * @param   {function} cb         Callback (err, data)
     */
    join: function(connection, collection, criteria, cb) {
      debug('join() criteria:', criteria.joins[0].criteria);
      connections[connection].join(collection, criteria, function (err, r) {
        /* istanbul ignore if */
        if (err) {
          return cb(err);
        }
        var processor = new Processor(connections[connection].collections);
        var cast_r = processor.cast(collection, {_result: r});
        return cb(null, cast_r);
      });
    }

  };

  // Expose adapter definition
  return adapter;

})();
