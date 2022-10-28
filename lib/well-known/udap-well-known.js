'use strict';

const njwt = require('njwt')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const forge = require('node-forge')
const pki = require('node-forge').pki
const asn1 = require('node-forge').asn1

//Added to handle UDAP meta data
module.exports.getUDAPConfiguration = (tenantConfig) => {

	const serverCert = fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_cert_filename), {encoding: 'utf-8'})
	const serverKey = fs.readFileSync(path.resolve(process.env.LAMBDA_TASK_ROOT, 'udap_pki', tenantConfig.udap_pki_key_filename), {encoding: 'utf-8'})
	const serverCertSAN = getSANFromCert(serverCert)

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
			"signed_metadata": getSignedEndpointsJWT(serverCert, serverKey, tenantConfig)
		}
	}
	else {
		return {"error": "The SAN of the certificate used to host this server does not match the base FHIR URL."}
	}

}

function getSignedEndpointsJWT(serverCert, serverKey, tenantConfig) {
	const now = Math.floor( new Date().getTime() / 1000 );
	const plus5Minutes = new Date( ( now + (5*60) ) * 1000);
	const jti = uuidv4()

	const claims = {
		"authorization_endpoint": tenantConfig.authorize_endpoint,
		"token_endpoint": tenantConfig.token_endpoint,
		"registration_endpoint": tenantConfig.registration_endpoint
	}
	var derCert = pki.pemToDer(serverCert)
	var string64 = forge.util.encode64(derCert.getBytes())

	const jwt = njwt.create(claims, serverKey, "RS256")
		.setIssuedAt(now)
		.setExpiration(plus5Minutes)
		.setIssuer("https://" + process.env.FHIR_BASE_DOMAIN + "/" + tenantConfig.id)
		.setSubject("https://" + process.env.FHIR_BASE_DOMAIN + "/" + tenantConfig.id)
		.setHeader("x5c", [string64])
		.setJti(jti)
		.compact();

		return jwt
}

//This will get the subject alternative name from the cert we're using to host this metadata. It needs to be the same as process.env.FHIR_BASE
function getSANFromCert(certValue) {
	const cert = pki.certificateFromPem(certValue)

	console.log("Loaded public cert- SAN:")
	console.log(cert.getExtension('subjectAltName').altNames[0].value)

	return cert.getExtension('subjectAltName').altNames[0].value
}

function stripHeadTail(content) {
	var lines = content.split('\n')
	lines.splice(0,1)

	//Strip away empty lines and ending --END CERTIFICATE-- lines from the end.
	while(lines.length > 0 && (lines[lines.length - 1].startsWith('-') || lines[lines.length - 1].length == 0)) {
		lines.splice(-1, 1)
	}

	return lines.join('\n')
}
