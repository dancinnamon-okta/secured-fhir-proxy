'use strict'

//This is the authorizer that is used for all calls to the MCP endpoint.
//It is responsible for:
//Ensuring that a valid access token is provided.
//Ensuring that the request is for a resource and tool that is included in the token's approved scopes.

//Providing an indicator to the runtime which mode we're running in user/, system/, or patient/
//Providing an indicator to the runtime which principal/context we're in.

//This is different than the FHIR global authorizer in 2 ways:
//1- In MCP, a failed authorization will result in a 401 being passed back, along with metadata URLs for the client to authorize.
//2- In MCP, all requests will be POST'ed to an /mcp endpoint, and from there I need to figure out the authorization based upon the tool and tool parameters.
//In contrast, with FHIR, i'm just looking at the URL path instead.

//All record level access will still occur as we process the data.

//This is almost identical to the authorizer setup for AWS- but tailored to a local environment (i.e. not leveraging AWS IAM).
const TenantConfig = require('../lib/tenant_config')
const jwtEndpointProcessor = require('../lib/authorization/global/jwt_endpoint_processor')

module.exports.authorizer = async function(req, res, next) {
  //Parse out the inbound request to get what we need for validation and output.
  const tenantConfig = TenantConfig.getTenantConfig(req.params.tenantId)

  console.log("MCP Global Authorizer")
  //Details about the request.
  const requestBody = req.body
  
  if(requestBody.method == 'tools/call' && requestBody.params.name.includes('fhir_resource')){ //In this case we're performing actual FHIR work. For this we need real SMART/FHIR Scopes.
    console.log("Inbound MCP request is for a FHIR resource. Including additional detail for our authorization processors.")
    const fhirResourceType = requestBody.params.arguments.resourceType
    const toolName = requestBody.params.name

    var fhirRequestMethod = 'DELETE'
    if(toolName.includes('read') || toolName.includes('search')) {
      fhirRequestMethod = 'GET'
    }
    else if(toolName.includes('create')) {
      fhirRequestMethod = 'POST'
    }
    else if(toolName.includes('update')) {
      fhirRequestMethod = 'PUT'
    }
    console.log(`Authorizing MCP call: method: ${fhirRequestMethod}, ResourceType: ${fhirResourceType}`)
    const coarseEndpointResults = await jwtEndpointProcessor.authorizeJwtProtectedEndpoint(tenantConfig, fhirRequestMethod, req.headers, fhirResourceType)

    if(!coarseEndpointResults.success) {
      const resourceMetadataUrl = `${req.protocol}://${req.hostname}/.well-known/oauth-protected-resource/${req.params.tenantId}`
      const wwwAuthValue = `Bearer error="invalid_or_misssing_jwt", error_description="${coarseEndpointResults.message}", resource_metadata="${resourceMetadataUrl}"`
      res.set('WWW-Authenticate', wwwAuthValue)
      res.status(401).send(coarseEndpointResults.message);
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
  else { //In this case we're performing base MCP duties (list tools, capabilities metadata, etc. Just need the MCP scope for this.)
    console.log("Inbound MCP request is for MCP-only information. Just performing basic checks for valid MCP authorization.")
    const coarseEndpointResults = await jwtEndpointProcessor.authorizeJwtProtectedEndpoint(tenantConfig, 'GET', req.headers, 'mcp')

    if(!coarseEndpointResults.success) {
      const resourceMetadataUrl = `${req.protocol}://${req.hostname}/.well-known/oauth-protected-resource/${req.params.tenantId}`
      const wwwAuthValue = `Bearer error="invalid_or_misssing_jwt", error_description="${coarseEndpointResults.message}", resource_metadata="${resourceMetadataUrl}"`
      res.set('WWW-Authenticate', wwwAuthValue)
      res.status(401).send(coarseEndpointResults.message);
      return;
    }
    else {
      next();
    }
  }
}