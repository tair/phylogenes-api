const logger = require('./startup/logging');
const config = require('config');
const express = require('express');
const app = express();

require('./startup/exception')();
require('./startup/config')();
require('./startup/solr').ping();
require('./startup/routes')(app);
if (config.get('NODE_ENV')=='production'){
    require('./startup/prod')(app);
}

const port = process.env.PORT || 3000;
app.listen(port, () => logger.info(`Listening on port ${port}...`));