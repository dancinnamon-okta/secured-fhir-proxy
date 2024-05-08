'use strict';
const TenantConfig = require('./tenant_config');

//This is the method that handles searches- so paths like /Observation?_patient=123
//Note this is very, very experimental, and meant as a way to learn how searching might be combined with access control.
//The algorithm this follows is essentially to perform 2 sets of paging... front-end, auth aware paging, and backend, non-authorization aware paging.
module.exports.searchHandler = async (authorizationContext, tenantId, fhirResource, queryStringObject, headers) => {
    const tenantConfig = TenantConfig.getTenantConfig(tenantId)

    var searchProcessor = null

    if(tenantConfig.fga_enabled === 'true' && ['user','system'].includes(authorizationContext.authorizationMode)) {
        searchProcessor = require('./search/fga_input_filtered_search_processor')
    }
    else {
        searchProcessor = require('./search/cga_search_processor')
    }
    
    return await searchProcessor.searchHandler(authorizationContext, tenantConfig, fhirResource, queryStringObject, headers)
}