const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const { z } = require("zod/v3");
const {
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');


const searchOperation = require('./search_operation');
const readOperation = require('./read_operation');
const metadataEndpoints = require('./metadata_endpoints');

/**
 * MCP Handler for FHIR Proxy
 * Provides MCP server functionality for the secured FHIR proxy
 */
class FHIRProxyMCPHandler {
  constructor() {
    // Don't initialize server in constructor for stateless mode
  }

  createServer(tenantId = null, requestHeaders, authorizationContext) {
    const server = new McpServer(
      {
        name: 'secured-fhir-proxy-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
    
    this.setupToolHandlers(server, tenantId, requestHeaders, authorizationContext);
    
    // Error handling
    server.onerror = (error) => console.error('[MCP Error]', error);
    
    return server;
  }

  /**
   * Setup MCP tool handlers
   */
  setupToolHandlers(server, tenantId = null, requestHeaders, authorizationContext) {
    // Register get_fhir_capabilities tool using modern pattern
    server.registerTool(
      'get_fhir_capabilities',
      {
        title: 'Get FHIR Capabilities',
        description: 'Retrieves metadata about a specified FHIR resource type, including its supported search parameters and custom operations. This tool MUST always be invoked before performing any resource operation to discover the valid searchParams and operations permitted for that resource type.',
        inputSchema: {
          resourceType: z.string().describe("The FHIR Resource to get capabilities for."),
        },
      },
      async ({ resourceType }) => {
        console.log('get_fhir_capabilities handler')
        console.log('resourceType:', resourceType)
        console.log(`Tenant ID: ${tenantId}`)
        return await this.handleGetCapabilities({ resourceType }, tenantId);
      }
    );

    // Register search_fhir_resources tool using modern pattern
    server.registerTool(
      'search_fhir_resources',
      {
        title: 'Search FHIR Resources',
        description: 'Executes a standard FHIR search interaction on a given resource type, returning a bundle or list of matching resources. Use this when you need to query for multiple resources based on one or more search-parameters.',
        inputSchema: {
          resourceType: z.string().describe("The FHIR Resource to search for."),
          searchParams: z.record(z.any()).optional().describe('A mapping of FHIR search parameter names to their values. Only include parameters supported for the resource type.'),
        },
      },
      async ({ resourceType, searchParams = {} }) => {
        console.log('search_fhir_resources handler')
        console.log('resourceType:', resourceType)
        console.log('searchParams:', searchParams)
        console.log(`Tenant ID: ${tenantId}`)
        return await this.handleSearchResources({ resourceType, searchParams }, authorizationContext, tenantId, requestHeaders);
      }
    );

    // Register read_fhir_resource tool using modern pattern
    server.registerTool(
      'read_fhir_resource',
      {
        title: 'Read FHIR Resource',
        description: 'Performs a FHIR read interaction to retrieve a single resource instance by its type and resource ID. Use it when you know the exact resource ID and require that one resource.',
        inputSchema: {
          resourceType: z.string().describe('The FHIR resource type name. Must exactly match one of the resource types supported by the server.'),
          id: z.string().describe('The logical ID of a specific FHIR resource instance.'),
          searchParams: z.record(z.any()).optional().describe('Optional search parameters to refine the query.'),
        },
      },
      async ({ resourceType, id, searchParams = {} }) => {
        console.log('read_fhir_resource handler')
        console.log('resourceType:', resourceType)
        console.log('id:', id)
        console.log('searchParams:', searchParams)
        console.log(`Tenant ID: ${tenantId}`)
        return await this.handleReadResource({ resourceType, id, searchParams }, authorizationContext, tenantId, requestHeaders);
      }
    );

    // Register get_fhir_metadata tool using modern pattern
    server.registerTool(
      'get_fhir_metadata',
      {
        title: 'Get FHIR Metadata',
        description: 'Retrieves the FHIR server capability statement which describes the server capabilities, supported resources, and operations.',
        inputSchema: {},
      },
      async () => {
        console.log('get_fhir_metadata handler')
        console.log(`Tenant ID: ${tenantId}`)
        return await this.handleGetMetadata(tenantId);
      }
    );
  }

  /**
   * Handle get capabilities tool
   */
  async handleGetCapabilities(requestArgs, tenantId) {
    try {
      if (!requestArgs || !requestArgs.resourceType) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'resourceType is required'
        );
      }

      const metadataResult = await metadataEndpoints.legacyMetadataHandler(tenantId);
      
      if (metadataResult.statusCode !== 200) {
        throw new McpError(
          ErrorCode.InternalError,
          'Failed to retrieve FHIR metadata'
        );
      }

      const capabilityStatement = metadataResult.body;
      const resourceType = requestArgs.resourceType;

      // Find the resource type in the capability statement
      const restResource = capabilityStatement.rest?.[0]?.resource?.find(
        r => r.type === resourceType
      );

      if (!restResource) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'not-supported',
                message: `The resource type '${resourceType}' is not supported by this server.`,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
        };
      }

      // Extract capabilities
      const capabilities = {
        type: restResource.type,
        searchParam: {},
        operation: {},
        interaction: restResource.interaction || [],
        searchInclude: restResource.searchInclude || [],
        searchRevInclude: restResource.searchRevInclude || [],
      };

      // Process search parameters
      if (restResource.searchParam) {
        restResource.searchParam.forEach(param => {
          capabilities.searchParam[param.name] = param.documentation || param.definition || 'No description available';
        });
      }

      // Process operations
      if (restResource.operation) {
        restResource.operation.forEach(op => {
          capabilities.operation[op.name] = op.documentation || op.definition || 'No description available';
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(capabilities, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleGetCapabilities:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get capabilities: ${error.message}`
      );
    }
  }

  /**
   * Handle search resources tool
   */
  async handleSearchResources(requestArgs, authorizationContext, tenantId, headers) {
    try {
      if (!requestArgs || !requestArgs.resourceType) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'resourceType is required'
        );
      }

      const searchParams = requestArgs.searchParams || {};

      const result = await searchOperation.searchHandler(
        authorizationContext.context,
        tenantId,
        requestArgs.resourceType,
        searchParams,
        headers
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.body, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleSearchResources:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search resources: ${error.message}`
      );
    }
  }

  /**
   * Handle read resource tool
   */
  async handleReadResource(requestArgs, authorizationContext, tenantId, headers) {
    try {
      if (!requestArgs || !requestArgs.resourceType || !requestArgs.id) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'resourceType and id are required'
        );
      }
      const path = `/${tenantId}/${requestArgs.resourceType}/${requestArgs.id}`;
      const searchParams = requestArgs.searchParams || {};

      const result = await readOperation.readHandler(
        authorizationContext.context,
        tenantId,
        path,
        searchParams,
        headers
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.body, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleReadResource:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read resource: ${error.message}`
      );
    }
  }


  /**
   * Handle get metadata tool
   */
  async handleGetMetadata(tenantId) {
    try {
      const result = await metadataEndpoints.legacyMetadataHandler(tenantId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.body, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleGetMetadata:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get metadata: ${error.message}`
      );
    }
  }

  /**
   * Handle HTTP MCP requests using streamable transport (stateless mode)
   */
  async handleHttpRequest(req, res, tenantId) {
    try {      
      // In stateless mode, create a new instance of transport and server for each request
      // to ensure complete isolation. A single instance would cause request ID collisions
      // when multiple clients connect concurrently.
      console.log("httpHandler: Authorization Context= ")
      console.log(req.authorizationContext)
      const server = this.createServer(tenantId, req.headers, req.authorizationContext);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });
      
      res.on('close', () => {
        console.log('Request closed');
        transport.close();
        server.close();
      });
      
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP HTTP request error:', error);
      
      if (!res.headersSent) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: error.code || ErrorCode.InternalError,
            message: error.message || 'Internal server error'
          }
        };
        
        res.status(500).json(errorResponse);
      }
    }
  }
}

module.exports = FHIRProxyMCPHandler;
