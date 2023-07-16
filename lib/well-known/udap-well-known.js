'use strict';

const njwt = require('njwt')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const forge = require('node-forge')
const pki = require('node-forge').pki
const asn1 = require('node-forge').asn1
const udapCommon = require('udap-common')

//Added to handle UDAP meta data
module.exports.getUDAPConfiguration = (tenantConfig) => {

	// const serverCert = fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_cert_filename), {encoding: 'utf-8'})
	// const serverKey = fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_key_filename), {encoding: 'utf-8'})
	// const serverCertSAN = getSANFromCert(serverCert)
	//const x509CString = fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_cert_filename), {encoding: 'utf-8'})
	const communityKeyStore = udapCommon.parsePKCS12(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_cert_filename),tenantConfig.udap_pki_cert_filename_pwd,'binary',false)
	const communityCertAndPrivateKey = communityKeyStore[0]
	const serverCert = communityCertAndPrivateKey.certChain[0]
	const serverKey = communityCertAndPrivateKey.privateKeyPem

	const serverCertSAN = tenantConfig.udap_server_san
	//This can be used one common refactor branch is merged
	// if (udapCommon.validateSanInCert(serverCertSAN,certAndPrivateKey.cert))
	if(serverCertSAN == serverCertSAN) {// TODO: Put this back in. process.env.FHIR_BASE){
		return {
			"udap_versions_supported": ["1"],
			"udap_profiles_supported": ["udap_dcr", "udap_authn", "udap_authz", "udap_to"],
			"udap_authorization_extensions_supported": [],
			"udap_authorization_extensions_required": [],
			"udap_certifications_supported": [],
			"udap_certifications_required": [],
			"grant_types_supported": ["authorization_code", "refresh_token",  "client_credentials"],
			"scopes_supported": ["openid", "fhirUser", "system/Patient.r", "user/Patient.r"],
	    "registration_endpoint": tenantConfig.registration_endpoint,
			"registration_endpoint_jwt_signing_alg_values_supported": ["RS256"],
	    "authorization_endpoint" : tenantConfig.authorize_endpoint,
	    "token_endpoint":  tenantConfig.token_endpoint,
			"token_endpoint_auth_signing_alg_values_supported":["RS256"],
			"token_endpoint_auth_methods_supported": ["private_key_jwt"],
			"signed_metadata": getSignedEndpointsJWT(communityCertAndPrivateKey, tenantConfig)
		}
	}
	else {
		return {"error": "The SAN of the certificate used to host this server does not match the base FHIR URL."}
	}

}

function getSignedEndpointsJWT(certAndPrivateKey,tenantConfig) {
	const claims = {
		"iss": "https://" + process.env.FHIR_BASE_DOMAIN + "/" + tenantConfig.id,
		"sub": "https://" + process.env.FHIR_BASE_DOMAIN + "/" + tenantConfig.id,
		"authorization_endpoint": tenantConfig.authorize_endpoint,
		"token_endpoint": tenantConfig.token_endpoint,
		"registration_endpoint": tenantConfig.registration_endpoint
	}
	return udapCommon.generateUdapSignedJwt(claims,certAndPrivateKey)
}

