'use strict'

//This is the authorizer that is used for all FHIR calls.
//It is responsible for:
//Ensuring that a valid access token is provided.
//Ensuring that the request is for a resource that is included in the token's approved scopes.
//Providing an indicator to the runtime which mode we're running in user/, system/, or patient/
//Providing an indicator to the runtime which principal/context we're in.

//This method will not do any record-level access control. Only matching fhirResource and action.
//All record level access will occur as we process the data.

//This is almost identical to the authorizer setup for AWS- but tailored to a local environment (i.e. not leveraging AWS IAM).
const TenantConfig = require('../lib/tenant_config')
const jwtEndpointProcessor = require('../lib/authorization/global/jwt_endpoint_processor')

module.exports.authorizer = async function(req, res, next) {
  //Parse out the inbound request to get what we need for validation and output.
  const tenantConfig = TenantConfig.getTenantConfig(req.params.tenantId)

  //Details about the request.
  const httpMethod = req.method
  const fhirResourceType = req.path.includes("Patient/$match") ? "Patient" : req.params.fhirResource

  const coarseEndpointResults = await jwtEndpointProcessor.authorizeJwtProtectedEndpoint(tenantConfig, httpMethod, req.headers, fhirResourceType)

  if(!coarseEndpointResults.success) {
    res.status(403).send(coarseEndpointResults.message);
    return;
  }

  const verifiedJWT = coarseEndpointResults.verifiedJWT

  var authCtx = {
    "success": true,
    "context": {}
  }

  //At this point we know we're going to at least allow the call to be made (but may be filtered/rejected later).
  //We're only attesting that they have the right FHIR resource type and activity type based upon approved scopes.
  const scopesArray = Array.isArray(verifiedJWT.body.scope) ? verifiedJWT.body.scope : verifiedJWT.body.scope.split(' ');
  
  if(scopesArray.filter(scope => scope.startsWith('patient/')).length > 0) {
    console.log('Running in single patient mode.')
    authCtx.context.authorizationMode = 'patient'
    authCtx.context.fhirAuthorizationPrincipal = verifiedJWT.body.launch_response_patient ? `Patient/${verifiedJWT.body.launch_response_patient}` : ''
    authCtx.context.externalAuthorizationPrincipal =  '' //No fine grained access for patient mode.
  }
  else if (scopesArray.filter(scope => scope.startsWith('user/')).length > 0) {
    console.log('Running in multi-patient mode.')
    authCtx.context.authorizationMode = 'user'
    authCtx.context.fhirAuthorizationPrincipal = verifiedJWT.body.fhirUser ? verifiedJWT.body.fhirUser : '' //Used for coarse grained access
    authCtx.context.externalAuthorizationPrincipal =  `user:${verifiedJWT.body.sub}` //Used for fine grained access
  }
  else {
    console.log('Running in system mode.')
    authCtx.context.authorizationMode = 'system'
    authCtx.context.fhirAuthorizationPrincipal = verifiedJWT.body.fhirUser ? verifiedJWT.body.fhirUser : '' //Used for coarse grained access
    authCtx.context.externalAuthorizationPrincipal = `system:${verifiedJWT.body.sub}` //Used for fine grained access
  }
  req.authorizationContext = authCtx
  next();
}