'use strict';
const axios = require('axios')
const querystring = require("querystring")
const TenantConfig = require('./tenant_config')

module.exports.readHandler = async (authorizationContext, tenantId, path, queryStringObject, headers) => {
    const backendPath = path.replace(`/${tenantId}`, '')
    console.log(`${process.env.BACKEND_FHIR_SERVICE_URL}${backendPath}?${querystring.stringify(queryStringObject)}`)
    const tenantConfig = TenantConfig.getTenantConfig(tenantId)

    var fhirResult = await axios.request({
        'url': `${process.env.BACKEND_FHIR_SERVICE_URL}${backendPath}?${querystring.stringify(queryStringObject)}`,
        'method': 'GET',
        'headers': headers,
        'maxRedirects': 0,
        'validateStatus': function (status) {
            return true //We want to report on exactly what the FHIR server reports back, good or bad.
        }
    })
    if(fhirResult.status === 200) {
        var authzProcessor = null
        if(tenantConfig.fga_enabled === 'true' && ['user','system'].includes(authorizationContext.authorizationMode)) {
            authzProcessor = require('./authorization/fga_processor')
        }
        else {
            authzProcessor = require('./authorization/cga_processor')
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