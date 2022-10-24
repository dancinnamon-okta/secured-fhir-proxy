'use strict'

//This is our authorizer that our sample FHIR server will use to determine what resources can be accessed by a given token.

const njwt = require('njwt');
const AuthPolicy = require('./auth-policy');
const axios = require('axios');
const jwk2pem = require('pem-jwk').jwk2pem
const { Auth0FgaApi } = require('@auth0/fga');
const TenantConfig = require('../lib/tenant_config.js')

module.exports.handler = async function(event, context) {
  //Parse out the inbound request to get what we need for validation and output.
  var apiOptions = {};
  console.log(event)
  console.log(context)
  const tenantConfig = TenantConfig.getTenantConfig(event.pathParameters.tenantId)
  const arnParts = event.methodArn.split(':');
  const apiGatewayArnPart = arnParts[5].split('/');
  const awsAccountId = arnParts[4];
  apiOptions.region = arnParts[3];
  apiOptions.restApiId = apiGatewayArnPart[0];
  apiOptions.stage = apiGatewayArnPart[1];
  const method = apiGatewayArnPart[2];
  const requestedPatient = apiGatewayArnPart[apiGatewayArnPart.length - 1];

  //First token validation.
  var verifiedJWT = null;

  try {
    var key = await getSigningKey(tenantConfig.keys_endpoint)
    var arr = event.headers.Authorization.split(" ");
    var access_token = arr[1];

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
  if(!verifiedJWT.body.aud.startsWith(expectedAud)) {
    console.log("The JWT passed in has an incorrect audience.")
    console.log("Expected: " + expectedAud)
    console.log("Actual: " + verifiedJWT.body.aud)

    const failPolicy = new AuthPolicy('none', awsAccountId, apiOptions);
    failPolicy.denyAllMethods()
    return context.succeed(failPolicy.build());
  }

  //JWT is validated. Let's go one level lower. This is really only setup for patient reading right now.
  //Define our policy header.
  const policy = new AuthPolicy(verifiedJWT.body.sub, awsAccountId, apiOptions);

  //Our rules here below.
  //We're only enabling one type at a time.  Can't mix patient/user/system.
  //We'll do this by picking the most restrictive and allowing that.

  if(verifiedJWT.body.scope.includes("patient/")) {
    await handlePatientScopes(verifiedJWT, requestedPatient, policy, tenantConfig)
  }
  else if(verifiedJWT.body.scope.includes("user/")) {
    await handleUserScopes(verifiedJWT, requestedPatient, policy, tenantConfig)
  }
  else {
    await handleSystemScopes(verifiedJWT, requestedPatient, policy, tenantConfig)
  }

  if(policy.allowMethods.length == 0) {
    policy.denyAllMethods()
  }

  return context.succeed(policy.build());
}

async function handlePatientScopes(verifiedJWT, requestedPatient, policy, tenantConfig) {
  if(verifiedJWT.body.launch_response_patient){
    if(verifiedJWT.body.scope.includes('patient/Patient.read') || verifiedJWT.body.scope.includes('patient/*.read')) {
      policy.allowMethod(AuthPolicy.HttpVerb.GET, "/" + tenantConfig.id + "/Patient/" + verifiedJWT.body.launch_response_patient);
    }
    if(verifiedJWT.body.scope.includes('patient/Patient.write') || verifiedJWT.body.scope.includes('patient/*.write')) {
      policy.allowMethod(AuthPolicy.HttpVerb.POST, "/" + tenantConfig.id + "/Patient/" + verifiedJWT.body.launch_response_patient);
      policy.allowMethod(AuthPolicy.HttpVerb.PUT, "/" + tenantConfig.id + "/Patient/" + verifiedJWT.body.launch_response_patient);
    }
  }
}

async function handleUserScopes(verifiedJWT, requestedPatient, policy, tenantConfig) {
  console.log("Handling user scopes.")
  console.log("Requested Patient: " + requestedPatient)
  console.log("Requested scopes: " + verifiedJWT.body.scope)

  //Read access
  //With FGA, we'll do a relationship lookup
  //Without FGA, we'll just allow for the user to see themselves (fhirUser claim)
  if(verifiedJWT.body.scope.includes('user/Patient.read') || verifiedJWT.body.scope.includes('user/*.read')) {
    //We need to get the patient id from the request, not from the JWT.
    if(requestedPatient) {
      if(tenantConfig.fga_enabled === "true") {
        console.log("Performing a fine grained access check")
        console.log("Inbound client: " + verifiedJWT.body.fhirUser)
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
        }
      }
      else { //If we don't have FGA turned on then the fhirUser claim must have the patient in it.
        policy.allowMethod(AuthPolicy.HttpVerb.GET, "/" + tenantConfig.id + "/" + verifiedJWT.body.fhirUser);
      }
    }
  }

  //write access
  //With FGA, we'll do a relationship lookup
  //Without FGA, we'll just allow for the user to see themselves (fhirUser claim)
  if(verifiedJWT.body.scope.includes('user/Patient.write') || verifiedJWT.body.scope.includes('user/*.write')) {
    //We need to get the patient id from the request, not from the JWT.
    if(requestedPatient) {
      if(tenantConfig.fga_enabled === "true") {
        console.log("Performing a fine grained access check")
        console.log("Inbound client: " + verifiedJWT.body.fhirUser)
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
            relation: "can_write",
            object: "patient:" + requestedPatient
          }
        });
        console.log("FGA Result:")
        console.log(result)
        if(result && result.allowed) {
          console.log("Relationship found!")
          console.log(result)
          var allowedURL = "/" + tenantConfig.id + "/Patient/" + requestedPatient
          policy.allowMethod(AuthPolicy.HttpVerb.POST, allowedURL);
          policy.allowMethod(AuthPolicy.HttpVerb.PUT, allowedURL);
        }
        else {
          console.log("Fine Grained authz check failed. No access granted.")
        }
      }
      else { //If we don't have FGA turned on then the fhirUser claim must have the patient in it.
        policy.allowMethod(AuthPolicy.HttpVerb.POST, "/" + tenantConfig.id + "/" + verifiedJWT.body.fhirUser);
        policy.allowMethod(AuthPolicy.HttpVerb.PUT, "/" + tenantConfig.id + "/" + verifiedJWT.body.fhirUser);
      }
    }
  }
}

