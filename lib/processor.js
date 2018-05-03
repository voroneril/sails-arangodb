/*jshint node: true, esversion:6 */
'use strict';

var _ = require('lodash');
var debug = require('debug')('sails-arangodb:processor');

/**
 * Processes data returned from a AQL query.
 * Taken and modified from https://github.com/balderdashy/sails-postgresql/blob/master/lib/processor.js
 * @module
 * @name processor
 */
var Processor = module.exports = function Processor(schema) {
  this.schema = _.cloneDeep(schema);
  return this;
};

/**
 * Cast special values to proper types.
 *
 * Ex: Array is stored as "[0,1,2,3]" and should be cast to proper
 * array for return values.
 */

Processor.prototype.cast = function(collectionName, result) {

  var self = this;
  var _result = _.cloneDeep(result._result);

  // TODO: go deep in results for value casting

  /* istanbul ignore else  */
  if (_result !== undefined) {
    if (_.isArray(_result)) {
      debug('cast() _result:', _result);
      // _result is in the following form:
      // [ { name: 'Gab',
      //   createdAt: '2015-11-26T01:09:44.197Z',
      //   updatedAt: '2015-11-26T01:09:44.197Z',
      //   username: 'gab-arango',
      //   _id: 'user/4715390689',
      //   _rev: '5874132705',
      //   _key: '4715390689' } ]
      _result.forEach(function(r) {
        debug('cast() r:', r);
        /* istanbul ignore else  */
        if (r._key) {
          r.id = r._key;
        }
        Object.keys(r).forEach(function(key) {
          self.castValue(collectionName, key, r[key], r);
        });
      });
    } else {
      // cast single document
      _result.id = _result._key;
      Object.keys(_result).forEach(function(key) {
		//console.log('castValue',key);
        self.castValue(collectionName, key, _result[key], _result);
      });
    }
  }

  return _result;
};

/**
 * Cast a value
 *
 * @param {String} key
 * @param {Object|String|Integer|Array} value
 * @param {Object} schema
 * @api private
 */

Processor.prototype.castValue = function(table, key, value, attributes) {
  debug('castValue: table:', table, 'key:', key);

  var self = this;
  var identity = table;
  var attr;

  // Check for a columnName, serialize so we can do any casting
  /* istanbul ignore else  */
  if (this.schema[identity]) {
	//console.log('castValue 2',this.schema[identity]);
    Object.keys(this.schema[identity].definition).forEach(function(attribute) {
      if(self.schema[identity].definition[attribute].columnName === key) {
        attr = attribute;
        return;
      }
    });
  }

  if(!attr) attr = key;

  // Lookup Schema "Type"
  if(!this.schema[identity] || !this.schema[identity].definition[attr]) return;
  var type;

  debug('attr:', attr, 'definition:', this.schema[identity].definition[attr]);
  /* istanbul ignore next */
  if(!_.isPlainObject(this.schema[identity].definition[attr])) {
    // This code is never reached as waterline always passes object in schema
    // TODO: Remove
    type = this.schema[identity].definition[attr];
  } else {
    type = this.schema[identity].definition[attr].type;
  }

  debug(`castValue() field: ${key} has type ${type}`);

  /* istanbul ignore else  */
  if(!type) return;

  switch(type) {
//    case 'array':
//      try {
//        // Attempt to parse Array
//        attributes[key] = JSON.parse(value);
//      } catch(e) {
//        console.log('array parse error:', e, 'for:', value);
//        return;
//      }
//      break;
    case 'date':
    case 'datetime':
      attributes[key] = new Date(attributes[key]);
      break;
  }
  /* istanbul ignore next */
  debug('cast type?:', attributes[key] ? attributes[key].constructor : 'undefined', 'value:', attributes[key]);
};
