const express = require('express');
const panther = require('../routes/panther');
const error = require('../middleware/error');
const cors = require('cors');
const config = require('config');

module.exports = function(app) {
  app.use(cors( { origin: config.get('frontend_domain') } ));
  app.use(express.json());
  app.use('/api/panther', panther);
  app.use(error);
}