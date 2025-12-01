'use strict'

//This is a small expressjs middleware wrapper around our shared/global MCP authorizer.
//All the logic is in the shared library, I just need to plug it into expressjs framework.
const mcpAuthorizerLib = require('../lib/authorization/global/mcp_global_authorizer')

module.exports.authorizer = async function(req, res, next) {
  //Parse out the inbound request to get what we need for validation and output.
  const authorizerResult = await mcpAuthorizerLib.mcpAuthorizer(req.params.tenantId, req.body, req.headers)
  if(authorizerResult.statusCode == 401) {
    res.set('WWW-Authenticate', authorizerResult.wwwAuthValue)
    res.status(401).send(authorizerResult.body);
    return;
  }
  else {
    req.authorizationContext = authorizerResult.authorizationContext
    next();
  }
}