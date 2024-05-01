'use strict';
const axios = require('axios')
const querystring = require("querystring")
const TenantConfig = require('./tenant_config')

//This is the handler for "by id" queries- so /FHIR Resource/id
module.exports.readHandler = async (authorizationContext, tenantId, path, queryStringObject, headers) => {
    const backendPath = path.replace(`/${tenantId}`, '')
    console.log(`${process.env.BACKEND_FHIR_SERVICE_URL}${backendPath}?${querystring.stringify(queryStringObject)}`)
    const tenantConfig = TenantConfig.getTenantConfig(tenantId)

/*     var fhirResult = await axios.request({
        'url': `${process.env.BACKEND_FHIR_SERVICE_URL}${backendPath}?${querystring.stringify(queryStringObject)}`,
        'method': 'GET',
        'headers': headers,
        'maxRedirects': 0,
        'validateStatus': function (status) {
            return true //We want to report on exactly what the FHIR server reports back, good or bad.
        }
    }) */

    //Do not forward headers for https only send Bearer token
    //TODO: I'm not sure we want to completely override what's being sent. I actually think we want to send everything exactly as-is except for the host header.
    var request = {
        'url': `${process.env.BACKEND_FHIR_SERVICE_URL}${backendPath}?${querystring.stringify(queryStringObject)}`,
        'method': 'GET',
        'headers': { 'Authorization': headers.Authorization },
        'maxRedirects': 0,
        'validateStatus': function (status) {
            return true //We want to report on exactly what the FHIR server reports back, good or bad.
        }
    }
    console.log("Forwarding Request:")
    console.log(request)
    var fhirResult = await axios.request(request)
    if(fhirResult.status === 200) {
        var authzProcessor = null
        if(tenantConfig.fga_enabled === 'true' && ['user','system'].includes(authorizationContext.authorizationMode)) {
            authzProcessor = require('./authorization/resource_level/fga/fga_processor_basic')
        }
        else {
            authzProcessor = require('./authorization/resource_level/cga/cga_processor')
        }
        const authzResult = await authzProcessor.performAuthorization(tenantConfig, authorizationContext, fhirResult.data, 'GET')
        return {
            statusCode: authzResult.status,
            headers: fhirResult.headers,
            body: authzResult.authorizedData
        }
    }
    else {
        return {
            statusCode: fhirResult.status,
            headers: fhirResult.headers,
            body: fhirResult.data
        }
    }
}