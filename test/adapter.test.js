/*jshint node: true, esversion:6 */
'use strict';

/*global describe, before, it */
const assert = require('assert');
const should = require('should');

const Waterline = require('waterline');
const orm = new Waterline();
const adapter = require('../');
const config = require("./test.json");
config.adapter = 'arangodb';

const Users = require('./models/users');

const waterline_config = {
  adapters: {
    'default': adapter,
    arangodb: adapter
  },
  connections: {
    arangodb: config
  },
  defaults: {}
};

let models,
    connections,
    saveId;

describe('adapter', function () {

  before(function (done) {
    orm.loadCollection(Users);
    orm.initialize(waterline_config, (err, o) => {
      models = o.collections;
      connections = o.connections;
      done(err);
    });
  });

  describe('connection', function () {
    it('should establish a connection', () => {
      connections.should.ownProperty('arangodb');
    });
  });

  describe('methods', function () {
    it('should create a new document in users', (done) => {
      models.users.create({name: 'Fred Blogs'})
      .then((user) => {
        should.exist(user);
        user.should.have.property('id');
        user.should.have.property('_key');
        user.should.have.property('_id');
        user.should.have.property('_rev');
        user.should.have.property('name');
        user.should.have.property('createdAt');
        user.should.have.property('updatedAt');
        user.name.should.equal('Fred Blogs');
        saveId = user.id;
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find previously created user by id', (done) => {
      models.users.find({id: saveId})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.should.have.property('id');
        user.should.have.property('_key');
        user.should.have.property('_id');
        user.should.have.property('_rev');
        user.should.have.property('name');
        user.should.have.property('createdAt');
        user.should.have.property('updatedAt');
        user.name.should.equal('Fred Blogs');
        saveId = user.id;
        done();
      })
      .catch((err) => {
        done(err);
      });
    });
  });


}); // adapter