'use strict'

//This is the authorizer that is used for all FHIR calls.
//It is responsible for:
//Ensuring that a valid access token is provided.
//Ensuring that the request is for a resource that is included in the token's approved scopes.
//Providing an indicator to the runtime which mode we're running in user/, system/, or patient/
//Providing an indicator to the runtime which principal/context we're in.

//This method will not do any record-level access control. Only matching fhirResource and action.
//All record level access will occur as we process the data.

const AuthPolicy = require('./auth-policy');
const TenantConfig = require('../lib/tenant_config')
const jwtEndpointProcessor = require('../lib/authorization/jwt_endpoint_processor')

module.exports.handler = async function(event, context) {
  //Parse out the inbound request to get what we need for validation and output.
  var apiOptions = {};
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
  const fhirResourceType = event.pathParameters.fhirResource

  const coarseEndpointResults = await jwtEndpointProcessor.authorizeJwtProtectedEndpoint(tenantConfig, httpMethod, event.headers, fhirResourceType)

  if(!coarseEndpointResults.success) {
    const failPolicy = new AuthPolicy('none', awsAccountId, apiOptions);
    failPolicy.denyAllMethods()
    return context.succeed(failPolicy.build());
  }

  const verifiedJWT = coarseEndpointResults.verifiedJWT

  //At this point we know we're going to at least allow the call to be made (but may be filtered/rejected later).
  //We're only attesting that they have the right FHIR resource type and activity type based upon approved scopes.
  const policy = new AuthPolicy(verifiedJWT.body.sub, awsAccountId, apiOptions);
  policy.allowMethod(httpMethod, event.path);

  const scopesArray = Array.isArray(verifiedJWT.body.scope) ? verifiedJWT.body.scope : verifiedJWT.body.scope.split(' ');
  
  if(scopesArray.filter(scope => scope.startsWith('patient/')).length > 0) {
    console.log('Running in single patient mode.')
    policy.context.authorizationMode = 'patient'
    policy.context.fhirAuthorizationPrincipal = verifiedJWT.body.launch_response_patient ? `Patient/${verifiedJWT.body.launch_response_patient}` : ''
  }
  else if (scopesArray.filter(scope => scope.startsWith('user/')).length > 0) {
    console.log('Running in multi-patient mode.')
    policy.context.authorizationMode = 'user'
    policy.context.fhirAuthorizationPrincipal = verifiedJWT.body.fhirUser ? verifiedJWT.body.fhirUser : ''
  }
  else {
    console.log('Running in system mode.')
    policy.context.authorizationMode = 'system'
  }

  return context.succeed(policy.build());
}