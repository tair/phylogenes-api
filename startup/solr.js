const SolrNode = require('solr-node');
const config = require('config');

const client =  new SolrNode({
    host: config.get('host'),
    port: config.get('port'),
    protocol: config.get('protocol'),
    core: config.get('core'),
    user: config.get('user'),
    password: config.get('password')
});
module.exports = client;