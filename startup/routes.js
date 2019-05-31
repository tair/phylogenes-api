const express = require('express');
const panther = require('../routes/panther');
const error = require('../middleware/error');

module.exports = function(app) {
  app.use(express.json());
  app.use('/api/panther', panther);
  app.use(error);
}