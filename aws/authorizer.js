'use strict'

//This is our authorizer that our sample FHIR server will use to determine what resources can be accessed by a given token.

const njwt = require('njwt');
const AuthPolicy = require('./auth-policy');
const axios = require('axios');
const jwk2pem = require('pem-jwk').jwk2pem
const { Auth0FgaApi } = require('@auth0/fga');
const TenantConfig = require('../lib/tenant_config.js')
const scopeProcessor = require('./scope_processor')

module.exports.handler = async function(event, context) {
  //Parse out the inbound request to get what we need for validation and output.
  var apiOptions = {};
  console.log(event)
  console.log(context)
  const tenantConfig = TenantConfig.getTenantConfig(event.pathParameters.tenantId)
  const arnParts = event.methodArn.split(':');

  //We need the details of the API gateway to create/deny access.
  const apiGatewayArnPart = arnParts[5].split('/');
  const awsAccountId = arnParts[4];
  apiOptions.region = arnParts[3];
  apiOptions.restApiId = apiGatewayArnPart[0];
  apiOptions.stage = apiGatewayArnPart[1];

  //Details about the request.
  const httpMethod = event.requestContext.httpMethod
  const fhirResourcePath = event.pathParameters.proxy.split('/')
  const fhirResourceType = fhirResourcePath[0]
  const fhirResourceId = (fhirResourcePath.length > 1) ? fhirResourcePath[1] : null
  
  //First token validation.
  var verifiedJWT = null;

  try {
    var key = await getSigningKey(tenantConfig.keys_endpoint)
    var authZHeader = event.headers.Authorization.split(" ");
    var access_token = authZHeader[1];

    var signingKeyPem = jwk2pem(key)
    verifiedJWT = njwt.verify(access_token, signingKeyPem, "RS256")
  }
  catch(err) {
    console.log("An invalid JWT was passed in.  The request is not authorized.")
    console.log(err)
    const failPolicy = new AuthPolicy('none', awsAccountId, apiOptions);
    failPolicy.denyAllMethods()
    return context.succeed(failPolicy.build());
  }

  //Audience Check
  const expectedAud = "https://" + process.env.FHIR_BASE_DOMAIN + "/" + event.pathParameters.tenantId
  const validAudience = (Array.isArray(verifiedJWT.body.aud) && verifiedJWT.body.aud.includes(expectedAud)) || (verifiedJWT.body.aud.startsWith(expectedAud))
  if(!validAudience) {
    console.log("The JWT passed in has an incorrect audience.")
    console.log("Expected: " + expectedAud)
    console.log("Actual: " + verifiedJWT.body.aud)

    const failPolicy = new AuthPolicy('none', awsAccountId, apiOptions);
    failPolicy.denyAllMethods()
    return context.succeed(failPolicy.build());
  }

  const scopesArray = Array.isArray(verifiedJWT.body.scope) ? verifiedJWT.body.scope : verifiedJWT.body.scope.split(' ');

  //Coarse grained scope check
  if(!scopeProcessor.authorizeScopeForResourceAndMethod(fhirResourceType, fhirResourceId, httpMethod, scopesArray)) {
    console.log("The JWT passed in does not have the proper scopes to make the request")
    console.log("FHIR Resource Type: " + fhirResourceType)
    console.log("FHIR Resource ID: " + fhirResourceId)
    console.log("HTTP Method: " + httpMethod)
    console.log("Scopes: " + verifiedJWT.body.scope)

    const failPolicy = new AuthPolicy('none', awsAccountId, apiOptions);
    failPolicy.denyAllMethods()
    return context.succeed(failPolicy.build());
  }

  //Resource level checks
  //Define our policy header.
  const policy = new AuthPolicy(verifiedJWT.body.sub, awsAccountId, apiOptions);

  //Our rules here below.
  //We're only enabling one type at a time.  Can't mix patient/user/system.
  //We'll do this by picking the most restrictive and allowing that.
  if(scopesArray.filter(scope => scope.startsWith('patient/')).length > 0) {
    await handlePatientScopes(verifiedJWT, httpMethod, policy, tenantConfig)
  }
  else if (scopesArray.filter(scope => scope.startsWith('user/')).length > 0) {
    await handleUserScopes(verifiedJWT, httpMethod, policy, tenantConfig)
  }
  else {
    await handleSystemScopes(verifiedJWT, httpMethod, policy, tenantConfig)
  }

  if(policy.allowMethods.length == 0) {
    policy.denyAllMethods()
  }

  return context.succeed(policy.build());
}

