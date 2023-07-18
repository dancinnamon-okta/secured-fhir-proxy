//This method will determine if the FHIR resource I've requested are authorized at a coarse level
//depending upon the scopes the authorization server has granted.
const activityMap = {
    GET: ['r','read', '*'],
    SEARCH: ['read', 's', '*'],
    POST: ['c', 'write', '*'],
    PUT: ['u',' write', '*'],
    DELETE: ['d', 'write', '*']
}
module.exports.authorizeScopeForResourceAndMethod = (requestedResourceType, requestedResource, httpMethod, scopeArray) => {
    const foundMatchingScopes = scopeArray.filter(scopeValue => {
        const fhirScopePattern = /(user|system|patient)+\/(.+)\.(.+)/
        const fhirScopeMatch = scopeValue.match(fhirScopePattern)
        if(fhirScopeMatch) {
            const resourceTypeMatch = (fhirScopeMatch[2] == requestedResourceType)

            if(httpMethod == 'GET' && !requestedResource) {

            }
            const searchAwareHttpMethod = (httpMethod == 'GET' && !requestedResource) ? 'SEARCH' : httpMethod
            const httpMethodMatch = (activityMap[searchAwareHttpMethod].includes(fhirScopeMatch[3]))
            return resourceTypeMatch && httpMethodMatch
        } 
        else {
            return false
        }
    })

    return foundMatchingScopes && foundMatchingScopes.length > 0
}