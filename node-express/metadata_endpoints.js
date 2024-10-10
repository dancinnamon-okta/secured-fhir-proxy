'use strict';
const metadataLib = require('../lib/metadata_endpoints')

module.exports.connect = (app) => {
	app.get('/:tenantId/smart-configuration', async (req, res) => {
		var smartConfigResult = await metadataLib.smartConfigHandler(req.params.tenantId)

		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', false);
		res.status(200).send(JSON.stringify(smartConfigResult));
	});
	
	app.get('/:tenantId/.well-known/smart-configuration', async (req, res) => {
		var smartConfigResult = await metadataLib.smartConfigHandler(req.params.tenantId)

		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', false);
		res.status(200).send(JSON.stringify(smartConfigResult));
	});
	
	app.get('/:tenantId/metadata', async (req, res) => {
		var legacyConfigResult = await metadataLib.legacyMetadataHandler(req.params.tenantId)
		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', false);
		res.status(200).send(JSON.stringify(legacyConfigResult));
	});
	
	app.get('/:tenantId/.well-known/udap', async (req, res) => {
		var udapConfigResult = await metadataLib.udapConfigHandler(req.params.tenantId)
		res.set('Access-Control-Allow-Origin', '*');
		res.set('Access-Control-Allow-Credentials', false);
		res.status(200).send(JSON.stringify(udapConfigResult));
	});
}