//This method provides a search method for non-FGA.

//It works in the following ways:
//For system mode, it's currently wide open (maybe throw an error or something for user?).
//For patient mode, it will append the patient id on all searches.
//For user mode, we're not supporting search at all.  Need to figure out how to handle this.

'use strict';
const axios = require('axios')
const querystring = require("querystring")
const nullPatientId = '<XXX>'

module.exports.searchHandler = async (authorizationContext, tenantConfig, fhirResource, queryStringObject, headers) => {

    //It's not really possible to support user-secured searches, so I'm going to throw an error.
    if(authorizationContext.authorizationMode == 'user') {
        return {
            statusCode: 400,
            headers: headers,
            body: 'Coarse grained, user/ authorized searches are currently not supported.'
        }
    }

    const searchConfig = await loadSearchConfig(queryStringObject, authorizationContext, tenantConfig, fhirResource)

    //Get the requested data from the FHIR server.
    //Do not forward headers for https only send Bearer token
    //TODO: I'm not sure we want to completely override the header being sent. I actually think we want to send everything exactly as-is except for the host header.
    console.log("Fetching data from the backend server...")

    var request = {
        'url': searchConfig.nextCall,
        'method': 'GET',
        'headers': { 'Authorization': headers.Authorization },
        'maxRedirects': 0,
        'validateStatus': function (status) {
            return true //We want to report on exactly what the FHIR server reports back, good or bad.
        }
    }

    var fhirResult = await axios.request(request)
    
    if(fhirResult.status === 200) {
        console.log("FHIR Data received.")
        //At this point we pretty much want to pass everything back exactly as-is, with the exception of the next/self links.
        //Those we want to override to handle our proxy.
        var newLinksArray = []
        const selfLink = {
            "relation": "self",
            "url": `https://${process.env.FHIR_BASE_DOMAIN}/${tenantConfig.id}/${fhirResource}?${querystring.stringify(queryStringObject)}`
        }
        newLinksArray.push(selfLink)

        const backendNextPageUrl = fhirResult.data.link.filter((link) => link.relation == "next")
        if(backendNextPageUrl.length == 1) {
            console.log(`Backend next URL: ${backendNextPageUrl[0].url}`)

            const nextLink = {
                "relation": "next",
                "url": `https://${process.env.FHIR_BASE_DOMAIN}/${tenantConfig.id}/${fhirResource}?internal=${encodeURIComponent(backendNextPageUrl[0].url)}`
            }
            newLinksArray.push(nextLink)
        }

        const backendPrevPageUrl = fhirResult.data.link.filter((link) => link.relation == "previous")
        if(backendPrevPageUrl.length == 1) {
            console.log(`Backend prev URL: ${backendPrevPageUrl[0].url}`)

            const prevLink = {
                "relation": "previous",
                "url": `https://${process.env.FHIR_BASE_DOMAIN}/${tenantConfig.id}/${fhirResource}?internal=${encodeURIComponent(backendPrevPageUrl[0].url)}`
            }
            newLinksArray.push(prevLink)
        }
        
        fhirResult.data.link = newLinksArray
    }
    return {
        statusCode: fhirResult.status,
        headers: fhirResult.headers,
        body: fhirResult.data
    }
}

//This method is responsible for loading default values for sort and object count if not provided, and it also enforces FGA by enforcing FGA-aware search parameters.
async function loadSearchConfig(queryStringObject, authorizationContext, tenantConfig, fhirResource) {
    var searchConfig = {
        nextCall: null,
    }

    if(queryStringObject && queryStringObject.internal) {
        searchConfig.nextCall = queryStringObject.internal
    }
    else {
        //Apply defaults
        var updatedQuerystring = queryStringObject ? JSON.parse(JSON.stringify(queryStringObject)) : {}
        updatedQuerystring._count = updatedQuerystring._count ? updatedQuerystring._count : 20
        updatedQuerystring._sort = updatedQuerystring._sort ? updatedQuerystring._sort : '_id'

        const cgaFilterAttribute = fhirResource == 'Patient' ? '_id' : 'patient'
        
        if(authorizationContext.authorizationmode == 'patient') {
            if(queryStringObject && queryStringObject[cgaFilterAttribute] && queryStringObject[cgaFilterAttribute] != authorizationContext.fhirAuthorizationPrincipal) {
                updatedQuerystring[fgaFilterAttribute] = nullPatientId
            }
            else {
                updatedQuerystring[fgaFilterAttribute] = authorizationContext.fhirAuthorizationPrincipal
            }
        }
        searchConfig.nextSearchString = querystring.stringify(updatedQuerystring)
        
        console.log("Final call")
        const fhirUrl = tenantConfig.backend_fhir_service_url ? tenantConfig.backend_fhir_service_url : process.env.BACKEND_FHIR_SERVICE_URL
        searchConfig.nextCall = `${fhirUrl}/${fhirResource}?${querystring.stringify(updatedQuerystring)}`
        console.log(searchConfig.nextCall)
    }
    return searchConfig
}