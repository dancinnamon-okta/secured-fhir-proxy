'use strict';
const readLib = require('../lib/read_operation')
const globalAuthorizerLib = require('./fhirGlobalAuthorizer')

module.exports.connect = (app) => {
	app.get('/:tenantId/:fhirResource/*', globalAuthorizerLib.authorizer, async (req, res) => {
		const readResult = await readLib.readHandler(req.authorizationContext.context, req.params.tenantId, req.path, req.query, req.headers)
		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', true);

		res.status(readResult.statusCode).send(JSON.stringify(readResult.body))
	});
}