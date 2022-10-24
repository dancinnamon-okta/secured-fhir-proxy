'use strict';
const matchLib = require('../lib/match_operation')

//Token proxy - AWS implementation.
//See the token library for full documentation.
module.exports.matchHandler = async (event, context) => {
	var handlerResponse = await matchLib.matchHandler(event.body)

	return {
		statusCode: handlerResponse.statusCode,
		body: JSON.stringify(handlerResponse.body),
		headers: handlerResponse.headers
	}
}
