'use strict';
const readLib = require('../lib/read_operation')

module.exports.readHandler = async (event, context) => {
	const readResult = await readLib.readHandler(event.requestContext.authorizer, event.pathParameters.tenantId, event.path, event.queryStringParameters, event.headers)
	return {
		statusCode: readResult.statusCode,
		body: JSON.stringify(readResult.body),
		headers: readResult.headers
	}
}