//This method provides a search method where Okta FGA is queried first to get a list of authorized patients
//that a principal may see. It will then pass those inbound to the backend FHIR service.
//This is the most robust and performant approach for performing FGA.

//TODO: as a future state, if the principal has access to millions of records, we could "page" through the FGA resultset.
//TODO: Right now i'm only checking permissions on the initial search, and relying on the backend paging to work.  The weakness there is if a person loses access while paging, they'll still see the data.

'use strict';
const axios = require('axios')
const querystring = require("querystring")
const authzProcessor = require('../authorization/resource_level/fga/fga_processor_basic')
const nullPatientId = '<XXX>'

module.exports.searchHandler = async (authorizationContext, tenantConfig, fhirResource, queryStringObject, headers) => {
    const searchConfig = await loadSearchConfig(queryStringObject, authorizationContext, tenantConfig, fhirResource)

    //Get the requested data from the FHIR server.
    //Do not forward headers for https only send Bearer token
    //TODO: I'm not sure we want to completely override the header being sent. I actually think we want to send everything exactly as-is except for the host header.
    console.log("Fetching data from the backend server...")
    const authorizationHeader = headers.Authorization ? headers.Authorization : ''
    var request = {
        'url': searchConfig.nextCall,
        'method': 'GET',
        'headers': { 'Authorization': authorizationHeader },
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
            "url": `${process.env.FHIR_BASE_URL}/${tenantConfig.id}/${fhirResource}?${querystring.stringify(queryStringObject)}`
        }
        newLinksArray.push(selfLink)

        const backendNextPageUrl = fhirResult.data.link.filter((link) => link.relation == "next")
        if(backendNextPageUrl.length == 1) {
            console.log(`Backend next URL: ${backendNextPageUrl[0].url}`)

            const nextLink = {
                "relation": "next",
                "url": `${process.env.FHIR_BASE_URL}/${tenantConfig.id}/${fhirResource}?internal=${encodeURIComponent(backendNextPageUrl[0].url)}`
            }
            newLinksArray.push(nextLink)
        }

        const backendPrevPageUrl = fhirResult.data.link.filter((link) => link.relation == "previous")
        if(backendPrevPageUrl.length == 1) {
            console.log(`Backend prev URL: ${backendPrevPageUrl[0].url}`)

            const prevLink = {
                "relation": "previous",
                "url": `${process.env.FHIR_BASE_URL}/${tenantConfig.id}/${fhirResource}?internal=${encodeURIComponent(backendPrevPageUrl[0].url)}`
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
        nextHttpMethod: 'GET',
        nextSearchString: null //used in HTTP post when I get to it.
    }
    if(queryStringObject && queryStringObject.internal) {
        searchConfig.nextCall = queryStringObject.internal
    }
    else {
        //Apply defaults
        var updatedQuerystring = queryStringObject ? JSON.parse(JSON.stringify(queryStringObject)) : {}
        updatedQuerystring._count = updatedQuerystring._count ? updatedQuerystring._count : 20
        updatedQuerystring._sort = updatedQuerystring._sort ? updatedQuerystring._sort : '_id'

        const fgaFilterAttribute = fhirResource == 'Patient' ? '_id' : 'patient'

        //Apply FGA input
        const fgaCriteria = await getFGASearchCriteria(tenantConfig, authorizationContext)
        
        //TODO: if the criteria is huge, switch over to HTTP Post.

        //If the inbound query has a patient id, we need to check to see if it's in there, if it's not- then we need to return a null result. If it is- then don't do anything.
        if(queryStringObject && queryStringObject[fgaFilterAttribute]) {
            const searchPatients = queryStringObject[fgaFilterAttribute].split(',')
            const filteredSearchPatients = searchPatients.filter(patient => fgaCriteria.patient.includes(patient));

            console.log("Inbound patient list:")
            console.log(searchPatients)

            console.log("FGA Filtered")
            console.log(filteredSearchPatients)
            if(filteredSearchPatients.length > 0) {
                updatedQuerystring[fgaFilterAttribute] = filteredSearchPatients.join(',')
            }
            else {
                updatedQuerystring[fgaFilterAttribute] = nullPatientId
            }
        }
        //if the inbound query does NOT have a patient id, then append our list.
        else {
            if(fgaCriteria.patient.length > 0) {
                updatedQuerystring[fgaFilterAttribute] = fgaCriteria.patient.join(',')
            }
            else {
                updatedQuerystring[fgaFilterAttribute] = nullPatientId
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
//Get the list of patients the security principal has access to.
async function getFGASearchCriteria(tenantConfig, authorizationContext) {
    console.log("Adding authorized search criteria to the backend search...")
    const searchCriteria = await authzProcessor.getAuthorizedList(tenantConfig, authorizationContext, 'Patient', 'GET')

    console.log("Search criteria found...")
    console.log(searchCriteria)
    return {
        "patient": searchCriteria
    }
}