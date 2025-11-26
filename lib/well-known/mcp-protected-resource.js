'use strict';

//This will tell MCP clients where to find the authorization server.
module.exports.getMCPConfiguration = (tenantConfig, resourceServerBaseUrl) => {
	console.log('Calculating metadata...')
	console.log(tenantConfig)

	var metadata = {
		"resource": resourceServerBaseUrl,
		"authorization_servers": [tenantConfig.issuer],
		"resource_name": "Demo FHIR MCP Server with authorization"
	}
	if(tenantConfig.scopes_supported) {
		metadata.scopes_supported = tenantConfig.scopes_supported
	}
	return metadata
}