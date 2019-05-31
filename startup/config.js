const config = require('config');

// check required environment variables
module.exports = function() {
    if (!config.get('user')) {
        throw new Error('Error starting up application: environment variable solr_user is not defined.');
    }
    if (!config.get('password')) {
        throw new Error('Error starting up application: environment variable solr_password is not defined.');
    }
}