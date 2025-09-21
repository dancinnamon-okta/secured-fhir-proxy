const FHIRProxyMCPHandler = require('../lib/mcp_handler');
const mcpAuthorizerLib = require('./mcpGlobalAuthorizer');

/**
 * Connect MCP endpoint to Express app
 */

function connect(app) {
  // MCP endpoint for handling MCP protocol requests
  app.post('/:tenantId/mcp', mcpAuthorizerLib.authorizer, async (req, res) => {
    const mcpHandler = new FHIRProxyMCPHandler();
    await mcpHandler.handleHttpRequest(req, res, req.params.tenantId);
  });

  console.log('MCP endpoints connected');
}

module.exports = {
  connect
};
