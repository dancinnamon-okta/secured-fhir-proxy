'use strict'

//This is the authorizer that is used when a FHIR resource is requested directly by ID.
//A different authorizer will be used for patient match and FHIR searches.

const njwt = require('njwt');
const axios = require('axios');
const jwk2pem = require('pem-jwk').jwk2pem

const scopeProcessor = require('./scope_processor')

async function getSigningKey(keysUrl) {
    try {
      var keysResponse = await axios.request({
        'url': keysUrl,
        'method': 'get'
      })
      console.log('Keys response')
      console.log(keysResponse.data)
      return keysResponse.data.keys[0]
    }
    catch(error) {
      console.log(error)
      throw new Error("Error getting keys...")
    }
  }

module.exports.authorizeJwtProtectedEndpoint = async function(tenantConfig, httpMethod, headers, fhirResourceType) {
    //First token validation.
    var verifiedJWT = null;

    try {
        var key = await getSigningKey(tenantConfig.keys_endpoint)
        var authZHeader = headers.Authorization.split(" ");
        var access_token = authZHeader[1];

        var signingKeyPem = jwk2pem(key)
        verifiedJWT = njwt.verify(access_token, signingKeyPem, "RS256")
    }
    catch(err) {
        return {
            success: false,
            message: 'An invalid JWT was passed in, or the server is not properly configured for JWT validation.  The request is not authorized.',
            verifiedJWT: null
        }
    }

    //Audience Check
    const expectedAud = "https://" + process.env.FHIR_BASE_DOMAIN + "/" + tenantConfig.id
    const validAudience = (Array.isArray(verifiedJWT.body.aud) && verifiedJWT.body.aud.includes(expectedAud)) || (verifiedJWT.body.aud.startsWith(expectedAud))
    if(!validAudience) {
        console.log("The JWT passed in has an incorrect audience.")
        console.log("Expected: " + expectedAud)
        console.log("Actual: " + verifiedJWT.body.aud)

        return {
            success: false,
            message: 'The JWT used for authorization in has an incorrect audience.  The request is not authorized.',
            verifiedJWT: null
        }
    }

    const scopesArray = Array.isArray(verifiedJWT.body.scope) ? verifiedJWT.body.scope : verifiedJWT.body.scope.split(' ');

    //Coarse grained scope check
    if(!scopeProcessor.authorizeScopeForResourceAndMethod(fhirResourceType, httpMethod, scopesArray)) {
        console.log("The JWT passed in does not have the proper scopes to make the request")
        console.log("FHIR Resource Type: " + fhirResourceType)
        console.log("HTTP Method: " + httpMethod)
        console.log("Scopes: " + verifiedJWT.body.scope)

        return {
            success: false,
            message: 'The JWT used for authorization does not have the proper scopes to make the request.  The request is not authorized.',
            verifiedJWT: null
        }
    }

    return {
        success: true,
        message: '',
        verifiedJWT: verifiedJWT
    }
}