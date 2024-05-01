'use strict';
const axios = require('axios')
const querystring = require("querystring")
const TenantConfig = require('./tenant_config');
const { count } = require('console');

//This is the method that handles searches- so paths like /Observation?_patient=123
//Note this is very, very experimental, and meant as a way to learn how searching might be combined with access control.
module.exports.searchHandler = async (authorizationContext, tenantId, fhirResource, queryStringObject, headers) => {
    const tenantConfig = TenantConfig.getTenantConfig(tenantId)
    const maxInternalPages = 10
    var searchConfig = loadSearchConfig(queryStringObject, fhirResource)
    var currentBundleSize = 0
    var internalPagesRetrieved = 0
    var filteredPagedEntry = []
    var remainingFetchedBackendFhirData = false

    console.log("Search config:")
    console.log(searchConfig)

    var currentPageOffset=searchConfig.offset
    console.log(`starting at offset ${searchConfig.offset}`)
    while(currentBundleSize < searchConfig.count && internalPagesRetrieved < maxInternalPages) {
        //Get the next bit of data from the FHIR server.
        //Do not forward headers for https only send Bearer token
        //TODO: I'm not sure we want to completely override the header being sent. I actually think we want to send everything exactly as-is except for the host header.
        var request = {
            'url': searchConfig.nextCall,
            'method': 'GET',
            'headers': { 'Authorization': headers.Authorization },
            'maxRedirects': 0,
            'validateStatus': function (status) {
                return true //We want to report on exactly what the FHIR server reports back, good or bad.
            }
        }
        console.log("Fetching a page from the backend server...")
        console.log(request)
        var fhirResult = await axios.request(request)
        
        if(fhirResult.status === 200) {
            console.log("Internal page received.")
            var authzProcessor = null
            if(tenantConfig.fga_enabled === 'true' && ['user','system'].includes(authorizationContext.authorizationMode)) {
                authzProcessor = require('./authorization/resource_level/fga/fga_processor_basic')
            }
            else {
                authzProcessor = require('./authorization/resource_level/cga/cga_processor')
            }
            
            const filteredBundle = await authzProcessor.performAuthorization(tenantConfig, authorizationContext, fhirResult.data, 'GET')
            console.log("Filtered Bundle after authorization processing...")
            console.log(filteredBundle)

            while(currentPageOffset<filteredBundle.authorizedData.entry.length && currentBundleSize < searchConfig.count) {
                console.log("Moving entry to final result...")
                console.log(filteredBundle.authorizedData.entry[currentPageOffset])

                filteredPagedEntry.push(filteredBundle.authorizedData.entry[currentPageOffset])
                currentBundleSize++
                currentPageOffset++
            }
            console.log("Done with a page from the backend... data:")
            console.log(`Current Bundle Size: ${currentBundleSize}, currentPageOffset: ${currentPageOffset}`)
            remainingFetchedBackendFhirData = (currentPageOffset<filteredBundle.authorizedData.entry.length)
            console.log(`Remaining fetched authorized backend data: ${remainingFetchedBackendFhirData}`)
            console.log("Resetting current page offset.")
            currentPageOffset=0
            
            const backendNextPageUrl = fhirResult.data.link.filter((link) => link.relation == "next")
            
            //This is the situation where we ran out of items from the backend, but we think there are more.
            //If there IS a next link, we'll go up top, and the condition there will either cause us to leave, or execute the next call if we still need data.
            if(backendNextPageUrl.length == 1) {
                searchConfig.nextCall = backendNextPageUrl[0].url
                console.log(`Backend next URL: ${backendNextPageUrl[0].url}`)
            }
            else {
                console.log("Didn't find another backend next url- no more data to find...")
                break
            }
            internalPagesRetrieved++

            //At this point I need to stop adding items, and I need to figure out what i'm doing next. I'll either:
            //Go back up to top (I ran out of filteredBundle entries, but haven't hit my count, and there's more data on the FHIR server.)
            //End (I hit my count, but maybe not filteredBundle entries)
            //End (No more results from the FHIR server.)      
        } //TODO: Let's return an error if any of these internal calls fail.
        else {
            console.error("Internal page fetch failed...")
            throw new Error("The FHIR call died.")
        }
    }
    if(internalPagesRetrieved >= maxInternalPages) {
        console.warn("Ran out of internal pages to search... not all data will be available to the client.")
        fhirResult.data.meta.message = "Not all data was searched- please narrow your search results."
        fhirResult.data.meta.internalPageCount = internalPagesRetrieved
    }
    //At this rate we're ready to return.
    fhirResult.data.entry = filteredPagedEntry

    //We need to update the links array coming back. Get everything EXCEPT the next link, which we're going to override.
    //TODO: Return self as well?
    var newLinksArray = fhirResult.data.link.filter((link) => link.relation != "next" && link.relation != "self")

    //Need to determine what our next link is going to be.
    //If currentBundleSize hasn't reached maximum yet, it means we've reached the end of the data that's possible.
    //In that case we don't want a next URL at all.
    //This if/elseif here is for adding a next URL, and wouldn't be followed in that case.

    //In this case, we're at our count, and there's still data that we already fetched from the backend, and authorized it.
    //In this case we want the next "backend query" to be the same as the current one.
    if(currentBundleSize == searchConfig.count && remainingFetchedBackendFhirData) {
        //return internal CURRENT + OFFSET
        const nextQuerystringContents = {
            "__count": searchConfig.count,
            "_sort": searchConfig.sort,
            "offset": currentBundleSize,
            "internalNext": fhirResult.data.link.filter((link) => link.relation == "self")[0].url
        }
        const nextLinkFullURL = `https://${process.env.FHIR_BASE_DOMAIN}/${tenantId}/${fhirResource}?${querystring.stringify(nextQuerystringContents)}`
    
        const nextLink = {
            "relation": "next",
            "url": nextLinkFullURL
        }
        newLinksArray.push(nextLink)
    }

    //In this case there's no more feteched authorized data and we've hit our count.
    //Next time, we want to use the "next" link from the backend to get the next page.
    else if(currentBundleSize == searchConfig.count && !remainingFetchedBackendFhirData) {
        //return internal NEXT + 0 OFFSET
        const nextQuerystringContents = {
            "_count": searchConfig.count,
            "_sort": searchConfig.sort,
            "offset": 0,
            "internalNext": fhirResult.data.link.filter((link) => link.relation == "next")[0].url
        }
        const nextLinkFullURL = `https://${process.env.FHIR_BASE_DOMAIN}/${tenantId}/${fhirResource}?${querystring.stringify(nextQuerystringContents)}`
    
        const nextLink = {
            "relation": "next",
            "url": nextLinkFullURL
        }
        newLinksArray.push(nextLink)
    }

    const selfLink = {
        "relation": "self",
        "url": `https://${process.env.FHIR_BASE_DOMAIN}/${tenantId}/${fhirResource}?${querystring.stringify(queryStringObject)}`
    }
    newLinksArray.push(selfLink)

    fhirResult.data.link = newLinksArray
    fhirResult.data.total = fhirResult.data.entry.length

    return {
        statusCode: fhirResult.status,
        headers: fhirResult.headers,
        body: fhirResult.data
    }
}

