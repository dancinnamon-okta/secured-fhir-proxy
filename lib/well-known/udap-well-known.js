'use strict';

const path = require('path')
const udapCommon = require('udap-common')

//Added to handle UDAP meta data
module.exports.getUDAPConfiguration = (tenantConfig) => {
	const communityKeyStore = udapCommon.parsePKCS12(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_cert_filename),tenantConfig.udap_pki_cert_filename_pwd,'binary',false)
	const communityCertAndPrivateKey = communityKeyStore[0]
	const serverCertSAN = tenantConfig.udap_server_san

	if (udapCommon.validateSanInCert(serverCertSAN, communityCertAndPrivateKey.certChain[0])) {
		var metadata = {
			"udap_versions_supported": ["1"],
			"udap_profiles_supported": ["udap_dcr", "udap_authn", "udap_authz", "udap_to"],
			"udap_authorization_extensions_supported": [],
			"udap_authorization_extensions_required": [],
			"udap_certifications_supported": [],
			"udap_certifications_required": [],
			"grant_types_supported": ["authorization_code", "refresh_token",  "client_credentials"],
	    	"registration_endpoint": tenantConfig.registration_endpoint,
			"registration_endpoint_jwt_signing_alg_values_supported": ["RS256"],
	    	"authorization_endpoint" : tenantConfig.authorize_endpoint,
	   	 	"token_endpoint":  tenantConfig.token_endpoint,
			"token_endpoint_auth_signing_alg_values_supported":["RS256"],
			"token_endpoint_auth_methods_supported": ["private_key_jwt"],
			"signed_metadata": getSignedEndpointsJWT(communityCertAndPrivateKey, tenantConfig)
		}
		if(tenantConfig.scopes_supported) {
			metadata.scopes_supported = tenantConfig.scopes_supported
		}
		return metadata
	}
	else {
		return {"error": "The SAN of the certificate used to host this server does not match the base FHIR URL."}
	}
}

function getSignedEndpointsJWT(certAndPrivateKey,tenantConfig) {
	const claims = {
		"iss": tenantConfig.udap_server_san,
		"sub": tenantConfig.udap_server_san,
		"authorization_endpoint": tenantConfig.authorize_endpoint,
		"token_endpoint": tenantConfig.token_endpoint,
		"registration_endpoint": tenantConfig.registration_endpoint
	}
	return udapCommon.generateUdapSignedJwt(claims,certAndPrivateKey)
}

