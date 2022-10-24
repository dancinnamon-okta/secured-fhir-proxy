'use strict';
const SmartConfig = require('./well-known/smart-well-known.js');
const UDAPConfig = require('./well-known/udap-well-known.js')
const TenantConfig = require('./tenant_config.js')

//These endpoints are essentially static endpoints that advertise key information about the SMART authorization server.
//They are dyanamic endpoints in this reference implementation purely for ease of deployment.
module.exports.smartConfigHandler = async (tenantId) => {
	return SmartConfig.getSMARTConfiguration(TenantConfig.getTenantConfig(tenantId));
}

module.exports.legacyMetadataHandler = async (tenantId) => {
	return SmartConfig.getLegacyConfiguration(TenantConfig.getTenantConfig(tenantId));
}

module.exports.udapConfigHandler = async (tenantId) => {
	return UDAPConfig.getUDAPConfiguration(TenantConfig.getTenantConfig(tenantId));
}
