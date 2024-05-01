'use strict';
const searchLib = require('../lib/search_operation')

module.exports.searchHandler = async (event, context) => {
	const searchResult = await searchLib.searchHandler(event.requestContext.authorizer, event.pathParameters.tenantId, event.pathParameters.fhirResource, event.queryStringParameters, event.headers)
	searchResult.headers['Access-Control-Allow-Origin'] = '*'
	searchResult.headers['Access-Control-Allow-Credentials'] = 'true'
	return {
		statusCode: searchResult.statusCode,
		body: JSON.stringify(searchResult.body),
		headers: searchResult.headers
	}
}