'use strict';
const metadataLib = require('../lib/metadata_endpoints')

//Metadata endpoints - AWS Lambda Interface
//See the metadata library for more detail.
module.exports.smartConfigHandler = async (event, context) => {
	var smartConfigResult = await metadataLib.smartConfigHandler(event.pathParameters.tenantId)
	return {
		statusCode: 200,
		body: JSON.stringify(smartConfigResult),
		headers: {
			'Access-Control-Allow-Origin': '*', // CORS
			'Access-Control-Allow-Credentials': false // Required for cookies, authorization headers with HTTPS
		}
	}
}

module.exports.legacyMetadataHandler = async (event, context) => {
	var legacyConfigResult = await metadataLib.legacyMetadataHandler(event.pathParameters.tenantId)
	return {
		statusCode: 200,
		body: JSON.stringify(legacyConfigResult),
		headers: {
			'Access-Control-Allow-Origin': '*', // CORS
			'Access-Control-Allow-Credentials': false // Required for cookies, authorization headers with HTTPS
		}
	}
}

module.exports.udapConfigHandler = async (event, context) => {
	var udapConfigResult = await metadataLib.udapConfigHandler(event.pathParameters.tenantId)
	return {
		statusCode: 200,
		body: JSON.stringify(udapConfigResult),
		headers: {
			'Access-Control-Allow-Origin': '*', // CORS
			'Access-Control-Allow-Credentials': false // Required for cookies, authorization headers with HTTPS
		}
	}
}