async function handlePatientScopes(verifiedJWT, requestMethod, policy, tenantConfig) {
  //We need to add an allow policy only for the patient id called out in the JWT.
  console.log("Handling patient scopes.")
  console.log("Allowing access to: " + "/" + tenantConfig.id + "/Patient/" + verifiedJWT.body.launch_response_patient)
  policy.allowMethod(requestMethod, "/" + tenantConfig.id + "/Patient/" + verifiedJWT.body.launch_response_patient);
}

//For user scopes, we're going to follow 1 of 2 paths...
//If FGA is enabled, we'll perform a relationship check.
//If FGA is NOT enabled, then we'll just grant access to the value in the fhirUser claim only.
async function handleUserScopes(verifiedJWT, requestMethod, policy, tenantConfig) {
  console.log("Handling user scopes.")
  if(tenantConfig.fga_enabled === "true") {
    console.log("Performing a fine grained access check")
    /*console.log("Inbound client: " + verifiedJWT.body.fhirUser)
    console.log("Patient to access: " + requestedPatient)
    const auth0fga = new Auth0FgaApi({
      environment: tenantConfig.fga_environment, // can be "us" (default if not set) for Developer Community Preview or "playground" for the Playground API
      storeId: tenantConfig.fga_store_id,
      clientId: tenantConfig.fga_client_id,
      clientSecret: tenantConfig.fga_client_secret
    });
    const result = await auth0fga.check({
      tuple_key: {
        user: verifiedJWT.body.fhirUser,
        relation: "can_view",
        object: "patient:" + requestedPatient
      }
    });
    console.log("FGA Result:")
    console.log(result)
    if(result && result.allowed) {
      console.log("Relationship found!")
      console.log(result)
      var allowedURL = "/" + tenantConfig.id + "/Patient/" + requestedPatient
      policy.allowMethod(AuthPolicy.HttpVerb.GET, allowedURL);
    }
    else {
      console.log("Fine Grained authz check failed. No access granted.")
    }*/
  }
  else {
    console.log("FGA not enabled. Granting access to: " + verifiedJWT.body.fhirUser)
    policy.allowMethod(requestMethod, "/" + tenantConfig.id + '/' + verifiedJWT.body.fhirUser);
  }
}

//For user scopes, we're going to follow 1 of 2 paths...
//If FGA is enabled, we'll perform a relationship check.
//If FGA is NOT enabled, then we'll grant full access to all records.

async function handleSystemScopes(verifiedJWT, requestMethod, policy, tenantConfig) {

  console.log("Handling system scopes.")
  if(tenantConfig.fga_enabled === "true") {
    console.log("Performing a fine grained access check")
    /*console.log("Inbound client: " + verifiedJWT.body.fhirUser)
    console.log("Patient to access: " + requestedPatient)
    const auth0fga = new Auth0FgaApi({
      environment: tenantConfig.fga_environment, // can be "us" (default if not set) for Developer Community Preview or "playground" for the Playground API
      storeId: tenantConfig.fga_store_id,
      clientId: tenantConfig.fga_client_id,
      clientSecret: tenantConfig.fga_client_secret
    });
    const result = await auth0fga.check({
      tuple_key: {
        user: verifiedJWT.body.fhirUser,
        relation: "can_view",
        object: "patient:" + requestedPatient
      }
    });
    console.log("FGA Result:")
    console.log(result)
    if(result && result.allowed) {
      console.log("Relationship found!")
      console.log(result)
      var allowedURL = "/" + tenantConfig.id + "/Patient/" + requestedPatient
      policy.allowMethod(AuthPolicy.HttpVerb.GET, allowedURL);
    }
    else {
      console.log("Fine Grained authz check failed. No access granted.")
    }*/
  }
  else {
    //This is not really full access, remembering that I already validated the scope<->resourceType + activity mapping.
    console.log("FGA not enabled. Granting full access to scoped FHIR resource types and activities.")
    policy.allowMethod(requestMethod, "/" + tenantConfig.id + '/*')
  }
}

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
