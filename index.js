const logger = require('./startup/logging');
const config = require('config');
const express = require('express');
const app = express();

require('./startup/exception')();
require('./startup/config')();
require('./startup/solr').ping();
require('./startup/routes')(app);
if (process.env.NODE_ENV == 'production') {
    require('./startup/prod')(app);
}

const port = process.env.PORT || 80;
app.listen(port, () => logger.info(`Listening on port ${port}...`));