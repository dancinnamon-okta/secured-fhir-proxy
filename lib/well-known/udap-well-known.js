'use strict';

const path = require('path')
const udapCommon = require('hl7-fhir-udap-common')

//Added to handle UDAP meta data
module.exports.getUDAPConfiguration = (tenantConfig, communityId) => {
	const configPath = process.env.CONFIG_PATH ? process.env.CONFIG_PATH : process.env.LAMBDA_TASK_ROOT
	const communityDetails = getCommunityDetails(tenantConfig, communityId)

	if(!communityDetails) {
		return null
	}

	const communityKeyStore = udapCommon.parsePKCS12(path.resolve(configPath, 'udap_pki', communityDetails.udap_pki_cert_filename),communityDetails.udap_pki_cert_filename_pwd,'binary',false)
	const communityCertAndPrivateKey = communityKeyStore[0]
	const serverCertSAN = communityDetails.udap_server_san

	if (udapCommon.validateSanInCert(serverCertSAN, communityCertAndPrivateKey.certChain[0])) {
		var metadata = {
			"udap_versions_supported": ["1"],
			"udap_profiles_supported": ["udap_dcr", "udap_authn", "udap_authz", "udap_to"],
			"udap_authorization_extensions_supported": [],
			"udap_authorization_extensions_required": [],
			"udap_certifications_supported": [],
			"udap_certifications_required": [],
			"grant_types_supported": ["authorization_code", "refresh_token",  "client_credentials"],
			"registration_endpoint": communityDetails.registration_endpoint,
			"registration_endpoint_jwt_signing_alg_values_supported": [process.env.BACKEND_SIGNING_ALGORITHM],
			"authorization_endpoint" : communityDetails.authorize_endpoint,
			"token_endpoint":  communityDetails.token_endpoint,
			"token_endpoint_auth_signing_alg_values_supported":[process.env.BACKEND_SIGNING_ALGORITHM],
			"token_endpoint_auth_methods_supported": ["private_key_jwt"],
			"signed_metadata": getSignedEndpointsJWT(communityCertAndPrivateKey, communityDetails, process.env.BACKEND_SIGNING_ALGORITHM)
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

function getSignedEndpointsJWT(certAndPrivateKey, communityDetails, signingAlg) {
	const claims = {
		"iss": communityDetails.udap_server_san,
		"sub": communityDetails.udap_server_san,
		"authorization_endpoint": communityDetails.authorize_endpoint,
		"token_endpoint": communityDetails.token_endpoint,
		"registration_endpoint": communityDetails.registration_endpoint
	}
	return udapCommon.generateUdapSignedJwt(claims,certAndPrivateKey,signingAlg)
}

function getCommunityDetails(tenantConfig, communityId) {
	if(communityId && tenantConfig.udap_additional_communities) {
		const communityDetails = tenantConfig.udap_additional_communities.filter(community => community.uri === communityId)
		if(communityDetails.length == 1) {
			return communityDetails[0]
		}
		else {
			return null
		}
	}
	else if(!communityId) {
		return {
			udap_pki_cert_filename: tenantConfig.udap_pki_cert_filename,
			udap_pki_cert_filename_pwd: tenantConfig.udap_pki_cert_filename_pwd,
			udap_server_san: tenantConfig.udap_server_san,
			issuer: tenantConfig.issuer,
			authorize_endpoint: tenantConfig.authorize_endpoint,
			token_endpoint: tenantConfig.token_endpoint,
			revoke_endpoint: tenantConfig.revoke_endpoint,
			introspect_endpoint: tenantConfig.introspect_endpoint,
			registration_endpoint: tenantConfig.registration_endpoint,
			keys_endpoint: tenantConfig.keys_endpoint
		}
	}
	else {
		return null
	}
}

