//Fine grained access processor.


const { CredentialsMethod, OpenFgaClient } = require('@openfga/sdk');

const actionMapping = {
    "POST": "can_write",
    "PUT": "can_write",
    "DELETE": "can_write",
    "GET": "can_view",
    "SEARCH": "can_view"
}

const fhirSubjectPattern = /Patient\/(.+)/

const getPatientId = (fhirResource) => {
    if(fhirResource.resourceType == 'Patient') {
        return fhirResource.id
    }
    else if(fhirResource.subject.reference) {
        const fhirSubjectMatch = (fhirResource.subject && fhirResource.subject.reference) ? fhirResource.subject.reference.match(fhirSubjectPattern) : null
        if(fhirSubjectMatch) {
            return fhirSubjectMatch[1]
        }
        else {
            return null
        }
    }
    else {
        return null
    }
}

//Given a FHIR resource, I'm going to make an FGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
performFGASingleResourceCheck = async (fgaClient, authorizationContext, fhirObject, action) => {
    const relationship = actionMapping[action]
    const patientId = getPatientId(fhirObject)
    const resource = `Patient:${patientId}`
    const securityPrincipalId = authorizationContext.authorizationMode === "system" ? `external_entity:${authorizationContext.principalId}` : `user:${authorizationContext.principalId}`

    //If we weren't able to determine the patient that the resource links to- don't even try- just return false.
    if(!patientId) {
        return false
    }

    console.log("Making the following FGA Check:")
    console.log(`Security Principal: ${securityPrincipalId}`)
    console.log(`Relationship: ${relationship}`)
    console.log(`Requested Object: ${resource}`)
    try {
        const fgaResult = await fgaClient.check({
            user: securityPrincipalId,
            relation: relationship,
            object: resource
        });
        console.log('Result:')
        console.log(fgaResult)
        return fgaResult.allowed
    }
    catch(error) {
        console.log(error)
        return false
    }
}

performFGABundleResourceCheck = async (fgaClient, authorizationContext, fhirObject, action) => {
    console.log("Bundle detected. Filtering the bundle...")
    if(fhirObject.total > 0 && fhirObject.entry) {
        var finalArray = []

        //Filter out the items the principal can't access.
        //TODO: there may be a faster way of doing this. Maybe run everyhting in parallel?
        for(var i=0;i<fhirObject.entry.length - 1; i++) {
            if(await performFGASingleResourceCheck(fgaClient, authorizationContext, fhirObject.entry[i].resource, action)) {
                finalArray.push(fhirObject.entry[i])
            }
        }

        fhirObject.entry = finalArray
        fhirObject.total = finalArray.length
    }

    return fhirObject
}


module.exports.performAuthorization = async (tenantConfig, authorizationContext, fhirObject, action) => {
    console.log("Performing fine grained filtering.")
    const fgaClient = new OpenFgaClient({
        apiScheme: 'https',
        apiHost: tenantConfig.fga_environment,
        storeId: tenantConfig.fga_store_id,
        authorizationModelId: tenantConfig.fga_authz_model_id,
        credentials: {
          method: CredentialsMethod.ClientCredentials,
          config: {
            apiTokenIssuer: tenantConfig.fga_token_issuer,
            apiAudience: tenantConfig.fga_api_audience,
            clientId: tenantConfig.fga_client_id,
            clientSecret: tenantConfig.fga_client_secret
          },
        }
    });

    if(fhirObject.resourceType === "Bundle") {
        const filteredBundle = await performFGABundleResourceCheck(fgaClient, authorizationContext, fhirObject, action)
        return {
            status: 200,
            authorizedData: filteredBundle
        }
    }
    else {
        if(await performFGASingleResourceCheck(fgaClient, authorizationContext, fhirObject, action)) {
            return {
                status: 200,
                authorizedData: fhirObject
            }
        }
        else {
            return {
                status: 403,
                authorizedData: "You do not have access to this resource."
            }
        }
    }
}