async function handleSystemScopes(verifiedJWT, requestedPatient, policy, tenantConfig) {

  //If we have system/patient.s (or system/Patient.read in v1), then we allow access to the patient match function.
  if(verifiedJWT.body.scope.includes('system/Patient.read')) {
    console.log("Adding in the patient match scope.")
    policy.allowMethod(AuthPolicy.HttpVerb.POST, "/Patient/$match");
  }

  //If we have system/Patient.read, then let's do our fine grained authz check.
  if(verifiedJWT.body.scope.includes('system/Patient.read') || verifiedJWT.body.scope.includes('system/*.read')) {

    if(requestedPatient) {
      if(tenantConfig.fga_enabled === "true") {
        console.log("Performing a fine grained access check")
        console.log("Inbound client: " + verifiedJWT.body.sub)
        console.log("Patient to access: " + requestedPatient)
        const auth0fga = new Auth0FgaApi({
          environment: tenantConfig.fga_environment, // can be "us" (default if not set) for Developer Community Preview or "playground" for the Playground API
          storeId: tenantConfig.fga_store_id,
          clientId: tenantConfig.fga_client_id,
          clientSecret: tenantConfig.fga_client_secret
        });

        const result = await auth0fga.check({
          tuple_key: {
            user: verifiedJWT.body.sub,
            relation: "can_view",
            object: "patient:" + requestedPatient
          },
        });

        if(result && result.allowed) {
          console.log("Relationship found!")
          console.log(result)
          var allowedURL = "/" + tenantConfig.id + "/Patient/" + requestedPatient
          policy.allowMethod(AuthPolicy.HttpVerb.GET, allowedURL);

        }
        else {
          console.log("Fine Grained authz check failed. No access granted.")
        }
      }
      else {
        var allowedURL = "/" + tenantConfig.id + "/Patient/*"
        policy.allowMethod(AuthPolicy.HttpVerb.GET, allowedURL);
      }
    }
  }

  if(verifiedJWT.body.scope.includes('system/Patient.write') || verifiedJWT.body.scope.includes('system/*.write')) {

    if(requestedPatient) {
      console.log("Performing a fine grained access check")
      console.log("Inbound client: " + verifiedJWT.body.sub)
      console.log("Patient to access: " + requestedPatient)
      if(tenantConfig.fga_enabled === "true") {
        const auth0fga = new Auth0FgaApi({
          environment: tenantConfig.fga_environment, // can be "us" (default if not set) for Developer Community Preview or "playground" for the Playground API
          storeId: tenantConfig.fga_store_id,
          clientId: tenantConfig.fga_client_id,
          clientSecret: tenantConfig.fga_client_secret
        });

        const result = await auth0fga.check({
          tuple_key: {
            user: verifiedJWT.body.sub,
            relation: "can_write",
            object: "patient:" + requestedPatient
          },
        });

        if(result && result.allowed) {
          console.log("Relationship found!")
          console.log(result)
          var allowedURL = "/" + tenantConfig.id + "/Patient/" + requestedPatient
          policy.allowMethod(AuthPolicy.HttpVerb.POST, allowedURL);
          policy.allowMethod(AuthPolicy.HttpVerb.PUT, allowedURL);

        }
        else {
          console.log("Fine Grained authz check failed. No access granted.")
        }
      }
      else {
        var allowedURL = "/" + tenantConfig.id + "/Patient/*"
        policy.allowMethod(AuthPolicy.HttpVerb.POST, allowedURL);
        policy.allowMethod(AuthPolicy.HttpVerb.PUT, allowedURL);
      }
    }
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
