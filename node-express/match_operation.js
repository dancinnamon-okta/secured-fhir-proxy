'use strict';
const matchLib = require('../lib/match_operation')
const globalAuthorizerLib = require('./fhirGlobalAuthorizer')

module.exports.connect = (app) => {
	app.post('/:tenantId/Patient/match', async (req, res) => {
		const matchResult = await matchLib.matchHandler(JSON.stringify(req.body), req.params.tenantId)

		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', true);

		res.status(matchResult.statusCode).send(JSON.stringify(matchResult.body))
	});
}