/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const Users = Waterline.Collection.extend({
  identity: 'users',
  schema: true,
  connection: 'arangodb',

  attributes: {

    name: {
      type: 'string',
      required: true
    }

  }
});

module.exports = Users;