'use strict';
const searchLib = require('../lib/search_operation')
const globalAuthorizerLib = require('./fhirGlobalAuthorizer')

module.exports.connect = (app) => {
	app.get('/:tenantId/:fhirResource', globalAuthorizerLib.authorizer, async (req, res) => {
		const searchResult = await searchLib.searchHandler(req.authorizationContext.context, req.params.tenantId, req.params.fhirResource, req.query, req.headers)

		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', true);

		res.status(searchResult.statusCode).send(JSON.stringify(searchResult.body))
	});
}