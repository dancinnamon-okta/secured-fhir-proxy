'use strict';
const SmartConfig = require('./well-known/smart-well-known.js');
const UDAPConfig = require('./well-known/udap-well-known.js')
const TenantConfig = require('./tenant_config.js')
const MCPConfig = require('./well-known/mcp-protected-resource.js')
const axios = require('axios')

//These endpoints are essentially static endpoints that advertise key information about the SMART authorization server.
//They are dyanamic endpoints in this reference implementation purely for ease of deployment.
module.exports.smartConfigHandler = async (tenantId) => {
	return SmartConfig.getSMARTConfiguration(TenantConfig.getTenantConfig(tenantId));
}

//For the metadata endpoint, we need to grab the actual FHIR metadata behind the scenes, and bolster it with our authorization server data.
module.exports.legacyMetadataHandler = async (tenantId) => {
    const tenantConfig = TenantConfig.getTenantConfig(tenantId)
    const fhirUrl = tenantConfig.backend_fhir_service_url ? tenantConfig.backend_fhir_service_url : process.env.BACKEND_FHIR_SERVICE_URL

    console.log(`${fhirUrl}/metadata`)

    //Get the metadata from the backend server.
    var request = {
        'url': `${fhirUrl}/metadata`,
        'method': 'GET',
        'maxRedirects': 0,
        'validateStatus': function (status) {
            return true //We want to report on exactly what the FHIR server reports back, good or bad.
        }
    }
    console.log("Getting metadata from the backend.")
    console.log(request)
    var fhirResult = await axios.request(request)
    if(fhirResult.status === 200) {
		const smartConfiguration = SmartConfig.getLegacyConfiguration(tenantConfig);
		fhirResult.data.rest[0]['security'] = smartConfiguration.rest[0].security
        return {
            statusCode: fhirResult.status,
            headers: fhirResult.headers,
            body: fhirResult.data
        }
    }
    else {
        return {
            statusCode: fhirResult.status,
            headers: fhirResult.headers,
            body: fhirResult.data
        }
    }
}

module.exports.udapConfigHandler = async (tenantId, communityId) => {
	return UDAPConfig.getUDAPConfiguration(TenantConfig.getTenantConfig(tenantId), communityId);
}

module.exports.mcpConfigHandler = async (req, tenantId) => {
	return MCPConfig.getMCPConfiguration(req, TenantConfig.getTenantConfig(tenantId));
}