const { format, transports, exceptions } = require('winston');
require('express-async-errors');

module.exports = function () {
    // log unhandled exceptions
    exceptions.handle(
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new transports.File({ filename: 'uncaughtexceptions.log' })
    );
    // throw async exceptions so that exceptions.handle() can handle it
    process.on('unhandledRejection', (ex) => {
        throw ex;
    })
}