//Will adjust the initial querystring based upon various validation rules.
//It will also determine what needs to be done if a backend FHIR page config is passed in.
//The return will be the next FHIR call to make to the backend.
function loadSearchConfig(inboundQueryStringObject, fhirResource) {
    var updatedQuerystring = inboundQueryStringObject ? JSON.parse(JSON.stringify(inboundQueryStringObject)) : {}

    var searchConfig = {
        count: null,
        sort: null,
        offset: null,
        internalNext: null,
        nextCall: null
    }

    //Enforce a count.  If no value is passed in, use 20 (or by config), if value exceeds 500 (or by config) - use that.
    searchConfig.count = updatedQuerystring._count ? updatedQuerystring._count : 20
    searchConfig.count = Math.min(searchConfig.count, 500)

    //Enforce a sort order. If no value is passed in, I'll sort by ID ascending.
    searchConfig.sort = updatedQuerystring._sort ? updatedQuerystring._sort : '_id'

    //Get the offset parameter if it was passed in (this is a parameter that *I* would have passed back in a next link.)
    searchConfig.offset = updatedQuerystring.offset ? updatedQuerystring.offset : 0

    //Grab the internal next link if it exists (this is also a parameter that *I* would have passed by in the next link.)
    searchConfig.internalNext = updatedQuerystring.internalNext ? updatedQuerystring.internalNext : null

    //Return back what actual FHIR call we're going to make next.
    //If we have an internalNext parameter- it's just that.
    //If we don't, we need to pass in the full querystring.
    if(searchConfig.internalNext) {
        searchConfig.nextCall = searchConfig.internalNext
    }
    else {
        updatedQuerystring._count = searchConfig.count
        updatedQuerystring._sort = searchConfig.sort
        searchConfig.nextCall  = `${process.env.BACKEND_FHIR_SERVICE_URL}/${fhirResource}?${querystring.stringify(updatedQuerystring)}`
    }

    //Return
    return searchConfig
}