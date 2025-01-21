'use strict'

//This is the authorizer that is used when a FHIR resource is requested directly by ID.
//A different authorizer will be used for patient match and FHIR searches.

const njwt = require('njwt');
const axios = require('axios');
const jwk2pem = require('pem-jwk').jwk2pem

const scopeProcessor = require('./scope_processor')


async function getSigningKey(keysUrl, kid) {
    try {
      var keysResponse = await axios.request({
        'url': keysUrl,
        'method': 'get'
      })
      console.log('Keys response')
      console.log(keysResponse.data)
      const keyByKid = keysResponse.data.keys.filter((key) => key.kid == kid)
      if(keyByKid.length == 1) {
        return keyByKid[0]
      }
      else {
        throw new Error("Unable to locate the signing key by the kid in the access token header.")
      }
    }
    catch(error) {
      console.log(error)
      throw new Error("Error getting keys...")
    }
}

function getKeysUrl(tenantConfig, issuer) {
  if(issuer == tenantConfig.issuer) {
    return tenantConfig.keys_endpoint
  }

  else if(tenantConfig.udap_additional_communities) {
    const matchingCommunity = tenantConfig.udap_additional_communities.filter((community) => community.issuer == issuer)
    return matchingCommunity.length > 0 ? matchingCommunity[0].keys_endpoint : null
  }
  else {
    return null
  }
}

function getTokenKid(accessToken) {
   return JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64').toString('utf-8')).kid
}

function getTokenIssuer(accessToken) {
  return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf-8')).iss
}

function validateIssuer(issuer, tenantConfig) {
  console.log(`Validating token issuer: ${issuer}`)
  if(issuer == tenantConfig.issuer) {
    return true
  }

  if(tenantConfig.udap_additional_communities) {
    return tenantConfig.udap_additional_communities.filter((community) => community.issuer == issuer).length > 0
  }

  return false
}

module.exports.authorizeJwtProtectedEndpoint = async function(tenantConfig, httpMethod, headers, fhirResourceType) {
    //First token validation.
    const authorizeHeaderPattern = /^\s*bearer\s+(.+)$/i
    var verifiedJWT = null;

    try {
        const authZHeader = headers.Authorization ? headers.Authorization : (headers.authorization ? headers.authorization : '')
        const parsedHeader = authZHeader.match(authorizeHeaderPattern);

        if (!parsedHeader || parsedHeader.length != 2) {
          throw new Error('An invalid authorization header was sent in.')
        }

        var access_token = parsedHeader[1];
        const issuer = getTokenIssuer(access_token)
        if (!validateIssuer(issuer, tenantConfig)) {
          throw new Error('The access token was not signed by a trusted issuer.')
        }

        var key = await getSigningKey(getKeysUrl(tenantConfig, issuer), getTokenKid(access_token))

        var signingKeyPem = jwk2pem(key)
        verifiedJWT = njwt.verify(access_token, signingKeyPem, "RS256")
    }
    catch(err) {
        console.error(err)
        return {
            success: false,
            message: 'An invalid JWT was passed in, or the server is not properly configured for JWT validation.  The request is not authorized.',
            verifiedJWT: null
        }
    }

    //Audience Check
    const expectedAud = process.env.FHIR_BASE_URL + "/" + tenantConfig.id
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